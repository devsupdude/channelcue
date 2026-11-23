import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import { ConvexHttpClient } from 'convex/browser';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, timingSafeEqual } from 'node:crypto';
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
  acquireIndexJob: convexApi.appData.acquireIndexJob,
  checkpointIndexJob: convexApi.appData.checkpointIndexJob,
  releaseIndexJob: convexApi.appData.releaseIndexJob,
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
    accessOverride: (await getConfigValue(userId, 'ACCESS_OVERRIDE')) || 'none',
    defaultGoogleAccess: (await getConfigValue(userId, 'DEFAULT_GOOGLE_ACCESS')) === 'true'
  };
}

async function startUserTrial(userId, tri
[truncated — file has 49774 chars total; use start_line/end_line to read more]