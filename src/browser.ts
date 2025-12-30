/**
 * Railroad Memory - Browser Build
 *
 * This entry point provides browser-compatible exports for frontend applications.
 * It excludes Node.js-specific features (FileStorage) and includes browser storage adapters.
 *
 * @example
 * ```typescript
 * // In a React/Vue/Svelte/vanilla JS app
 * import { Railroad, LocalStorageAdapter, createSession } from '@metis/railroad-memory/browser';
 *
 * // Create session with localStorage
 * const session = await createSession('user-123', {
 *   storage: new LocalStorageAdapter()
 * });
 *
 * // Remember facts
 * await session.remember("User prefers dark mode");
 *
 * // Get context for LLM call
 * const context = await session.getContext();
 * console.log(context.toPrompt());
 * ```
 */

// Core Railroad class
export { Railroad } from './railroad';

// Types
export type {
  SessionState,
  Memory,
  Decision,
  UserProfile,
  Context,
  StorageAdapter,
  RailroadOptions,
  MemoryQuery,
  ExtractionResult
} from './types';

// Pruning types
export type { PruningConfig, PrunedState } from './pruning';

// Browser Storage Adapters
export {
  LocalStorageAdapter,
  IndexedDBAdapter,
  SessionStorageAdapter,
  RemoteAPIAdapter
} from './browser-storage';

// In-memory storage (works in browser)
export { MemoryStorage } from './storage';

// Pruning utilities
export { DEFAULT_PRUNING_CONFIG, pruneMemories } from './pruning';

// Import for createSession
import { Railroad } from './railroad';
import { LocalStorageAdapter } from './browser-storage';
import { MemoryStorage } from './storage';
import type { StorageAdapter, UserProfile } from './types';

/**
 * Browser-compatible session creation options
 */
export interface BrowserSessionOptions {
  storage?: StorageAdapter | 'localStorage' | 'sessionStorage' | 'indexedDB' | 'memory';
  initialUser?: Partial<UserProfile>;
  prefix?: string;
}

/**
 * Create or resume a session (browser-compatible)
 *
 * @example
 * ```typescript
 * // Using localStorage (default)
 * const session = await createSession('user-123');
 *
 * // Using IndexedDB for larger data
 * const session = await createSession('user-123', { storage: 'indexedDB' });
 *
 * // Using custom adapter
 * const session = await createSession('user-123', {
 *   storage: new RemoteAPIAdapter({ baseUrl: '/api/memory' })
 * });
 * ```
 */
export async function createSession(
  sessionId: string,
  options: BrowserSessionOptions = {}
): Promise<Railroad> {
  let storage: StorageAdapter;

  if (!options.storage || options.storage === 'localStorage') {
    storage = new LocalStorageAdapter({ prefix: options.prefix });
  } else if (options.storage === 'memory') {
    storage = new MemoryStorage();
  } else if (options.storage === 'sessionStorage') {
    const { SessionStorageAdapter } = await import('./browser-storage');
    storage = new SessionStorageAdapter({ prefix: options.prefix });
  } else if (options.storage === 'indexedDB') {
    const { IndexedDBAdapter } = await import('./browser-storage');
    const idbStorage = new IndexedDBAdapter();
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

/**
 * React Hook helper - creates a session that persists across renders
 *
 * @example
 * ```tsx
 * // In a React component
 * import { useEffect, useState } from 'react';
 * import { createSession, Railroad } from '@metis/railroad-memory/browser';
 *
 * function useRailroadSession(sessionId: string) {
 *   const [session, setSession] = useState<Railroad | null>(null);
 *
 *   useEffect(() => {
 *     createSession(sessionId).then(setSession);
 *   }, [sessionId]);
 *
 *   return session;
 * }
 *
 * function ChatComponent() {
 *   const session = useRailroadSession('user-123');
 *
 *   const handleMessage = async (msg: string) => {
 *     if (!session) return;
 *     await session.remember(msg);
 *     const context = await session.getContext();
 *     // Send to your LLM...
 *   };
 * }
 * ```
 */

/**
 * Check if running in browser environment
 */
export function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

/**
 * Get storage usage statistics
 */
export function getStorageStats(prefix = 'railroad'): {
  sessionCount: number;
  totalSize: number;
  sessions: { id: string; size: number }[];
} {
  if (!isBrowser()) {
    return { sessionCount: 0, totalSize: 0, sessions: [] };
  }

  const sessions: { id: string; size: number }[] = [];
  const prefixWithColon = `${prefix}:`;
  let totalSize = 0;

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefixWithColon)) {
      const value = localStorage.getItem(key) || '';
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

/**
 * Clear all Railroad sessions from storage
 */
export async function clearAllSessions(prefix = 'railroad'): Promise<number> {
  if (!isBrowser()) return 0;

  const adapter = new LocalStorageAdapter({ prefix });
  const sessions = await adapter.listSessions();

  for (const sessionId of sessions) {
    await adapter.delete(sessionId);
  }

  return sessions.length;
}
