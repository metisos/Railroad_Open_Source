import {
  MemoryStorage,
  Railroad
} from "./chunk-O3IDRRMX.mjs";
import {
  DEFAULT_PRUNING_CONFIG,
  pruneMemories
} from "./chunk-EAGTNQYD.mjs";
import {
  IndexedDBAdapter,
  LocalStorageAdapter,
  RemoteAPIAdapter,
  SessionStorageAdapter
} from "./chunk-NM4NC7ZM.mjs";

// src/browser.ts
async function createSession(sessionId, options = {}) {
  let storage;
  if (!options.storage || options.storage === "localStorage") {
    storage = new LocalStorageAdapter({ prefix: options.prefix });
  } else if (options.storage === "memory") {
    storage = new MemoryStorage();
  } else if (options.storage === "sessionStorage") {
    const { SessionStorageAdapter: SessionStorageAdapter2 } = await import("./browser-storage-NM532BJM.mjs");
    storage = new SessionStorageAdapter2({ prefix: options.prefix });
  } else if (options.storage === "indexedDB") {
    const { IndexedDBAdapter: IndexedDBAdapter2 } = await import("./browser-storage-NM532BJM.mjs");
    const idbStorage = new IndexedDBAdapter2();
    await idbStorage.init();
    storage = idbStorage;
  } else {
    storage = options.storage;
  }
  const session = new Railroad({
    sessionId,
    storage
  });
  await session.init();
  if (options.initialUser) {
    await session.updateUser(options.initialUser);
  }
  return session;
}
function isBrowser() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}
function getStorageStats(prefix = "railroad") {
  if (!isBrowser()) {
    return { sessionCount: 0, totalSize: 0, sessions: [] };
  }
  const sessions = [];
  const prefixWithColon = `${prefix}:`;
  let totalSize = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefixWithColon)) {
      const value = localStorage.getItem(key) || "";
      const size = key.length + value.length;
      sessions.push({
        id: key.substring(prefixWithColon.length),
        size
      });
      totalSize += size;
    }
  }
  return {
    sessionCount: sessions.length,
    totalSize,
    sessions
  };
}
async function clearAllSessions(prefix = "railroad") {
  if (!isBrowser()) return 0;
  const adapter = new LocalStorageAdapter({ prefix });
  const sessions = await adapter.listSessions();
  for (const sessionId of sessions) {
    await adapter.delete(sessionId);
  }
  return sessions.length;
}
export {
  DEFAULT_PRUNING_CONFIG,
  IndexedDBAdapter,
  LocalStorageAdapter,
  MemoryStorage,
  Railroad,
  RemoteAPIAdapter,
  SessionStorageAdapter,
  clearAllSessions,
  createSession,
  getStorageStats,
  isBrowser,
  pruneMemories
};
