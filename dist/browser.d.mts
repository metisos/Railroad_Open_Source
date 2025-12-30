import { StorageAdapter, SessionState, UserProfile, Railroad } from './index.mjs';
export { Context, DEFAULT_PRUNING_CONFIG, Decision, ExtractionResult, Memory, MemoryQuery, MemoryStorage, PrunedState, PruningConfig, RailroadOptions, pruneMemories } from './index.mjs';

/**
 * Browser Storage Adapters for Railroad Memory
 *
 * These adapters allow Railroad Memory to work in frontend JavaScript applications
 * using browser-native storage APIs.
 */

/**
 * LocalStorage Adapter
 *
 * Simple key-value storage using browser's localStorage.
 * Best for: Small to medium sessions (< 5MB total)
 *
 * @example
 * ```typescript
 * import { Railroad, LocalStorageAdapter } from '@metis/railroad-memory/browser';
 *
 * const session = new Railroad({
 *   sessionId: 'user-123',
 *   storage: new LocalStorageAdapter()
 * });
 * ```
 */
declare class LocalStorageAdapter implements StorageAdapter {
    private prefix;
    constructor(options?: {
        prefix?: string;
    });
    private getKey;
    load(sessionId: string): Promise<SessionState | null>;
    save(state: SessionState): Promise<void>;
    delete(sessionId: string): Promise<void>;
    exists(sessionId: string): Promise<boolean>;
    /**
     * List all session IDs stored with this prefix
     */
    listSessions(): Promise<string[]>;
    /**
     * Clear all sessions with this prefix
     */
    clearAll(): Promise<void>;
    /**
     * Get approximate storage usage in bytes
     */
    getStorageUsage(): {
        used: number;
        available: number;
    };
}
/**
 * IndexedDB Adapter
 *
 * More robust storage using browser's IndexedDB.
 * Best for: Large sessions, many memories, offline-first apps
 *
 * @example
 * ```typescript
 * import { Railroad, IndexedDBAdapter } from '@metis/railroad-memory/browser';
 *
 * const storage = new IndexedDBAdapter({ dbName: 'myapp-memory' });
 * await storage.init();
 *
 * const session = new Railroad({
 *   sessionId: 'user-123',
 *   storage
 * });
 * ```
 */
declare class IndexedDBAdapter implements StorageAdapter {
    private dbName;
    private storeName;
    private db;
    private initPromise;
    constructor(options?: {
        dbName?: string;
        storeName?: string;
    });
    /**
     * Initialize the database connection
     * Must be called before using other methods
     */
    init(): Promise<void>;
    private ensureDb;
    load(sessionId: string): Promise<SessionState | null>;
    save(state: SessionState): Promise<void>;
    delete(sessionId: string): Promise<void>;
    exists(sessionId: string): Promise<boolean>;
    /**
     * List all session IDs
     */
    listSessions(): Promise<string[]>;
    /**
     * Get all sessions
     */
    getAllSessions(): Promise<SessionState[]>;
    /**
     * Clear all sessions
     */
    clearAll(): Promise<void>;
    /**
     * Close the database connection
     */
    close(): void;
}
/**
 * SessionStorage Adapter
 *
 * Temporary storage that clears when the browser tab closes.
 * Best for: Ephemeral sessions, testing, anonymous users
 *
 * @example
 * ```typescript
 * import { Railroad, SessionStorageAdapter } from '@metis/railroad-memory/browser';
 *
 * const session = new Railroad({
 *   sessionId: 'temp-session',
 *   storage: new SessionStorageAdapter()
 * });
 * ```
 */
declare class SessionStorageAdapter implements StorageAdapter {
    private prefix;
    constructor(options?: {
        prefix?: string;
    });
    private getKey;
    load(sessionId: string): Promise<SessionState | null>;
    save(state: SessionState): Promise<void>;
    delete(sessionId: string): Promise<void>;
    exists(sessionId: string): Promise<boolean>;
}
/**
 * Remote API Adapter
 *
 * Store sessions on your backend server.
 * Best for: Cross-device sync, server-side processing, enterprise apps
 *
 * @example
 * ```typescript
 * import { Railroad, RemoteAPIAdapter } from '@metis/railroad-memory/browser';
 *
 * const session = new Railroad({
 *   sessionId: 'user-123',
 *   storage: new RemoteAPIAdapter({
 *     baseUrl: 'https://api.myapp.com/memory',
 *     headers: { 'Authorization': 'Bearer token123' }
 *   })
 * });
 * ```
 */
declare class RemoteAPIAdapter implements StorageAdapter {
    private baseUrl;
    private headers;
    constructor(options: {
        baseUrl: string;
        headers?: Record<string, string>;
    });
    load(sessionId: string): Promise<SessionState | null>;
    save(state: SessionState): Promise<void>;
    delete(sessionId: string): Promise<void>;
    exists(sessionId: string): Promise<boolean>;
}

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

/**
 * Browser-compatible session creation options
 */
interface BrowserSessionOptions {
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
declare function createSession(sessionId: string, options?: BrowserSessionOptions): Promise<Railroad>;
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
declare function isBrowser(): boolean;
/**
 * Get storage usage statistics
 */
declare function getStorageStats(prefix?: string): {
    sessionCount: number;
    totalSize: number;
    sessions: {
        id: string;
        size: number;
    }[];
};
/**
 * Clear all Railroad sessions from storage
 */
declare function clearAllSessions(prefix?: string): Promise<number>;

export { type BrowserSessionOptions, IndexedDBAdapter, LocalStorageAdapter, Railroad, RemoteAPIAdapter, SessionState, SessionStorageAdapter, StorageAdapter, UserProfile, clearAllSessions, createSession, getStorageStats, isBrowser };
