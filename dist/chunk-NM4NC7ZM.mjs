// src/browser-storage.ts
var LocalStorageAdapter = class {
  prefix;
  constructor(options = {}) {
    this.prefix = options.prefix || "railroad";
  }
  getKey(sessionId) {
    return `${this.prefix}:${sessionId}`;
  }
  async load(sessionId) {
    try {
      const data = localStorage.getItem(this.getKey(sessionId));
      if (!data) return null;
      return JSON.parse(data);
    } catch (error) {
      console.error("LocalStorageAdapter: Failed to load session", error);
      return null;
    }
  }
  async save(state) {
    try {
      const data = JSON.stringify(state);
      localStorage.setItem(this.getKey(state.sessionId), data);
    } catch (error) {
      if (error instanceof Error && error.name === "QuotaExceededError") {
        console.error("LocalStorageAdapter: Storage quota exceeded. Consider using IndexedDBAdapter for larger sessions.");
      }
      throw error;
    }
  }
  async delete(sessionId) {
    localStorage.removeItem(this.getKey(sessionId));
  }
  async exists(sessionId) {
    return localStorage.getItem(this.getKey(sessionId)) !== null;
  }
  /**
   * List all session IDs stored with this prefix
   */
  async listSessions() {
    const sessions = [];
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
  async clearAll() {
    const sessions = await this.listSessions();
    for (const sessionId of sessions) {
      await this.delete(sessionId);
    }
  }
  /**
   * Get approximate storage usage in bytes
   */
  getStorageUsage() {
    let used = 0;
    const prefixWithColon = `${this.prefix}:`;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefixWithColon)) {
        const value = localStorage.getItem(key) || "";
        used += key.length + value.length;
      }
    }
    const available = 5 * 1024 * 1024 - used;
    return { used, available };
  }
};
var IndexedDBAdapter = class {
  dbName;
  storeName;
  db = null;
  initPromise = null;
  constructor(options = {}) {
    this.dbName = options.dbName || "railroad-memory";
    this.storeName = options.storeName || "sessions";
  }
  /**
   * Initialize the database connection
   * Must be called before using other methods
   */
  async init() {
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
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: "sessionId" });
          store.createIndex("updatedAt", "updatedAt", { unique: false });
        }
      };
    });
    return this.initPromise;
  }
  async ensureDb() {
    if (!this.db) {
      await this.init();
    }
    if (!this.db) {
      throw new Error("IndexedDB: Database not initialized");
    }
    return this.db;
  }
  async load(sessionId) {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, "readonly");
      const store = transaction.objectStore(this.storeName);
      const request = store.get(sessionId);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }
  async save(state) {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, "readwrite");
      const store = transaction.objectStore(this.storeName);
      const request = store.put(state);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }
  async delete(sessionId) {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, "readwrite");
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(sessionId);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }
  async exists(sessionId) {
    const state = await this.load(sessionId);
    return state !== null;
  }
  /**
   * List all session IDs
   */
  async listSessions() {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, "readonly");
      const store = transaction.objectStore(this.storeName);
      const request = store.getAllKeys();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }
  /**
   * Get all sessions
   */
  async getAllSessions() {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, "readonly");
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }
  /**
   * Clear all sessions
   */
  async clearAll() {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, "readwrite");
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }
  /**
   * Close the database connection
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initPromise = null;
    }
  }
};
var SessionStorageAdapter = class {
  prefix;
  constructor(options = {}) {
    this.prefix = options.prefix || "railroad";
  }
  getKey(sessionId) {
    return `${this.prefix}:${sessionId}`;
  }
  async load(sessionId) {
    try {
      const data = sessionStorage.getItem(this.getKey(sessionId));
      if (!data) return null;
      return JSON.parse(data);
    } catch (error) {
      console.error("SessionStorageAdapter: Failed to load session", error);
      return null;
    }
  }
  async save(state) {
    const data = JSON.stringify(state);
    sessionStorage.setItem(this.getKey(state.sessionId), data);
  }
  async delete(sessionId) {
    sessionStorage.removeItem(this.getKey(sessionId));
  }
  async exists(sessionId) {
    return sessionStorage.getItem(this.getKey(sessionId)) !== null;
  }
};
var RemoteAPIAdapter = class {
  baseUrl;
  headers;
  constructor(options) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.headers = {
      "Content-Type": "application/json",
      ...options.headers
    };
  }
  async load(sessionId) {
    try {
      const response = await fetch(`${this.baseUrl}/${encodeURIComponent(sessionId)}`, {
        method: "GET",
        headers: this.headers
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error("RemoteAPIAdapter: Failed to load session", error);
      return null;
    }
  }
  async save(state) {
    const response = await fetch(`${this.baseUrl}/${encodeURIComponent(state.sessionId)}`, {
      method: "PUT",
      headers: this.headers,
      body: JSON.stringify(state)
    });
    if (!response.ok) {
      throw new Error(`RemoteAPIAdapter: Failed to save session: HTTP ${response.status}`);
    }
  }
  async delete(sessionId) {
    const response = await fetch(`${this.baseUrl}/${encodeURIComponent(sessionId)}`, {
      method: "DELETE",
      headers: this.headers
    });
    if (!response.ok && response.status !== 404) {
      throw new Error(`RemoteAPIAdapter: Failed to delete session: HTTP ${response.status}`);
    }
  }
  async exists(sessionId) {
    try {
      const response = await fetch(`${this.baseUrl}/${encodeURIComponent(sessionId)}`, {
        method: "HEAD",
        headers: this.headers
      });
      return response.ok;
    } catch {
      return false;
    }
  }
};

export {
  LocalStorageAdapter,
  IndexedDBAdapter,
  SessionStorageAdapter,
  RemoteAPIAdapter
};
