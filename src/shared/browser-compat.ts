export type { Runtime, Tabs, Menus, Storage } from 'webextension-polyfill';

const rawChrome = typeof (globalThis as any).chrome !== 'undefined' ? (globalThis as any).chrome : undefined;
const rawBrowser = typeof (globalThis as any).browser !== 'undefined' ? (globalThis as any).browser : undefined;
const isExtensionContext = typeof globalThis !== 'undefined' && (
  Boolean((globalThis as any).chrome?.runtime?.id) ||
  Boolean((globalThis as any).browser?.runtime?.id)
);

const inMemoryStore: Record<string, any> = {};

const mockLocalStorage = {
  get: async (keys?: any) => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        if (!keys) {
          const result: Record<string, any> = {};
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k) {
              try { result[k] = JSON.parse(localStorage.getItem(k) || ''); }
              catch { result[k] = localStorage.getItem(k); }
            }
          }
          return result;
        }
        const keyList = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
        const res: Record<string, any> = {};
        for (const k of keyList) {
          const item = localStorage.getItem(k);
          if (item !== null) {
            try { res[k] = JSON.parse(item); }
            catch { res[k] = item; }
          }
        }
        return res;
      }

      // In Node.js test environment without window.localStorage
      if (!keys) return { ...inMemoryStore };
      const keyList = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
      const res: Record<string, any> = {};
      for (const k of keyList) {
        if (k in inMemoryStore) {
          res[k] = inMemoryStore[k];
        }
      }
      return res;
    } catch {
      return {};
    }
  },
  set: async (items: Record<string, any>) => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        for (const [k, v] of Object.entries(items)) {
          localStorage.setItem(k, JSON.stringify(v));
        }
      }
      for (const [k, v] of Object.entries(items)) {
        inMemoryStore[k] = v;
      }
    } catch {}
  },
  remove: async (keys: string | string[]) => {
    try {
      const list = typeof keys === 'string' ? [keys] : keys;
      if (typeof window !== 'undefined' && window.localStorage) {
        for (const k of list) localStorage.removeItem(k);
      }
      for (const k of list) delete inMemoryStore[k];
    } catch {}
  },
  clear: async () => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) localStorage.clear();
      for (const k of Object.keys(inMemoryStore)) delete inMemoryStore[k];
    } catch {}
  },
};

let resolvedBrowser: any = null;
if (isExtensionContext) {
  try {
    resolvedBrowser = require('webextension-polyfill');
  } catch {
    resolvedBrowser = rawChrome || rawBrowser;
  }
}

if (!resolvedBrowser) {
  resolvedBrowser = {
    storage: { local: mockLocalStorage },
    runtime: {
      id: rawChrome?.runtime?.id || 'standalone',
      sendMessage: async () => ({}),
      onMessage: { addListener: () => {} },
    },
  };
}

export const browser: any = resolvedBrowser;
export default browser;
export const chromeCompat: any = rawChrome?.storage?.local ? rawChrome : resolvedBrowser;
