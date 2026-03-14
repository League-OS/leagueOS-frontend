import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForPostLoginReady } from './readiness.ts';

type LocatorStub = {
  waitFor: (opts?: { timeout?: number }) => Promise<void>;
  first: () => LocatorStub;
  isVisible: () => Promise<boolean>;
};

type PageStub = {
  getByRole: (role: string, options?: { name?: string | RegExp }) => LocatorStub;
  getByLabel: (_label: string) => LocatorStub;
  waitForURL: (_matcher: (url: URL) => boolean, _opts?: { timeout?: number }) => Promise<void>;
};

function makePageStub(handlers: {
  plus?: () => Promise<void>;
  heading?: () => Promise<void>;
  signOut?: () => Promise<void>;
}): PageStub {
  const makeLocator = (waitForImpl?: () => Promise<void>, isVisibleValue = false): LocatorStub => {
    const locator: LocatorStub = {
      waitFor: waitForImpl ?? (async () => {}),
      first: () => locator,
      isVisible: async () => isVisibleValue,
    };
    return locator;
  };

  return {
    getByRole: (role, options) => {
      const name = options?.name;
      if (role === 'button' && (name === '+' || (name instanceof RegExp && name.test('+')))) {
        return makeLocator(handlers.plus);
      }
      if (role === 'heading') return makeLocator(handlers.heading);
      if (role === 'button') return makeLocator(handlers.signOut);
      return makeLocator();
    },
    getByLabel: () => makeLocator(undefined, false),
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
