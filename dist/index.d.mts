/**
 * Railroad Memory Types
 *
 * Core type definitions for the Railroad context memory system.
 */
/**
 * User profile extracted from conversation
 */
interface UserProfile {
    name?: string;
    [key: string]: unknown;
}
/**
 * A single memory item
 */
interface Memory {
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
interface Decision {
    id: string;
    content: string;
    context?: string;
    createdAt: string;
    metadata?: Record<string, unknown>;
}
/**
 * Complete session state
 */
interface SessionState {
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
interface RailroadOptions {
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
interface ExtractionResult {
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
interface Context {
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
interface StorageAdapter {
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
interface MemoryQuery {
    /** Filter by category */
    category?: string;
    /** Maximum number to return */
    limit?: number;
    /** Minimum importance score */
    minImportance?: number;
    /** Search text (simple contains match) */
    search?: string;
}

/**
 * Railroad Memory Pruning
 *
 * Strategies for managing memory growth in long-running tasks.
 * Keeps context size bounded while preserving important information.
 */

/**
 * Memory tier - determines how memories are stored and injected
 */
type MemoryTier = 'core' | 'working' | 'longterm' | 'archived';
/**
 * Pruning configuration
 */
interface PruningConfig {
    /** Maximum memories in working memory (default: 100) */
    workingMemoryLimit: number;
    /** Days before memory moves from working to long-term (default: 7) */
    workingMemoryDays: number;
    /** Maximum long-term memory summaries (default: 50) */
    longTermLimit: number;
    /** Days of memories per long-term summary (default: 7) */
    summaryWindowDays: number;
    /** Importance threshold for core facts (default: 9) */
    coreFactThreshold: number;
    /** Enable importance decay (default: true) */
    enableDecay: boolean;
    /** Decay half-life in days (default: 14) */
    decayHalfLifeDays: number;
    /** Minimum importance before archival (default: 2) */
    archiveThreshold: number;
}
/**
 * Default pruning configuration
 */
declare const DEFAULT_PRUNING_CONFIG: PruningConfig;
/**
 * Extended memory with pruning metadata
 */
interface PrunableMemory extends Memory {
    tier: MemoryTier;
    lastAccessed: string;
    accessCount: number;
    decayedImportance?: number;
}
/**
 * Long-term memory summary
 */
interface MemorySummary {
    id: string;
    period: {
        start: string;
        end: string;
    };
    summary: string;
    sourceMemoryIds: string[];
    createdAt: string;
}
/**
 * Pruned state structure
 */
interface PrunedState {
    /** Core facts - always injected, never pruned */
    coreFacts: PrunableMemory[];
    /** Working memory - recent, full detail */
    workingMemory: PrunableMemory[];
    /** Long-term memory - older, summarized */
    longTermMemory: MemorySummary[];
    /** Archived - stored but not injected */
    archived: PrunableMemory[];
}
/**
 * Calculate decayed importance based on time since last access
 */
declare function calculateDecayedImportance(memory: PrunableMemory, config: PruningConfig): number;
/**
 * Identify core facts that should never be pruned
 */
declare function identifyCoreFacts(memories: Memory[], config?: PruningConfig): Memory[];
/**
 * Generate a prompt for LLM to summarize memories
 */
declare function generateSummaryPrompt(memories: Memory[], periodStart: string, periodEnd: string): string;
/**
 * Deduplicate similar memories
 */
declare function deduplicateMemories(memories: Memory[]): Memory[];
/**
 * Boost importance of memories matching a query (reinforcement)
 */
declare function reinforceMemories(memories: PrunableMemory[], query: string, boost?: number): PrunableMemory[];
/**
 * Prune memories according to configuration
 * Returns structured memory tiers
 */
declare function pruneMemories(memories: Memory[], config?: PruningConfig): PrunedState;
/**
 * Calculate token estimate for pruned state
 */
declare function estimateTokens(state: PrunedState): {
    core: number;
    working: number;
    longTerm: number;
    total: number;
};
/**
 * Format pruned state for LLM injection
 */
declare function formatPrunedStateForPrompt(state: PrunedState): string;

/**
 * Railroad - Main class for managing agent memory
 */
declare class Railroad {
    private sessionId;
    private storage;
    private state;
    private initialized;
    constructor(options: RailroadOptions | string);
    /**
     * Initialize the session - loads existing or creates new
     */
    init(options?: {
        initialUser?: UserProfile;
    }): Promise<void>;
    /**
     * Ensure session is initialized
     */
    private ensureInit;
    /**
     * Save current state to storage
     */
    private save;
    /**
     * Get current user profile
     */
    getUser(): Promise<UserProfile>;
    /**
     * Update user profile (merges with existing)
     */
    updateUser(updates: Partial<UserProfile>): Promise<void>;
    /**
     * Set user profile (replaces existing)
     */
    setUser(user: UserProfile): Promise<void>;
    /**
     * Add one or more memories
     */
    remember(facts: string | string[], options?: {
        category?: string;
        importance?: number;
    }): Promise<Memory[]>;
    /**
     * Get all memories, optionally filtered
     */
    getMemories(query?: MemoryQuery): Promise<Memory[]>;
    /**
     * Get memory count
     */
    getMemoryCount(): Promise<number>;
    /**
     * Clear all memories (use with caution)
     */
    clearMemories(): Promise<void>;
    /**
     * Track a decision
     */
    decide(decision: string, context?: string): Promise<Decision>;
    /**
     * Get all decisions
     */
    getDecisions(): Promise<Decision[]>;
    /**
     * Set current conversation context
     */
    setContext(context: string): Promise<void>;
    /**
     * Get current conversation context
     */
    getCurrentContext(): Promise<string | undefined>;
    /**
     * Get full context object for injection into LLM
     */
    getContext(): Promise<Context>;
    /**
     * Record tokens used (for tracking)
     */
    addTokens(count: number): Promise<void>;
    /**
     * Increment message count
     */
    incrementMessageCount(): Promise<void>;
    /**
     * Get current stats
     */
    getStats(): Promise<SessionState['stats'] & {
        memoryCount: number;
        decisionCount: number;
    }>;
    /**
     * Process an extraction result from LLM
     * This is a convenience method for handling structured LLM output
     */
    processExtraction(result: ExtractionResult): Promise<void>;
    /**
     * Get the system prompt for memory extraction
     * Use this to instruct your LLM to return structured output
     */
    static getExtractionPrompt(): string;
    /**
     * Get raw session state
     */
    getState(): Promise<SessionState>;
    /**
     * Delete this session
     */
    destroy(): Promise<void>;
    /**
     * Check if session exists in storage
     */
    exists(): Promise<boolean>;
    /**
     * Get session ID
     */
    getSessionId(): string;
    /**
     * Prune memories to keep context size manageable
     * Returns pruned state without modifying the session
     */
    getPrunedContext(config?: Partial<PruningConfig>): Promise<PrunedState>;
    /**
     * Get context formatted with pruning applied
     * Use this for long-running sessions where memory has grown large
     */
    getPrunedPrompt(config?: Partial<PruningConfig>): Promise<string>;
    /**
     * Estimate token count for current context
     */
    estimateContextTokens(): Promise<{
        raw: number;
        pruned: number;
    }>;
    /**
     * Mark a memory as accessed (for reinforcement learning)
     */
    touchMemory(memoryId: string): Promise<void>;
    /**
     * Boost importance of memories matching a search term
     */
    reinforceMemories(searchTerm: string, boost?: number): Promise<number>;
    /**
     * Archive old memories (move to separate storage, reduce active set)
     */
    archiveOldMemories(daysOld?: number): Promise<{
        archived: number;
        remaining: number;
    }>;
}
/**
 * Create a new Railroad session
 * Convenience function for quick setup
 */
declare function createSession(sessionId: string, options?: {
    storage?: 'memory' | 'file' | StorageAdapter;
    initialUser?: UserProfile;
}): Promise<Railroad>;

/**
 * Railroad Storage Adapters
 *
 * Built-in storage backends for persisting session state.
 * Implement StorageAdapter interface for custom backends.
 */

/**
 * File-based storage adapter
 * Stores each session as a YAML file on disk
 */
declare class FileStorage implements StorageAdapter {
    private directory;
    private format;
    constructor(options?: {
        directory?: string;
        format?: 'yaml' | 'json';
    });
    private getFilePath;
    load(sessionId: string): Promise<SessionState | null>;
    save(state: SessionState): Promise<void>;
    delete(sessionId: string): Promise<void>;
    exists(sessionId: string): Promise<boolean>;
    list(): Promise<string[]>;
}
/**
 * In-memory storage adapter
 * Useful for testing or short-lived sessions
 */
declare class MemoryStorage implements StorageAdapter {
    private store;
    load(sessionId: string): Promise<SessionState | null>;
    save(state: SessionState): Promise<void>;
    delete(sessionId: string): Promise<void>;
    exists(sessionId: string): Promise<boolean>;
    list(): Promise<string[]>;
    /** Clear all sessions (useful for testing) */
    clear(): void;
}
/**
 * Create a storage adapter from options
 */
declare function createStorage(options: 'memory' | 'file' | {
    type: 'file';
    directory?: string;
    format?: 'yaml' | 'json';
} | {
    type: 'memory';
} | StorageAdapter): StorageAdapter;

export { type Context, DEFAULT_PRUNING_CONFIG, type Decision, type ExtractionResult, FileStorage, type Memory, type MemoryQuery, MemoryStorage, type MemorySummary, type MemoryTier, type PrunableMemory, type PrunedState, type PruningConfig, Railroad, type RailroadOptions, type SessionState, type StorageAdapter, type UserProfile, calculateDecayedImportance, createSession, createStorage, deduplicateMemories, estimateTokens, formatPrunedStateForPrompt, generateSummaryPrompt, identifyCoreFacts, pruneMemories, reinforceMemories };
