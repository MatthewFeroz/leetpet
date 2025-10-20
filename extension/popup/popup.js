const elements = {
  authBanner: document.getElementById('auth-banner'),
  loginButton: document.getElementById('login-button'),
  feedButton: document.getElementById('feed-button'),
  refreshButton: document.getElementById('refresh-button'),
  petName: document.getElementById('pet-name'),
  petStatus: document.getElementById('pet-status'),
  petLevel: document.getElementById('pet-level'),
  xpBar: document.getElementById('xp-bar'),
  xpNumbers: document.getElementById('xp-numbers'),
  statTotal: document.getElementById('stat-total'),
  statStreak: document.getElementById('stat-streak'),
  statDaily: document.getElementById('stat-daily'),
  petSprite: document.getElementById('pet-sprite')
};

const STATE = {
  authenticated: false,
  loading: false
};

const sendMessage = (message) =>
  new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(error);
      } else {
        resolve(response);
      }
    });
  });

elements.loginButton.addEventListener('click', onLogin);
elements.feedButton.addEventListener('click', onManualFeed);
elements.refreshButton.addEventListener('click', onRefresh);

await initialize();

async function initialize() {
  await updateAuthState();
  await refreshPetState();
}

async function updateAuthState() {
  try {
    const response = await sendMessage({ type: 'LEETPET::CHECK_AUTH' });
    STATE.authenticated = Boolean(response?.data?.authenticated);
    setAuthBanner(!STATE.authenticated);
  } catch (error) {
    console.warn('LeetPet: failed to verify auth', error);
    setAuthBanner(true);
  }
}

async function refreshPetState({ forceRemote = false } = {}) {
  if (STATE.loading) return;
  STATE.loading = true;

  try {
    if (forceRemote) {
      await sendMessage({ type: 'LEETPET::REFRESH_FROM_LEETCODE' });
    }
    const response = await sendMessage({ type: 'LEETPET::GET_STATE' });
    if (response?.ok && response.data) {
      renderPet(response.data);
    }
  } catch (error) {
    console.error('LeetPet: failed to refresh pet state', error);
  } finally {
    STATE.loading = false;
  }
}

async function onManualFeed() {
  const response = await sendMessage({
    type: 'LEETPET::MANUAL_FEED',
    payload: { amount: 1 }
  });
  if (response?.ok && response.data) {
    renderPet(response.data);
  }
}

async function onRefresh() {
  await refreshPetState({ forceRemote: true });
}

async function onLogin() {
  chrome.tabs.create({ url: 'https://leetcode.com/accounts/login/' }, async () => {
    await delay(4000);
    await updateAuthState();
    if (STATE.authenticated) {
      await refreshPetState({ forceRemote: true });
    }
  });
}

function renderPet(state) {
  elements.petName.textContent = state.name ?? 'LeetPet';
  elements.petStatus.textContent = state.statusMessage ?? 'Keep practicing on LeetCode.';
  elements.petLevel.textContent = state.level ?? 1;
  elements.xpNumbers.textContent = `${state.xpIntoLevel ?? 0} / ${state.xpToNext ?? 120}`;
  const xpPercent = Math.min(100, Math.round((state.xpProgress ?? 0) * 100));
  elements.xpBar.style.width = `${xpPercent}%`;
  elements.statTotal.textContent = state.totalSolved ?? 0;
  elements.statStreak.textContent = `${state.streak ?? 0}d`;
  elements.statDaily.textContent = state.lastDailyCompletionDate ? 'Complete' : 'Pending';
  setPetMood(state);
}

function setPetMood(state) {
  const hunger = state.hunger ?? 50;
  if (hunger <= 20) {
    elements.petSprite.style.background = 'radial-gradient(circle at 30% 30%, #86efac, #16a34a)';
  } else if (hunger <= 60) {
    elements.petSprite.style.background = 'radial-gradient(circle at 30% 30%, #facc15, #f97316)';
  } else {
    elements.petSprite.style.background = 'radial-gradient(circle at 30% 30%, #f97316, #b91c1c)';
  }
}

function setAuthBanner(show) {
  elements.authBanner.classList.toggle('active', show);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
