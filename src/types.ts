/**
 * Railroad Memory Types
 *
 * Core type definitions for the Railroad context memory system.
 */

/**
 * User profile extracted from conversation
 */
export interface UserProfile {
  name?: string;
  [key: string]: unknown;
}

/**
 * A single memory item
 */
export interface Memory {
  id: string;
  content: string;
  category?: string;
  importance?: number;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

/**
 * A tracked decision
 */
export interface Decision {
  id: string;
  content: string;
  context?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

/**
 * Complete session state
 */
export interface SessionState {
  sessionId: string;
  createdAt: string;
  updatedAt: string;

  /** User profile - who we're talking to */
  user: UserProfile;

  /** Accumulated memories - facts extracted from conversation */
  memories: Memory[];

  /** Tracked decisions - commitments and choices made */
  decisions: Decision[];

  /** Current conversation context */
  currentContext?: string;

  /** Token tracking */
  stats: {
    totalTokens: number;
    messageCount: number;
  };

  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Options for creating a new Railroad session
 */
export interface RailroadOptions {
  /** Unique session identifier */
  sessionId: string;

  /** Storage backend to use */
  storage?: StorageAdapter;

  /** Initial user profile (optional) */
  initialUser?: UserProfile;

  /** Custom metadata (optional) */
  metadata?: Record<string, unknown>;
}

/**
 * What the LLM should return for memory extraction
 */
export interface ExtractionResult {
  /** Natural language response to user */
  response: string;

  /** New user info extracted */
  userUpdates?: Partial<UserProfile>;

  /** New facts to remember */
  newMemories?: string[];

  /** New decisions made */
  newDecisions?: string[];

  /** Updated context summary */
  currentContext?: string;
}

/**
 * Context object returned to agents
 */
export interface Context {
  /** Session ID */
  sessionId: string;

  /** User profile */
  user: UserProfile;

  /** All memories */
  memories: Memory[];

  /** All decisions */
  decisions: Decision[];

  /** Current context */
  currentContext?: string;

  /** Stats */
  stats: {
    totalTokens: number;
    messageCount: number;
    memoryCount: number;
    decisionCount: number;
  };

  /** Convert to prompt-friendly string */
  toPrompt(): string;

  /** Convert to YAML string */
  toYAML(): string;

  /** Convert to JSON string */
  toJSON(): string;
}

/**
 * Storage adapter interface - implement this for custom storage backends
 */
export interface StorageAdapter {
  /** Load session state, returns null if not found */
  load(sessionId: string): Promise<SessionState | null>;

  /** Save session state */
  save(state: SessionState): Promise<void>;

  /** Delete session */
  delete(sessionId: string): Promise<void>;

  /** Check if session exists */
  exists(sessionId: string): Promise<boolean>;

  /** List all session IDs (optional) */
  list?(): Promise<string[]>;
}

/**
 * Memory query options
 */
export interface MemoryQuery {
  /** Filter by category */
  category?: string;

  /** Maximum number to return */
  limit?: number;

  /** Minimum importance score */
  minImportance?: number;

  /** Search text (simple contains match) */
  search?: string;
}
