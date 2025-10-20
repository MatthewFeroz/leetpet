export const STORAGE_KEYS = Object.freeze({
  PET_STATE: 'petState',
  LAST_PROGRESS_SYNC: 'lastProgressSync',
  LAST_DAILY_SYNC: 'lastDailySync'
});

export async function getStorageValues(keys) {
  const defaults = Array.isArray(keys)
    ? keys.reduce((acc, key) => ({ ...acc, [key]: undefined }), {})
    : keys;
  return chrome.storage.local.get(defaults);
}

export async function setStorageValues(values) {
  return chrome.storage.local.set(values);
}
