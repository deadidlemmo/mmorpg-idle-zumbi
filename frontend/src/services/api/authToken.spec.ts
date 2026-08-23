import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  expireAuthSession,
  getAuthToken,
  setAuthToken,
  subscribeToAuthSessionExpired,
} from './authToken';

const originalLocalStorage = Object.getOwnPropertyDescriptor(
  globalThis,
  'localStorage',
);
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

function restoreGlobal(
  key: 'localStorage' | 'window',
  descriptor: PropertyDescriptor | undefined,
) {
  if (descriptor) {
    Object.defineProperty(globalThis, key, descriptor);
    return;
  }

  Reflect.deleteProperty(globalThis, key);
}

describe('authToken', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };

    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: storage,
    });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: new EventTarget(),
    });
  });

  afterEach(() => {
    restoreGlobal('localStorage', originalLocalStorage);
    restoreGlobal('window', originalWindow);
  });

  it('removes the token and notifies subscribers when the session expires', () => {
    let notifications = 0;
    const unsubscribe = subscribeToAuthSessionExpired(() => {
      notifications += 1;
    });

    setAuthToken('valid-token');
    expireAuthSession();

    assert.equal(getAuthToken(), null);
    assert.equal(notifications, 1);

    unsubscribe();
    expireAuthSession();
    assert.equal(notifications, 1);
  });
});
