/**
 * Railroad Memory
 *
 * Dynamic context memory for long-running AI agent tasks.
 * Maintain coherent context past the 280k token limit.
 *
 * @example
 * ```typescript
 * import { Railroad, createSession } from '@metis/railroad-memory';
 *
 * // Quick start
 * const session = await createSession('user-123');
 *
 * // Remember facts
 * await session.remember("User's name is Jordan");
 * await session.remember(["Works at MedAI Labs", "Has a dog named Tesla"]);
 *
 * // Update user profile
 * await session.updateUser({ name: 'Jordan', role: 'CTO' });
 *
 * // Track decisions
 * await session.decide("Will use transformer architecture");
 *
 * // Get context for LLM injection
 * const context = await session.getContext();
 * console.log(context.toPrompt()); // Formatted for LLM
 * console.log(context.toYAML());   // YAML format
 * ```
 *
 * @packageDocumentation
 */

// Main class
export { Railroad, createSession } from './railroad';

// Storage adapters
export { FileStorage, MemoryStorage, createStorage } from './storage';

// Pruning utilities
export {
  pruneMemories,
  identifyCoreFacts,
  deduplicateMemories,
  reinforceMemories,
  calculateDecayedImportance,
  formatPrunedStateForPrompt,
  estimateTokens,
  generateSummaryPrompt,
  DEFAULT_PRUNING_CONFIG,
} from './pruning';

// Types
export type {
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

export type {
  PruningConfig,
  PrunedState,
  PrunableMemory,
  MemorySummary,
  MemoryTier,
} from './pruning';
