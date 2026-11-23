const state = {
  connected: false,
  subscriptions: [],
  cachedVideos: [],
  cachedIndexLoaded: false,
  clerkConfigured: false,
  signedIn: false,
  googleConfigured: false,
  useSharedGoogleKey: false
};

const SHARED_CLIENT_ID_MASK = '******** ChannelCue trial client ID ********';
const SHARED_CLIENT_SECRET_MASK = '******** ChannelCue trial client secret ********';

const els = {
  notice: document.querySelector('#notice'),
  authButton: document.querySelector('#authButton'),
  faqButton: document.querySelector('#faqButton'),
  configButton: document.querySelector('#configButton'),
  connectButton: document.querySelector('#connectButton'),
  logoutButton: document.querySelector('#logoutButton'),
  subBriefLogoutButton: document.querySelector('#subBriefLogoutButton'),
  accountBanner: document.querySelector('#accountBanner'),
  accountBannerTitle: document.querySelector('#accountBannerTitle'),
  accountBannerMessage: document.querySelector('#accountBannerMessage'),
  accountConnectButton: document.querySelector('#accountConnectButton'),
  accountIndexButton: document.querySelector('#accountIndexButton'),
  accountPayLink: document.querySelector('#accountPayLink'),
  heroStartButton: document.querySelector('#heroStartButton'),
  heroPayButton: document.querySelector('#heroPayButton'),
  heroConfigButton: document.querySelector('#heroConfigButton'),
  heroMessage: document.querySelector('#heroMessage'),
  hero: document.querySelector('#top'),
  heroVideo: document.querySelector('#heroVideo'),
  faqPanel: document.querySelector('#faqPanel'),
  setupPanel: document.querySelector('#setupPanel'),
  setupForm: document.querySelector('#setupForm'),
  clerkStatus: document.querySelector('#clerkStatus'),
  billingTab: document.querySelector('#billingTab'),
  googleTab: document.querySelector('#googleTab'),
  billingPane: document.querySelector('#billingPane'),
  billingDescription: document.querySelector('#billingDescription'),
  googleDescription: document.querySelector('#googleDescription'),
  trialHeading: document.querySelector('#trialHeading'),
  pricingNote: document.querySelector('#pricingNote'),
  googlePane: document.querySelector('#googlePane'),
  postTrialThanks: document.querySelector('#postTrialThanks'),
  redirectUri: document.querySelector('#redirectUri'),
  clientIdInput: document.querySelector('#clientIdInput'),
  clientSecretInput: document.querySelector('#clientSecretInput'),
  trialPanel: document.querySelector('#trialPanel'),
  trialStatus: document.querySelector('#trialStatus'),
  useDefaultKeyButton: document.querySelector('#useDefaultKeyButton'),
  channelSelect: document.querySelector('#channelSelect'),
  channelEmpty: document.querySelector('#channelEmpty'),
  channelDetails: document.querySelector('#channelDetails'),
  videoList: document.querySelector('#videoList'),
  latestMeta: document.querySelector('#latestMeta'),
  indexStatus: document.querySelector('#indexStatus'),
  refreshIndexButton: document.querySelector('#refreshIndexButton'),
  searchForm: document.querySelector('#searchForm'),
  searchInput: document.querySelector('#searchInput'),
  searchButton: document.querySelector('#searchButton'),
  searchStatus: document.querySelector('#searchStatus'),
  searchResults: document.querySelector('#searchResults'),
  searchMeta: document.querySelector('#searchMeta')
};

function showNotice(message, tone = 'info') {
  els.notice.textContent = message;
  els.notice.dataset.tone = tone;
  els.notice.classList.toggle('hidden', !message);
}

function setLoading(target, message) {
  target.innerHTML = `<div class="empty">${message}</div>`;
}

function setSearchBusy(isBusy, message = '') {
  els.searchButton.disabled = isBusy;
  els.searchInput.disabled = isBusy;
  els.searchButton.textContent = isBusy ? 'Searching...' : 'Search';
  els.searchStatus.textContent = message;
  els.searchStatus.classList.toggle('hidden', !message);
}

async function api(path, options = {}) {
  const response = await fetch(path, options);
  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();
  let data = {};

  if (text && contentType.includes('application/json')) {
    try {
      data = JSON.parse(text);
    } catch (_error) {
      data = { error: 'ChannelCue received an unreadable server response. Please try the action again.' };
    }
  } else if (text) {
    data = { error: text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() };
  }

  if (!response.ok) {
    const error = new Error(data.error || 'Request failed.');
    error.payload = data;
    throw error;
  }
  return data;
}

function showUpgradeCta(message, paymentLinkUrl = '', title = 'YouTube API quota reached') {
  els.accountBanner.classList.remove('hidden');
  els.accountBannerTitle.textContent = title;
  els.accountBannerMessage.textContent = message;
  els.accountConnectButton.classList.add('hidden');
  els.accountIndexButton.classList.add('hidden');
  els.accountPayLink.classList.remove('hidden');

  if (paymentLinkUrl) {
    els.accountPayLink.href = paymentLinkUrl;
    els.accountPayLink.removeAttribute('aria-disabled');
    els.accountPayLink.textContent = 'Manage plan';
  } else {
    els.accountPayLink.href = '#';
    els.accountPayLink.setAttribute('aria-disabled', 'true');
    els.accountPayLink.textContent = 'Payment link coming soon';
  }
}

function handleAppError(error) {
  if (
    error.payload?.code === 'YOUTUBE_API_QUOTA_EXCEEDED' ||
    error.payload?.code === 'TRIAL_TOKENS_EXHAUSTED' ||
    error.payload?.code === 'CHANNELCUE_SUBSCRIPTION_REQUIRED'
  ) {
    showUpgradeCta(
      error.message,
      error.payload.paymentLinkUrl,
      error.payload?.code === 'CHANNELCUE_SUBSCRIPTION_REQUIRED'
        ? 'ChannelCue subscription required'
        : 'YouTube API quota reached'
    );
  }
  showNotice(error.message);
}

function compactNumber(value) {
  if (value === null || value === undefined) return 'n/a';
  return new Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(value);
}

function formatDate(value) {
  if (!value) return 'Unknown date';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date(value));
}

function escapeHtml(value = '') {
  return value.replace(/[&<>"']/g, char => {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char];
  });
}

function updateAuthUi(configured) {
  state.googleConfigured = configured;
  if (!state.signedIn) {
    els.setupPanel.classList.add('hidden');
    els.faqPanel.classList.add('hidden');
    setSharedGoogleKeySelection(false);
  }
  els.faqButton.classList.toggle('hidden', !state.signedIn);
  els.configButton.classList.toggle('hidden', !state.signedIn);
  els.connectButton.classList.toggle('hidden', state.connected || !state.signedIn);
  els.logoutButton.classList.toggle('hidden', !state.connected);
  els.subBriefLogoutButton.classList.toggle('hidden', !state.signedIn);
  els.authButton.classList.toggle('hidden', !state.clerkConfigured || state.signedIn);
  els.connectButton.textContent = configured ? 'Connect YouTube' : 'Configure Google first';
  els.clerkStatus.textContent = state.clerkConfigured
    ? state.signedIn
      ? 'Signed in with Clerk. Configuration is saved per user.'
      : 'Clerk is configured. Sign in before connecting YouTube.'
    : 'Clerk keys are not configured yet, so this local prototype is using a development user.';

  if (!configured && state.signedIn) {
    showNotice('Add your Google client ID and client secret in Configuration before connecting YouTube.');
  }
}

function renderPaymentLink(url) {
  if (!url) {
    els.heroPayButton.href = '#';
    els.heroPayButton.setAttribute('aria-disabled', 'true');
    els.heroPayButton.textContent = 'Payment link coming soon';
    els.accountPayLink.href = '#';
    els.accountPayLink.setAttribute('aria-disabled', 'tr
[truncated — file has 33590 chars total; use start_line/end_line to read more]