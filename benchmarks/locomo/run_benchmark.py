"""
LoCoMo Benchmark Runner for Railroad Framework
Uses Railroad's YAML-based memory system with Groq LLM

LoCoMo: Long Context Conversation benchmark
- 10 multi-session conversations
- 1986 QA pairs testing memory across sessions
- Categories: single-hop, temporal, multi-hop, open-domain
"""

import os
import sys
import json
import yaml
import time
import argparse
from datetime import datetime
from pathlib import Path
from dataclasses import dataclass, field
from tqdm import tqdm

try:
    from groq import Groq
except ImportError:
    print("Install groq: pip install groq")
    sys.exit(1)


@dataclass
class RailroadMemory:
    """Railroad-style memory state for a conversation"""
    conversation_id: str
    speaker_a: str = ""
    speaker_b: str = ""
    facts_about_a: list = field(default_factory=list)
    facts_about_b: list = field(default_factory=list)
    events: list = field(default_factory=list)
    relationships: list = field(default_factory=list)
    shared_experiences: list = field(default_factory=list)
    total_tokens: int = 0
    sessions_processed: int = 0

    def to_yaml(self) -> str:
        """Convert memory to YAML for context injection"""
        return yaml.dump({
            "conversation_id": self.conversation_id,
            "speakers": {
                "speaker_a": self.speaker_a,
                "speaker_b": self.speaker_b
            },
            f"facts_about_{self.speaker_a}": self.facts_about_a[-40:],
            f"facts_about_{self.speaker_b}": self.facts_about_b[-40:],
            "events": self.events[-30:],
            "relationships": self.relationships[-10:],
            "shared_experiences": self.shared_experiences[-15:],
            "stats": {
                "sessions_processed": self.sessions_processed,
                "total_facts": len(self.facts_about_a) + len(self.facts_about_b),
                "total_events": len(self.events)
            }
        }, default_flow_style=False, allow_unicode=True)

    def add_memories(self, extracted: dict, speaker_a: str, speaker_b: str):
        """Add extracted memories from a session"""
        self.facts_about_a.extend(extracted.get(f"facts_about_{speaker_a}", []))
        self.facts_about_b.extend(extracted.get(f"facts_about_{speaker_b}", []))
        # Also check generic keys
        self.facts_about_a.extend(extracted.get("facts_about_a", []))
        self.facts_about_b.extend(extracted.get("facts_about_b", []))
        self.events.extend(extracted.get("events", []))
        self.relationships.extend(extracted.get("relationships", []))
        self.shared_experiences.extend(extracted.get("shared_experiences", []))


class RailroadLoCoMo:
    """Railroad-based memory system for LoCoMo benchmark"""

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

    def get_extraction_prompt(self, speaker_a: str, speaker_b: str) -> str:
        return f"""You are a memory extraction system. Extract important information from this conversation between {speaker_a} and {speaker_b}.

Extract:
1. facts_about_{speaker_a}: Facts about {speaker_a} (job, hobbies, family, preferences, experiences)
2. facts_about_{speaker_b}: Facts about {speaker_b} (job, hobbies, family, preferences, experiences)
3. events: Timestamped events mentioned (include dates when available)
4. relationships: People, places, things mentioned and their relationship to the speakers
5. shared_experiences: Things they did together or discussed

IMPORTANT: Only extract explicitly stated information. Include dates/times when mentioned.

Respond with JSON only:
{{
    "facts_about_{speaker_a}": ["fact1", "fact2"],
    "facts_about_{speaker_b}": ["fact1", "fact2"],
    "events": ["On [date]: event"],
    "relationships": ["relationship"],
    "shared_experiences": ["experience"]
}}"""

    def _call_llm(self, system: str, user: str) -> tuple[str, int]:
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
            time.sleep(2)
            return "", 0

    def _parse_json(self, content: str) -> dict:
        """Parse JSON from LLM response"""
        try:
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]
            return json.loads(content.strip())
        except:
            return {}

    def process_session(self, memory: RailroadMemory, session: list, session_date: str) -> int:
        """Process a single conversation session and extract memories"""
        # Format session as dialogue
        conversation = f"[Session Date: {session_date}]\n\n"
        for turn in session:
            speaker = turn.get("speaker", "Unknown")
            text = turn.get("text", "")
            conversation += f"{speaker}: {text}\n"

        # Truncate if too long
        if len(conversation) > 8000:
            conversation = conversation[:8000] + "\n[... truncated ...]"

        # Extract memories
        extraction_prompt = self.get_extraction_prompt(memory.speaker_a, memory.speaker_b)
        response, tokens = self._call_llm(
            extraction_prompt,
            f"Extract memories from this conversation:\n\n{conversation}"
        )

        extracted = self._parse_json(response)
        memory.add_memories(extracted, memory.speaker_a, memory.speaker_b)
        memory.sessions_processed += 1
        memory.total_tokens += tokens

        return tokens

    def answer_question(self, memory: RailroadMemory, question: str) -> tuple[str, int]:
        """Answer a question using accumulated memory"""
        memory_yaml = memory.to_yaml()

        system_prompt = """You are a helpful assistant with access to memories from conversations.
Answer questions based ONLY on the memories provided. Be concise and specific.
If the answer is not in the memories, say "I don't know" or "Not mentioned"."""

        user_prompt = f"""ACCUMULATED MEMORIES:
```yaml
{memory_yaml}
```

QUESTION: {question}

Answer concisely based only on the memories above:"""

        response, tokens = self._call_llm(system_prompt, user_prompt)
        memory.total_tokens += tokens
        return response.strip(), tokens

    def build_memory_for_conversation(self, conv_data: dict) -> RailroadMemory:
        """Process all sessions in a conversation to build memory"""
        conv = conv_data["conversation"]
        speaker_a = conv["speaker_a"]
        speaker_b = conv["speaker_b"]

        memory = RailroadMemory(
            conversation_id=conv_data["sample_id"],
            speaker_a=speaker_a,
            speaker_b=speaker_b
        )

        # Process each session
        session_num = 1
        while f"session_{session_num}" in conv:
            session = conv[f"session_{session_num}"]
            date_key = f"session_{session_num}_date_time"
            session_date = conv.get(date_key, f"Session {session_num}")

            self.process_session(memory, session, session_date)

            if self.verbose:
                print(f"    Session {session_num}: {len(session)} turns, "
                      f"{len(memory.facts_about_a)} + {len(memory.facts_about_b)} facts")

            session_num += 1
            time.sleep(0.1)  # Rate limiting

        return memory

    def evaluate_answer(self, predicted: str, ground_truth: str, question: str) -> tuple[bool, int]:
        """Use LLM to evaluate if predicted answer is correct"""
        prompt = f"""Compare the predicted answer to the correct answer for this question.
Answer "yes" if the predicted answer contains the correct information (even if worded differently).
Answer "no" if the predicted answer is wrong or missing key information.

Question: {question}
Correct Answer: {ground_truth}
Predicted Answer: {predicted}

Is the predicted answer correct? Answer yes or no only."""

        response, tokens = self._call_llm("You are an answer evaluator.", prompt)
        is_correct = "yes" in response.lower()
        return is_correct, tokens


def main():
    parser = argparse.ArgumentParser(description="Run Railroad on LoCoMo benchmark")
    parser.add_argument("--data", type=str,
                       default="letta-leaderboard/leaderboard/locomo/locomo10.json",
                       help="Path to LoCoMo data file")
    parser.add_argument("--output", type=str, default="railroad_locomo_results.jsonl",
                       help="Output file for results")
    parser.add_argument("--model", type=str, default="llama-3.3-70b-versatile",
                       help="Groq model to use")
    parser.add_argument("--limit-conversations", type=int, default=None,
                       help="Limit number of conversations")
    parser.add_argument("--limit-questions", type=int, default=None,
                       help="Limit questions per conversation")
    parser.add_argument("--verbose", action="store_true",
                       help="Print detailed progress")

    args = parser.parse_args()

    if not os.environ.get("GROQ_API_KEY"):
        print("Error: GROQ_API_KEY environment variable not set")
        sys.exit(1)

    # Load data
    print(f"Loading LoCoMo data from {args.data}...")
    with open(args.data) as f:
        data = json.load(f)

    if args.limit_conversations:
        data = data[:args.limit_conversations]

    total_questions = sum(len(d["qa"]) for d in data)
    print(f"Loaded {len(data)} conversations with {total_questions} total questions")
    print(f"Model: {args.model}")
    print()

    evaluator = RailroadLoCoMo(model=args.model, verbose=args.verbose)

    all_results = []
    category_correct = {1: 0, 2: 0, 3: 0, 4: 0}
    category_total = {1: 0, 2: 0, 3: 0, 4: 0}
    total_correct = 0
    total_questions_processed = 0
    total_tokens = 0

    start_time = time.time()

    with open(args.output, "w") as out_f:
        for conv_idx, conv_data in enumerate(data):
            conv_id = conv_data["sample_id"]
            print(f"\n[{conv_idx + 1}/{len(data)}] Processing conversation {conv_id}...")

            # Build memory from all sessions
            memory = evaluator.build_memory_for_conversation(conv_data)
            print(f"  Built memory: {len(memory.facts_about_a)} + {len(memory.facts_about_b)} facts, "
                  f"{len(memory.events)} events")

            # Answer questions
            qa_pairs = conv_data["qa"]
            if args.limit_questions:
                qa_pairs = qa_pairs[:args.limit_questions]

            print(f"  Answering {len(qa_pairs)} questions...")

            for qa in tqdm(qa_pairs, desc=f"  {conv_id}", leave=False):
                question = qa.get("question", "")
                ground_truth = qa.get("answer", "")
                category = qa.get("category", 1)

                if not question or not ground_truth:
                    continue  # Skip malformed QA pairs

                # Get Railroad's answer
                predicted, _ = evaluator.answer_question(memory, question)

                # Evaluate
                is_correct, eval_tokens = evaluator.evaluate_answer(predicted, ground_truth, question)
                memory.total_tokens += eval_tokens

                result = {
                    "conversation_id": conv_id,
                    "question": question,
                    "ground_truth": ground_truth,
                    "predicted": predicted,
                    "category": category,
                    "is_correct": is_correct
                }
                all_results.append(result)

                # Track stats
                category_total[category] = category_total.get(category, 0) + 1
                if is_correct:
                    category_correct[category] = category_correct.get(category, 0) + 1
                    total_correct += 1
                total_questions_processed += 1

                # Write result
                out_f.write(json.dumps({
                    "conversation_id": conv_id,
                    "question": question,
                    "hypothesis": predicted,
                    "is_correct": is_correct,
                    "category": category
                }) + "\n")
                out_f.flush()

                time.sleep(0.05)  # Rate limiting

            total_tokens += memory.total_tokens
            print(f"  Tokens used: {memory.total_tokens:,}")

    # Calculate metrics
    elapsed = time.time() - start_time
    overall_accuracy = total_correct / total_questions_processed if total_questions_processed > 0 else 0

    # Category names from LoCoMo paper
    category_names = {
        1: "single-hop",
        2: "temporal",
        3: "multi-hop",
        4: "open-domain"
    }

    print("\n" + "=" * 60)
    print("LOCOMO BENCHMARK RESULTS")
    print("=" * 60)
    print(f"\nOverall Accuracy: {overall_accuracy:.4f} ({total_correct}/{total_questions_processed})")
    print("\nAccuracy by Category:")
    for cat in sorted(category_total.keys()):
        if category_total[cat] > 0:
            acc = category_correct[cat] / category_total[cat]
            name = category_names.get(cat, f"category-{cat}")
            print(f"  {name}: {acc:.4f} ({category_correct[cat]}/{category_total[cat]})")

    print(f"\nTotal tokens: {total_tokens:,}")
    print(f"Total time: {elapsed/60:.1f} minutes")
    print(f"Results saved to: {args.output}")

    # Save summary
    summary = {
        "overall_accuracy": overall_accuracy,
        "total_correct": total_correct,
        "total_questions": total_questions_processed,
        "accuracy_by_category": {
            category_names.get(k, f"cat-{k}"): {
                "accuracy": category_correct[k] / category_total[k] if category_total[k] > 0 else 0,
                "correct": category_correct[k],
                "total": category_total[k]
            }
            for k in sorted(category_total.keys()) if category_total[k] > 0
        },
        "total_tokens": total_tokens,
        "model": args.model,
        "elapsed_minutes": elapsed / 60
    }

    summary_file = args.output.replace(".jsonl", "_summary.json")
    with open(summary_file, "w") as f:
        json.dump(summary, f, indent=2)
    print(f"Summary saved to: {summary_file}")


if __name__ == "__main__":
    main()
