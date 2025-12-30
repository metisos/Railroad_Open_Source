/**
 * Railroad - Dynamic Context Memory for AI Agents
 *
 * Enables AI agents to maintain coherent context indefinitely
 * by persisting state to storage instead of relying on conversation history.
 */

import YAML from 'yaml';
import { createStorage, FileStorage } from './storage';
import type {
  SessionState,
  RailroadOptions,
  StorageAdapter,
  UserProfile,
  Memory,
  Decision,
  Context,
  ExtractionResult,
  MemoryQuery,
} from './types';

/**
 * Generate a unique ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get current ISO timestamp
 */
function now(): string {
  return new Date().toISOString();
}

/**
 * Railroad - Main class for managing agent memory
 */
export class Railroad {
  private sessionId: string;
  private storage: StorageAdapter;
  private state: SessionState | null = null;
  private initialized = false;

  constructor(options: RailroadOptions | string) {
    if (typeof options === 'string') {
      this.sessionId = options;
      this.storage = new FileStorage();
    } else {
      this.sessionId = options.sessionId;
      this.storage = options.storage
        ? createStorage(options.storage as Parameters<typeof createStorage>[0])
        : new FileStorage();
    }
  }

  /**
   * Initialize the session - loads existing or creates new
   */
  async init(options?: { initialUser?: UserProfile }): Promise<void> {
    if (this.initialized) return;

    const existing = await this.storage.load(this.sessionId);

    if (existing) {
      this.state = existing;
    } else {
      this.state = {
        sessionId: this.sessionId,
        createdAt: now(),
        updatedAt: now(),
        user: options?.initialUser || {},
        memories: [],
        decisions: [],
        currentContext: undefined,
        stats: {
          totalTokens: 0,
          messageCount: 0,
        },
      };
      await this.save();
    }

    this.initialized = true;
  }

  /**
   * Ensure session is initialized
   */
  private async ensureInit(): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }
  }

  /**
   * Save current state to storage
   */
  private async save(): Promise<void> {
    if (!this.state) return;
    this.state.updatedAt = now();
    await this.storage.save(this.state);
  }

  // ============================================================
  // USER PROFILE
  // ============================================================

  /**
   * Get current user profile
   */
  async getUser(): Promise<UserProfile> {
    await this.ensureInit();
    return { ...this.state!.user };
  }

  /**
   * Update user profile (merges with existing)
   */
  async updateUser(updates: Partial<UserProfile>): Promise<void> {
    await this.ensureInit();
    this.state!.user = { ...this.state!.user, ...updates };
    await this.save();
  }

  /**
   * Set user profile (replaces existing)
   */
  async setUser(user: UserProfile): Promise<void> {
    await this.ensureInit();
    this.state!.user = user;
    await this.save();
  }

  // ============================================================
  // MEMORIES
  // ============================================================

  /**
   * Add one or more memories
   */
  async remember(
    facts: string | string[],
    options?: { category?: string; importance?: number }
  ): Promise<Memory[]> {
    await this.ensureInit();

    const factArray = Array.isArray(facts) ? facts : [facts];
    const newMemories: Memory[] = [];

    for (const content of factArray) {
      const memory: Memory = {
        id: generateId(),
        content,
        category: options?.category,
        importance: options?.importance,
        createdAt: now(),
      };
      this.state!.memories.push(memory);
      newMemories.push(memory);
    }

    await this.save();
    return newMemories;
  }

  /**
   * Get all memories, optionally filtered
   */
  async getMemories(query?: MemoryQuery): Promise<Memory[]> {
    await this.ensureInit();

    let memories = [...this.state!.memories];

    if (query?.category) {
      memories = memories.filter((m) => m.category === query.category);
    }

    if (query?.minImportance !== undefined) {
      memories = memories.filter(
        (m) => (m.importance || 0) >= query.minImportance!
      );
    }

    if (query?.search) {
      const searchLower = query.search.toLowerCase();
      memories = memories.filter((m) =>
        m.content.toLowerCase().includes(searchLower)
      );
    }

    if (query?.limit) {
      memories = memories.slice(-query.limit);
    }

    return memories;
  }

  /**
   * Get memory count
   */
  async getMemoryCount(): Promise<number> {
    await this.ensureInit();
    return this.state!.memories.length;
  }

  /**
   * Clear all memories (use with caution)
   */
  async clearMemories(): Promise<void> {
    await this.ensureInit();
    this.state!.memories = [];
    await this.save();
  }

  // ============================================================
  // DECISIONS
  // ============================================================

  /**
   * Track a decision
   */
  async decide(
    decision: string,
    context?: string
  ): Promise<Decision> {
    await this.ensureInit();

    const newDecision: Decision = {
      id: generateId(),
      content: decision,
      context,
      createdAt: now(),
    };

    this.state!.decisions.push(newDecision);
    await this.save();

    return newDecision;
  }

  /**
   * Get all decisions
   */
  async getDecisions(): Promise<Decision[]> {
    await this.ensureInit();
    return [...this.state!.decisions];
  }

  // ============================================================
  // CONTEXT
  // ============================================================

  /**
   * Set current conversation context
   */
  async setContext(context: string): Promise<void> {
    await this.ensureInit();
    this.state!.currentContext = context;
    await this.save();
  }

  /**
   * Get current conversation context
   */
  async getCurrentContext(): Promise<string | undefined> {
    await this.ensureInit();
    return this.state!.currentContext;
  }

  /**
   * Get full context object for injection into LLM
   */
  async getContext(): Promise<Context> {
    await this.ensureInit();

    const state = this.state!;

    const context: Context = {
      sessionId: state.sessionId,
      user: { ...state.user },
      memories: [...state.memories],
      decisions: [...state.decisions],
      currentContext: state.currentContext,
      stats: {
        totalTokens: state.stats.totalTokens,
        messageCount: state.stats.messageCount,
        memoryCount: state.memories.length,
        decisionCount: state.decisions.length,
      },

      toPrompt(): string {
        const lines: string[] = [];

        if (Object.keys(context.user).length > 0) {
          lines.push('## User Profile');
          for (const [key, value] of Object.entries(context.user)) {
            lines.push(`- ${key}: ${value}`);
          }
          lines.push('');
        }

        if (context.memories.length > 0) {
          lines.push('## Memories');
          for (const memory of context.memories) {
            lines.push(`- ${memory.content}`);
          }
          lines.push('');
        }

        if (context.decisions.length > 0) {
          lines.push('## Decisions');
          for (const decision of context.decisions) {
            lines.push(`- ${decision.content}`);
          }
          lines.push('');
        }

        if (context.currentContext) {
          lines.push(`## Current Context`);
          lines.push(context.currentContext);
        }

        return lines.join('\n');
      },

      toYAML(): string {
        return YAML.stringify({
          user: context.user,
          memories: context.memories.map((m) => m.content),
          decisions: context.decisions.map((d) => d.content),
          currentContext: context.currentContext,
        });
      },

      toJSON(): string {
        return JSON.stringify(
          {
            user: context.user,
            memories: context.memories,
            decisions: context.decisions,
            currentContext: context.currentContext,
            stats: context.stats,
          },
          null,
          2
        );
      },
    };

    return context;
  }

  // ============================================================
  // STATS & TRACKING
  // ============================================================

  /**
   * Record tokens used (for tracking)
   */
  async addTokens(count: number): Promise<void> {
    await this.ensureInit();
    this.state!.stats.totalTokens += count;
    await this.save();
  }

  /**
   * Increment message count
   */
  async incrementMessageCount(): Promise<void> {
    await this.ensureInit();
    this.state!.stats.messageCount += 1;
    await this.save();
  }

  /**
   * Get current stats
   */
  async getStats(): Promise<SessionState['stats'] & { memoryCount: number; decisionCount: number }> {
    await this.ensureInit();
    return {
      ...this.state!.stats,
      memoryCount: this.state!.memories.length,
      decisionCount: this.state!.decisions.length,
    };
  }

  // ============================================================
  // EXTRACTION HELPERS
  // ============================================================

  /**
   * Process an extraction result from LLM
   * This is a convenience method for handling structured LLM output
   */
  async processExtraction(result: ExtractionResult): Promise<void> {
    await this.ensureInit();

    if (result.userUpdates) {
      await this.updateUser(result.userUpdates);
    }

    if (result.newMemories && result.newMemories.length > 0) {
      await this.remember(result.newMemories);
    }

    if (result.newDecisions && result.newDecisions.length > 0) {
      for (const decision of result.newDecisions) {
        await this.decide(decision);
      }
    }

    if (result.currentContext) {
      await this.setContext(result.currentContext);
    }
  }

  /**
   * Get the system prompt for memory extraction
   * Use this to instruct your LLM to return structured output
   */
  static getExtractionPrompt(): string {
    return `You are having an ongoing conversation. Your memory persists between messages.

CRITICAL RULES:
1. Reference the user by name when known
2. Use facts from memory naturally in responses
3. Extract new facts worth remembering
4. Track decisions and commitments

Your response MUST be valid JSON:
{
  "response": "Your natural conversational response",
  "userUpdates": {"key": "value"} or null,
  "newMemories": ["fact 1", "fact 2"] or [],
  "newDecisions": ["decision 1"] or [],
  "currentContext": "Brief summary of current discussion"
}`;
  }

  // ============================================================
  // SESSION MANAGEMENT
  // ============================================================

  /**
   * Get raw session state
   */
  async getState(): Promise<SessionState> {
    await this.ensureInit();
    return JSON.parse(JSON.stringify(this.state));
  }

  /**
   * Delete this session
   */
  async destroy(): Promise<void> {
    await this.storage.delete(this.sessionId);
    this.state = null;
    this.initialized = false;
  }

  /**
   * Check if session exists in storage
   */
  async exists(): Promise<boolean> {
    return this.storage.exists(this.sessionId);
  }

  /**
   * Get session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  // ============================================================
  // PRUNING
  // ============================================================

  /**
   * Prune memories to keep context size manageable
   * Returns pruned state without modifying the session
   */
  async getPrunedContext(config?: Partial<import('./pruning').PruningConfig>): Promise<import('./pruning').PrunedState> {
    await this.ensureInit();

    const { pruneMemories, DEFAULT_PRUNING_CONFIG } = await import('./pruning');
    const mergedConfig = { ...DEFAULT_PRUNING_CONFIG, ...config };

    return pruneMemories(this.state!.memories, mergedConfig);
  }

  /**
   * Get context formatted with pruning applied
   * Use this for long-running sessions where memory has grown large
   */
  async getPrunedPrompt(config?: Partial<import('./pruning').PruningConfig>): Promise<string> {
    const prunedState = await this.getPrunedContext(config);

    const { formatPrunedStateForPrompt } = await import('./pruning');
    const memorySection = formatPrunedStateForPrompt(prunedState);

    // Add user profile
    const lines: string[] = [];

    const user = this.state!.user;
    if (Object.keys(user).length > 0) {
      lines.push('## User Profile');
      for (const [key, value] of Object.entries(user)) {
        lines.push(`- ${key}: ${value}`);
      }
      lines.push('');
    }

    lines.push(memorySection);

    // Add decisions (keep all - they're usually important)
    if (this.state!.decisions.length > 0) {
      lines.push('## Key Decisions');
      for (const decision of this.state!.decisions.slice(-20)) {
        lines.push(`- ${decision.content}`);
      }
      lines.push('');
    }

    if (this.state!.currentContext) {
      lines.push('## Current Context');
      lines.push(this.state!.currentContext);
    }

    return lines.join('\n');
  }

  /**
   * Estimate token count for current context
   */
  async estimateContextTokens(): Promise<{ raw: number; pruned: number }> {
    await this.ensureInit();

    const { estimateTokens, pruneMemories, DEFAULT_PRUNING_CONFIG } = await import('./pruning');

    // Raw estimate
    const rawTokens = this.state!.memories.reduce(
      (sum, m) => sum + Math.ceil(m.content.length / 4),
      0
    );

    // Pruned estimate
    const prunedState = pruneMemories(this.state!.memories, DEFAULT_PRUNING_CONFIG);
    const prunedEstimate = estimateTokens(prunedState);

    return {
      raw: rawTokens,
      pruned: prunedEstimate.total,
    };
  }

  /**
   * Mark a memory as accessed (for reinforcement learning)
   */
  async touchMemory(memoryId: string): Promise<void> {
    await this.ensureInit();

    const memory = this.state!.memories.find((m) => m.id === memoryId);
    if (memory) {
      (memory as any).lastAccessed = now();
      (memory as any).accessCount = ((memory as any).accessCount || 0) + 1;
      await this.save();
    }
  }

  /**
   * Boost importance of memories matching a search term
   */
  async reinforceMemories(searchTerm: string, boost: number = 1): Promise<number> {
    await this.ensureInit();

    const searchLower = searchTerm.toLowerCase();
    let reinforced = 0;

    for (const memory of this.state!.memories) {
      if (memory.content.toLowerCase().includes(searchLower)) {
        memory.importance = Math.min(10, (memory.importance || 5) + boost);
        (memory as any).lastAccessed = now();
        (memory as any).accessCount = ((memory as any).accessCount || 0) + 1;
        reinforced++;
      }
    }

    if (reinforced > 0) {
      await this.save();
    }

    return reinforced;
  }

  /**
   * Archive old memories (move to separate storage, reduce active set)
   */
  async archiveOldMemories(daysOld: number = 30): Promise<{ archived: number; remaining: number }> {
    await this.ensureInit();

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysOld);

    const toArchive: Memory[] = [];
    const toKeep: Memory[] = [];

    for (const memory of this.state!.memories) {
      const createdAt = new Date(memory.createdAt);
      // Keep if recent OR high importance
      if (createdAt > cutoff || (memory.importance || 5) >= 8) {
        toKeep.push(memory);
      } else {
        toArchive.push(memory);
      }
    }

    // Store archived memories separately (could be retrieved later)
    if (toArchive.length > 0) {
      const archiveState = {
        sessionId: this.sessionId,
        archivedAt: now(),
        memories: toArchive,
      };

      // Save to archive file
      const archivePath = `${this.sessionId}_archive_${Date.now()}`;
      await this.storage.save({
        ...this.state!,
        sessionId: archivePath,
        memories: toArchive,
      } as SessionState);
    }

    this.state!.memories = toKeep;
    await this.save();

    return {
      archived: toArchive.length,
      remaining: toKeep.length,
    };
  }
}

/**
 * Create a new Railroad session
 * Convenience function for quick setup
 */
export async function createSession(
  sessionId: string,
  options?: {
    storage?: 'memory' | 'file' | StorageAdapter;
    initialUser?: UserProfile;
  }
): Promise<Railroad> {
  const railroad = new Railroad({
    sessionId,
    storage: options?.storage as StorageAdapter | undefined,
  });

  await railroad.init({ initialUser: options?.initialUser });

  return railroad;
}
