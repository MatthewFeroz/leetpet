import { STORAGE_KEYS, getStorageValues, setStorageValues } from '../storage.js';

const XP_PER_LEVEL = 120;
const MAX_HUNGER = 100;
const MIN_HUNGER = 0;
const DEFAULT_PET_NAME = 'Algochi';
const DEFAULT_STATE = createBaseState();

const XP_GAIN = {
  manualFeed: 8,
  dailyBonus: 40,
  easy: 12,
  medium: 28,
  hard: 60
};

const HUNGER_DELTA = {
  manualFeed: -10,
  solve: -8
};

export async function ensurePetState() {
  const stored = await getStorageValues(STORAGE_KEYS.PET_STATE);
  const existing = stored?.[STORAGE_KEYS.PET_STATE];
  if (existing) {
    return recalculateDerived(existing);
  }
  const baseState = createBaseState();
  await setStorageValues({ [STORAGE_KEYS.PET_STATE]: baseState });
  return baseState;
}

export async function updatePetFromManualFeed(amount = 1) {
  const base = await ensurePetState();
  const xpGain = XP_GAIN.manualFeed * Math.max(1, amount);
  const hungerDelta = HUNGER_DELTA.manualFeed * Math.max(1, amount);
  const updated = applyProgress(base, {
    xpGain,
    hungerDelta,
    lastManualFeedAt: Date.now()
  });
  await saveState(updated);
  return decoratePetState(updated);
}

export async function feedPetWithProgress(currentState, progress, daily) {
  if (!progress?.authenticated) {
    return currentState;
  }

  const delta = computeProgressDelta(
    progress.totals,
    currentState.lastProgressTotals ?? DEFAULT_STATE.lastProgressTotals
  );

  let xpGain =
    delta.easy * XP_GAIN.easy + delta.medium * XP_GAIN.medium + delta.hard * XP_GAIN.hard;
  let hungerDelta = delta.total > 0 ? HUNGER_DELTA.solve * delta.total : 0;
  const now = Date.now();
  let lastDailyCompletionDate = currentState.lastDailyCompletionDate;

  if (daily?.completed && daily.date && daily.date !== currentState.lastDailyCompletionDate) {
    xpGain += XP_GAIN.dailyBonus;
    hungerDelta += HUNGER_DELTA.solve;
    lastDailyCompletionDate = daily.date;
  }

  const nextState = applyProgress(currentState, {
    xpGain,
    hungerDelta,
    streak: progress.streak ?? currentState.streak,
    totalActiveDays: progress.totalActiveDays ?? currentState.totalActiveDays,
    totalSolved: progress.totals?.total ?? currentState.totalSolved,
    stats: {
      easy: progress.totals?.easy ?? currentState.stats.easy,
      medium: progress.totals?.medium ?? currentState.stats.medium,
      hard: progress.totals?.hard ?? currentState.stats.hard
    },
    lastProgressTotals: progress.totals ?? currentState.lastProgressTotals,
    lastProgressSyncAt: progress.timestamp ?? now,
    lastDailyCompletionDate,
    lastFedAt: delta.total > 0 || daily?.completed ? now : currentState.lastFedAt,
    profile: progress.profile ?? currentState.profile
  });

  return recalculateDerived(nextState);
}

export function decoratePetState(state) {
  const recalculated = recalculateDerived(state);
  const hungerStatus = recalculated.hunger <= 20 ? 'Full' : recalculated.hunger <= 60 ? 'Peckish' : 'Hungry';
  const statusMessage = buildStatusMessage(recalculated, hungerStatus);
  return {
    ...recalculated,
    hungerStatus,
    statusMessage
  };
}

export async function shouldRefreshFromProgress(thresholdMinutes = 30) {
  const defaults = { [STORAGE_KEYS.LAST_PROGRESS_SYNC]: 0 };
  const stored = await getStorageValues(defaults);
  const lastSync = stored?.[STORAGE_KEYS.LAST_PROGRESS_SYNC];
  if (!lastSync) {
    return true;
  }
  return Date.now() - lastSync > thresholdMinutes * 60 * 1000;
}

export async function resetPetState() {
  const baseState = createBaseState();
  await setStorageValues({
    [STORAGE_KEYS.PET_STATE]: baseState,
    [STORAGE_KEYS.LAST_PROGRESS_SYNC]: 0,
    [STORAGE_KEYS.LAST_DAILY_SYNC]: 0
  });
  return recalculateDerived(baseState);
}

async function saveState(state) {
  await setStorageValues({ [STORAGE_KEYS.PET_STATE]: state });
}

function computeProgressDelta(nextTotals = {}, previousTotals = {}) {
  return {
    easy: Math.max(0, (nextTotals.easy ?? 0) - (previousTotals.easy ?? 0)),
    medium: Math.max(0, (nextTotals.medium ?? 0) - (previousTotals.medium ?? 0)),
    hard: Math.max(0, (nextTotals.hard ?? 0) - (previousTotals.hard ?? 0)),
    total: Math.max(0, (nextTotals.total ?? 0) - (previousTotals.total ?? 0))
  };
}

function applyProgress(state, overrides) {
  const {
    xpGain = 0,
    hungerDelta = 0,
    streak,
    totalActiveDays,
    totalSolved,
    stats,
    lastProgressTotals,
    lastProgressSyncAt,
    lastFedAt,
    lastManualFeedAt,
    lastDailyCompletionDate,
    profile
  } = overrides;

  const xp = Math.max(0, state.xp + xpGain);
  const hunger = clamp(state.hunger + hungerDelta, MIN_HUNGER, MAX_HUNGER);
  const happiness = clamp(state.happiness + xpGain * 0.1, 0, 100);

  return {
    ...state,
    xp,
    hunger,
    happiness,
    streak: streak ?? state.streak,
    totalActiveDays: totalActiveDays ?? state.totalActiveDays,
    totalSolved: totalSolved ?? state.totalSolved,
    stats: stats ?? state.stats,
    lastProgressTotals: lastProgressTotals ?? state.lastProgressTotals,
    lastProgressSyncAt: lastProgressSyncAt ?? state.lastProgressSyncAt,
    lastFedAt: lastFedAt ?? state.lastFedAt,
    lastManualFeedAt: lastManualFeedAt ?? state.lastManualFeedAt,
    lastDailyCompletionDate: lastDailyCompletionDate ?? state.lastDailyCompletionDate,
    profile: profile ?? state.profile
  };
}

function recalculateDerived(state) {
  const xp = Math.max(0, state.xp ?? 0);
  const level = Math.floor(xp / XP_PER_LEVEL) + 1;
  const xpIntoLevel = xp % XP_PER_LEVEL;
  const xpToNext = XP_PER_LEVEL - xpIntoLevel;
  const xpProgress = xpIntoLevel / XP_PER_LEVEL;
  return {
    ...state,
    xp,
    level,
    xpIntoLevel,
    xpToNext,
    xpProgress
  };
}

function buildStatusMessage(state, hungerStatus) {
  if (hungerStatus === 'Hungry') {
    return 'Your LeetPet is hungry! Solve a problem or tap feed.';
  }
  if (state.streak >= 7) {
    return `Streak on fire! ${state.streak}-day streak keeps ${state.name} glowing.`;
  }
  if (state.totalSolved === 0) {
    return 'Solve your first problem to hatch new energy!';
  }
  return 'Keep the momentum—daily problems boost your pet fastest.';
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function createBaseState() {
  return {
    name: DEFAULT_PET_NAME,
    xp: 0,
    level: 1,
    hunger: 40,
    happiness: 50,
    energy: 50,
    streak: 0,
    totalSolved: 0,
    totalActiveDays: 0,
    lastProgressTotals: { easy: 0, medium: 0, hard: 0, total: 0 },
    stats: { easy: 0, medium: 0, hard: 0 },
    lastFedAt: null,
    lastManualFeedAt: null,
    lastDailyCompletionDate: null,
    lastProgressSyncAt: null,
    profile: null
  };
}
