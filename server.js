import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { google } from 'googleapis';
import { clerkMiddleware, getAuth } from '@clerk/express';

const PORT = Number(process.env.PORT || 3000);
const IS_VERCEL = Boolean(process.env.VERCEL);
const REDIRECT_PATH = '/oauth2callback';
const YOUTUBE_SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';
const INDEX_UPLOADS_PER_CHANNEL = Number(process.env.INDEX_UPLOADS_PER_CHANNEL || 25);
const INDEX_REFRESH_MINUTES = Number(process.env.INDEX_REFRESH_MINUTES || 60);
const INDEX_REQUEST_DELAY_MS = Number(process.env.INDEX_REQUEST_DELAY_MS || 100);
const DEFAULT_GOOGLE_TRIAL_DAYS = Number(process.env.DEFAULT_GOOGLE_TRIAL_DAYS || 7);
const INDEX_REFRESH_MS = Math.max(INDEX_REFRESH_MINUTES, 5) * 60 * 1000;
const DATA_DIR = IS_VERCEL ? '/tmp/channelcue' : 'data';
const INDEX_DIR = `${DATA_DIR}/indexes`;
const activeRefreshContexts = new Map();
const activeRefreshes = new Map();
const CLERK_CONFIGURED = Boolean(process.env.CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
const CONFIG_PATH = `${DATA_DIR}/app-config.json`;
const CONVEX_URL = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL || '';
const convex = CONVEX_URL ? new ConvexHttpClient(CONVEX_URL) : null;
const convexFns = {
  getConfigValue: makeFunctionReference('appData:getConfigValue'),
  setConfigValues: makeFunctionReference('appData:setConfigValues'),
  getIndex: makeFunctionReference('appData:getIndex'),
  setIndex: makeFunctionReference('appData:setIndex')
};
mkdirSync(DATA_DIR, { recursive: true });

const app = express();

app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-session-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax'
    }
  })
);
if (CLERK_CONFIGURED) app.use(clerkMiddleware());
app.use('/vendor/clerk', express.static('node_modules/@clerk/clerk-js/dist'));
app.use(express.static('public'));

function getUserId(req) {
  if (!CLERK_CONFIGURED) {
    if (!req.session.localUserId) req.session.localUserId = 'local-dev-user';
    return req.session.localUserId;
  }
  return getAuth(req).userId;
}

function requireAppUser(req, res) {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Sign in with Clerk first.' });
    return null;
  }
  return userId;
}

function readConfigStore() {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function writeConfigStore(store) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(store, null, 2), 'utf8');
}

async function getConfigValue(userId, key) {
  if (convex) return convex.query(convexFns.getConfigValue, { userId, key });
  return readConfigStore()[userId]?.[key]?.value;
}

async function setConfigValues(userId, values) {
  const cleanValues = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, String(value)])
  );
  if (convex) {
    await convex.mutation(convexFns.setConfigValues, { userId, values: cleanValues });
    return;
  }

  const store = readConfigStore();
  store[userId] ||= {};
  for (const [key, value] of Object.entries(cleanValues)) {
    store[userId][key] = {
      value,
      updatedAt: new Date().toISOString()
    };
  }
  writeConfigStore(store);
}

function getDefaultGoogleConfig() {
  return {
    clientId: process.env.DEFAULT_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.DEFAULT_GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || ''
  };
}

function maskClientId(clientId = '') {
  if (!clientId) return '';
  if (clientId.length <= 18) return clientId;
  return `${clientId.slice(0, 8)}...${clientId.slice(-16)}`;
}

async function getTrialInfo(userId) {
  const startedAt = await getConfigValue(userId, 'DEFAULT_GOOGLE_TRIAL_STARTED_AT');
  const defaultConfig = getDefaultGoogleConfig();
  const available = Boolean(defaultConfig.clientId && defaultConfig.clientSecret);

  if (!startedAt) {
    return {
      available,
      active: false,
      expired: false,
      startedAt: null,
      expiresAt: null,
      daysRemaining: available ? DEFAULT_GOOGLE_TRIAL_DAYS : 0,
      clientIdPreview: maskClientId(defaultConfig.clientId)
    };
  }

  const start = new Date(startedAt);
  const expires = new Date(start.getTime() + DEFAULT_GOOGLE_TRIAL_DAYS * 24 * 60 * 60 * 1000);
  const active = available && Date.now() < expires.getTime();
  const daysRemaining = active
    ? Math.max(1, Math.ceil((expires.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
    : 0;

  return {
    available,
    active,
    expired: available && !active,
    startedAt,
    expiresAt: expires.toISOString(),
    daysRemaining,
    clientIdPreview: maskClientId(defaultConfig.clientId)
  };
}

async function hasPersonalGoogleConfig(userId) {
  return Boolean(
    (await getConfigValue(userId, 'GOOGLE_CLIENT_ID')) &&
      (await getConfigValue(userId, 'GOOGLE_CLIENT_SECRET'))
  );
}

async function getGoogleConfig(userId) {
  const personalConfig = {
    clientId: (await getConfigValue(userId, 'GOOGLE_CLIENT_ID')) || '',
    clientSecret: (await getConfigValue(userId, 'GOOGLE_CLIENT_SECRET')) || ''
  };

  if (personalConfig.clientId && personalConfig.clientSecret) {
    return { ...personalConfig, source: 'personal' };
  }

  const trial = await getTrialInfo(userId);
  if (trial.active) {
    return { ...getDefaultGoogleConfig(), source: 'trial' };
  }

  return {
    clientId: '',
    clientSecret: '',
    source: 'none'
  };
}

async function hasGoogleConfig(req) {
  const userId = getUserId(req);
  if (!userId) return false;
  const config = await getGoogleConfig(userId);
  return Boolean(config.clientId && config.clientSecret);
}

function getIndexPath(userId) {
  const safeUserId = String(userId || 'local-dev-user').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${INDEX_DIR}/${safeUserId}.json`;
}

async function readIndex(userId) {
  if (convex) {
    const index = await convex.query(convexFns.getIndex, { userId });
    if (index) return index;
    return {
      refreshedAt: null,
      channels: [],
      videos: []
    };
  }

  const indexPath = getIndexPath(userId);
  if (!existsSync(indexPath)) {
    return {
      refreshedAt: null,
      channels: [],
      videos: []
    };
  }

  try {
    return JSON.parse(readFileSync(indexPath, 'utf8'));
  } catch {
    return {
      refreshedAt: null,
      channels: [],
      videos: []
    };
  }
}

async function writeIndex(userId, index) {
  if (convex) {
    await convex.mutation(convexFns.setIndex, { userId, index });
    return;
  }
  mkdirSync(INDEX_DIR, { recursive: true });
  writeFileSync(getIndexPath(userId), JSON.stringify(index, null, 2), 'utf8');
}

function isIndexStale(index) {
  if (!index.refreshedAt) return true;
  return Date.now() - new Date(index.refreshedAt).getTime() > INDEX_REFRESH_MS;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getRedirectUrl(req) {
  return `${req.protocol}://${req.get('host')}${REDIRECT_PATH}`;
}

async function createOAuthClient(req) {
  const userId = getUserId(req);
  if (!userId) return null;
  const config = await getGoogleConfig(userId);
  if (!config.clientId || !config.clientSecret) return null;
  return new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    getRedirectUrl(req)
  );
}

async function createOAuthClientFromRedirect(redirectUrl, userId) {
  const config = await getGoogleConfig(userId);
  if (!config.clientId || !config.clientSecret) return null;
  return new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    redirectUrl
  );
}

async function createYouTubeFromTokens(tokens, redirectUrl, userId, onTokens) {
  const client = await createOAuthClientFromRedirect(redirectUrl, userId);
  if (!client || !tokens) return null;
  client.setCredentials(tokens);
  client.on('tokens', nextTokens => onTokens?.({ ...tokens, ...nextTokens }));
  return google.youtube({ version: 'v3', auth: client });
}

async function createAuthedYouTube(req) {
  const client = await createOAuthClient(req);
  if (!client || !req.session.tokens) return null;
  client.setCredentials(req.session.tokens);
  client.on('tokens', tokens => {
    req.session.tokens = { ...req.session.tokens, ...tokens };
  });
  return google.youtube({ version: 'v3', auth: client });
}

function rememberRefreshContext(req) {
  if (!req.session.tokens) return;
  activeRefreshContexts.set(req.sessionID, {
    tokens: req.session.tokens,
    redirectUrl: getRedirectUrl(req),
    userId: getUserId(req)
  });
}

async function requireYouTube(req, res) {
  const youtube = await createAuthedYouTube(req);
  if (!youtube) {
    res.status(401).json({
      error: (await hasGoogleConfig(req))
        ? 'Connect YouTube first.'
        : 'Google OAuth is not configured. Open Configuration and add a client ID and secret.'
    });
    return null;
  }
  rememberRefreshContext(req);
  return youtube;
}

function isYouTubeQuotaError(error) {
  const response = error.response?.data;
  const message = JSON.stringify(response || error.message || '').toLowerCase();
  return error.code === 403 && message.includes('quota');
}

function asNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanText(value = '') {
  return value
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[#@][\w-]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function makeSummary(video) {
  const description = cleanText(video.description || '');
  if (description.length > 260) return `${description.slice(0, 257).trim()}...`;
  if (description.length > 40) return description;
  return `A recent upload from ${video.channelTitle} focused on "${video.title}".`;
}

function formatDuration(isoDuration = '') {
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return '';
  const [, hours = '0', minutes = '0', seconds = '0'] = match;
  const parts = [hours, minutes, seconds].map(Number);
  if (parts[0]) return `${parts[0]}h ${parts[1]}m`;
  if (parts[1]) return `${parts[1]}m ${parts[2]}s`;
  return `${parts[2]}s`;
}

function mapVideo(item, details = {}) {
  const snippet = item.snippet || {};
  const stats = details.statistics || {};
  const content = details.contentDetails || {};
  const id = item.contentDetails?.videoId || item.id?.videoId || item.id;
  const publishedAt = item.contentDetails?.videoPublishedAt || snippet.publishedAt;
  return {
    id,
    title: snippet.title,
    channelId: snippet.channelId,
    channelTitle: snippet.channelTitle,
    description: snippet.description,
    publishedAt,
    thumbnail: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url,
    url: `https://www.youtube.com/watch?v=${id}`,
    viewCount: asNumber(stats.viewCount),
    likeCount: asNumber(stats.likeCount),
    duration: formatDuration(content.duration),
    summary: makeSummary({
      title: snippet.title,
      description: snippet.description,
      channelTitle: snippet.channelTitle
    })
  };
}

async function listAllSubscriptions(youtube) {
  const subscriptions = [];
  let pageToken;

  do {
    const response = await youtube.subscriptions.list({
      part: ['snippet'],
      mine: true,
      maxResults: 50,
      pageToken
    });

    for (const item of response.data.items || []) {
      const snippet = item.snippet || {};
      subscriptions.push({
        id: snippet.resourceId?.channelId,
        title: snippet.title,
        description: snippet.description,
        thumbnail: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url
      });
    }

    pageToken = response.data.nextPageToken;
  } while (pageToken);

  return subscriptions.filter(channel => channel.id);
}

async function getChannelBundle(youtube, channelId, maxResults = 8) {
  const [channelResponse] = await Promise.all([
    youtube.channels.list({
      part: ['snippet', 'statistics', 'contentDetails', 'brandingSettings'],
      id: [channelId],
      maxResults: 1
    })
  ]);

  const channel = channelResponse.data.items?.[0];
  if (!channel) throw new Error('Channel not found.');

  const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads;
  const playlistResponse = await youtube.playlistItems.list({
    part: ['snippet', 'contentDetails'],
    playlistId: uploadsPlaylistId,
    maxResults
  });

  const uploadItems = playlistResponse.data.items || [];
  const videoIds = uploadItems.map(item => item.contentDetails?.videoId).filter(Boolean);
  const detailsResponse = videoIds.length
    ? await youtube.videos.list({
        part: ['statistics', 'contentDetails'],
        id: videoIds
      })
    : { data: { items: [] } };

  const detailsById = new Map((detailsResponse.data.items || []).map(item => [item.id, item]));
  const snippet = channel.snippet || {};
  const statistics = channel.statistics || {};

  return {
    channel: {
      id: channel.id,
      title: snippet.title,
      description: snippet.description,
      customUrl: snippet.customUrl,
      country: snippet.country,
      thumbnail: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url,
      subscriberCount: asNumber(statistics.subscriberCount),
      videoCount: asNumber(statistics.videoCount),
      viewCount: asNumber(statistics.viewCount),
      url: `https://www.youtube.com/channel/${channel.id}`
    },
    videos: uploadItems.map(item => mapVideo(item, detailsById.get(item.contentDetails?.videoId)))
  };
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function getUploadPlaylists(youtube, channels) {
  const playlists = new Map();
  for (const channelChunk of chunk(channels, 50)) {
    const response = await youtube.channels.list({
      part: ['contentDetails'],
      id: channelChunk.map(channel => channel.id),
      maxResults: 50
    });

    for (const item of response.data.items || []) {
      const playlistId = item.contentDetails?.relatedPlaylists?.uploads;
      if (playlistId) playlists.set(item.id, playlistId);
    }
  }
  return playlists;
}

async function refreshVideoIndex(userId, youtube, subscriptions, options = {}) {
  const maxResults = Math.min(
    Number(options.maxResults || INDEX_UPLOADS_PER_CHANNEL),
    50
  );
  const uploadPlaylists = await getUploadPlaylists(youtube, subscriptions);
  const videosById = new Map();
  const errors = [];

  for (const channel of subscriptions) {
    const playlistId = uploadPlaylists.get(channel.id);
    if (!playlistId) continue;

    try {
      const response = await youtube.playlistItems.list({
        part: ['snippet', 'contentDetails'],
        playlistId,
        maxResults
      });

      for (const item of response.data.items || []) {
        const video = mapVideo(item);
        if (video.id) videosById.set(video.id, video);
      }
    } catch (error) {
      errors.push({
        channelId: channel.id,
        channelTitle: channel.title,
        message: error.response?.data?.error?.message || error.message
      });
    }

    if (INDEX_REQUEST_DELAY_MS > 0) await delay(INDEX_REQUEST_DELAY_MS);
  }

  const videos = [...videosById.values()].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
  const index = {
    refreshedAt: new Date().toISOString(),
    uploadsPerChannel: maxResults,
    channels: subscriptions,
    videos,
    errors
  };
  await writeIndex(userId, index);
  return index;
}

async function refreshVideoIndexOnce(key, userId, youtube, subscriptions, options = {}) {
  if (activeRefreshes.has(key)) return activeRefreshes.get(key);
  const refresh = refreshVideoIndex(userId, youtube, subscriptions, options).finally(() => {
    activeRefreshes.delete(key);
  });
  activeRefreshes.set(key, refresh);
  return refresh;
}

async function maybeRefreshIndexInBackground(req, youtube, subscriptions) {
  const userId = getUserId(req);
  const index = await readIndex(userId);
  if (!isIndexStale(index)) return;
  refreshVideoIndexOnce(req.sessionID, userId, youtube, subscriptions).catch(error => {
    console.error('Background index refresh failed:', error.message);
  });
}

function searchIndex(index, query) {
  const stopWords = new Set([
    'a',
    'an',
    'and',
    'are',
    'for',
    'how',
    'in',
    'is',
    'of',
    'on',
    'or',
    'the',
    'to',
    'what',
    'with'
  ]);
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map(term => term.replace(/(^\W+|\W+$)/g, ''))
    .filter(term => term && !stopWords.has(term));
  if (!terms.length) return [];

  return (index.videos || [])
    .map(video => {
      const title = (video.title || '').toLowerCase();
      const channel = (video.channelTitle || '').toLowerCase();
      const description = (video.description || '').toLowerCase();
      const haystack = `${title} ${channel} ${description}`;
      const matchedTerms = terms.filter(term => haystack.includes(term));
      if (!matchedTerms.length) return null;

      const score = matchedTerms.reduce((total, term) => {
        if (title.includes(term)) return total + 5;
        if (channel.includes(term)) return total + 3;
        return total + 1;
      }, 0);

      return { ...video, matchedTerms, score };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    })
    .slice(0, 50);
}

app.get('/api/auth/status', async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const trial = userId ? await getTrialInfo(userId) : null;
    const googleConfig = userId ? await getGoogleConfig(userId) : { source: 'none' };
    res.json({
      connected: Boolean(req.session.tokens),
      configured: await hasGoogleConfig(req),
      redirectUri: getRedirectUrl(req),
      clerkConfigured: CLERK_CONFIGURED,
      clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY || '',
      signedIn: Boolean(userId),
      userId,
      googleConfigSource: googleConfig.source,
      personalConfigured: userId ? await hasPersonalGoogleConfig(userId) : false,
      usingDefaultGoogleConfig: googleConfig.source === 'trial',
      defaultGoogleTrial: trial,
      annualPriceUsd: 36,
      paymentLinkUrl: process.env.PAYMENT_LINK_URL || ''
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/config/google', async (req, res, next) => {
  try {
    const userId = requireAppUser(req, res);
    if (!userId) return;

    const config = await getGoogleConfig(userId);
    const trial = await getTrialInfo(userId);
    res.json({
      configured: Boolean(config.clientId && config.clientSecret),
      personalConfigured: await hasPersonalGoogleConfig(userId),
      usingDefaultGoogleConfig: config.source === 'trial',
      googleConfigSource: config.source,
      clientId: (await getConfigValue(userId, 'GOOGLE_CLIENT_ID')) || '',
      hasClientSecret: Boolean(await getConfigValue(userId, 'GOOGLE_CLIENT_SECRET')),
      defaultGoogleTrial: trial,
      annualPriceUsd: 36,
      paymentLinkUrl: process.env.PAYMENT_LINK_URL || '',
      redirectUri: getRedirectUrl(req)
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/config/google/use-default', async (req, res, next) => {
  try {
    const userId = requireAppUser(req, res);
    if (!userId) return;

    const trial = await getTrialInfo(userId);
    if (!trial.available) {
      res.status(400).json({ error: 'The shared Google OAuth client is not configured on this server.' });
      return;
    }
    if (trial.expired) {
      res.status(403).json({
        error: 'Your free shared-key trial has ended. Add your own Google client ID and secret in Configuration to keep using the app.'
      });
      return;
    }
    if (!trial.startedAt) {
      await setConfigValues(userId, {
        DEFAULT_GOOGLE_TRIAL_STARTED_AT: new Date().toISOString()
      });
    }

    const nextTrial = await getTrialInfo(userId);
    res.json({
      ok: true,
      configured: true,
      usingDefaultGoogleConfig: true,
      defaultGoogleTrial: nextTrial,
      annualPriceUsd: 36,
      redirectUri: getRedirectUrl(req)
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/config/google', async (req, res, next) => {
  try {
    const userId = requireAppUser(req, res);
    if (!userId) return;

    const clientId = String(req.body.clientId || '').trim();
    const clientSecret = String(req.body.clientSecret || '').trim();

    const existing = await getGoogleConfig(userId);
    if (!clientId || (!clientSecret && !existing.clientSecret)) {
      res.status(400).json({ error: 'Client ID and client secret are required. If you changed the client ID, paste the matching secret too.' });
      return;
    }

    const values = { GOOGLE_CLIENT_ID: clientId };
    if (clientSecret) values.GOOGLE_CLIENT_SECRET = clientSecret;
    await setConfigValues(userId, values);

    res.json({
      ok: true,
      configured: true,
      usingDefaultGoogleConfig: false,
      googleConfigSource: 'personal',
      redirectUri: getRedirectUrl(req)
    });
  } catch (error) {
    next(error);
  }
});

app.get('/auth/youtube', async (req, res, next) => {
  try {
    const userId = requireAppUser(req, res);
    if (!userId) return;

    const client = await createOAuthClient(req);
    if (!client) {
      res.redirect('/?error=missing-google-config');
      return;
    }

    const url = client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [YOUTUBE_SCOPE]
    });
    res.redirect(url);
  } catch (error) {
    next(error);
  }
});

app.get(REDIRECT_PATH, async (req, res, next) => {
  try {
    const userId = requireAppUser(req, res);
    if (!userId) return;

    const client = await createOAuthClient(req);
    if (!client || !req.query.code) {
      res.redirect('/?error=oauth-failed');
      return;
    }
    const { tokens } = await client.getToken(String(req.query.code));
    req.session.tokens = tokens;
    req.session.subscriptions = null;
    res.redirect('/');
  } catch (error) {
    next(error);
  }
});

app.post('/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/subscriptions', async (req, res, next) => {
  try {
    const youtube = await requireYouTube(req, res);
    if (!youtube) return;

    const subscriptions = await listAllSubscriptions(youtube);
    req.session.subscriptions = subscriptions;
    maybeRefreshIndexInBackground(req, youtube, subscriptions).catch(error => {
      console.error('Background index refresh check failed:', error.message);
    });
    res.json({ subscriptions });
  } catch (error) {
    next(error);
  }
});

app.get('/api/index/status', async (req, res, next) => {
  try {
    const userId = requireAppUser(req, res);
    if (!userId) return;
    const index = await readIndex(userId);

    res.json({
      refreshedAt: index.refreshedAt,
      stale: isIndexStale(index),
      channelCount: index.channels?.length || 0,
      videoCount: index.videos?.length || 0,
      uploadsPerChannel: index.uploadsPerChannel || INDEX_UPLOADS_PER_CHANNEL,
      refreshMinutes: INDEX_REFRESH_MINUTES,
      requestDelayMs: INDEX_REQUEST_DELAY_MS
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/index/refresh', async (req, res, next) => {
  try {
    const userId = requireAppUser(req, res);
    if (!userId) return;
    const youtube = await requireYouTube(req, res);
    if (!youtube) return;

    const subscriptions = req.session.subscriptions || (await listAllSubscriptions(youtube));
    req.session.subscriptions = subscriptions;
    const index = await refreshVideoIndexOnce(req.sessionID, userId, youtube, subscriptions, {
      maxResults: req.body?.maxResults
    });

    res.json({
      refreshedAt: index.refreshedAt,
      channelCount: index.channels.length,
      videoCount: index.videos.length,
      errors: index.errors
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/channels/:channelId/latest', async (req, res, next) => {
  try {
    const maxResults = Math.min(Number(req.query.maxResults || 8), 12);
    const youtube = await requireYouTube(req, res);
    if (!youtube) return;

    res.json(await getChannelBundle(youtube, req.params.channelId, maxResults));
  } catch (error) {
    next(error);
  }
});

app.get('/api/search', async (req, res, next) => {
  try {
    const query = String(req.query.q || '').trim();
    if (!query) {
      res.status(400).json({ error: 'Search query is required.' });
      return;
    }

    const userId = requireAppUser(req, res);
    if (!userId) return;
    const index = await readIndex(userId);
    if (!index.videos?.length) {
      const youtube = await requireYouTube(req, res);
      if (!youtube) return;

      const subscriptions = req.session.subscriptions || (await listAllSubscriptions(youtube));
      req.session.subscriptions = subscriptions;
      maybeRefreshIndexInBackground(req, youtube, subscriptions).catch(error => {
        console.error('Background index refresh check failed:', error.message);
      });
      res.status(409).json({
        error: 'Your searchable video index is empty. Refresh the index once, then search again.'
      });
      return;
    }

    const youtube = await createAuthedYouTube(req);
    const subscriptions = req.session.subscriptions || index.channels || [];
    if (youtube) {
      rememberRefreshContext(req);
      maybeRefreshIndexInBackground(req, youtube, subscriptions).catch(error => {
        console.error('Background index refresh check failed:', error.message);
      });
    }

    const results = searchIndex(index, query);
    res.json({
      searchedChannels: index.channels?.length || subscriptions.length,
      totalChannels: subscriptions.length,
      indexVideoCount: index.videos.length,
      refreshedAt: index.refreshedAt,
      query,
      results
    });
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, _next) => {
  console.error(error);
  if (isYouTubeQuotaError(error)) {
    res.status(429).json({
      error:
        'Sorry, we can only provide the trial while tokens are available. Please try again later or upgrade to the paid plan.',
      code: 'TRIAL_TOKENS_EXHAUSTED',
      paymentLinkUrl: process.env.PAYMENT_LINK_URL || ''
    });
    return;
  }

  const googleError = error.response?.data?.error;
  const message =
    googleError === 'invalid_client'
      ? 'Google rejected the OAuth client. Recheck that the saved client ID and client secret are from the same Google OAuth web client, then save Configuration again.'
      : error.response?.data?.error_description ||
        error.response?.data?.error?.message ||
        error.message ||
        'Something went wrong.';
  res.status(error.code || 500).json({ error: message });
});

if (!IS_VERCEL) {
  app.listen(PORT, () => {
    console.log(`YouTube subscription summarizer running at http://localhost:${PORT}`);
  });
}

if (!IS_VERCEL) setInterval(async () => {
  for (const [sessionId, context] of activeRefreshContexts.entries()) {
    const index = await readIndex(context.userId);
    if (!isIndexStale(index)) continue;

    const youtube = await createYouTubeFromTokens(context.tokens, context.redirectUrl, context.userId, tokens => {
      activeRefreshContexts.set(sessionId, { ...context, tokens });
    });
    if (!youtube || !index.channels?.length) continue;

    refreshVideoIndexOnce(sessionId, context.userId, youtube, index.channels).catch(error => {
      console.error('Scheduled index refresh failed:', error.message);
    });
  }
}, Math.min(INDEX_REFRESH_MS, 15 * 60 * 1000));

export default app;
