/**
 * Basic Usage Example
 *
 * Shows how to use Railroad Memory with an AI agent.
 */

import { createSession, Railroad } from '../src';

async function main() {
  // Create or resume a session
  const session = await createSession('example-user-123');

  console.log('Session created:', session.getSessionId());

  // Simulate a conversation
  console.log('\n--- Simulating conversation ---\n');

  // Message 1: User introduces themselves
  await session.updateUser({
    name: 'Alex',
    role: 'Indie Game Developer',
  });
  await session.remember([
    "Alex is building a game called Void Runners",
    "It's a sci-fi roguelike with an echo mechanic",
    "Using Godot 4 as the engine",
  ]);
  await session.setContext("Discussing game development project");
  console.log('Added initial memories');

  // Message 2: Budget discussion
  await session.remember("Budget is $15,000 from personal savings");
  await session.decide("Will complete game in 8 months");
  console.log('Added budget info and timeline decision');

  // Message 3: Context change - got funding!
  await session.remember([
    "Accepted into indie game accelerator",
    "Received $25,000 in funding",
    "New total budget is $40,000",
  ]);
  await session.updateUser({ budget: '$40,000' });
  await session.decide("Extended timeline to 12 months for quality");
  console.log('Updated with funding news');

  // Message 4: Team expansion
  await session.remember([
    "Hired Maya Chen for synthwave soundtrack - $3,000",
    "Hired Jordan Park for character art - $5,000",
  ]);
  await session.updateUser({
    team: ['Maya Chen (Music)', 'Jordan Park (Art)'],
  });
  console.log('Added team members');

  // Get full context for LLM
  console.log('\n--- Getting context for LLM ---\n');

  const context = await session.getContext();

  console.log('=== PROMPT FORMAT ===');
  console.log(context.toPrompt());

  console.log('\n=== YAML FORMAT ===');
  console.log(context.toYAML());

  console.log('\n=== STATS ===');
  console.log(context.stats);

  // Get specific queries
  console.log('\n--- Querying memories ---\n');

  const allMemories = await session.getMemories();
  console.log(`Total memories: ${allMemories.length}`);

  const budgetMemories = await session.getMemories({ search: 'budget' });
  console.log(`Budget-related memories: ${budgetMemories.length}`);
  budgetMemories.forEach((m) => console.log(`  - ${m.content}`));

  const decisions = await session.getDecisions();
  console.log(`\nDecisions made: ${decisions.length}`);
  decisions.forEach((d) => console.log(`  - ${d.content}`));

  // Show that session persists
  console.log('\n--- Session persists to disk ---');
  console.log(`Session file: ./railroad-sessions/${session.getSessionId()}.yaml`);

  // Clean up (optional - normally you'd keep the session)
  // await session.destroy();
}

main().catch(console.error);
