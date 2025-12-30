/**
 * Railroad Memory Pruning
 *
 * Strategies for managing memory growth in long-running tasks.
 * Keeps context size bounded while preserving important information.
 */

import type { Memory, Decision, SessionState } from './types';

/**
 * Memory tier - determines how memories are stored and injected
 */
export type MemoryTier = 'core' | 'working' | 'longterm' | 'archived';

/**
 * Pruning configuration
 */
export interface PruningConfig {
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
export const DEFAULT_PRUNING_CONFIG: PruningConfig = {
  workingMemoryLimit: 100,
  workingMemoryDays: 7,
  longTermLimit: 50,
  summaryWindowDays: 7,
  coreFactThreshold: 9,
  enableDecay: true,
  decayHalfLifeDays: 14,
  archiveThreshold: 2,
};

/**
 * Extended memory with pruning metadata
 */
export interface PrunableMemory extends Memory {
  tier: MemoryTier;
  lastAccessed: string;
  accessCount: number;
  decayedImportance?: number;
}

/**
 * Long-term memory summary
 */
export interface MemorySummary {
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
export interface PrunedState {
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
export function calculateDecayedImportance(
  memory: PrunableMemory,
  config: PruningConfig
): number {
  if (!config.enableDecay) {
    return memory.importance || 5;
  }

  const lastAccessed = new Date(memory.lastAccessed);
  const now = new Date();
  const daysSinceAccess =
    (now.getTime() - lastAccessed.getTime()) / (1000 * 60 * 60 * 24);

  const baseImportance = memory.importance || 5;
  const decayFactor = Math.pow(0.5, daysSinceAccess / config.decayHalfLifeDays);

  // Access count provides reinforcement
  const reinforcement = Math.log2(memory.accessCount + 1) * 0.5;

  return Math.min(10, baseImportance * decayFactor + reinforcement);
}

/**
 * Determine which tier a memory belongs to
 */
export function determineMemoryTier(
  memory: PrunableMemory,
  config: PruningConfig
): MemoryTier {
  const decayedImportance = calculateDecayedImportance(memory, config);

  // Core facts: high importance, frequently accessed
  if (decayedImportance >= config.coreFactThreshold) {
    return 'core';
  }

  // Check age
  const createdAt = new Date(memory.createdAt);
  const now = new Date();
  const daysOld =
    (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);

  // Archive: very low importance
  if (decayedImportance < config.archiveThreshold) {
    return 'archived';
  }

  // Working memory: recent
  if (daysOld <= config.workingMemoryDays) {
    return 'working';
  }

  // Long-term: older but still relevant
  return 'longterm';
}

/**
 * Identify core facts that should never be pruned
 */
export function identifyCoreFacts(
  memories: Memory[],
  config: PruningConfig = DEFAULT_PRUNING_CONFIG
): Memory[] {
  // Core fact patterns - these are always important
  const corePatterns = [
    /\b(name|called)\b.*\b(is|am)\b/i, // "Name is X", "I am X"
    /\b(i am|i'm|my name)\b/i, // Self-identification
    /\b(works? at|cto|ceo|founder|vp|director)\b/i, // Role/company
    /\bpet\b.*\b(named?|called)\b/i, // Pet names
    /\b(hates?|loves?|prefers?|always|never)\b/i, // Strong preferences
    /\bpet peeve\b/i, // Explicit pet peeves
  ];

  return memories.filter((m) => {
    // High explicit importance
    if ((m.importance || 0) >= config.coreFactThreshold) {
      return true;
    }

    // Matches core patterns
    return corePatterns.some((pattern) => pattern.test(m.content));
  });
}

/**
 * Group memories by time period for summarization
 */
export function groupMemoriesByPeriod(
  memories: Memory[],
  windowDays: number
): Map<string, Memory[]> {
  const groups = new Map<string, Memory[]>();

  for (const memory of memories) {
    const date = new Date(memory.createdAt);
    // Round to start of window
    const windowStart = new Date(date);
    windowStart.setDate(
      windowStart.getDate() - (windowStart.getDate() % windowDays)
    );
    windowStart.setHours(0, 0, 0, 0);

    const key = windowStart.toISOString();

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(memory);
  }

  return groups;
}

/**
 * Generate a prompt for LLM to summarize memories
 */
export function generateSummaryPrompt(
  memories: Memory[],
  periodStart: string,
  periodEnd: string
): string {
  const memoryList = memories.map((m) => `- ${m.content}`).join('\n');

  return `Summarize these memories from ${periodStart} to ${periodEnd} into 2-3 concise sentences that capture the key facts and decisions:

${memoryList}

Summary:`;
}

/**
 * Deduplicate similar memories
 */
export function deduplicateMemories(memories: Memory[]): Memory[] {
  const dominated = new Set<string>();

  // Sort by importance (descending) then recency
  const sorted = [...memories].sort((a, b) => {
    const impDiff = (b.importance || 5) - (a.importance || 5);
    if (impDiff !== 0) return impDiff;
    return (
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  });

  // Simple similarity check - memories with >60% word overlap
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
        // j is dominated by i (i is higher importance/more recent)
        dominated.add(sorted[j].id);
      }
    }
  }

  return sorted.filter((m) => !dominated.has(m.id));
}

/**
 * Boost importance of memories matching a query (reinforcement)
 */
export function reinforceMemories(
  memories: PrunableMemory[],
  query: string,
  boost: number = 1
): PrunableMemory[] {
  const queryWords = new Set(query.toLowerCase().split(/\s+/));

  return memories.map((m) => {
    const memoryWords = m.content.toLowerCase().split(/\s+/);
    const matches = memoryWords.filter((w) => queryWords.has(w)).length;

    if (matches > 0) {
      return {
        ...m,
        importance: Math.min(10, (m.importance || 5) + boost),
        accessCount: m.accessCount + 1,
        lastAccessed: new Date().toISOString(),
      };
    }
    return m;
  });
}

/**
 * Prune memories according to configuration
 * Returns structured memory tiers
 */
export function pruneMemories(
  memories: Memory[],
  config: PruningConfig = DEFAULT_PRUNING_CONFIG
): PrunedState {
  // Convert to prunable memories
  const prunableMemories: PrunableMemory[] = memories.map((m) => ({
    ...m,
    tier: 'working' as MemoryTier,
    lastAccessed: (m as PrunableMemory).lastAccessed || m.createdAt,
    accessCount: (m as PrunableMemory).accessCount || 0,
  }));

  // Deduplicate first
  const deduped = deduplicateMemories(prunableMemories) as PrunableMemory[];

  // Categorize into tiers
  const coreFacts: PrunableMemory[] = [];
  const workingMemory: PrunableMemory[] = [];
  const longTermCandidates: PrunableMemory[] = [];
  const archived: PrunableMemory[] = [];

  for (const memory of deduped) {
    memory.decayedImportance = calculateDecayedImportance(memory, config);
    const tier = determineMemoryTier(memory, config);
    memory.tier = tier;

    switch (tier) {
      case 'core':
        coreFacts.push(memory);
        break;
      case 'working':
        workingMemory.push(memory);
        break;
      case 'longterm':
        longTermCandidates.push(memory);
        break;
      case 'archived':
        archived.push(memory);
        break;
    }
  }

  // Enforce working memory limit (keep most recent)
  const sortedWorking = workingMemory.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const keptWorking = sortedWorking.slice(0, config.workingMemoryLimit);
  const overflowToLongTerm = sortedWorking.slice(config.workingMemoryLimit);

  // Long-term candidates include overflow from working memory
  const allLongTerm = [...longTermCandidates, ...overflowToLongTerm];

  // Group for summarization
  const grouped = groupMemoriesByPeriod(allLongTerm, config.summaryWindowDays);

  // Create summary placeholders (actual summarization done by LLM)
  const longTermMemory: MemorySummary[] = [];
  let summaryIndex = 0;

  for (const [periodKey, periodMemories] of grouped) {
    if (summaryIndex >= config.longTermLimit) {
      // Move excess to archive
      archived.push(...(periodMemories as PrunableMemory[]));
      continue;
    }

    const periodStart = new Date(periodKey);
    const periodEnd = new Date(periodStart);
    periodEnd.setDate(periodEnd.getDate() + config.summaryWindowDays);

    longTermMemory.push({
      id: `summary-${periodKey}`,
      period: {
        start: periodStart.toISOString(),
        end: periodEnd.toISOString(),
      },
      summary: `[PENDING SUMMARIZATION: ${periodMemories.length} memories]`,
      sourceMemoryIds: periodMemories.map((m) => m.id),
      createdAt: new Date().toISOString(),
    });

    summaryIndex++;
  }

  return {
    coreFacts,
    workingMemory: keptWorking,
    longTermMemory,
    archived,
  };
}

/**
 * Calculate token estimate for pruned state
 */
export function estimateTokens(state: PrunedState): {
  core: number;
  working: number;
  longTerm: number;
  total: number;
} {
  // Rough estimate: 1 token ≈ 4 characters
  const estimate = (text: string) => Math.ceil(text.length / 4);

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
    total: core + working + longTerm,
  };
}

/**
 * Format pruned state for LLM injection
 */
export function formatPrunedStateForPrompt(state: PrunedState): string {
  const lines: string[] = [];

  if (state.coreFacts.length > 0) {
    lines.push('## Core Facts (Always Remember)');
    state.coreFacts.forEach((m) => lines.push(`- ${m.content}`));
    lines.push('');
  }

  if (state.workingMemory.length > 0) {
    lines.push('## Recent Memory (Last 7 Days)');
    state.workingMemory.forEach((m) => lines.push(`- ${m.content}`));
    lines.push('');
  }

  if (state.longTermMemory.length > 0) {
    lines.push('## Historical Context');
    state.longTermMemory.forEach((s) => {
      const start = new Date(s.period.start).toLocaleDateString();
      const end = new Date(s.period.end).toLocaleDateString();
      lines.push(`- [${start} - ${end}]: ${s.summary}`);
    });
    lines.push('');
  }

  return lines.join('\n');
}
