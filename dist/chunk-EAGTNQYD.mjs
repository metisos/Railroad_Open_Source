// src/pruning.ts
var DEFAULT_PRUNING_CONFIG = {
  workingMemoryLimit: 100,
  workingMemoryDays: 7,
  longTermLimit: 50,
  summaryWindowDays: 7,
  coreFactThreshold: 9,
  enableDecay: true,
  decayHalfLifeDays: 14,
  archiveThreshold: 2
};
function calculateDecayedImportance(memory, config) {
  if (!config.enableDecay) {
    return memory.importance || 5;
  }
  const lastAccessed = new Date(memory.lastAccessed);
  const now = /* @__PURE__ */ new Date();
  const daysSinceAccess = (now.getTime() - lastAccessed.getTime()) / (1e3 * 60 * 60 * 24);
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
  const now = /* @__PURE__ */ new Date();
  const daysOld = (now.getTime() - createdAt.getTime()) / (1e3 * 60 * 60 * 24);
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

export {
  DEFAULT_PRUNING_CONFIG,
  calculateDecayedImportance,
  determineMemoryTier,
  identifyCoreFacts,
  groupMemoriesByPeriod,
  generateSummaryPrompt,
  deduplicateMemories,
  reinforceMemories,
  pruneMemories,
  estimateTokens,
  formatPrunedStateForPrompt
};
