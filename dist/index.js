"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/pruning.ts
var pruning_exports = {};
__export(pruning_exports, {
  DEFAULT_PRUNING_CONFIG: () => DEFAULT_PRUNING_CONFIG,
  calculateDecayedImportance: () => calculateDecayedImportance,
  deduplicateMemories: () => deduplicateMemories,
  determineMemoryTier: () => determineMemoryTier,
  estimateTokens: () => estimateTokens,
  formatPrunedStateForPrompt: () => formatPrunedStateForPrompt,
  generateSummaryPrompt: () => generateSummaryPrompt,
  groupMemoriesByPeriod: () => groupMemoriesByPeriod,
  identifyCoreFacts: () => identifyCoreFacts,
  pruneMemories: () => pruneMemories,
  reinforceMemories: () => reinforceMemories
});
function calculateDecayedImportance(memory, config) {
  if (!config.enableDecay) {
    return memory.importance || 5;
  }
  const lastAccessed = new Date(memory.lastAccessed);
  const now2 = /* @__PURE__ */ new Date();
  const daysSinceAccess = (now2.getTime() - lastAccessed.getTime()) / (1e3 * 60 * 60 * 24);
  const baseImportance = memory.importance || 5;
  const decayFactor = Math.pow(0.5, daysSinceAccess / config.decayHalfLifeDays);
  const reinforcement = Math.log2(memory.accessCount + 1) * 0.5;
  return Math.min(10, baseImportance * decayFactor + reinforcement);
}
function determineMemoryTier(memory, config) {
  const decayedImportance = calculateDecayedImportance(memory, config);
  if (decayedImportance >= config.coreFactThreshold) {
    return "core";
  }
  const createdAt = new Date(memory.createdAt);
  const now2 = /* @__PURE__ */ new Date();
  const daysOld = (now2.getTime() - createdAt.getTime()) / (1e3 * 60 * 60 * 24);
  if (decayedImportance < config.archiveThreshold) {
    return "archived";
  }
  if (daysOld <= config.workingMemoryDays) {
    return "working";
  }
  return "longterm";
}
function identifyCoreFacts(memories, config = DEFAULT_PRUNING_CONFIG) {
  const corePatterns = [
    /\b(name|called)\b.*\b(is|am)\b/i,
    // "Name is X", "I am X"
    /\b(i am|i'm|my name)\b/i,
    // Self-identification
    /\b(works? at|cto|ceo|founder|vp|director)\b/i,
    // Role/company
    /\bpet\b.*\b(named?|called)\b/i,
    // Pet names
    /\b(hates?|loves?|prefers?|always|never)\b/i,
    // Strong preferences
    /\bpet peeve\b/i
    // Explicit pet peeves
  ];
  return memories.filter((m) => {
    if ((m.importance || 0) >= config.coreFactThreshold) {
      return true;
    }
    return corePatterns.some((pattern) => pattern.test(m.content));
  });
}
function groupMemoriesByPeriod(memories, windowDays) {
  const groups = /* @__PURE__ */ new Map();
  for (const memory of memories) {
    const date = new Date(memory.createdAt);
    const windowStart = new Date(date);
    windowStart.setDate(
      windowStart.getDate() - windowStart.getDate() % windowDays
    );
    windowStart.setHours(0, 0, 0, 0);
    const key = windowStart.toISOString();
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(memory);
  }
  return groups;
}
function generateSummaryPrompt(memories, periodStart, periodEnd) {
  const memoryList = memories.map((m) => `- ${m.content}`).join("\n");
  return `Summarize these memories from ${periodStart} to ${periodEnd} into 2-3 concise sentences that capture the key facts and decisions:

${memoryList}

Summary:`;
}
function deduplicateMemories(memories) {
  const dominated = /* @__PURE__ */ new Set();
  const sorted = [...memories].sort((a, b) => {
    const impDiff = (b.importance || 5) - (a.importance || 5);
    if (impDiff !== 0) return impDiff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  for (let i = 0; i < sorted.length; i++) {
    if (dominated.has(sorted[i].id)) continue;
    const wordsI = new Set(
      sorted[i].content.toLowerCase().split(/\s+/)
    );
    for (let j = i + 1; j < sorted.length; j++) {
      if (dominated.has(sorted[j].id)) continue;
      const wordsJ = sorted[j].content.toLowerCase().split(/\s+/);
      const overlap = wordsJ.filter((w) => wordsI.has(w)).length;
      const similarity = overlap / Math.max(wordsI.size, wordsJ.length);
      if (similarity > 0.6) {
        dominated.add(sorted[j].id);
      }
    }
  }
  return sorted.filter((m) => !dominated.has(m.id));
}
function reinforceMemories(memories, query, boost = 1) {
  const queryWords = new Set(query.toLowerCase().split(/\s+/));
  return memories.map((m) => {
    const memoryWords = m.content.toLowerCase().split(/\s+/);
    const matches = memoryWords.filter((w) => queryWords.has(w)).length;
    if (matches > 0) {
      return {
        ...m,
        importance: Math.min(10, (m.importance || 5) + boost),
        accessCount: m.accessCount + 1,
        lastAccessed: (/* @__PURE__ */ new Date()).toISOString()
      };
    }
    return m;
  });
}
function pruneMemories(memories, config = DEFAULT_PRUNING_CONFIG) {
  const prunableMemories = memories.map((m) => ({
    ...m,
    tier: "working",
    lastAccessed: m.lastAccessed || m.createdAt,
    accessCount: m.accessCount || 0
  }));
  const deduped = deduplicateMemories(prunableMemories);
  const coreFacts = [];
  const workingMemory = [];
  const longTermCandidates = [];
  const archived = [];
  for (const memory of deduped) {
    memory.decayedImportance = calculateDecayedImportance(memory, config);
    const tier = determineMemoryTier(memory, config);
    memory.tier = tier;
    switch (tier) {
      case "core":
        coreFacts.push(memory);
        break;
      case "working":
        workingMemory.push(memory);
        break;
      case "longterm":
        longTermCandidates.push(memory);
        break;
      case "archived":
        archived.push(memory);
        break;
    }
  }
  const sortedWorking = workingMemory.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const keptWorking = sortedWorking.slice(0, config.workingMemoryLimit);
  const overflowToLongTerm = sortedWorking.slice(config.workingMemoryLimit);
  const allLongTerm = [...longTermCandidates, ...overflowToLongTerm];
  const grouped = groupMemoriesByPeriod(allLongTerm, config.summaryWindowDays);
  const longTermMemory = [];
  let summaryIndex = 0;
  for (const [periodKey, periodMemories] of grouped) {
    if (summaryIndex >= config.longTermLimit) {
      archived.push(...periodMemories);
      continue;
    }
    const periodStart = new Date(periodKey);
    const periodEnd = new Date(periodStart);
    periodEnd.setDate(periodEnd.getDate() + config.summaryWindowDays);
    longTermMemory.push({
      id: `summary-${periodKey}`,
      period: {
        start: periodStart.toISOString(),
        end: periodEnd.toISOString()
      },
      summary: `[PENDING SUMMARIZATION: ${periodMemories.length} memories]`,
      sourceMemoryIds: periodMemories.map((m) => m.id),
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    summaryIndex++;
  }
  return {
    coreFacts,
    workingMemory: keptWorking,
    longTermMemory,
    archived
  };
}
function estimateTokens(state) {
  const estimate = (text) => Math.ceil(text.length / 4);
  const core = state.coreFacts.reduce(
    (sum, m) => sum + estimate(m.content),
    0
  );
  const working = state.workingMemory.reduce(
    (sum, m) => sum + estimate(m.content),
    0
  );
  const longTerm = state.longTermMemory.reduce(
    (sum, s) => sum + estimate(s.summary),
    0
  );
  return {
    core,
    working,
    longTerm,
    total: core + working + longTerm
  };
}
function formatPrunedStateForPrompt(state) {
  const lines = [];
  if (state.coreFacts.length > 0) {
    lines.push("## Core Facts (Always Remember)");
    state.coreFacts.forEach((m) => lines.push(`- ${m.content}`));
    lines.push("");
  }
  if (state.workingMemory.length > 0) {
    lines.push("## Recent Memory (Last 7 Days)");
    state.workingMemory.forEach((m) => lines.push(`- ${m.content}`));
    lines.push("");
  }
  if (state.longTermMemory.length > 0) {
    lines.push("## Historical Context");
    state.longTermMemory.forEach((s) => {
      const start = new Date(s.period.start).toLocaleDateString();
      const end = new Date(s.period.end).toLocaleDateString();
      lines.push(`- [${start} - ${end}]: ${s.summary}`);
    });
    lines.push("");
  }
  return lines.join("\n");
}
var DEFAULT_PRUNING_CONFIG;
var init_pruning = __esm({
  "src/pruning.ts"() {
    "use strict";
    DEFAULT_PRUNING_CONFIG = {
      workingMemoryLimit: 100,
      workingMemoryDays: 7,
      longTermLimit: 50,
      summaryWindowDays: 7,
      coreFactThreshold: 9,
      enableDecay: true,
      decayHalfLifeDays: 14,
      archiveThreshold: 2
    };
  }
});

// src/index.ts
var index_exports = {};
__export(index_exports, {
  DEFAULT_PRUNING_CONFIG: () => DEFAULT_PRUNING_CONFIG,
  FileStorage: () => FileStorage,
  MemoryStorage: () => MemoryStorage,
  Railroad: () => Railroad,
  calculateDecayedImportance: () => calculateDecayedImportance,
  createSession: () => createSession,
  createStorage: () => createStorage,
  deduplicateMemories: () => deduplicateMemories,
  estimateTokens: () => estimateTokens,
  formatPrunedStateForPrompt: () => formatPrunedStateForPrompt,
  generateSummaryPrompt: () => generateSummaryPrompt,
  identifyCoreFacts: () => identifyCoreFacts,
  pruneMemories: () => pruneMemories,
  reinforceMemories: () => reinforceMemories
});
module.exports = __toCommonJS(index_exports);

// src/railroad.ts
var import_yaml2 = __toESM(require("yaml"));

// src/storage.ts
var fs = __toESM(require("fs/promises"));
var path = __toESM(require("path"));
var import_yaml = __toESM(require("yaml"));
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
        return import_yaml.default.parse(content);
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
      content = import_yaml.default.stringify(state, { indent: 2 });
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
        return import_yaml2.default.stringify({
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
    const { pruneMemories: pruneMemories2, DEFAULT_PRUNING_CONFIG: DEFAULT_PRUNING_CONFIG2 } = await Promise.resolve().then(() => (init_pruning(), pruning_exports));
    const mergedConfig = { ...DEFAULT_PRUNING_CONFIG2, ...config };
    return pruneMemories2(this.state.memories, mergedConfig);
  }
  /**
   * Get context formatted with pruning applied
   * Use this for long-running sessions where memory has grown large
   */
  async getPrunedPrompt(config) {
    const prunedState = await this.getPrunedContext(config);
    const { formatPrunedStateForPrompt: formatPrunedStateForPrompt2 } = await Promise.resolve().then(() => (init_pruning(), pruning_exports));
    const memorySection = formatPrunedStateForPrompt2(prunedState);
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
    const { estimateTokens: estimateTokens2, pruneMemories: pruneMemories2, DEFAULT_PRUNING_CONFIG: DEFAULT_PRUNING_CONFIG2 } = await Promise.resolve().then(() => (init_pruning(), pruning_exports));
    const rawTokens = this.state.memories.reduce(
      (sum, m) => sum + Math.ceil(m.content.length / 4),
      0
    );
    const prunedState = pruneMemories2(this.state.memories, DEFAULT_PRUNING_CONFIG2);
    const prunedEstimate = estimateTokens2(prunedState);
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

// src/index.ts
init_pruning();
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DEFAULT_PRUNING_CONFIG,
  FileStorage,
  MemoryStorage,
  Railroad,
  calculateDecayedImportance,
  createSession,
  createStorage,
  deduplicateMemories,
  estimateTokens,
  formatPrunedStateForPrompt,
  generateSummaryPrompt,
  identifyCoreFacts,
  pruneMemories,
  reinforceMemories
});
