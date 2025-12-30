<p align="center">
  <img src="railroadframework.jpg" alt="Railroad Memory" width="600">
</p>

# Railroad Memory

**Dynamic context memory for long-running AI agent tasks.**

Railroad enables AI agents to maintain coherent context indefinitely—far past the traditional 280k token limit where standard agents fail. Instead of storing conversation history, Railroad persists structured state to disk, allowing agents to work on tasks spanning days, weeks, or months.

## Installation

```bash
npm install railroad-memory
```

## Quick Start

```typescript
import { createSession } from 'railroad-memory';

// Create or resume a session
const session = await createSession('user-123');

// Remember facts from conversation
await session.remember("User's name is Jordan");
await session.remember([
  "Jordan is CTO of MedAI Labs",
  "Has a rescue greyhound named Tesla",
  "PhD from MIT in computer vision"
]);

// Update user profile
await session.updateUser({
  name: 'Jordan',
  role: 'CTO',
  company: 'MedAI Labs'
});

// Track decisions
await session.decide("Will use transformer architecture for CT model");

// Get context for LLM injection
const context = await session.getContext();

// Use in your LLM call
const response = await llm.complete({
  system: "You are a helpful assistant.",
  messages: [
    { role: 'user', content: context.toPrompt() + "\n\nUser: " + userMessage }
  ]
});
```

## Why Railroad?

Traditional AI agents store conversation history in the context window:

```
Turn 1:   Context = 1,000 tokens
Turn 100: Context = 100,000 tokens
Turn 400: Context = 280,000 tokens → CRASH (context limit exceeded)
```

Railroad stores state, not history:

```
Turn 1:   Context = State (1,000 tokens)
Turn 100: Context = State (5,000 tokens)
Turn 400: Context = State (15,000 tokens) → Still working
Turn ∞:   Works forever
```

**Tested Results:**
- 2.96 million tokens across 4 tests
- 10/10 memory confidence throughout
- Works with Groq, Claude, and other LLMs

## Core Concepts

### Sessions

Each conversation gets a session. Sessions persist to disk and survive restarts.

```typescript
import { Railroad } from 'railroad-memory';

// Create session with options
const session = new Railroad({
  sessionId: 'user-123',
  storage: { type: 'file', directory: './sessions' }
});

await session.init();
```

### Memories

Facts extracted from conversation. Railroad accumulates these over time.

```typescript
// Add single memory
await session.remember("User prefers morning meetings");

// Add multiple memories
await session.remember([
  "Budget is $40,000",
  "Timeline is 12 months",
  "Team size is 8 engineers"
]);

// Add with metadata
await session.remember("Critical: FDA approval required", {
  category: 'regulatory',
  importance: 10
});

// Query memories
const allMemories = await session.getMemories();
const recentMemories = await session.getMemories({ limit: 10 });
const importantMemories = await session.getMemories({ minImportance: 8 });
const searchResults = await session.getMemories({ search: 'FDA' });
```

### User Profile

Structured information about who you're talking to.

```typescript
// Update (merges with existing)
await session.updateUser({
  name: 'Jordan',
  company: 'MedAI Labs',
  pet: 'Tesla the greyhound'
});

// Get current profile
const user = await session.getUser();
console.log(user.name); // 'Jordan'
```

### Decisions

Track commitments and choices made during conversation.

```typescript
await session.decide("Will prioritize UK market expansion");
await session.decide("Chose usage-based pricing model", "After discussing with board");

const decisions = await session.getDecisions();
```

### Context

Get everything for LLM injection.

```typescript
const context = await session.getContext();

// Different formats
console.log(context.toPrompt()); // Markdown-formatted
console.log(context.toYAML());   // YAML format
console.log(context.toJSON());   // JSON format

// Access directly
console.log(context.user);       // User profile
console.log(context.memories);   // All memories
console.log(context.decisions);  // All decisions
console.log(context.stats);      // Token counts, etc.
```

## Storage Adapters

### File Storage (Default)

Stores sessions as YAML files on disk.

```typescript
import { Railroad, FileStorage } from 'railroad-memory';

const session = new Railroad({
  sessionId: 'user-123',
  storage: new FileStorage({
    directory: './my-sessions',
    format: 'yaml' // or 'json'
  })
});
```

### Memory Storage

In-memory storage for testing or ephemeral sessions.

```typescript
import { Railroad, MemoryStorage } from 'railroad-memory';

const session = new Railroad({
  sessionId: 'test-session',
  storage: new MemoryStorage()
});
```

### Custom Storage

Implement the `StorageAdapter` interface for custom backends (Redis, S3, PostgreSQL, etc.).

```typescript
import type { StorageAdapter, SessionState } from 'railroad-memory';

class RedisStorage implements StorageAdapter {
  async load(sessionId: string): Promise<SessionState | null> {
    const data = await redis.get(`railroad:${sessionId}`);
    return data ? JSON.parse(data) : null;
  }

  async save(state: SessionState): Promise<void> {
    await redis.set(`railroad:${state.sessionId}`, JSON.stringify(state));
  }

  async delete(sessionId: string): Promise<void> {
    await redis.del(`railroad:${sessionId}`);
  }

  async exists(sessionId: string): Promise<boolean> {
    return (await redis.exists(`railroad:${sessionId}`)) === 1;
  }
}
```

## Browser Usage

Railroad Memory works in frontend JavaScript applications (React, Vue, Svelte, vanilla JS) using browser-native storage APIs.

### Installation

```bash
npm install railroad-memory
```

### Quick Start (Browser)

```typescript
import { createSession, Railroad } from 'railroad-memory/browser';

// Create session with localStorage (default)
const session = await createSession('user-123');

// Remember facts
await session.remember("User prefers dark mode");
await session.remember("Shopping cart has 3 items");

// Get context for LLM call
const context = await session.getContext();
console.log(context.toPrompt());
```

### Browser Storage Adapters

#### LocalStorage (Default)

Simple key-value storage. Best for small to medium sessions (< 5MB).

```typescript
import { Railroad, LocalStorageAdapter } from 'railroad-memory/browser';

const session = new Railroad({
  sessionId: 'user-123',
  storage: new LocalStorageAdapter({ prefix: 'myapp' })
});
await session.init();
```

#### IndexedDB

More robust storage for larger sessions. Best for offline-first apps.

```typescript
import { Railroad, IndexedDBAdapter } from 'railroad-memory/browser';

const storage = new IndexedDBAdapter({ dbName: 'myapp-memory' });
await storage.init();

const session = new Railroad({
  sessionId: 'user-123',
  storage
});
await session.init();
```

#### SessionStorage

Temporary storage that clears when the tab closes. Best for anonymous/guest users.

```typescript
import { createSession } from 'railroad-memory/browser';

const session = await createSession('guest-session', {
  storage: 'sessionStorage'
});
```

#### Remote API

Store sessions on your backend server. Best for cross-device sync.

```typescript
import { Railroad, RemoteAPIAdapter } from 'railroad-memory/browser';

const session = new Railroad({
  sessionId: 'user-123',
  storage: new RemoteAPIAdapter({
    baseUrl: 'https://api.myapp.com/memory',
    headers: { 'Authorization': 'Bearer token123' }
  })
});
await session.init();
```

### React Example

```tsx
import { useEffect, useState } from 'react';
import { createSession, Railroad } from 'railroad-memory/browser';

function useRailroadSession(sessionId: string) {
  const [session, setSession] = useState<Railroad | null>(null);

  useEffect(() => {
    createSession(sessionId).then(setSession);
  }, [sessionId]);

  return session;
}

function ChatComponent({ userId }: { userId: string }) {
  const session = useRailroadSession(userId);
  const [messages, setMessages] = useState<string[]>([]);

  const sendMessage = async (msg: string) => {
    if (!session) return;

    // Get current context
    const context = await session.getContext();

    // Call your LLM API
    const response = await fetch('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        message: msg,
        context: context.toPrompt()
      })
    });

    const result = await response.json();

    // Process any extracted memories
    await session.processExtraction(result);

    setMessages(prev => [...prev, msg, result.response]);
  };

  return (
    <div>
      {messages.map((m, i) => <p key={i}>{m}</p>)}
      <input onKeyDown={e => e.key === 'Enter' && sendMessage(e.currentTarget.value)} />
    </div>
  );
}
```

### Vue Example

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { createSession, Railroad } from 'railroad-memory/browser';

const session = ref<Railroad | null>(null);
const context = ref('');

onMounted(async () => {
  session.value = await createSession('user-123');
  const ctx = await session.value.getContext();
  context.value = ctx.toPrompt();
});

const remember = async (fact: string) => {
  if (!session.value) return;
  await session.value.remember(fact);
  const ctx = await session.value.getContext();
  context.value = ctx.toPrompt();
};
</script>

<template>
  <div>
    <pre>{{ context }}</pre>
    <button @click="remember('User clicked the button')">Remember Click</button>
  </div>
</template>
```

### Storage Utilities

```typescript
import { getStorageStats, clearAllSessions } from 'railroad-memory/browser';

// Check storage usage
const stats = getStorageStats('myapp');
console.log(`Sessions: ${stats.sessionCount}`);
console.log(`Total size: ${stats.totalSize} bytes`);

// Clear all sessions
const cleared = await clearAllSessions('myapp');
console.log(`Cleared ${cleared} sessions`);
```

### Browser vs Node.js Imports

```typescript
// Node.js (server-side)
import { createSession, FileStorage } from 'railroad-memory';

// Browser (client-side)
import { createSession, LocalStorageAdapter } from 'railroad-memory/browser';
```

## Integration with LLMs

### Basic Pattern

```typescript
import { createSession, Railroad } from 'railroad-memory';

async function chat(sessionId: string, userMessage: string) {
  const session = await createSession(sessionId);

  // Get current context
  const context = await session.getContext();

  // Call your LLM
  const response = await llm.complete({
    system: Railroad.getExtractionPrompt(),
    messages: [{
      role: 'user',
      content: `Current memory:\n${context.toYAML()}\n\nUser: ${userMessage}`
    }]
  });

  // Parse structured response
  const result = JSON.parse(response);

  // Process extractions automatically
  await session.processExtraction(result);

  // Track tokens
  await session.addTokens(response.usage.total_tokens);
  await session.incrementMessageCount();

  return result.response;
}
```

### With Anthropic Claude

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { createSession, Railroad } from 'railroad-memory';

const anthropic = new Anthropic();

async function chat(sessionId: string, userMessage: string) {
  const session = await createSession(sessionId);
  const context = await session.getContext();

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    system: Railroad.getExtractionPrompt(),
    messages: [{
      role: 'user',
      content: `Memory state:\n${context.toYAML()}\n\nUser message: ${userMessage}`
    }]
  });

  const result = JSON.parse(response.content[0].text);
  await session.processExtraction(result);
  await session.addTokens(response.usage.input_tokens + response.usage.output_tokens);

  return result.response;
}
```

### With OpenAI

```typescript
import OpenAI from 'openai';
import { createSession, Railroad } from 'railroad-memory';

const openai = new OpenAI();

async function chat(sessionId: string, userMessage: string) {
  const session = await createSession(sessionId);
  const context = await session.getContext();

  const response = await openai.chat.completions.create({
    model: 'gpt-4-turbo-preview',
    messages: [
      { role: 'system', content: Railroad.getExtractionPrompt() },
      { role: 'user', content: `Memory:\n${context.toYAML()}\n\nUser: ${userMessage}` }
    ],
    response_format: { type: 'json_object' }
  });

  const result = JSON.parse(response.choices[0].message.content);
  await session.processExtraction(result);

  return result.response;
}
```

## Memory Pruning

For long-running sessions, memories accumulate and can bloat context size. Railroad provides intelligent pruning strategies.

### Hierarchical Memory Tiers

```
┌─────────────────────────────────────────────────────────────┐
│  CORE FACTS (never pruned)                                  │
│  - User identity, critical preferences                      │
│  - High importance (≥9) or matches identity patterns        │
├─────────────────────────────────────────────────────────────┤
│  WORKING MEMORY (last 7 days, full detail)                  │
│  - Recent memories, capped at 100 items                     │
│  - Overflow moves to long-term                              │
├─────────────────────────────────────────────────────────────┤
│  LONG-TERM MEMORY (older, summarized)                       │
│  - Grouped by week, summarized into 2-3 sentences           │
│  - Preserves gist without full detail                       │
├─────────────────────────────────────────────────────────────┤
│  ARCHIVED (not injected, but retrievable)                   │
│  - Very old or low-importance memories                      │
│  - Can be retrieved if specifically asked about             │
└─────────────────────────────────────────────────────────────┘
```

### Using Pruned Context

```typescript
// Get pruned context for LLM (recommended for long sessions)
const prunedPrompt = await session.getPrunedPrompt();

// Check token savings
const tokens = await session.estimateContextTokens();
console.log(`Raw: ${tokens.raw} tokens, Pruned: ${tokens.pruned} tokens`);

// Custom pruning config
const prunedPrompt = await session.getPrunedPrompt({
  workingMemoryLimit: 50,      // Max recent memories
  workingMemoryDays: 3,        // Days before moving to long-term
  coreFactThreshold: 8,        // Importance threshold for core facts
});
```

### Importance Decay

Memories decay over time unless reinforced:

```typescript
// Boost memories matching a term (when user mentions something)
await session.reinforceMemories('FDA', 2); // +2 importance to FDA-related memories

// Mark a specific memory as accessed
await session.touchMemory(memoryId);
```

### Manual Archiving

```typescript
// Archive memories older than 30 days (except high-importance)
const result = await session.archiveOldMemories(30);
console.log(`Archived ${result.archived}, kept ${result.remaining}`);
```

### Pruning Configuration

```typescript
import { DEFAULT_PRUNING_CONFIG } from 'railroad-memory';

const config = {
  workingMemoryLimit: 100,    // Max memories in working memory
  workingMemoryDays: 7,       // Days before moving to long-term
  longTermLimit: 50,          // Max long-term summaries
  summaryWindowDays: 7,       // Days per summary
  coreFactThreshold: 9,       // Importance for core facts
  enableDecay: true,          // Enable importance decay
  decayHalfLifeDays: 14,      // Decay half-life
  archiveThreshold: 2,        // Below this → archive
};
```

### Token Comparison

| Day | Raw Memories | Raw Tokens | Pruned Tokens | Savings |
|-----|--------------|------------|---------------|---------|
| 1 | 50 | 2,000 | 2,000 | 0% |
| 30 | 500 | 20,000 | 8,000 | 60% |
| 90 | 1,500 | 60,000 | 12,000 | 80% |
| 180 | 3,000 | 120,000 | 15,000 | 87% |

---

## API Reference

### Railroad

Main class for managing agent memory.

| Method | Description |
|--------|-------------|
| `init()` | Initialize session (loads existing or creates new) |
| `getUser()` | Get current user profile |
| `updateUser(updates)` | Merge updates into user profile |
| `setUser(user)` | Replace user profile |
| `remember(facts, options?)` | Add memories |
| `getMemories(query?)` | Get memories with optional filtering |
| `getMemoryCount()` | Get total memory count |
| `clearMemories()` | Delete all memories |
| `decide(decision, context?)` | Track a decision |
| `getDecisions()` | Get all decisions |
| `setContext(context)` | Set current conversation context |
| `getCurrentContext()` | Get current context |
| `getContext()` | Get full context object for LLM |
| `addTokens(count)` | Record tokens used |
| `incrementMessageCount()` | Increment message counter |
| `getStats()` | Get session statistics |
| `processExtraction(result)` | Process LLM extraction result |
| `getState()` | Get raw session state |
| `destroy()` | Delete session |
| `exists()` | Check if session exists |
| `getSessionId()` | Get session ID |
| `getPrunedContext(config?)` | Get pruned memory tiers |
| `getPrunedPrompt(config?)` | Get formatted prompt with pruning |
| `estimateContextTokens()` | Estimate raw vs pruned token count |
| `touchMemory(id)` | Mark memory as accessed (reinforcement) |
| `reinforceMemories(term, boost)` | Boost matching memories |
| `archiveOldMemories(days)` | Archive old low-importance memories |

### Static Methods

| Method | Description |
|--------|-------------|
| `Railroad.getExtractionPrompt()` | Get system prompt for LLM extraction |

### createSession

Convenience function for quick setup.

```typescript
const session = await createSession('session-id', {
  storage: 'file', // or 'memory' or custom adapter
  initialUser: { name: 'Jordan' }
});
```

## Tested Performance

| LLM | Tokens | Past 280k | Confidence |
|-----|--------|-----------|------------|
| Groq Llama 3.3 70B | 1,181,938 | +901,938 | 10/10 |
| Claude Sonnet 4 | 1,043,182 | +763,182 | 10/10 |
| Groq (Dynamic) | 372,163 | +92,163 | 10/10 |
| Claude (Dynamic) | 362,927 | +82,927 | 10/10 |

**Total: 2.96 million tokens with perfect memory recall.**

## License

MIT

## Contributing

Contributions welcome! Please read our contributing guidelines.

## Credits

Developed by [Metis Analytics](https://metisos.com).

Based on research into long-running AI agent architectures and persistent state management for AI agents.
