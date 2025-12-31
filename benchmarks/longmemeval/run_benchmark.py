"""
LongMemEval Benchmark Runner for Railroad Framework
Uses Railroad's YAML-based memory system with Groq LLM

This script tests Railroad's ability to:
1. Process multi-session chat histories
2. Extract and retain relevant memories
3. Answer questions using accumulated context
"""

import os
import sys
import json
import yaml
import time
import argparse
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from dataclasses import dataclass, field

# Add parent directory for imports
sys.path.insert(0, str(Path(__file__).parent))

try:
    from groq import Groq
except ImportError:
    print("Install groq: pip install groq")
    sys.exit(1)


@dataclass
class RailroadMemory:
    """Railroad-style memory state for a single evaluation instance"""
    session_id: str
    user_facts: list = field(default_factory=list)
    user_preferences: list = field(default_factory=list)
    events: list = field(default_factory=list)  # timestamped events
    key_decisions: list = field(default_factory=list)
    relationships: list = field(default_factory=list)
    total_tokens: int = 0
    sessions_processed: int = 0

    def to_yaml(self) -> str:
        """Convert memory to YAML for context injection"""
        return yaml.dump({
            "session_id": self.session_id,
            "user_facts": self.user_facts[-50:],  # Keep most recent 50
            "user_preferences": self.user_preferences[-20:],
            "events": self.events[-30:],  # Timestamped events
            "key_decisions": self.key_decisions[-10:],
            "relationships": self.relationships[-10:],
            "stats": {
                "total_memories": len(self.user_facts) + len(self.events),
                "sessions_processed": self.sessions_processed,
                "total_tokens": self.total_tokens
            }
        }, default_flow_style=False)

    def add_memories(self, extracted: dict):
        """Add extracted memories from a session"""
        self.user_facts.extend(extracted.get("user_facts", []))
        self.user_preferences.extend(extracted.get("user_preferences", []))
        self.events.extend(extracted.get("events", []))
        self.key_decisions.extend(extracted.get("key_decisions", []))
        self.relationships.extend(extracted.get("relationships", []))


class RailroadLongMemEval:
    """
    Railroad-based memory system for LongMemEval benchmark.

    Uses the Railroad pattern: persist structured state to YAML,
    inject relevant context per interaction, extract and accumulate memories.
    """

    def __init__(
        self,
        model: str = "llama-3.3-70b-versatile",
        max_tokens: int = 4096,
        temperature: float = 0.3,
        verbose: bool = False
    ):
        self.client = Groq()
        self.model = model
        self.max_tokens = max_tokens
        self.temperature = temperature
        self.verbose = verbose

        self.extraction_prompt = """You are a memory extraction system. Your task is to extract important information from a chat conversation that should be remembered for future reference.

Extract the following types of information:
1. user_facts: Factual information about the user (name, job, possessions, dates, etc.)
2. user_preferences: User's preferences, opinions, likes/dislikes
3. events: Timestamped events or things that happened (include approximate dates if mentioned)
4. key_decisions: Decisions the user made or is planning to make
5. relationships: People, places, or things mentioned and their relationship to the user

IMPORTANT: Only extract information explicitly stated or strongly implied. Do not make assumptions.

Respond with JSON only:
{
    "user_facts": ["fact1", "fact2"],
    "user_preferences": ["pref1"],
    "events": ["On [date]: event description"],
    "key_decisions": ["decision1"],
    "relationships": ["relationship1"]
}"""

        self.answer_prompt = """You are a helpful assistant with access to accumulated memories from past conversations.

Based ONLY on the memories provided, answer the user's question. If the answer is not in the memories, say "I don't have information about that."

Be specific and reference the relevant memory when answering."""

    def _call_llm(self, system: str, user: str, json_mode: bool = False) -> tuple[str, int]:
        """Call Groq LLM and return response + token count"""
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                max_tokens=self.max_tokens,
                temperature=self.temperature,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user}
                ]
            )
            content = response.choices[0].message.content
            tokens = response.usage.prompt_tokens + response.usage.completion_tokens
            return content, tokens
        except Exception as e:
            print(f"LLM Error: {e}")
            return "", 0

    def _parse_json(self, content: str) -> dict:
        """Parse JSON from LLM response, handling markdown blocks"""
        try:
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]
            return json.loads(content.strip())
        except:
            return {}

    def process_session(self, memory: RailroadMemory, session: list, session_date: str) -> int:
        """
        Process a single chat session and extract memories.
        Returns tokens used.
        """
        # Format session as conversation
        conversation = f"[Session Date: {session_date}]\n\n"
        for turn in session:
            role = "User" if turn["role"] == "user" else "Assistant"
            conversation += f"{role}: {turn['content']}\n\n"

        # Truncate if too long (keep ~6000 chars for extraction)
        if len(conversation) > 6000:
            conversation = conversation[:6000] + "\n[... conversation truncated ...]"

        # Extract memories
        response, tokens = self._call_llm(
            self.extraction_prompt,
            f"Extract memories from this conversation:\n\n{conversation}"
        )

        extracted = self._parse_json(response)
        memory.add_memories(extracted)
        memory.sessions_processed += 1
        memory.total_tokens += tokens

        if self.verbose:
            facts_added = len(extracted.get("user_facts", []))
            events_added = len(extracted.get("events", []))
            print(f"    Session processed: +{facts_added} facts, +{events_added} events ({tokens} tokens)")

        return tokens

    def answer_question(self, memory: RailroadMemory, question: str, question_date: str) -> tuple[str, int]:
        """
        Answer a question using accumulated Railroad memory.
        Returns (answer, tokens_used).
        """
        # Build context from memory (Railroad pattern: inject YAML state)
        memory_yaml = memory.to_yaml()

        user_prompt = f"""Current Date: {question_date}

ACCUMULATED MEMORIES:
```yaml
{memory_yaml}
```

QUESTION: {question}

Answer based only on the memories above. Be specific."""

        response, tokens = self._call_llm(self.answer_prompt, user_prompt)
        memory.total_tokens += tokens

        return response, tokens

    def run_single_instance(self, instance: dict) -> dict:
        """
        Run Railroad memory system on a single LongMemEval instance.

        1. Process all chat sessions to build memory
        2. Answer the question using accumulated memory
        """
        question_id = instance["question_id"]
        question = instance["question"]
        question_date = instance["question_date"]
        sessions = instance["haystack_sessions"]
        session_dates = instance["haystack_dates"]

        if self.verbose:
            print(f"\n[{question_id}] Processing {len(sessions)} sessions...")

        # Initialize Railroad memory for this instance
        memory = RailroadMemory(session_id=question_id)

        # Process each session chronologically
        for i, (session, date) in enumerate(zip(sessions, session_dates)):
            self.process_session(memory, session, date)
            # Small delay to respect rate limits
            time.sleep(0.1)

        # Answer the question
        answer, _ = self.answer_question(memory, question, question_date)

        if self.verbose:
            print(f"  Total memories: {len(memory.user_facts)} facts, {len(memory.events)} events")
            print(f"  Total tokens: {memory.total_tokens}")
            print(f"  Question: {question}")
            print(f"  Answer: {answer[:200]}...")

        return {
            "question_id": question_id,
            "hypothesis": answer,
            "memories_extracted": len(memory.user_facts) + len(memory.events),
            "tokens_used": memory.total_tokens,
            "sessions_processed": memory.sessions_processed
        }


def main():
    parser = argparse.ArgumentParser(description="Run Railroad on LongMemEval benchmark")
    parser.add_argument("--data", type=str, default="LongMemEval/data/longmemeval_oracle.json",
                       help="Path to LongMemEval data file")
    parser.add_argument("--output", type=str, default="railroad_longmemeval_results.jsonl",
                       help="Output file for results")
    parser.add_argument("--model", type=str, default="llama-3.3-70b-versatile",
                       help="Groq model to use")
    parser.add_argument("--limit", type=int, default=None,
                       help="Limit number of questions to process")
    parser.add_argument("--start", type=int, default=0,
                       help="Starting question index")
    parser.add_argument("--verbose", action="store_true",
                       help="Print detailed progress")
    parser.add_argument("--question-types", type=str, nargs="+", default=None,
                       help="Filter by question types")

    args = parser.parse_args()

    # Check for API key
    if not os.environ.get("GROQ_API_KEY"):
        print("Error: GROQ_API_KEY environment variable not set")
        sys.exit(1)

    # Load data
    print(f"Loading data from {args.data}...")
    with open(args.data) as f:
        data = json.load(f)

    # Filter by question types if specified
    if args.question_types:
        data = [q for q in data if q["question_type"] in args.question_types]
        print(f"Filtered to {len(data)} questions of types: {args.question_types}")

    # Apply start and limit
    data = data[args.start:]
    if args.limit:
        data = data[:args.limit]

    print(f"Processing {len(data)} questions with Railroad + Groq ({args.model})...")
    print(f"Output: {args.output}")
    print()

    # Initialize Railroad evaluator
    evaluator = RailroadLongMemEval(
        model=args.model,
        verbose=args.verbose
    )

    # Process questions
    results = []
    total_tokens = 0
    start_time = time.time()

    with open(args.output, "w") as out_f:
        for i, instance in enumerate(data):
            try:
                result = evaluator.run_single_instance(instance)
                results.append(result)
                total_tokens += result["tokens_used"]

                # Write result immediately (streaming output)
                out_f.write(json.dumps({
                    "question_id": result["question_id"],
                    "hypothesis": result["hypothesis"]
                }) + "\n")
                out_f.flush()

                # Progress update
                elapsed = time.time() - start_time
                avg_time = elapsed / (i + 1)
                remaining = avg_time * (len(data) - i - 1)

                print(f"[{i+1}/{len(data)}] {result['question_id']}: "
                      f"{result['memories_extracted']} memories, "
                      f"{result['tokens_used']} tokens "
                      f"(ETA: {remaining/60:.1f}m)")

                # Rate limiting
                time.sleep(0.5)

            except Exception as e:
                print(f"Error processing {instance['question_id']}: {e}")
                # Write empty result
                out_f.write(json.dumps({
                    "question_id": instance["question_id"],
                    "hypothesis": f"Error: {str(e)}"
                }) + "\n")
                out_f.flush()

    # Summary
    elapsed = time.time() - start_time
    print()
    print("=" * 60)
    print("RAILROAD LONGMEMEVAL BENCHMARK COMPLETE")
    print("=" * 60)
    print(f"Questions processed: {len(results)}")
    print(f"Total tokens used: {total_tokens:,}")
    print(f"Avg tokens/question: {total_tokens // len(results) if results else 0:,}")
    print(f"Total time: {elapsed/60:.1f} minutes")
    print(f"Avg time/question: {elapsed/len(results):.1f}s")
    print(f"Results saved to: {args.output}")
    print()
    print("To evaluate results:")
    print(f"  cd LongMemEval/src/evaluation")
    print(f"  python3 evaluate_qa.py gpt-4o ../../{args.output} ../../{args.data}")


if __name__ == "__main__":
    main()
