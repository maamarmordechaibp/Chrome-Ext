// Offscreen documents only support the chrome.runtime API, so `chrome.storage`
// is undefined there. This installs a `chrome.storage.local` shim that proxies
// get/set/remove to the service worker (which does have chrome.storage), letting
// shared modules like StorageManager and the cloud session run unchanged inside
// the offscreen renderer.
import type { MessageResponse } from '../types';

type Callback = (result?: Record<string, unknown>) => void;

function proxy(payload: Record<string, unknown>): Promise<MessageResponse> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'STORAGE_LOCAL', payload }, (resp: MessageResponse) =>
      resolve(resp ?? { success: false }),
    );
  });
}

/** Installs the storage proxy when running where chrome.storage is unavailable. */
export function installOffscreenStorageProxy(): void {
  const api = chrome as unknown as { storage?: { local?: unknown } };
  if (api.storage?.local) return;

  const local = {
    get(keys: string | string[] | null, cb: Callback): void {
      void proxy({ op: 'get', keys }).then((r) => cb((r.data as Record<string, unknown>) ?? {}));
    },
    set(items: Record<string, unknown>, cb?: Callback): void {
      void proxy({ op: 'set', items }).then(() => cb?.());
    },
    remove(keys: string | string[], cb?: Callback): void {
      void proxy({ op: 'remove', keys }).then(() => cb?.());
    },
  };
  api.storage = { local };
}
