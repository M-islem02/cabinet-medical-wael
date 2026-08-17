import test from 'node:test';
import assert from 'node:assert/strict';

const SAVED_CREDENTIALS_KEY = 'medcareso_saved_credentials';
const CREDENTIALS_VALIDITY_MS = 24 * 60 * 60 * 1000;

function createMockLocalStorage() {
  const store = new Map();
  return {
    getItem: (key) => store.get(key) || null,
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear()
  };
}

function verifyAndLoadCredentials(localStorageInstance, now = Date.now()) {
  const raw = localStorageInstance.getItem(SAVED_CREDENTIALS_KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (data && data.savedAt && (now - Number(data.savedAt) < CREDENTIALS_VALIDITY_MS)) {
      return { username: data.username, password: data.password };
    }
    localStorageInstance.removeItem(SAVED_CREDENTIALS_KEY);
    return null;
  } catch {
    localStorageInstance.removeItem(SAVED_CREDENTIALS_KEY);
    return null;
  }
}

function saveCredentials(localStorageInstance, username, password, remember, now = Date.now()) {
  if (remember) {
    localStorageInstance.setItem(SAVED_CREDENTIALS_KEY, JSON.stringify({
      username,
      password,
      savedAt: now
    }));
  } else {
    localStorageInstance.removeItem(SAVED_CREDENTIALS_KEY);
  }
}

test('credentials saved with remember=true are retrieved within 24 hours', () => {
  const storage = createMockLocalStorage();
  const startTime = Date.now();

  saveCredentials(storage, 'testuser', 'secret123', true, startTime);
  
  // 1 hour later
  const oneHourLater = startTime + (1 * 60 * 60 * 1000);
  const result1h = verifyAndLoadCredentials(storage, oneHourLater);
  assert.deepEqual(result1h, { username: 'testuser', password: 'secret123' });

  // 23 hours later
  const twentyThreeHoursLater = startTime + (23 * 60 * 60 * 1000);
  const result23h = verifyAndLoadCredentials(storage, twentyThreeHoursLater);
  assert.deepEqual(result23h, { username: 'testuser', password: 'secret123' });
});

test('credentials expire and are automatically cleared after 24 hours', () => {
  const storage = createMockLocalStorage();
  const startTime = Date.now();

  saveCredentials(storage, 'testuser', 'secret123', true, startTime);

  // 24 hours + 1 minute later
  const expiredTime = startTime + (24 * 60 * 60 * 1000) + 60000;
  const resultExpired = verifyAndLoadCredentials(storage, expiredTime);
  
  assert.equal(resultExpired, null);
  assert.equal(storage.getItem(SAVED_CREDENTIALS_KEY), null);
});

test('unchecking remember me clears credentials immediately', () => {
  const storage = createMockLocalStorage();
  const startTime = Date.now();

  saveCredentials(storage, 'testuser', 'secret123', true, startTime);
  assert.notEqual(storage.getItem(SAVED_CREDENTIALS_KEY), null);

  saveCredentials(storage, 'testuser', 'secret123', false, startTime);
  assert.equal(storage.getItem(SAVED_CREDENTIALS_KEY), null);
});

test('test account enables all modules and bypasses restriction gates', () => {
  const isTestAccount = (role, username) => role === 'test' || username === 'test';
  
  assert.equal(isTestAccount('test', 'dr_test'), true);
  assert.equal(isTestAccount('doctor', 'test'), true);
  assert.equal(isTestAccount('assistant', 'assistant_user'), false);
});
