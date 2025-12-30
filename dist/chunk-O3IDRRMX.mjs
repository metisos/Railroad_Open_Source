// src/storage.ts
import * as fs from "fs/promises";
import * as path from "path";
import YAML from "yaml";
var FileStorage = class {
  directory;
  format;
  constructor(options = {}) {
    this.directory = options.directory || "./railroad-sessions";
    this.format = options.format || "yaml";
  }
  getFilePath(sessionId) {
    const ext = this.format === "yaml" ? "yaml" : "json";
    return path.join(this.directory, `${sessionId}.${ext}`);
  }
  async load(sessionId) {
    const filePath = this.getFilePath(sessionId);
    try {
      const content = await fs.readFile(filePath, "utf-8");
      if (this.format === "yaml") {
        return YAML.parse(content);
      } else {
        return JSON.parse(content);
      }
    } catch (error) {
      if (error.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }
  async save(state) {
    await fs.mkdir(this.directory, { recursive: true });
    const filePath = this.getFilePath(state.sessionId);
    let content;
    if (this.format === "yaml") {
      content = YAML.stringify(state, { indent: 2 });
    } else {
      content = JSON.stringify(state, null, 2);
    }
    await fs.writeFile(filePath, content, "utf-8");
  }
  async delete(sessionId) {
    const filePath = this.getFilePath(sessionId);
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }
  async exists(sessionId) {
    const filePath = this.getFilePath(sessionId);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
  async list() {
    try {
      const files = await fs.readdir(this.directory);
      const ext = this.format === "yaml" ? ".yaml" : ".json";
      return files.filter((f) => f.endsWith(ext)).map((f) => f.replace(ext, ""));
    } catch {
      return [];
    }
  }
};
var MemoryStorage = class {
  store = /* @__PURE__ */ new Map();
  async load(sessionId) {
    return this.store.get(sessionId) || null;
  }
  async save(state) {
    this.store.set(state.sessionId, JSON.parse(JSON.stringify(state)));
  }
  async delete(sessionId) {
    this.store.delete(sessionId);
  }
  async exists(sessionId) {
    return this.store.has(sessionId);
  }
  async list() {
    return Array.from(this.store.keys());
  }
  /** Clear all sessions (useful for testing) */
  clear() {
    this.store.clear();
  }
};
function createStorage(options) {
  if (typeof options === "string") {
    if (options === "memory") {
      return new MemoryStorage();
    } else if (options === "file") {
      return new FileStorage();
    }
  }
  if (typeof options === "object") {
    if ("load" in options && "save" in options) {
      return options;
    }
    if ("type" in options) {
      if (options.type === "memory") {
        return new MemoryStorage();
      } else if (options.type === "file") {
        return new FileStorage({
          directory: options.directory,
          format: options.format
        });
      }
    }
  }
  return new FileStorage();
}

// src/railroad.ts
import YAML2 from "yaml";
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
function now() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
var Railroad = class {
  sessionId;
  storage;
  state = null;
  initialized = false;
  constructor(options) {
    if (typeof options === "string") {
      this.sessionId = options;
      this.storage = new FileStorage();
    } else {
      this.sessionId = options.sessionId;
      this.storage = options.storage ? createStorage(options.storage) : new FileStorage();
    }
  }
  /**
   * Initialize the session - loads existing or creates new
   */
  async init(options) {
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
        currentContext: void 0,
        stats: {
          totalTokens: 0,
          messageCount: 0
        }
      };
      await this.save();
    }
    this.initialized = true;
  }
  /**
   * Ensure session is initialized
   */
  async ensureInit() {
    if (!this.initialized) {
      await this.init();
    }
  }
  /**
   * Save current state to storage
   */
  async save() {
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
  async getUser() {
    await this.ensureInit();
    return { ...this.state.user };
  }
  /**
   * Update user profile (merges with existing)
   */
  async updateUser(updates) {
    await this.ensureInit();
    this.state.user = { ...this.state.user, ...updates };
    await this.save();
  }
  /**
   * Set user profile (replaces existing)
   */
  async setUser(user) {
    await this.ensureInit();
    this.state.user = user;
    await this.save();
  }
  // ============================================================
  // MEMORIES
  // ============================================================
  /**
   * Add one or more memories
   */
  async remember(facts, options) {
    await this.ensureInit();
    const factArray = Array.isArray(facts) ? facts : [facts];
    const newMemories = [];
    for (const content of factArray) {
      const memory = {
        id: generateId(),
        content,
        category: options?.category,
        importance: options?.importance,
        createdAt: now()
      };
      this.state.memories.push(memory);
      newMemories.push(memory);
    }
    await this.save();
    return newMemories;
  }
  /**
   * Get all memories, optionally filtered
   */
  async getMemories(query) {
    await this.ensureInit();
    let memories = [...this.state.memories];
    if (query?.category) {
      memories = memories.filter((m) => m.category === query.category);
    }
    if (query?.minImportance !== void 0) {
      memories = memories.filter(
        (m) => (m.importance || 0) >= query.minImportance
      );
    }
    if (query?.search) {
      const searchLower = query.search.toLowerCase();
      memories = memories.filter(
        (m) => m.content.toLowerCase().includes(searchLower)
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
  async getMemoryCount() {
    await this.ensureInit();
    return this.state.memories.length;
  }
  /**
   * Clear all memories (use with caution)
   */
  async clearMemories() {
    await this.ensureInit();
    this.state.memories = [];
    await this.save();
  }
  // ============================================================
  // DECISIONS
  // ============================================================
  /**
   * Track a decision
   */
  async decide(decision, context) {
    await this.ensureInit();
    const newDecision = {
      id: generateId(),
      content: decision,
      context,
      createdAt: now()
    };
    this.state.decisions.push(newDecision);
    await this.save();
    return newDecision;
  }
  /**
   * Get all decisions
   */
  async getDecisions() {
    await this.ensureInit();
    return [...this.state.decisions];
  }
  // ============================================================
  // CONTEXT
  // ============================================================
  /**
   * Set current conversation context
   */
  async setContext(context) {
    await this.ensureInit();
    this.state.currentContext = context;
    await this.save();
  }
  /**
   * Get current conversation context
   */
  async getCurrentContext() {
    await this.ensureInit();
    return this.state.currentContext;
  }
  /**
   * Get full context object for injection into LLM
   */
  async getContext() {
    await this.ensureInit();
    const state = this.state;
    const context = {
      sessionId: state.sessionId,
      user: { ...state.user },
      memories: [...state.memories],
      decisions: [...state.decisions],
      currentContext: state.currentContext,
      stats: {
        totalTokens: state.stats.totalTokens,
        messageCount: state.stats.messageCount,
        memoryCount: state.memories.length,
        decisionCount: state.decisions.length
      },
      toPrompt() {
        const lines = [];
        if (Object.keys(context.user).length > 0) {
          lines.push("## User Profile");
          for (const [key, value] of Object.entries(context.user)) {
            lines.push(`- ${key}: ${value}`);
          }
          lines.push("");
        }
        if (context.memories.length > 0) {
          lines.push("## Memories");
          for (const memory of context.memories) {
            lines.push(`- ${memory.content}`);
          }
          lines.push("");
        }
        if (context.decisions.length > 0) {
          lines.push("## Decisions");
          for (const decision of context.decisions) {
            lines.push(`- ${decision.content}`);
          }
          lines.push("");
        }
        if (context.currentContext) {
          lines.push(`## Current Context`);
          lines.push(context.currentContext);
        }
        return lines.join("\n");
      },
      toYAML() {
        return YAML2.stringify({
          user: context.user,
          memories: context.memories.map((m) => m.content),
          decisions: context.decisions.map((d) => d.content),
          currentContext: context.currentContext
        });
      },
      toJSON() {
        return JSON.stringify(
          {
            user: context.user,
            memories: context.memories,
            decisions: context.decisions,
            currentContext: context.currentContext,
            stats: context.stats
          },
          null,
          2
        );
      }
    };
    return context;
  }
  // ============================================================
  // STATS & TRACKING
  // ============================================================
  /**
   * Record tokens used (for tracking)
   */
  async addTokens(count) {
    await this.ensureInit();
    this.state.stats.totalTokens += count;
    await this.save();
  }
  /**
   * Increment message count
   */
  async incrementMessageCount() {
    await this.ensureInit();
    this.state.stats.messageCount += 1;
    await this.save();
  }
  /**
   * Get current stats
   */
  async getStats() {
    await this.ensureInit();
    return {
      ...this.state.stats,
      memoryCount: this.state.memories.length,
      decisionCount: this.state.decisions.length
    };
  }
  // ============================================================
  // EXTRACTION HELPERS
  // ============================================================
  /**
   * Process an extraction result from LLM
   * This is a convenience method for handling structured LLM output
   */
  async processExtraction(result) {
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
  static getExtractionPrompt() {
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
  async getState() {
    await this.ensureInit();
    return JSON.parse(JSON.stringify(this.state));
  }
  /**
   * Delete this session
   */
  async destroy() {
    await this.storage.delete(this.sessionId);
    this.state = null;
    this.initialized = false;
  }
  /**
   * Check if session exists in storage
   */
  async exists() {
    return this.storage.exists(this.sessionId);
  }
  /**
   * Get session ID
   */
  getSessionId() {
    return this.sessionId;
  }
  // ============================================================
  // PRUNING
  // ============================================================
  /**
   * Prune memories to keep context size manageable
   * Returns pruned state without modifying the session
   */
  async getPrunedContext(config) {
    await this.ensureInit();
    const { pruneMemories, DEFAULT_PRUNING_CONFIG } = await import("./pruning-5FCWCEIC.mjs");
    const mergedConfig = { ...DEFAULT_PRUNING_CONFIG, ...config };
    return pruneMemories(this.state.memories, mergedConfig);
  }
  /**
   * Get context formatted with pruning applied
   * Use this for long-running sessions where memory has grown large
   */
  async getPrunedPrompt(config) {
    const prunedState = await this.getPrunedContext(config);
    const { formatPrunedStateForPrompt } = await import("./pruning-5FCWCEIC.mjs");
    const memorySection = formatPrunedStateForPrompt(prunedState);
    const lines = [];
    const user = this.state.user;
    if (Object.keys(user).length > 0) {
      lines.push("## User Profile");
      for (const [key, value] of Object.entries(user)) {
        lines.push(`- ${key}: ${value}`);
      }
      lines.push("");
    }
    lines.push(memorySection);
    if (this.state.decisions.length > 0) {
      lines.push("## Key Decisions");
      for (const decision of this.state.decisions.slice(-20)) {
        lines.push(`- ${decision.content}`);
      }
      lines.push("");
    }
    if (this.state.currentContext) {
      lines.push("## Current Context");
      lines.push(this.state.currentContext);
    }
    return lines.join("\n");
  }
  /**
   * Estimate token count for current context
   */
  async estimateContextTokens() {
    await this.ensureInit();
    const { estimateTokens, pruneMemories, DEFAULT_PRUNING_CONFIG } = await import("./pruning-5FCWCEIC.mjs");
    const rawTokens = this.state.memories.reduce(
      (sum, m) => sum + Math.ceil(m.content.length / 4),
      0
    );
    const prunedState = pruneMemories(this.state.memories, DEFAULT_PRUNING_CONFIG);
    const prunedEstimate = estimateTokens(prunedState);
    return {
      raw: rawTokens,
      pruned: prunedEstimate.total
    };
  }
  /**
   * Mark a memory as accessed (for reinforcement learning)
   */
  async touchMemory(memoryId) {
    await this.ensureInit();
    const memory = this.state.memories.find((m) => m.id === memoryId);
    if (memory) {
      memory.lastAccessed = now();
      memory.accessCount = (memory.accessCount || 0) + 1;
      await this.save();
    }
  }
  /**
   * Boost importance of memories matching a search term
   */
  async reinforceMemories(searchTerm, boost = 1) {
    await this.ensureInit();
    const searchLower = searchTerm.toLowerCase();
    let reinforced = 0;
    for (const memory of this.state.memories) {
      if (memory.content.toLowerCase().includes(searchLower)) {
        memory.importance = Math.min(10, (memory.importance || 5) + boost);
        memory.lastAccessed = now();
        memory.accessCount = (memory.accessCount || 0) + 1;
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
  async archiveOldMemories(daysOld = 30) {
    await this.ensureInit();
    const cutoff = /* @__PURE__ */ new Date();
    cutoff.setDate(cutoff.getDate() - daysOld);
    const toArchive = [];
    const toKeep = [];
    for (const memory of this.state.memories) {
      const createdAt = new Date(memory.createdAt);
      if (createdAt > cutoff || (memory.importance || 5) >= 8) {
        toKeep.push(memory);
      } else {
        toArchive.push(memory);
      }
    }
    if (toArchive.length > 0) {
      const archiveState = {
        sessionId: this.sessionId,
        archivedAt: now(),
        memories: toArchive
      };
      const archivePath = `${this.sessionId}_archive_${Date.now()}`;
      await this.storage.save({
        ...this.state,
        sessionId: archivePath,
        memories: toArchive
      });
    }
    this.state.memories = toKeep;
    await this.save();
    return {
      archived: toArchive.length,
      remaining: toKeep.length
    };
  }
};
async function createSession(sessionId, options) {
  const railroad = new Railroad({
    sessionId,
    storage: options?.storage
  });
  await railroad.init({ initialUser: options?.initialUser });
  return railroad;
}

export {
  FileStorage,
  MemoryStorage,
  createStorage,
  Railroad,
  createSession
};
