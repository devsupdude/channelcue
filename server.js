import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import { ConvexHttpClient } from 'convex/browser';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { google } from 'googleapis';
import { clerkMiddleware, getAuth } from '@clerk/express';
import { api as convexApi } from './convex/_generated/api.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const IS_VERCEL = Boolean(process.env.VERCEL);
const REDIRECT_PATH = '/oauth2callback';
const APP_BASE_URL = (process.env.APP_BASE_URL || '').replace(/\/+$/, '');
const YOUTUBE_SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';
const INDEX_UPLOADS_PER_CHANNEL = Number(process.env.INDEX_UPLOADS_PER_CHANNEL || 25);
const INDEX_REFRESH_MINUTES = Number(process.env.INDEX_REFRESH_MINUTES || 60);
const INDEX_REQUEST_DELAY_MS = Number(process.env.INDEX_REQUEST_DELAY_MS || 100);
const INDEX_DESCRIPTION_LIMIT = Number(process.env.INDEX_DESCRIPTION_LIMIT || 600);
const INDEX_CHANNEL_DESCRIPTION_LIMIT = Number(process.env.INDEX_CHANNEL_DESCRIPTION_LIMIT || 500);
const DEFAULT_GOOGLE_TRIAL_DAYS = Number(process.env.DEFAULT_GOOGLE_TRIAL_DAYS || 7);
const INDEX_REFRESH_MS = Math.max(INDEX_REFRESH_MINUTES, 5) * 60 * 1000;
const PAYMENT_LINK_URL = process.env.PAYMENT_LINK_URL || '';
const DATA_DIR = IS_VERCEL ? '/tmp/channelcue' : 'data';
const INDEX_DIR = `${DATA_DIR}/indexes`;
const activeRefreshContexts = new Map();
const activeRefreshes = new Map();
const CLERK_CONFIGURED = Boolean(process.env.CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
const CONFIG_PATH = `${DATA_DIR}/app-config.json`;
const PUBLIC_DIR = join(__dirname, 'public');
const CLERK_BROWSER_DIR = join(__dirname, 'node_modules', '@clerk', 'clerk-js', 'dist');
const CONVEX_URL = (process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL || '').replace(/\/+$/, '');
const convex = CONVEX_URL ? new ConvexHttpClient(CONVEX_URL) : null;
const convexFns = {
  getConfigValue: convexApi.appData.getConfigValue,
  setConfigValues: convexApi.appData.setConfigValues,
  getUserAccess: convexApi.appData.getUserAccess,
  startUserTrial: convexApi.appData.startUserTrial,
  setSubscriptionActive: convexApi.appData.setSubscriptionActive,
  getSession: convexApi.appData.getSession,
  setSession: convexApi.appData.setSession,
  destroySession: convexApi.appData.destroySession,
  getIndex: convexApi.appData.getIndex,
  setIndex: convexApi.appData.setIndex,
  replaceIndexStart: convexApi.appData.replaceIndexStart,
  setIndexChunk: convexApi.appData.setIndexChunk,
  commitIndex: convexApi.appData.commitIndex
};
mkdirSync(DATA_DIR, { recursive: true });

class ConvexSessionStore extends session.Store {
  constructor(client, fns) {
    super();
    this.client = client;
    this.fns = fns;
  }

  get(sid, callback) {
    this.client
      .query(this.fns.getSession, { sid })
      .then(data => callback(null, data || null))
      .catch(error => callback(error));
  }

  set(sid, sess, callback) {
    const expiresAt = sess.cookie?.expires
      ? new Date(sess.cookie.expires).getTime()
      : Date.now() + 7 * 24 * 60 * 60 * 1000;

    this.client
      .mutation(this.fns.setSession, {
        sid,
        data: toConvexValue(sess),
        expiresAt
      })
      .then(() => callback?.(null))
      .catch(error => callback?.(error));
  }

  destroy(sid, callback) {
    this.client
      .mutation(this.fns.destroySession, { sid })
      .then(() => callback?.(null))
      .catch(error => callback?.(error));
  }
}

const app = express();
app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (req.path.startsWith('/api/') || req.path === REDIRECT_PATH) {
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
});

app.use(express.json());
app.use(
  session({
    store: convex ? new ConvexSessionStore(convex, convexFns) : undefined,
    secret: process.env.SESSION_SECRET || 'dev-session-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: IS_VERCEL || process.env.NODE_ENV === 'production'
    }
  })
);
if (CLERK_CONFIGURED) app.use(clerkMiddleware());
app.use('/vendor/clerk', express.static(CLERK_BROWSER_DIR));
app.use(express.static(PUBLIC_DIR));

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

function toConvexValue(value) {
  if (value === undefined) return null;
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  if (Array.isArray(value)) return value.map(item => toConvexValue(item));
  if (value && typeof value === 'object') {
    if (value instanceof Date) return value.toISOString();
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, toConvexValue(item)])
    );
  }
  return value;
}

function chunkForConvex(items = [], maxBytes = 75_000, maxItems = 25) {
  const chunks = [];
  let current = [];
  let currentBytes = 2;

  for (const item of items) {
    const itemBytes = Buffer.byteLength(JSON.stringify(item), 'utf8') + 1;
    if (current.length && (current.length >= maxItems || currentBytes + itemBytes > maxBytes)) {
      chunks.push(current);
      current = [];
      currentBytes = 2;
    }
    current.push(item);
    currentBytes += itemBytes;
  }

  if (current.length) chunks.push(current);
  return chunks;
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

async function getUserAccess(userId) {
  if (convex) {
    return convex.query(convexFns.getUserAccess, { userId });
  }

  return {
    trialStartedAt: (await getConfigValue(userId, 'TRIAL_STARTED_AT')) || null,
    subscriptionActive: (await getConfigValue(userId, 'SUBSCRIPTION_ACTIVE')) === 'true',
    subscriptionEndsAt: (await getConfigValue(userId, 'SUBSCRIPTION_ENDS_AT')) || null,
    accessOverride: (await getConfigValue(userId, 'ACCESS_OVERRIDE')) || 'none'
  };
}

async function startUserTrial(userId, trialStartedAt = new Date().toISOString()) {
  if (convex) {
    await convex.mutation(convexFns.startUserTrial, { userId, trialStartedAt });
    return;
  }

  const existingStartedAt = await getConfigValue(userId, 'TRIAL_STARTED_AT');
  if (!existingStartedAt) {
    await setConfigValues(userId, { TRIAL_STARTED_AT: trialStartedAt });
  }
}

async function hasSubscriptionActive(userId) {
  const access = await getUserAccess(userId);
  if (access.accessOverride === 'comped') return true;
  if (!access.subscriptionActive) return false;
  if (!access.subscriptionEndsAt) return true;
  const endsAt = new Date(access.subscriptionEndsAt).getTime();
  return Number.isFinite(endsAt) && Date.now() < endsAt;
}

function getDefaultGoogleConfig() {
  return {
    clientId: process.env.DEFAULT_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.DEFAULT_GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || ''
  };
}

async function getTrialInfo(userId) {
  const access = await getUserAccess(userId);
  const legacyStartedAt = await getConfigValue(userId, 'DEFAULT_GOOGLE_TRIAL_STARTED_AT');
  const startedAt = access.trialStartedAt || legacyStartedAt;
  const defaultConfig = getDefaultGoogleConfig();
  const available = Boolean(defaultConfig.clientId && defaultConfig.clientSecret);

  if (!startedAt) {
    return {
      available,
      active: false,
      expired: false,
      startedAt: null,
      expiresAt: null,
      daysRemaining: available ? DEFAULT_GOOGLE_TRIAL_DAYS : 0
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
    subscriptionActive: Boolean(access.subscriptionActive)
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
    const cleanIndex = toConvexValue(index);
    const { channels = [], videos = [], errors = [], ...meta } = cleanIndex;
    const batchId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    async function writeAdaptiveChunks(kind, chunks) {
      let nextChunkIndex = 0;
      let savedCount = 0;
      let skippedCount = 0;

      async function writeItems(items, label) {
        if (!items.length) return;

        const chunkIndex = nextChunkIndex;
        const payloadBytes = Buffer.byteLength(JSON.stringify(items), 'utf8');
        try {
          await convex.mutation(convexFns.setIndexChunk, {
            userId,
            batchId,
            kind,
            chunkIndex,
            items
          });
          nextChunkIndex += 1;
          savedCount += items.length;
        } catch (error) {
          if (items.length > 1) {
            const midpoint = Math.ceil(items.length / 2);
            console.warn(
              `Convex ${kind} chunk ${label} failed with ${items.length} items/${payloadBytes} bytes. Splitting smaller. ${error.message}`
            );
            await writeItems(items.slice(0, midpoint), `${label}a`);
            await writeItems(items.slice(midpoint), `${label}b`);
            return;
          }

          skippedCount += 1;
          console.error(
            `Skipping one ${kind} item that Convex rejected during index write: ${items[0]?.id || 'unknown id'} (${payloadBytes} bytes). ${error.message}`
          );
        }
      }

      for (const [chunkIndex, items] of chunks.entries()) {
        await writeItems(items, `${chunkIndex + 1}/${chunks.length}`);
      }

      return { savedCount, skippedCount, chunkCount: nextChunkIndex };
    }

    const channelChunks = chunkForConvex(channels, 50_000, 25);
    const videoChunks = chunkForConvex(videos, 25_000, 10);
    const channelWrite = await writeAdaptiveChunks('channels', channelChunks);
    const videoWrite = await writeAdaptiveChunks('videos', videoChunks);

    if (channels.length && !channelWrite.savedCount) {
      throw new Error('Convex rejected every channel index chunk, so ChannelCue kept the previous saved index.');
    }
    if (videos.length && !videoWrite.savedCount) {
      throw new Error('Convex rejected every video index chunk, so ChannelCue kept the previous saved index.');
    }

    const nextMeta = {
      ...meta,
      channelCount: channelWrite.savedCount,
      videoCount: videoWrite.savedCount,
      errorCount: errors.length,
      skippedChannelCount: channelWrite.skippedCount,
      skippedVideoCount: videoWrite.skippedCount
    };

    await convex.mutation(convexFns.commitIndex, {
      userId,
      batchId,
      meta: nextMeta
    });
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
  if (APP_BASE_URL) return `${APP_BASE_URL}${REDIRECT_PATH}`;
  const forwardedProto = String(req.get('x-forwarded-proto') || '').split(',')[0].trim();
  const forwardedHost = String(req.get('x-forwarded-host') || '').split(',')[0].trim();
  const protocol = forwardedProto || req.protocol;
  const host = forwardedHost || req.get('host');
  return `${protocol}://${host}${REDIRECT_PATH}`;
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

function isConvexSetupError(error) {
  const message = String(error.message || '').toLowerCase();
  return message.includes('could not find public function') || message.includes('did you forget to run `npx convex dev`');
}

function isConvexArgumentError(error) {
  const message = String(error.message || '').toLowerCase();
  return message.includes('invalid arguments provided') || message.includes('argumentvalidationerror');
}

function asNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeString(value = '') {
  return String(value || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '')
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
}

function isValidYouTubeId(value) {
  return /^[A-Za-z0-9_-]+$/.test(String(value || ''));
}

function cleanText(value = '') {
  return safeString(value)
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[#@][\w-]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function limitText(value = '', maxLength = 600) {
  const text = cleanText(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
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
  const id = safeString(item.contentDetails?.videoId || item.id?.videoId || item.id).trim();
  const publishedAt = item.contentDetails?.videoPublishedAt || snippet.publishedAt;
  return {
    id,
    title: safeString(snippet.title),
    channelId: safeString(snippet.channelId).trim(),
    channelTitle: safeString(snippet.channelTitle),
    description: safeString(snippet.description),
    publishedAt,
    thumbnail: safeString(snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url),
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

function compactChannelForIndex(channel = {}, details = {}) {
  const snippet = details.snippet || {};
  const statistics = details.statistics || {};
  return {
    id: String(channel.id || ''),
    title: safeString(snippet.title || channel.title || 'Untitled channel'),
    description: limitText(snippet.description || channel.description, INDEX_CHANNEL_DESCRIPTION_LIMIT),
    thumbnail:
      snippet.thumbnails?.medium?.url ||
      snippet.thumbnails?.default?.url ||
      safeString(channel.thumbnail) ||
      '',
    subscriberCount: asNumber(statistics.subscriberCount),
    videoCount: asNumber(statistics.videoCount),
    viewCount: asNumber(statistics.viewCount),
    url: channel.url || (channel.id ? `https://www.youtube.com/channel/${channel.id}` : '')
  };
}

function compactVideoForIndex(video = {}) {
  const description = limitText(video.description, INDEX_DESCRIPTION_LIMIT);
  const summary = video.summary || makeSummary({ ...video, description });
  return {
    id: safeString(video.id || '').trim(),
    title: safeString(video.title || 'Untitled video'),
    channelId: safeString(video.channelId || '').trim(),
    channelTitle: safeString(video.channelTitle || 'Channel'),
    description,
    searchText: limitText(`${video.title || ''} ${video.channelTitle || ''} ${description}`, 1000),
    publishedAt: video.publishedAt || null,
    thumbnail: safeString(video.thumbnail || ''),
    url: video.url || (video.id ? `https://www.youtube.com/watch?v=${video.id}` : ''),
    viewCount: video.viewCount,
    likeCount: video.likeCount,
    duration: safeString(video.duration || ''),
    summary
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
        thumbnail: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url,
        url: snippet.resourceId?.channelId
          ? `https://www.youtube.com/channel/${snippet.resourceId.channelId}`
          : ''
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

async function getChannelIndexDetails(youtube, channels) {
  const channelDetails = new Map();

  async function fetchChannelChunk(channelChunk, label) {
    const ids = channelChunk
      .map(channel => safeString(channel.id).trim())
      .filter(isValidYouTubeId);
    if (!ids.length) return;

    try {
      const response = await youtube.channels.list({
        part: ['snippet', 'statistics', 'contentDetails'],
        id: ids,
        maxResults: 50
      });

      for (const item of response.data.items || []) {
        const playlistId = safeString(item.contentDetails?.relatedPlaylists?.uploads).trim();
        channelDetails.set(item.id, {
          uploadsPlaylistId: isValidYouTubeId(playlistId) ? playlistId : '',
          snippet: item.snippet || {},
          statistics: item.statistics || {}
        });
      }
    } catch (error) {
      const message = error.response?.data?.error?.message || error.message || '';
      if (channelChunk.length > 1 && /pattern|invalid|bad request/i.test(message)) {
        const midpoint = Math.ceil(channelChunk.length / 2);
        console.warn(`YouTube channel batch ${label} failed validation. Splitting smaller. ${message}`);
        await fetchChannelChunk(channelChunk.slice(0, midpoint), `${label}a`);
        await fetchChannelChunk(channelChunk.slice(midpoint), `${label}b`);
        return;
      }

      if (channelChunk.length === 1 && /pattern|invalid|bad request/i.test(message)) {
        console.warn(`Skipping channel ${channelChunk[0]?.id || 'unknown'} because YouTube rejected its ID. ${message}`);
        return;
      }

      throw error;
    }
  }

  for (const [chunkIndex, channelChunk] of chunk(channels, 50).entries()) {
    await fetchChannelChunk(channelChunk, `${chunkIndex + 1}`);
  }

  return channelDetails;
}

async function refreshVideoIndex(userId, youtube, subscriptions, options = {}) {
  const maxResults = Math.min(
    Number(options.maxResults || INDEX_UPLOADS_PER_CHANNEL),
    50
  );
  const channelDetails = await getChannelIndexDetails(youtube, subscriptions);
  const videosById = new Map();
  const errors = [];

  for (const channel of subscriptions) {
    const playlistId = channelDetails.get(channel.id)?.uploadsPlaylistId;
    if (!isValidYouTubeId(playlistId)) continue;

    try {
      const response = await youtube.playlistItems.list({
        part: ['snippet', 'contentDetails'],
        playlistId,
        maxResults
      });

      for (const item of response.data.items || []) {
        const video = mapVideo(item);
        if (isValidYouTubeId(video.id)) videosById.set(video.id, video);
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

  const videos = [...videosById.values()].map(compactVideoForIndex).sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
  const index = {
    refreshedAt: new Date().toISOString(),
    uploadsPerChannel: maxResults,
    channels: subscriptions.map(channel => compactChannelForIndex(channel, channelDetails.get(channel.id))),
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
      const searchText = (video.searchText || video.description || '').toLowerCase();
      const haystack = `${title} ${channel} ${searchText}`;
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
    const access = userId ? await getUserAccess(userId) : null;
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
      access,
      annualPriceUsd: 36,
      paymentLinkUrl: PAYMENT_LINK_URL
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
    const access = await getUserAccess(userId);
    res.json({
      configured: Boolean(config.clientId && config.clientSecret),
      personalConfigured: await hasPersonalGoogleConfig(userId),
      usingDefaultGoogleConfig: config.source === 'trial',
      googleConfigSource: config.source,
      clientId: (await getConfigValue(userId, 'GOOGLE_CLIENT_ID')) || '',
      hasClientSecret: Boolean(await getConfigValue(userId, 'GOOGLE_CLIENT_SECRET')),
      defaultGoogleTrial: trial,
      access,
      annualPriceUsd: 36,
      paymentLinkUrl: PAYMENT_LINK_URL,
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
        error: 'Your 7-day trial has ended. Activate your ChannelCue subscription, then add your own Google client ID and secret in Configuration to keep using the app.'
      });
      return;
    }
    if (!trial.startedAt) {
      await startUserTrial(userId);
    } else {
      const access = await getUserAccess(userId);
      if (!access.trialStartedAt) {
        await startUserTrial(userId, trial.startedAt);
      }
    }

    const nextTrial = await getTrialInfo(userId);
    const access = await getUserAccess(userId);
    res.json({
      ok: true,
      configured: true,
      usingDefaultGoogleConfig: true,
      defaultGoogleTrial: nextTrial,
      access,
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

    if (!(await hasSubscriptionActive(userId))) {
      res.status(402).json({
        error:
          'Personal Google credentials are available with an active ChannelCue subscription. Start or renew your $36/year plan, then save your Google client ID and secret again.',
        code: 'CHANNELCUE_SUBSCRIPTION_REQUIRED',
        paymentLinkUrl: PAYMENT_LINK_URL
      });
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

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, app: 'ChannelCue' });
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

app.get('/api/index/library', async (req, res, next) => {
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
      requestDelayMs: INDEX_REQUEST_DELAY_MS,
      channels: index.channels || [],
      videos: index.videos || []
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/index/refresh', async (req, res, next) => {
  let userId;
  try {
    userId = requireAppUser(req, res);
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
    if (userId && isConvexArgumentError(error)) {
      console.error('Index refresh storage warning:', error.message);
      const savedIndex = await readIndex(userId);
      if (savedIndex.videos?.length || savedIndex.channels?.length) {
        res.json({
          refreshedAt: savedIndex.refreshedAt,
          channelCount: savedIndex.channels?.length || 0,
          videoCount: savedIndex.videos?.length || 0,
          warning:
            'ChannelCue saved a usable index, but Convex reported a storage warning. You can keep searching the saved index.'
        });
        return;
      }
    }
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
        'YouTube has paused this request because the Google API quota for the connected credentials has been reached. ChannelCue is ready to keep working, but Google controls this daily limit. Please wait for the YouTube API quota to reset, or add your own Google OAuth credentials in Configuration.',
      code: 'YOUTUBE_API_QUOTA_EXCEEDED',
      paymentLinkUrl: PAYMENT_LINK_URL
    });
    return;
  }

  if (isConvexSetupError(error)) {
    res.status(503).json({
      error:
        'Convex storage is connected, but the ChannelCue Convex functions are not deployed yet. Run npx convex dev --once locally, or npx convex deploy for Vercel, then try again.'
    });
    return;
  }

  if (isConvexArgumentError(error)) {
    res.status(400).json({
      error:
        'ChannelCue could not save this data to Convex. The app has been updated to store large video indexes in smaller chunks; refresh and try the action again.'
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
