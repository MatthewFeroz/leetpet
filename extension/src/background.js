import { ensureLeetCodeSession, fetchUserProgress, fetchDailyChallenge } from './api/leetcodeClient.js';
import {
  ensurePetState,
  feedPetWithProgress,
  updatePetFromManualFeed,
  decoratePetState,
  shouldRefreshFromProgress,
  resetPetState
} from './tamagotchi/petState.js';
import { STORAGE_KEYS, getStorageValues, setStorageValues } from './storage.js';

const DAILY_ALARM_NAME = 'leetpet-daily-refresh';

init();

async function init() {
  await ensurePetState();
  chrome.runtime.onInstalled.addListener(handleInstalled);
  chrome.runtime.onStartup.addListener(handleStartup);
  chrome.alarms.onAlarm.addListener(handleAlarm);
  chrome.runtime.onMessage.addListener(handleMessage);
  chrome.commands.onCommand.addListener(handleCommand);
  await scheduleDailyRefresh();
}

async function handleInstalled(details) {
  if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
    await scheduleDailyRefresh(true);
  }
}

async function handleStartup() {
  await maybeRefreshFromLeetCode({ reason: 'startup' });
}

async function handleAlarm(alarm) {
  if (alarm.name === DAILY_ALARM_NAME) {
    await maybeRefreshFromLeetCode({ reason: 'daily-alarm', force: true });
  }
}

async function handleCommand(command) {
  if (command === 'refresh-leetpet') {
    await maybeRefreshFromLeetCode({ reason: 'command', force: true });
  }
}

async function handleMessage(message, _sender, sendResponse) {
  const { type, payload } = message;
  switch (type) {
    case 'LEETPET::GET_STATE': {
      const state = await getPetState();
      sendResponse({ ok: true, data: state });
      return true;
    }
    case 'LEETPET::MANUAL_FEED': {
      const updated = await updatePetFromManualFeed(payload?.amount ?? 1);
      sendResponse({ ok: true, data: updated });
      return true;
    }
    case 'LEETPET::REFRESH_FROM_LEETCODE': {
      const result = await maybeRefreshFromLeetCode({ reason: 'manual', force: true });
      sendResponse(result);
      return true;
    }
    case 'LEETPET::RESET_STATE': {
      const state = await resetPetState();
      sendResponse({ ok: true, data: state });
      return true;
    }
    case 'LEETPET::CHECK_AUTH': {
      const authenticated = await ensureLeetCodeSession();
      sendResponse({ ok: true, data: { authenticated } });
      return true;
    }
    default:
      sendResponse({ ok: false, error: 'UNKNOWN_MESSAGE' });
      return true;
  }
}

async function maybeRefreshFromLeetCode({ reason, force = false }) {
  const authenticated = await ensureLeetCodeSession();
  if (!authenticated) {
    return { ok: false, error: 'NOT_AUTHENTICATED' };
  }

  const petState = await getPetState();
  if (!force && !(await shouldRefreshFromProgress())) {
    return { ok: true, data: petState, skipped: true };
  }

  try {
    const progress = await fetchUserProgress();
    const daily = await fetchDailyChallenge();
    const nextState = await feedPetWithProgress(petState, progress, daily);
    await savePetState(nextState);
    const syncValues = {
      [STORAGE_KEYS.LAST_PROGRESS_SYNC]: Date.now()
    };
    if (daily?.questionId) {
      syncValues[STORAGE_KEYS.LAST_DAILY_SYNC] = Date.now();
    }
    await setStorageValues(syncValues);
    return { ok: true, data: nextState, reason };
  } catch (error) {
    console.error('Failed to refresh LeetPet from LeetCode', error);
    return { ok: false, error: 'FETCH_FAILED', message: error?.message };
  }
}

async function scheduleDailyRefresh(reset) {
  if (reset) {
    await chrome.alarms.clear(DAILY_ALARM_NAME);
  }
  const existing = await chrome.alarms.get(DAILY_ALARM_NAME);
  if (!existing) {
    chrome.alarms.create(DAILY_ALARM_NAME, { periodInMinutes: 60 });
  }
}

async function getPetState() {
  const stored = await getStorageValues(STORAGE_KEYS.PET_STATE);
  const petState = stored?.[STORAGE_KEYS.PET_STATE] ?? (await ensurePetState());
  return decoratePetState(petState);
}

async function savePetState(state) {
  await setStorageValues({ [STORAGE_KEYS.PET_STATE]: state });
}
