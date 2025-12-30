/**
 * Browser Storage Adapters for Railroad Memory
 *
 * These adapters allow Railroad Memory to work in frontend JavaScript applications
 * using browser-native storage APIs.
 */

import type { StorageAdapter, SessionState } from './types';

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
export class LocalStorageAdapter implements StorageAdapter {
  private prefix: string;

  constructor(options: { prefix?: string } = {}) {
    this.prefix = options.prefix || 'railroad';
  }

  private getKey(sessionId: string): string {
    return `${this.prefix}:${sessionId}`;
  }

  async load(sessionId: string): Promise<SessionState | null> {
    try {
      const data = localStorage.getItem(this.getKey(sessionId));
      if (!data) return null;
      return JSON.parse(data) as SessionState;
    } catch (error) {
      console.error('LocalStorageAdapter: Failed to load session', error);
      return null;
    }
  }

  async save(state: SessionState): Promise<void> {
    try {
      const data = JSON.stringify(state);
      localStorage.setItem(this.getKey(state.sessionId), data);
    } catch (error) {
      // Handle quota exceeded
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        console.error('LocalStorageAdapter: Storage quota exceeded. Consider using IndexedDBAdapter for larger sessions.');
      }
      throw error;
    }
  }

  async delete(sessionId: string): Promise<void> {
    localStorage.removeItem(this.getKey(sessionId));
  }

  async exists(sessionId: string): Promise<boolean> {
    return localStorage.getItem(this.getKey(sessionId)) !== null;
  }

  /**
   * List all session IDs stored with this prefix
   */
  async listSessions(): Promise<string[]> {
    const sessions: string[] = [];
    const prefixWithColon = `${this.prefix}:`;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefixWithColon)) {
        sessions.push(key.substring(prefixWithColon.length));
      }
    }

    return sessions;
  }

  /**
   * Clear all sessions with this prefix
   */
  async clearAll(): Promise<void> {
    const sessions = await this.listSessions();
    for (const sessionId of sessions) {
      await this.delete(sessionId);
    }
  }

  /**
   * Get approximate storage usage in bytes
   */
  getStorageUsage(): { used: number; available: number } {
    let used = 0;
    const prefixWithColon = `${this.prefix}:`;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefixWithColon)) {
        const value = localStorage.getItem(key) || '';
        used += key.length + value.length;
      }
    }

    // localStorage limit is typically 5MB
    const available = 5 * 1024 * 1024 - used;

    return { used, available };
  }
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
export class IndexedDBAdapter implements StorageAdapter {
  private dbName: string;
  private storeName: string;
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(options: { dbName?: string; storeName?: string } = {}) {
    this.dbName = options.dbName || 'railroad-memory';
    this.storeName = options.storeName || 'sessions';
  }

  /**
   * Initialize the database connection
   * Must be called before using other methods
   */
  async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => {
        reject(new Error(`IndexedDB: Failed to open database: ${request.error}`));
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'sessionId' });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
      };
    });

    return this.initPromise;
  }

  private async ensureDb(): Promise<IDBDatabase> {
    if (!this.db) {
      await this.init();
    }
    if (!this.db) {
      throw new Error('IndexedDB: Database not initialized');
    }
    return this.db;
  }

  async load(sessionId: string): Promise<SessionState | null> {
    const db = await this.ensureDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(sessionId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  async save(state: SessionState): Promise<void> {
    const db = await this.ensureDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(state);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async delete(sessionId: string): Promise<void> {
    const db = await this.ensureDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(sessionId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async exists(sessionId: string): Promise<boolean> {
    const state = await this.load(sessionId);
    return state !== null;
  }

  /**
   * List all session IDs
   */
  async listSessions(): Promise<string[]> {
    const db = await this.ensureDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAllKeys();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result as string[]);
    });
  }

  /**
   * Get all sessions
   */
  async getAllSessions(): Promise<SessionState[]> {
    const db = await this.ensureDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  /**
   * Clear all sessions
   */
  async clearAll(): Promise<void> {
    const db = await this.ensureDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initPromise = null;
    }
  }
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
export class SessionStorageAdapter implements StorageAdapter {
  private prefix: string;

  constructor(options: { prefix?: string } = {}) {
    this.prefix = options.prefix || 'railroad';
  }

  private getKey(sessionId: string): string {
    return `${this.prefix}:${sessionId}`;
  }

  async load(sessionId: string): Promise<SessionState | null> {
    try {
      const data = sessionStorage.getItem(this.getKey(sessionId));
      if (!data) return null;
      return JSON.parse(data) as SessionState;
    } catch (error) {
      console.error('SessionStorageAdapter: Failed to load session', error);
      return null;
    }
  }

  async save(state: SessionState): Promise<void> {
    const data = JSON.stringify(state);
    sessionStorage.setItem(this.getKey(state.sessionId), data);
  }

  async delete(sessionId: string): Promise<void> {
    sessionStorage.removeItem(this.getKey(sessionId));
  }

  async exists(sessionId: string): Promise<boolean> {
    return sessionStorage.getItem(this.getKey(sessionId)) !== null;
  }
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
export class RemoteAPIAdapter implements StorageAdapter {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(options: { baseUrl: string; headers?: Record<string, string> }) {
    this.baseUrl = options.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };
  }

  async load(sessionId: string): Promise<SessionState | null> {
    try {
      const response = await fetch(`${this.baseUrl}/${encodeURIComponent(sessionId)}`, {
        method: 'GET',
        headers: this.headers
      });

      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      return await response.json();
    } catch (error) {
      console.error('RemoteAPIAdapter: Failed to load session', error);
      return null;
    }
  }

  async save(state: SessionState): Promise<void> {
    const response = await fetch(`${this.baseUrl}/${encodeURIComponent(state.sessionId)}`, {
      method: 'PUT',
      headers: this.headers,
      body: JSON.stringify(state)
    });

    if (!response.ok) {
      throw new Error(`RemoteAPIAdapter: Failed to save session: HTTP ${response.status}`);
    }
  }

  async delete(sessionId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
      headers: this.headers
    });

    if (!response.ok && response.status !== 404) {
      throw new Error(`RemoteAPIAdapter: Failed to delete session: HTTP ${response.status}`);
    }
  }

  async exists(sessionId: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/${encodeURIComponent(sessionId)}`, {
        method: 'HEAD',
        headers: this.headers
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
