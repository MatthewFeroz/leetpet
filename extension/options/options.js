const profileForm = document.getElementById('profile-form');
const nameInput = document.getElementById('pet-name-input');
const resetButton = document.getElementById('reset-button');
const authStatus = document.getElementById('auth-status');
const openLeetCode = document.getElementById('open-leetcode');

const storageGet = (keys) =>
  new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (result) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    });
  });

const storageSet = (values) =>
  new Promise((resolve, reject) => {
    chrome.storage.local.set(values, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });

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

profileForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = nameInput.value.trim() || 'LeetPet';
  try {
    const { petState } = await storageGet('petState');
    if (!petState) return;
    await storageSet({ petState: { ...petState, name } });
    await showTempStatus(authStatus, `Saved! ${name} is ready to learn.`);
  } catch (error) {
    console.error('LeetPet: failed to update pet name', error);
    await showTempStatus(authStatus, 'Failed to save. Try again.', true);
  }
});

resetButton.addEventListener('click', async () => {
  const confirmed = confirm('Reset LeetPet progress? This clears XP and stats.');
  if (!confirmed) {
    return;
  }
  try {
    const response = await sendMessage({ type: 'LEETPET::RESET_STATE' });
    if (response?.ok) {
      nameInput.value = response.data?.name ?? 'LeetPet';
      await showTempStatus(authStatus, 'Pet reset! Remember to sync after solving.');
    }
  } catch (error) {
    console.error('LeetPet: failed to reset state', error);
    await showTempStatus(authStatus, 'Reset failed. Check background page.', true);
  }
});

openLeetCode.addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://leetcode.com/problemset/all/' });
});

await initialize();

async function initialize() {
  await hydrateProfileForm();
  await refreshAuthStatus();
}

async function hydrateProfileForm() {
  try {
    const { petState } = await storageGet('petState');
    nameInput.value = petState?.name ?? 'Algochi';
  } catch (error) {
    console.warn('LeetPet: unable to load stored pet state', error);
    nameInput.value = 'Algochi';
  }
}

async function refreshAuthStatus() {
  try {
    const response = await sendMessage({ type: 'LEETPET::CHECK_AUTH' });
    const authenticated = Boolean(response?.data?.authenticated);
    authStatus.textContent = authenticated
      ? 'Authenticated with LeetCode.'
      : 'Not authenticated. Log into LeetCode in a new tab.';
  } catch (error) {
    authStatus.textContent = 'Unable to verify authentication.';
  }
}

async function showTempStatus(target, message, isError = false, duration = 2500) {
  const original = target.textContent;
  target.textContent = message;
  target.style.color = isError ? '#fca5a5' : '#bbf7d0';
  await delay(duration);
  target.textContent = original;
  target.style.color = '';
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
