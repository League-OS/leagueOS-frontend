import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForPostLoginReady } from './readiness.ts';

type LocatorStub = { waitFor: (opts?: { timeout?: number }) => Promise<void> };

type PageStub = {
  getByRole: (role: string, options?: { name?: string | RegExp }) => LocatorStub;
  waitForURL: (_matcher: (url: URL) => boolean, _opts?: { timeout?: number }) => Promise<void>;
};

function makePageStub(handlers: {
  plus?: () => Promise<void>;
  heading?: () => Promise<void>;
  signOut?: () => Promise<void>;
}): PageStub {
  return {
    getByRole: (role, options) => {
      const name = options?.name;
      if (role === 'button' && name === '+') return { waitFor: handlers.plus ?? (async () => {}) };
      if (role === 'heading') return { waitFor: handlers.heading ?? (async () => {}) };
      if (role === 'button') return { waitFor: handlers.signOut ?? (async () => {}) };
      return { waitFor: async () => {} };
    },
    waitForURL: async () => {
      throw new Error('still on login');
    },
  };
}

test('readiness succeeds when plus button is missing but dashboard heading is present', async () => {
  const page = makePageStub({
    plus: async () => {
      throw new Error('plus missing');
    },
    heading: async () => {
      // heading is available immediately
    },
  });

  await assert.doesNotReject(() => waitForPostLoginReady(page as never, 200));
});
