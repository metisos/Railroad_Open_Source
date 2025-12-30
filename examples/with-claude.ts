/**
 * Integration with Claude Example
 *
 * Shows how to use Railroad Memory with Anthropic's Claude API.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createSession, Railroad, type ExtractionResult } from '../src';

// Initialize Anthropic client
const anthropic = new Anthropic();

/**
 * Chat function with persistent memory
 */
async function chat(sessionId: string, userMessage: string): Promise<string> {
  // Get or create session
  const session = await createSession(sessionId);

  // Get current context
  const context = await session.getContext();

  // Build prompt with memory
  const memoryContext = context.toYAML();

  // Call Claude
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    temperature: 0.7,
    system: Railroad.getExtractionPrompt(),
    messages: [
      {
        role: 'user',
        content: `Current memory state:
\`\`\`yaml
${memoryContext}
\`\`\`

User message #${context.stats.messageCount + 1}:
"${userMessage}"

Respond naturally and extract anything worth remembering.`,
      },
    ],
  });

  // Parse response
  const content = response.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type');
  }

  let result: ExtractionResult;
  try {
    // Try to parse as JSON
    let jsonStr = content.text;

    // Handle markdown code blocks
    if (jsonStr.includes('```json')) {
      jsonStr = jsonStr.split('```json')[1].split('```')[0];
    } else if (jsonStr.includes('```')) {
      jsonStr = jsonStr.split('```')[1].split('```')[0];
    }

    result = JSON.parse(jsonStr.trim());
  } catch {
    // If parsing fails, treat the whole response as the response text
    result = {
      response: content.text,
      newMemories: [],
      newDecisions: [],
    };
  }

  // Process extractions (updates user, memories, decisions, context)
  await session.processExtraction(result);

  // Track tokens
  const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;
  await session.addTokens(tokensUsed);
  await session.incrementMessageCount();

  // Log stats
  const stats = await session.getStats();
  console.log(
    `[Session ${sessionId}] Tokens: ${stats.totalTokens}, Memories: ${stats.memoryCount}`
  );

  return result.response;
}

/**
 * Example conversation
 */
async function main() {
  const sessionId = `demo-${Date.now()}`;

  console.log('Starting conversation with Claude + Railroad Memory\n');
  console.log('='.repeat(60));

  // Simulate a multi-turn conversation
  const messages = [
    "Hi! I'm Jordan Okafor, CTO of a healthcare AI startup called MedAI Labs.",
    "We're building AI for medical imaging - helping radiologists detect cancer earlier.",
    "I have a rescue greyhound named Tesla who sleeps under my desk all day.",
    "We just closed our Series A - $12 million from Andreessen Horowitz.",
    "Our main product is called RadAssist. It's FDA 510(k) cleared.",
    "Big news - we just signed a partnership with Epic! 250 million patient records.",
  ];

  for (const message of messages) {
    console.log(`\nUser: ${message}`);

    const response = await chat(sessionId, message);

    console.log(`\nAssistant: ${response}`);
    console.log('-'.repeat(60));
  }

  // Show final memory state
  console.log('\n' + '='.repeat(60));
  console.log('FINAL MEMORY STATE');
  console.log('='.repeat(60));

  const session = await createSession(sessionId);
  const context = await session.getContext();

  console.log('\nUser Profile:');
  console.log(JSON.stringify(context.user, null, 2));

  console.log('\nMemories:');
  context.memories.forEach((m, i) => console.log(`  ${i + 1}. ${m.content}`));

  console.log('\nDecisions:');
  context.decisions.forEach((d, i) => console.log(`  ${i + 1}. ${d.content}`));

  console.log('\nStats:');
  console.log(context.stats);
}

// Run if executed directly
main().catch(console.error);
