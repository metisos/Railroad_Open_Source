/**
 * Railroad Storage Adapters
 *
 * Built-in storage backends for persisting session state.
 * Implement StorageAdapter interface for custom backends.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import YAML from 'yaml';
import type { StorageAdapter, SessionState } from './types';

/**
 * File-based storage adapter
 * Stores each session as a YAML file on disk
 */
export class FileStorage implements StorageAdapter {
  private directory: string;
  private format: 'yaml' | 'json';

  constructor(options: { directory?: string; format?: 'yaml' | 'json' } = {}) {
    this.directory = options.directory || './railroad-sessions';
    this.format = options.format || 'yaml';
  }

  private getFilePath(sessionId: string): string {
    const ext = this.format === 'yaml' ? 'yaml' : 'json';
    return path.join(this.directory, `${sessionId}.${ext}`);
  }

  async load(sessionId: string): Promise<SessionState | null> {
    const filePath = this.getFilePath(sessionId);

    try {
      const content = await fs.readFile(filePath, 'utf-8');

      if (this.format === 'yaml') {
        return YAML.parse(content) as SessionState;
      } else {
        return JSON.parse(content) as SessionState;
      }
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async save(state: SessionState): Promise<void> {
    // Ensure directory exists
    await fs.mkdir(this.directory, { recursive: true });

    const filePath = this.getFilePath(state.sessionId);

    let content: string;
    if (this.format === 'yaml') {
      content = YAML.stringify(state, { indent: 2 });
    } else {
      content = JSON.stringify(state, null, 2);
    }

    await fs.writeFile(filePath, content, 'utf-8');
  }

  async delete(sessionId: string): Promise<void> {
    const filePath = this.getFilePath(sessionId);

    try {
      await fs.unlink(filePath);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async exists(sessionId: string): Promise<boolean> {
    const filePath = this.getFilePath(sessionId);

    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async list(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.directory);
      const ext = this.format === 'yaml' ? '.yaml' : '.json';

      return files
        .filter((f) => f.endsWith(ext))
        .map((f) => f.replace(ext, ''));
    } catch {
      return [];
    }
  }
}

/**
 * In-memory storage adapter
 * Useful for testing or short-lived sessions
 */
export class MemoryStorage implements StorageAdapter {
  private store: Map<string, SessionState> = new Map();

  async load(sessionId: string): Promise<SessionState | null> {
    return this.store.get(sessionId) || null;
  }

  async save(state: SessionState): Promise<void> {
    // Deep clone to prevent reference issues
    this.store.set(state.sessionId, JSON.parse(JSON.stringify(state)));
  }

  async delete(sessionId: string): Promise<void> {
    this.store.delete(sessionId);
  }

  async exists(sessionId: string): Promise<boolean> {
    return this.store.has(sessionId);
  }

  async list(): Promise<string[]> {
    return Array.from(this.store.keys());
  }

  /** Clear all sessions (useful for testing) */
  clear(): void {
    this.store.clear();
  }
}

/**
 * Create a storage adapter from options
 */
export function createStorage(
  options:
    | 'memory'
    | 'file'
    | { type: 'file'; directory?: string; format?: 'yaml' | 'json' }
    | { type: 'memory' }
    | StorageAdapter
): StorageAdapter {
  if (typeof options === 'string') {
    if (options === 'memory') {
      return new MemoryStorage();
    } else if (options === 'file') {
      return new FileStorage();
    }
  }

  if (typeof options === 'object') {
    if ('load' in options && 'save' in options) {
      // It's already a StorageAdapter
      return options;
    }

    if ('type' in options) {
      if (options.type === 'memory') {
        return new MemoryStorage();
      } else if (options.type === 'file') {
        return new FileStorage({
          directory: options.directory,
          format: options.format,
        });
      }
    }
  }

  // Default to file storage
  return new FileStorage();
}
