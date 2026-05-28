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
  setupPanel: document.querySelector('#setupPanel'),
  setupForm: document.querySelector('#setupForm'),
  clerkStatus: document.querySelector('#clerkStatus'),
  billingTab: document.querySelector('#billingTab'),
  googleTab: document.querySelector('#googleTab'),
  billingPane: document.querySelector('#billingPane'),
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
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || 'Request failed.');
    error.payload = data;
    throw error;
  }
  return data;
}

function showUpgradeCta(message, paymentLinkUrl = '') {
  els.accountBanner.classList.remove('hidden');
  els.accountBannerTitle.textContent = 'Trial tokens are unavailable';
  els.accountBannerMessage.textContent = message;
  els.accountConnectButton.classList.add('hidden');
  els.accountIndexButton.classList.add('hidden');
  els.accountPayLink.classList.remove('hidden');

  if (paymentLinkUrl) {
    els.accountPayLink.href = paymentLinkUrl;
    els.accountPayLink.removeAttribute('aria-disabled');
    els.accountPayLink.textContent = 'Upgrade to paid plan';
  } else {
    els.accountPayLink.href = '#';
    els.accountPayLink.setAttribute('aria-disabled', 'true');
    els.accountPayLink.textContent = 'Payment link coming soon';
  }
}

function handleAppError(error) {
  if (error.payload?.code === 'TRIAL_TOKENS_EXHAUSTED') {
    showUpgradeCta(error.message, error.payload.paymentLinkUrl);
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
    setSharedGoogleKeySelection(false);
  }
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
    els.accountPayLink.setAttribute('aria-disabled', 'true');
    els.accountPayLink.textContent = 'Payment link coming soon';
    return;
  }

  els.heroPayButton.href = url;
  els.heroPayButton.removeAttribute('aria-disabled');
  els.heroPayButton.textContent = 'Pay Now';
  els.accountPayLink.href = url;
  els.accountPayLink.removeAttribute('aria-disabled');
  els.accountPayLink.textContent = 'Pay Now';
}

function activateConfigTab(tabName) {
  const showGoogle = tabName === 'google';
  els.googleTab.classList.toggle('active', showGoogle);
  els.billingTab.classList.toggle('active', !showGoogle);
  els.googlePane.classList.toggle('hidden', !showGoogle);
  els.billingPane.classList.toggle('hidden', showGoogle);
}

function setSharedGoogleKeySelection(isSelected) {
  state.useSharedGoogleKey = isSelected;
  els.clientIdInput.readOnly = isSelected;
  els.clientSecretInput.readOnly = isSelected;
  els.clientIdInput.dataset.sharedKey = isSelected ? 'true' : 'false';
  els.clientSecretInput.dataset.sharedKey = isSelected ? 'true' : 'false';

  if (isSelected) {
    els.clientIdInput.value = SHARED_CLIENT_ID_MASK;
    els.clientSecretInput.value = SHARED_CLIENT_SECRET_MASK;
    els.clientSecretInput.placeholder = '';
    return;
  }

  if (els.clientIdInput.value === SHARED_CLIENT_ID_MASK) {
    els.clientIdInput.value = '';
  }
  if (els.clientSecretInput.value === SHARED_CLIENT_SECRET_MASK) {
    els.clientSecretInput.value = '';
  }
}

function showConfiguration(tabName = 'billing') {
  if (!state.signedIn) {
    showNotice('Sign in to ChannelCue before opening Configuration.');
    if (state.clerkConfigured) els.authButton.click();
    return;
  }

  els.setupPanel.classList.remove('hidden');
  activateConfigTab(tabName);
  loadGoogleConfig();
}

function renderHeroState(config = {}) {
  els.hero.classList.toggle('hidden', state.signedIn);
  els.heroConfigButton.classList.toggle('hidden', !state.signedIn);
  renderAccountBanner(config);
  const trial = config.defaultGoogleTrial;
  const expired = Boolean(trial?.expired && !config.personalConfigured);
  els.heroPayButton.classList.toggle('hidden', !expired);
  els.heroStartButton.classList.toggle('hidden', expired);
  els.postTrialThanks.classList.toggle('hidden', !expired);

  if (expired) {
    els.heroMessage.textContent =
      'Thanks for using ChannelCue Pro. Tell your friends, then add your own Google keys or renew for $36/year.';
    activateConfigTab('google');
    return;
  }

  if (config.usingDefaultGoogleConfig && trial?.active) {
    els.heroMessage.textContent = `Trial active: ${trial.daysRemaining} day${trial.daysRemaining === 1 ? '' : 's'} left. All updates included with Pro.`;
    return;
  }

  els.heroMessage.textContent = '7 days free, then $36/year with all updates included.';
}

function renderAccountBanner(config = {}) {
  const trial = config.defaultGoogleTrial;
  const expired = Boolean(trial?.expired && !config.personalConfigured);
  const needsIndex = Boolean(config.needsIndex);
  const showBanner = state.signedIn && (!state.connected || expired || needsIndex);
  els.accountBanner.classList.toggle('hidden', !showBanner);
  if (!showBanner) return;

  els.accountPayLink.classList.toggle('hidden', !expired);
  els.accountConnectButton.classList.toggle('hidden', expired || state.connected);
  els.accountIndexButton.classList.toggle('hidden', !state.connected || expired);

  if (expired) {
    els.accountBannerTitle.textContent = 'Thanks for using ChannelCue Pro';
    els.accountBannerMessage.textContent =
      'Your 7-day trial has ended. Tell your friends if ChannelCue helped, then pay now or add your own Google keys in Configuration.';
    return;
  }

  if (!state.connected) {
    if (!state.googleConfigured) {
      els.accountConnectButton.textContent = 'Choose Google key';
      els.accountBannerTitle.textContent = 'Next step: choose Google access';
      els.accountBannerMessage.textContent =
        'ChannelCue login is complete. Start the 7-day trial, or add your own Google client ID and secret.';
      return;
    }

    els.accountConnectButton.textContent = 'Connect YouTube';
    els.accountBannerTitle.textContent = 'Next step: connect YouTube';
    els.accountBannerMessage.textContent =
      'ChannelCue login is complete. Now connect YouTube so we can load your subscriptions and build your private channel briefings.';
    return;
  }

  els.accountIndexButton.classList.remove('hidden');
  els.accountConnectButton.classList.add('hidden');
  els.accountBannerTitle.textContent = 'Channels loaded';
  els.accountBannerMessage.textContent =
    'Go ahead and click Refresh index once. We will show progress while ChannelCue gathers recent uploads.';
}

function renderTrial(config) {
  const trial = config?.defaultGoogleTrial;
  els.trialPanel.classList.toggle('hidden', !trial?.available);
  if (!trial?.available) return;

  if (config.usingDefaultGoogleConfig && trial.active) {
    els.trialStatus.textContent = `7-day trial active. ${trial.daysRemaining} day${trial.daysRemaining === 1 ? '' : 's'} remaining. Your Google access is ready for this trial.`;
    els.useDefaultKeyButton.textContent = 'Trial active';
    els.useDefaultKeyButton.disabled = true;
    return;
  }

  if (trial.expired) {
    els.trialStatus.textContent = `Your 7-day trial ended. Add your own Google credentials to continue. Continued access is $${config.annualPriceUsd || 36}/year.`;
    els.useDefaultKeyButton.textContent = 'Trial ended';
    els.useDefaultKeyButton.disabled = true;
    renderHeroState(config);
    return;
  }

  if (state.useSharedGoogleKey) {
    els.trialStatus.textContent =
      '7-day trial selected. The trial client ID and secret are masked here and stay private on the server. Click Save configuration to start your trial.';
    els.useDefaultKeyButton.textContent = 'Trial selected';
    els.useDefaultKeyButton.disabled = true;
  } else {
    els.trialStatus.textContent = `Start with ChannelCue trial access for ${trial.daysRemaining || 7} days. The trial client ID and secret stay private on the server. Click Start 7-day trial, then save to begin.`;
    els.useDefaultKeyButton.textContent = 'Start 7-day trial';
    els.useDefaultKeyButton.disabled = false;
  }
  renderHeroState(config);
}

function renderIndexStatus(status) {
  if (!status || !status.refreshedAt) {
    els.indexStatus.textContent = 'No cached videos yet. Refresh the index before searching.';
    return;
  }

  const refreshed = formatDate(status.refreshedAt);
  const stale = status.stale ? 'Needs refresh' : 'Fresh';
  els.indexStatus.textContent = `${stale}: ${status.videoCount} videos from ${status.channelCount} channels, refreshed ${refreshed}.`;
}

function renderSubscriptions() {
  els.channelSelect.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = state.subscriptions.length ? 'Choose a subscribed channel' : 'No channels loaded';
  els.channelSelect.appendChild(placeholder);

  for (const channel of state.subscriptions) {
    const option = document.createElement('option');
    option.value = channel.id;
    option.textContent = channel.title;
    els.channelSelect.appendChild(option);
  }
}

function renderChannel(channel) {
  els.channelEmpty.classList.add('hidden');
  els.channelDetails.classList.remove('hidden');
  const channelUrl = channel.url || `https://www.youtube.com/channel/${channel.id}`;
  els.channelDetails.innerHTML = `
    <article class="channel-card">
      <div class="channel-head">
        <img src="${channel.thumbnail || ''}" alt="" />
        <div>
          <h3>${escapeHtml(channel.title)}</h3>
          <a href="${channelUrl}" target="_blank" rel="noreferrer">Open channel</a>
        </div>
      </div>
      <p class="channel-description">${escapeHtml(channel.description || 'No channel description available.')}</p>
      <div class="stats">
        <div class="stat"><strong>${compactNumber(channel.subscriberCount)}</strong><span>subscribers</span></div>
        <div class="stat"><strong>${compactNumber(channel.videoCount)}</strong><span>videos</span></div>
        <div class="stat"><strong>${compactNumber(channel.viewCount)}</strong><span>views</span></div>
      </div>
    </article>
  `;
}

function renderVideos(target, videos) {
  if (!videos.length) {
    target.innerHTML = '<div class="empty">No videos found.</div>';
    return;
  }

  target.innerHTML = videos
    .map(video => {
      return `
        <article class="video-card">
          <a href="${video.url}" target="_blank" rel="noreferrer">
            <img src="${video.thumbnail || ''}" alt="" />
          </a>
          <div class="video-body">
            <h3><a href="${video.url}" target="_blank" rel="noreferrer">${escapeHtml(video.title)}</a></h3>
            <p class="summary">${escapeHtml(video.summary)}</p>
            <div class="meta">
              <span class="pill">${escapeHtml(video.channelTitle || 'Channel')}</span>
              <span>${formatDate(video.publishedAt)}</span>
              ${video.duration ? `<span>${escapeHtml(video.duration)}</span>` : ''}
              ${video.viewCount ? `<span>${compactNumber(video.viewCount)} views</span>` : ''}
            </div>
          </div>
        </article>
      `;
    })
    .join('');
}

async function loadGoogleConfig() {
  if (!state.signedIn) return;

  try {
    const config = await api('/api/config/google');
    const usingSharedKey = Boolean(config.usingDefaultGoogleConfig && config.defaultGoogleTrial?.active);
    setSharedGoogleKeySelection(usingSharedKey);
    if (!usingSharedKey) {
      els.clientIdInput.value = config.clientId || '';
      els.clientSecretInput.value = '';
    }
    els.clientSecretInput.placeholder = !usingSharedKey && config.hasClientSecret
      ? 'Saved. Enter a new secret to replace it.'
      : '';
    if (config.redirectUri) els.redirectUri.textContent = config.redirectUri;
    renderTrial(config);
    renderPaymentLink(config.paymentLinkUrl);
  } catch (error) {
    if (state.signedIn) handleAppError(error);
  }
}

async function loadSubscriptions() {
  showNotice('');
  showNotice('Loading your YouTube subscriptions. This can take a moment if you follow a lot of channels.');
  setLoading(els.videoList, 'Loading your YouTube subscriptions...');
  els.indexStatus.textContent = 'Loading channels from YouTube...';
  try {
    const data = await api('/api/subscriptions');
    state.subscriptions = data.subscriptions;
    state.cachedVideos = [];
    state.cachedIndexLoaded = false;
    renderSubscriptions();
    await loadIndexStatus();
    if (state.subscriptions[0]) {
      els.channelSelect.value = state.subscriptions[0].id;
      await loadChannel(state.subscriptions[0].id);
    }
    showNotice(`Loaded ${state.subscriptions.length} subscribed channels. Click Refresh index once to make search useful.`);
    renderAccountBanner({ configured: state.googleConfigured, needsIndex: true });
  } catch (error) {
    setLoading(els.videoList, 'Could not load YouTube subscriptions.');
    handleAppError(error);
  }
}

async function loadCachedIndex() {
  try {
    const index = await api('/api/index/library');
    renderIndexStatus(index);
    if (!index.channels?.length || !index.videos?.length) {
      state.cachedVideos = [];
      state.cachedIndexLoaded = false;
      return false;
    }

    state.subscriptions = index.channels;
    state.cachedVideos = index.videos;
    state.cachedIndexLoaded = true;
    renderSubscriptions();
    if (state.subscriptions[0]) {
      els.channelSelect.value = state.subscriptions[0].id;
      renderCachedChannel(state.subscriptions[0].id);
    }
    showNotice(`Loaded saved index with ${index.videoCount} videos from ${index.channelCount} channels. Refresh only when you want newer uploads.`);
    renderAccountBanner({ configured: state.googleConfigured, needsIndex: false });
    return true;
  } catch (error) {
    if (state.signedIn) handleAppError(error);
    return false;
  }
}

async function loadIndexStatus() {
  try {
    const status = await api('/api/index/status');
    renderIndexStatus(status);
  } catch {
    renderIndexStatus(null);
  }
}

async function refreshIndex() {
  els.refreshIndexButton.disabled = true;
  els.accountIndexButton.disabled = true;
  els.refreshIndexButton.textContent = 'Refreshing...';
  els.accountIndexButton.textContent = 'Indexing...';
  els.indexStatus.textContent = 'Fetching recent uploads from subscribed channels...';
  try {
    const status = await api('/api/index/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    renderIndexStatus(status);
    await loadCachedIndex();
    showNotice(`Search index refreshed with ${status.videoCount} videos from ${status.channelCount} channels.`);
  } catch (error) {
    handleAppError(error);
  } finally {
    els.refreshIndexButton.disabled = false;
    els.accountIndexButton.disabled = false;
    els.refreshIndexButton.textContent = 'Refresh index';
    els.accountIndexButton.textContent = 'Refresh index';
  }
}

function renderCachedChannel(channelId) {
  const channel = state.subscriptions.find(item => item.id === channelId);
  if (!channel) return;
  const videos = state.cachedVideos
    .filter(video => video.channelId === channelId)
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, 8);
  renderChannel(channel);
  renderVideos(els.videoList, videos);
  els.latestMeta.textContent = `${videos.length} cached videos`;
}

async function loadChannel(channelId) {
  if (!channelId) return;
  if (state.cachedIndexLoaded && state.cachedVideos.length) {
    renderCachedChannel(channelId);
    return;
  }

  setLoading(els.videoList, 'Fetching latest uploads...');
  els.latestMeta.textContent = '';
  const data = await api(`/api/channels/${encodeURIComponent(channelId)}/latest`);
  renderChannel(data.channel);
  renderVideos(els.videoList, data.videos);
  els.latestMeta.textContent = `${data.videos.length} videos`;
}

async function searchTopics(query) {
  setSearchBusy(true, 'Searching the cached video index...');
  setLoading(els.searchResults, 'Searching cached videos...');
  els.searchMeta.textContent = '';
  try {
    const data = await api(`/api/search?q=${encodeURIComponent(query)}`);
    renderVideos(els.searchResults, data.results);
    const scope =
      data.totalChannels && data.searchedChannels < data.totalChannels
        ? `${data.searchedChannels} of ${data.totalChannels} channels`
        : `${data.searchedChannels} channels`;
    els.searchMeta.textContent = `${data.results.length} matches across ${scope}`;
    if (data.indexVideoCount) {
      els.searchMeta.textContent += `, ${data.indexVideoCount} cached videos`;
    }
    const completion =
      data.results.length > 0
        ? `Search complete for "${query}".`
        : `Search complete for "${query}". No matches found in ${data.indexVideoCount || 0} cached videos.`;
    setSearchBusy(false, completion);
  } catch (error) {
    renderVideos(els.searchResults, []);
    els.searchMeta.textContent = 'Search failed';
    setSearchBusy(false, `Search failed: ${error.message}`);
    handleAppError(error);
  }
}

async function setupClerk(status) {
  if (!status.clerkConfigured || !status.clerkPublishableKey) return;

  const frontendApi = getClerkFrontendApi(status.clerkPublishableKey);
  if (!frontendApi) {
    throw new Error('Clerk publishable key is not valid.');
  }

  window.__clerk_publishable_key = status.clerkPublishableKey;
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://${frontendApi}/npm/@clerk/clerk-js@5/dist/clerk.browser.js`;
    script.setAttribute('data-clerk-publishable-key', status.clerkPublishableKey);
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });

  if (window.Clerk?.load) {
    await window.Clerk.load();
  }
}

function getClerkFrontendApi(publishableKey) {
  const encoded = publishableKey.split('_')[2];
  if (!encoded) return '';
  const padded = encoded.padEnd(encoded.length + ((4 - (encoded.length % 4)) % 4), '=');
  try {
    return atob(padded).replace(/\$$/, '');
  } catch {
    return '';
  }
}

function setupHeroVideoFade() {
  if (!els.heroVideo) return;

  const updateVideoVisibility = () => {
    const duration = els.heroVideo.duration || 18;
    const fadeAt = Math.max(0, duration - 7.7);
    const isFinale = els.heroVideo.currentTime >= fadeAt;
    els.heroVideo.classList.toggle('fade-away', false);
    els.hero.classList.toggle('video-finale', isFinale);
  };

  els.heroVideo.addEventListener('timeupdate', updateVideoVisibility);
  els.heroVideo.addEventListener('seeked', updateVideoVisibility);
  els.heroVideo.addEventListener('play', updateVideoVisibility);
  els.heroVideo.addEventListener('loadedmetadata', updateVideoVisibility);
}

async function init() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('error') === 'missing-google-config') {
    showNotice('Google OAuth is not configured. Open Configuration and save your Google credentials.');
  }

  try {
    const status = await api('/api/auth/status');
    state.connected = status.connected;
    state.clerkConfigured = status.clerkConfigured;
    state.signedIn = status.signedIn;
    if (status.redirectUri) els.redirectUri.textContent = status.redirectUri;
    await setupClerk(status);
    renderPaymentLink(status.paymentLinkUrl);
    renderHeroState(status);
    updateAuthUi(status.configured);
    await loadGoogleConfig();
    const hasCachedIndex = await loadCachedIndex();
    if (!hasCachedIndex && state.connected) await loadSubscriptions();
    if (!hasCachedIndex) await loadIndexStatus();
  } catch (error) {
    handleAppError(error);
  }
}

els.connectButton.addEventListener('click', async () => {
  try {
    const status = await api('/api/auth/status');
    state.signedIn = status.signedIn;
    updateAuthUi(status.configured);
    if (status.configured) {
      showNotice('Opening Google so you can connect YouTube. When you return, ChannelCue will load your channels.');
      window.location.href = '/auth/youtube';
      return;
    }
    showConfiguration('google');
    els.clientIdInput.focus();
  } catch (error) {
    handleAppError(error);
  }
});

els.configButton.addEventListener('click', () => {
  if (!els.setupPanel.classList.contains('hidden')) {
    els.setupPanel.classList.add('hidden');
    return;
  }
  showConfiguration('google');
});

els.heroConfigButton.addEventListener('click', () => {
  showConfiguration('google');
});

els.heroStartButton.addEventListener('click', async () => {
  if (!state.signedIn && state.clerkConfigured) {
    await els.authButton.click();
    return;
  }
  if (state.googleConfigured) {
    window.location.href = '/auth/youtube';
    return;
  }
  showConfiguration('billing');
});

els.accountConnectButton.addEventListener('click', () => {
  els.connectButton.click();
});

els.accountIndexButton.addEventListener('click', () => {
  refreshIndex();
});

els.billingTab.addEventListener('click', () => activateConfigTab('billing'));
els.googleTab.addEventListener('click', () => activateConfigTab('google'));

els.authButton.addEventListener('click', async () => {
  if (!window.Clerk?.openSignIn) {
    showNotice('Clerk is not ready. Check your Clerk publishable and secret keys, then refresh.');
    return;
  }
  await window.Clerk.openSignIn();
});

els.useDefaultKeyButton.addEventListener('click', async () => {
  setSharedGoogleKeySelection(true);
  els.trialStatus.textContent =
    '7-day trial selected. The trial client ID and secret are masked here and stay private on the server. Click Save configuration to start your trial.';
  els.useDefaultKeyButton.textContent = 'Trial selected';
  els.useDefaultKeyButton.disabled = true;
  showNotice('7-day trial selected. Click Save configuration to start it.');
});

els.setupForm.addEventListener('submit', async event => {
  event.preventDefault();
  try {
    els.setupForm.querySelector('button[type="submit"]').disabled = true;
    const data = state.useSharedGoogleKey
      ? await api('/api/config/google/use-default', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        })
      : await api('/api/config/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId: els.clientIdInput.value,
            clientSecret: els.clientSecretInput.value
          })
        });
    if (data.redirectUri) els.redirectUri.textContent = data.redirectUri;
    updateAuthUi(true);
    showNotice(
      state.useSharedGoogleKey
        ? 'Your 7-day trial has started. You can connect YouTube now.'
        : 'Configuration saved. You can update these Google keys any time from Configuration.'
    );
    await loadGoogleConfig();
  } catch (error) {
    handleAppError(error);
  } finally {
    els.setupForm.querySelector('button[type="submit"]').disabled = false;
  }
});

els.logoutButton.addEventListener('click', async () => {
  await fetch('/auth/logout', { method: 'POST' });
  state.connected = false;
  state.subscriptions = [];
  state.cachedVideos = [];
  state.cachedIndexLoaded = false;
  renderSubscriptions();
  renderIndexStatus(null);
  updateAuthUi(state.googleConfigured);
  showNotice('Disconnected from YouTube.');
});

els.subBriefLogoutButton.addEventListener('click', async () => {
  await fetch('/auth/logout', { method: 'POST' });
  if (window.Clerk?.signOut) {
    await window.Clerk.signOut();
  }
  state.connected = false;
  state.signedIn = false;
  state.subscriptions = [];
  state.cachedVideos = [];
  state.cachedIndexLoaded = false;
  renderSubscriptions();
  renderIndexStatus(null);
  renderHeroState({});
  updateAuthUi(false);
  showNotice('Logged out of ChannelCue.');
});

els.refreshIndexButton.addEventListener('click', () => {
  refreshIndex();
});

els.channelSelect.addEventListener('change', event => {
  loadChannel(event.target.value).catch(handleAppError);
});

els.searchForm.addEventListener('submit', event => {
  event.preventDefault();
  const query = els.searchInput.value.trim();
  if (!query) return;
  searchTopics(query);
});

init();
setupHeroVideoFade();
