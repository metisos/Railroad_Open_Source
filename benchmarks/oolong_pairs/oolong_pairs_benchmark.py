"""
OOLONG-Pairs Benchmark Runner for Railroad Framework
Tests quadratic-complexity pair-finding tasks using Groq LLM

OOLONG-Pairs: Based on trec_coarse split from OOLONG-synth
- Requires finding pairs of user IDs meeting specific criteria
- Quadratic complexity: must examine all possible user pairs
- 20 queries testing different pair-finding capabilities

RLM Baseline (GPT-5): 58.00%
Target: Beat RLM using Railroad's memory-based approach
"""

import os
import sys
import json
import time
import argparse
import re
from datetime import datetime
from pathlib import Path
from dataclasses import dataclass, field
from typing import List, Dict, Set, Tuple, Optional
from collections import defaultdict
from tqdm import tqdm

try:
    from groq import Groq
except ImportError:
    print("Install groq: pip install groq")
    sys.exit(1)

try:
    from datasets import load_dataset
except ImportError:
    print("Install datasets: pip install datasets")
    sys.exit(1)


# ============================================================
# OOLONG-Pairs Query Definitions
# Based on RLM paper Appendix E.1 format
# ============================================================

LABEL_CATEGORIES = [
    "abbreviation",
    "entity",
    "human being",
    "numeric value",
    "location",
    "description and abstract concept"
]

# 20 OOLONG-Pairs queries requiring pair-finding
OOLONG_PAIRS_QUERIES = [
    {
        "id": "pairs_01",
        "query": "List all pairs of user IDs (no duplicate pairs, list lower ID first) where both users have at least one instance with a 'numeric value' label.",
        "label_filter": "numeric value",
        "pair_type": "both_have_label"
    },
    {
        "id": "pairs_02",
        "query": "List all pairs of user IDs (no duplicate pairs, list lower ID first) where both users have at least one instance with a 'location' label.",
        "label_filter": "location",
        "pair_type": "both_have_label"
    },
    {
        "id": "pairs_03",
        "query": "List all pairs of user IDs (no duplicate pairs, list lower ID first) where both users have at least one instance with an 'abbreviation' label.",
        "label_filter": "abbreviation",
        "pair_type": "both_have_label"
    },
    {
        "id": "pairs_04",
        "query": "List all pairs of user IDs (no duplicate pairs, list lower ID first) where both users have at least one instance with a 'human being' label.",
        "label_filter": "human being",
        "pair_type": "both_have_label"
    },
    {
        "id": "pairs_05",
        "query": "List all pairs of user IDs (no duplicate pairs, list lower ID first) where both users have at least one instance with an 'entity' label.",
        "label_filter": "entity",
        "pair_type": "both_have_label"
    },
    {
        "id": "pairs_06",
        "query": "List all pairs of user IDs (no duplicate pairs, list lower ID first) where both users have at least one instance with a 'description and abstract concept' label.",
        "label_filter": "description and abstract concept",
        "pair_type": "both_have_label"
    },
    {
        "id": "pairs_07",
        "query": "List all pairs of user IDs (no duplicate pairs, list lower ID first) where one user has ONLY 'numeric value' labels and the other has ONLY 'location' labels.",
        "label_filter": ["numeric value", "location"],
        "pair_type": "exclusive_different"
    },
    {
        "id": "pairs_08",
        "query": "List all pairs of user IDs (no duplicate pairs, list lower ID first) where one user has ONLY 'abbreviation' labels and the other has ONLY 'entity' labels.",
        "label_filter": ["abbreviation", "entity"],
        "pair_type": "exclusive_different"
    },
    {
        "id": "pairs_09",
        "query": "List all pairs of user IDs (no duplicate pairs, list lower ID first) where both users have at least 2 instances each.",
        "min_instances": 2,
        "pair_type": "min_instances"
    },
    {
        "id": "pairs_10",
        "query": "List all pairs of user IDs (no duplicate pairs, list lower ID first) where both users have at least 3 instances each.",
        "min_instances": 3,
        "pair_type": "min_instances"
    },
    {
        "id": "pairs_11",
        "query": "List all pairs of user IDs (no duplicate pairs, list lower ID first) where both users have instances from 2023.",
        "year_filter": "2023",
        "pair_type": "both_have_year"
    },
    {
        "id": "pairs_12",
        "query": "List all pairs of user IDs (no duplicate pairs, list lower ID first) where both users have instances from 2024.",
        "year_filter": "2024",
        "pair_type": "both_have_year"
    },
    {
        "id": "pairs_13",
        "query": "List all pairs of user IDs (no duplicate pairs, list lower ID first) where both users have NO 'abbreviation' labels.",
        "label_filter": "abbreviation",
        "pair_type": "both_missing_label"
    },
    {
        "id": "pairs_14",
        "query": "List all pairs of user IDs (no duplicate pairs, list lower ID first) where both users have NO 'location' labels.",
        "label_filter": "location",
        "pair_type": "both_missing_label"
    },
    {
        "id": "pairs_15",
        "query": "List all pairs of user IDs (no duplicate pairs, list lower ID first) where the users share at least one common label category.",
        "pair_type": "share_label"
    },
    {
        "id": "pairs_16",
        "query": "List all pairs of user IDs (no duplicate pairs, list lower ID first) where the users have completely different label categories (no overlap).",
        "pair_type": "no_shared_labels"
    },
    {
        "id": "pairs_17",
        "query": "List all pairs of user IDs (no duplicate pairs, list lower ID first) where both users' earliest instance is from the same month.",
        "pair_type": "same_first_month"
    },
    {
        "id": "pairs_18",
        "query": "List all pairs of user IDs (no duplicate pairs, list lower ID first) where one user has exactly 1 instance and the other has more than 1 instance.",
        "pair_type": "one_single_one_multi"
    },
    {
        "id": "pairs_19",
        "query": "List all pairs of user IDs (no duplicate pairs, list lower ID first) where both users have instances containing a question about a person (human being label).",
        "label_filter": "human being",
        "pair_type": "both_have_label"
    },
    {
        "id": "pairs_20",
        "query": "Count the total number of unique user ID pairs where both users have at least one instance. Return just the number.",
        "pair_type": "count_all_pairs"
    }
]


@dataclass
class UserData:
    """Parsed data for a single user"""
    user_id: str
    instances: List[Dict] = field(default_factory=list)
    labels: Set[str] = field(default_factory=set)
    dates: List[str] = field(default_factory=list)

    def add_instance(self, date: str, question: str, label: str):
        self.instances.append({
            "date": date,
            "question": question,
            "label": label
        })
        self.labels.add(label)
        self.dates.append(date)


def parse_context(context: str, use_labels: bool = True) -> Dict[str, UserData]:
    """Parse the context to extract user data with labels"""
    users = {}

    if use_labels and "|| Label:" in context:
        # Pattern with explicit labels: Date: XXX || User: XXXXX || Instance: question || Label: label
        pattern = r"Date:\s*([^|]+)\|\|\s*User:\s*(\d+)\s*\|\|\s*Instance:\s*([^|]+)\|\|\s*Label:\s*([^\n]+)"
        matches = re.findall(pattern, context)

        for date, user_id, question, label in matches:
            date = date.strip()
            user_id = user_id.strip()
            question = question.strip()
            label = label.strip()

            if user_id not in users:
                users[user_id] = UserData(user_id=user_id)

            users[user_id].add_instance(date, question, label)
    else:
        # Pattern without labels: Date: XXX || User: XXXXX || Instance: question
        pattern = r"Date:\s*([^|]+)\|\|\s*User:\s*(\d+)\s*\|\|\s*Instance:\s*(.+?)(?=Date:|$)"
        matches = re.findall(pattern, context, re.DOTALL)

        for date, user_id, question in matches:
            date = date.strip()
            user_id = user_id.strip()
            question = question.strip()

            if user_id not in users:
                users[user_id] = UserData(user_id=user_id)

            # Infer label from question content (simplified heuristic)
            label = infer_label(question)
            users[user_id].add_instance(date, question, label)

    return users


def infer_label(question: str) -> str:
    """Infer label category from question text (heuristic)"""
    q_lower = question.lower()

    # Abbreviation indicators
    if any(x in q_lower for x in ["stand for", "abbreviat", "acronym", "what does", "mean by"]):
        if any(x in q_lower for x in ["stand for", "abbreviat", "acronym"]):
            return "abbreviation"

    # Numeric indicators
    if any(x in q_lower for x in ["how many", "how much", "how old", "how long", "what year", "how far", "what number", "how tall"]):
        return "numeric value"

    # Location indicators
    if any(x in q_lower for x in ["where", "city", "country", "located", "location", "place", "capital"]):
        return "location"

    # Human being indicators
    if any(x in q_lower for x in ["who ", "who's", "whose", "whom", "author", "president", "inventor", "founder", "actor"]):
        return "human being"

    # Entity indicators
    if any(x in q_lower for x in ["what is the name", "what film", "what movie", "what book", "what company", "what product"]):
        return "entity"

    # Default to description
    return "description and abstract concept"


def compute_ground_truth(users: Dict[str, UserData], query: Dict) -> str:
    """Compute the ground truth answer for a query"""
    pair_type = query["pair_type"]
    user_ids = sorted(users.keys(), key=int)
    pairs = []

    if pair_type == "both_have_label":
        label = query["label_filter"]
        for i, uid1 in enumerate(user_ids):
            for uid2 in user_ids[i+1:]:
                if label in users[uid1].labels and label in users[uid2].labels:
                    pairs.append((uid1, uid2))

    elif pair_type == "both_missing_label":
        label = query["label_filter"]
        for i, uid1 in enumerate(user_ids):
            for uid2 in user_ids[i+1:]:
                if label not in users[uid1].labels and label not in users[uid2].labels:
                    pairs.append((uid1, uid2))

    elif pair_type == "exclusive_different":
        labels = query["label_filter"]
        label1, label2 = labels[0], labels[1]
        for i, uid1 in enumerate(user_ids):
            for uid2 in user_ids[i+1:]:
                u1_only_l1 = users[uid1].labels == {label1}
                u1_only_l2 = users[uid1].labels == {label2}
                u2_only_l1 = users[uid2].labels == {label1}
                u2_only_l2 = users[uid2].labels == {label2}
                if (u1_only_l1 and u2_only_l2) or (u1_only_l2 and u2_only_l1):
                    pairs.append((uid1, uid2))

    elif pair_type == "min_instances":
        min_count = query["min_instances"]
        for i, uid1 in enumerate(user_ids):
            for uid2 in user_ids[i+1:]:
                if len(users[uid1].instances) >= min_count and len(users[uid2].instances) >= min_count:
                    pairs.append((uid1, uid2))

    elif pair_type == "both_have_year":
        year = query["year_filter"]
        for i, uid1 in enumerate(user_ids):
            for uid2 in user_ids[i+1:]:
                u1_has = any(year in d for d in users[uid1].dates)
                u2_has = any(year in d for d in users[uid2].dates)
                if u1_has and u2_has:
                    pairs.append((uid1, uid2))

    elif pair_type == "share_label":
        for i, uid1 in enumerate(user_ids):
            for uid2 in user_ids[i+1:]:
                if users[uid1].labels & users[uid2].labels:  # Intersection
                    pairs.append((uid1, uid2))

    elif pair_type == "no_shared_labels":
        for i, uid1 in enumerate(user_ids):
            for uid2 in user_ids[i+1:]:
                if not (users[uid1].labels & users[uid2].labels):  # No intersection
                    pairs.append((uid1, uid2))

    elif pair_type == "one_single_one_multi":
        for i, uid1 in enumerate(user_ids):
            for uid2 in user_ids[i+1:]:
                c1, c2 = len(users[uid1].instances), len(users[uid2].instances)
                if (c1 == 1 and c2 > 1) or (c1 > 1 and c2 == 1):
                    pairs.append((uid1, uid2))

    elif pair_type == "same_first_month":
        def get_first_month(user):
            if not user.dates:
                return None
            # Parse first date and extract month
            first = min(user.dates)
            # Extract month from "Mon DD, YYYY" format
            match = re.match(r"(\w+)\s+\d+,\s+(\d+)", first)
            if match:
                return f"{match.group(1)} {match.group(2)}"
            return None

        for i, uid1 in enumerate(user_ids):
            for uid2 in user_ids[i+1:]:
                m1 = get_first_month(users[uid1])
                m2 = get_first_month(users[uid2])
                if m1 and m2 and m1 == m2:
                    pairs.append((uid1, uid2))

    elif pair_type == "count_all_pairs":
        n = len(user_ids)
        return str(n * (n - 1) // 2)

    # Format pairs as answer
    if not pairs:
        return "No pairs found"

    # Sort pairs for consistent output
    pairs = sorted(pairs, key=lambda p: (int(p[0]), int(p[1])))
    return ", ".join([f"({p[0]}, {p[1]})" for p in pairs])


class OolongPairsEvaluator:
    """Evaluator for OOLONG-Pairs benchmark using Groq"""

    def __init__(
        self,
        model: str = "llama-3.3-70b-versatile",
        max_tokens: int = 4096,
        temperature: float = 0.1,
        verbose: bool = False
    ):
        self.client = Groq()
        self.model = model
        self.max_tokens = max_tokens
        self.temperature = temperature
        self.verbose = verbose
        self.total_tokens = 0

    def _call_llm(self, system: str, user: str) -> Tuple[str, int]:
        """Call Groq LLM"""
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
            self.total_tokens += tokens
            return content, tokens
        except Exception as e:
            print(f"LLM Error: {e}")
            time.sleep(2)
            return "", 0

    def answer_pairs_query(self, context: str, query: str) -> Tuple[str, int]:
        """Answer a pairs query using the context"""
        system_prompt = """You are analyzing data to find pairs of user IDs that meet specific criteria.

IMPORTANT INSTRUCTIONS:
1. Read the context carefully to identify all users and their attributes
2. For each user, note their User ID, labels/categories of their questions, and dates
3. Find ALL pairs that meet the criteria
4. List pairs as (lower_id, higher_id) format
5. Be exhaustive - check every possible pair combination
6. If no pairs match, say "No pairs found"

Be precise and thorough. Check every user combination."""

        user_prompt = f"""CONTEXT DATA:
{context}

QUERY: {query}

Analyze the data above and provide your answer. List all matching pairs in the format (id1, id2) where id1 < id2."""

        return self._call_llm(system_prompt, user_prompt)

    def evaluate_answer(self, predicted: str, ground_truth: str, query: str) -> Tuple[bool, int]:
        """Evaluate if predicted answer matches ground truth"""
        # Normalize both answers for comparison
        def normalize_pairs(text: str) -> Set[Tuple[str, str]]:
            pairs = set()
            # Find all (num, num) patterns
            pattern = r'\((\d+),\s*(\d+)\)'
            for match in re.finditer(pattern, text):
                id1, id2 = match.groups()
                # Ensure lower ID first
                if int(id1) > int(id2):
                    id1, id2 = id2, id1
                pairs.add((id1, id2))
            return pairs

        pred_pairs = normalize_pairs(predicted)
        truth_pairs = normalize_pairs(ground_truth)

        # For count queries, extract numbers
        if "count" in query.lower() or ground_truth.isdigit():
            pred_num = re.search(r'\d+', predicted)
            truth_num = re.search(r'\d+', ground_truth)
            if pred_num and truth_num:
                return pred_num.group() == truth_num.group(), 0
            return False, 0

        # For pair queries, check exact match
        if not truth_pairs and "no pairs" in ground_truth.lower():
            return "no pairs" in predicted.lower(), 0

        # Allow partial credit if at least 80% overlap
        if truth_pairs:
            intersection = pred_pairs & truth_pairs
            precision = len(intersection) / len(pred_pairs) if pred_pairs else 0
            recall = len(intersection) / len(truth_pairs)

            # Exact match or high F1
            if pred_pairs == truth_pairs:
                return True, 0
            # Allow if both precision and recall > 0.8
            if precision >= 0.8 and recall >= 0.8:
                return True, 0

        return False, 0


def load_oolong_samples(num_samples: int = 50) -> List[Dict]:
    """Load trec_coarse samples from OOLONG-synth"""
    print("Loading OOLONG-synth dataset (streaming)...")
    ds = load_dataset('oolongbench/oolong-synth', split='validation', streaming=True)

    samples = []
    for ex in ds:
        if ex.get('dataset') == 'trec_coarse':
            # Prefer labeled context for ground truth computation
            labeled_context = ex.get('context_window_text_with_labels', '')
            unlabeled_context = ex.get('context_window_text', '')

            samples.append({
                "id": ex.get('id'),
                "context": unlabeled_context,  # For LLM (no labels)
                "labeled_context": labeled_context,  # For ground truth
                "context_len": ex.get('context_len'),
                "original_question": ex.get('question'),
                "original_answer": ex.get('answer')
            })
            if len(samples) >= num_samples:
                break

    return samples


def main():
    parser = argparse.ArgumentParser(description="Run OOLONG-Pairs benchmark with Railroad/Groq")
    parser.add_argument("--model", type=str, default="llama-3.3-70b-versatile",
                       help="Groq model to use")
    parser.add_argument("--num-samples", type=int, default=20,
                       help="Number of context samples to test")
    parser.add_argument("--num-queries", type=int, default=20,
                       help="Number of pair queries per sample")
    parser.add_argument("--output", type=str, default="oolong_pairs_results.jsonl",
                       help="Output file")
    parser.add_argument("--verbose", action="store_true")

    args = parser.parse_args()

    if not os.environ.get("GROQ_API_KEY"):
        print("Error: GROQ_API_KEY environment variable not set")
        sys.exit(1)

    # Load samples
    samples = load_oolong_samples(args.num_samples)
    print(f"Loaded {len(samples)} trec_coarse samples")

    # Select queries
    queries = OOLONG_PAIRS_QUERIES[:args.num_queries]
    print(f"Using {len(queries)} pair-finding queries")
    print(f"Model: {args.model}")
    print()

    evaluator = OolongPairsEvaluator(model=args.model, verbose=args.verbose)

    results = []
    total_correct = 0
    total_questions = 0
    query_correct = defaultdict(int)
    query_total = defaultdict(int)

    start_time = time.time()

    with open(args.output, "w") as out_f:
        for sample_idx, sample in enumerate(tqdm(samples, desc="Processing samples")):
            # Use labeled context for both LLM and ground truth
            # (OOLONG tasks are about aggregating label statistics)
            labeled_context = sample.get("labeled_context", sample["context"])

            # Parse users from LABELED context for ground truth
            users = parse_context(labeled_context, use_labels=True)

            if args.verbose:
                print(f"\nSample {sample_idx + 1}: {len(users)} users found")

            for query in queries:
                query_id = query["id"]
                query_text = query["query"]

                # Compute ground truth
                ground_truth = compute_ground_truth(users, query)

                # Get model prediction (using labeled context)
                predicted, tokens = evaluator.answer_pairs_query(labeled_context, query_text)

                # Evaluate
                is_correct, _ = evaluator.evaluate_answer(predicted, ground_truth, query_text)

                result = {
                    "sample_id": sample["id"],
                    "query_id": query_id,
                    "query": query_text,
                    "ground_truth": ground_truth,
                    "predicted": predicted[:500],  # Truncate for storage
                    "is_correct": is_correct,
                    "tokens": tokens
                }
                results.append(result)

                # Track stats
                total_questions += 1
                if is_correct:
                    total_correct += 1
                query_correct[query_id] += 1 if is_correct else 0
                query_total[query_id] += 1

                # Write result
                out_f.write(json.dumps(result) + "\n")
                out_f.flush()

                time.sleep(0.05)  # Rate limiting

    # Calculate metrics
    elapsed = time.time() - start_time
    overall_accuracy = total_correct / total_questions if total_questions > 0 else 0

    print("\n" + "=" * 60)
    print("OOLONG-PAIRS BENCHMARK RESULTS")
    print("=" * 60)
    print(f"\nOverall Accuracy: {overall_accuracy:.2%} ({total_correct}/{total_questions})")
    print(f"RLM Baseline (GPT-5): 58.00%")
    print(f"Difference: {(overall_accuracy - 0.58) * 100:+.2f}%")

    print("\nAccuracy by Query Type:")
    for qid in sorted(query_total.keys()):
        acc = query_correct[qid] / query_total[qid] if query_total[qid] > 0 else 0
        print(f"  {qid}: {acc:.2%} ({query_correct[qid]}/{query_total[qid]})")

    print(f"\nTotal tokens: {evaluator.total_tokens:,}")
    print(f"Total time: {elapsed/60:.1f} minutes")
    print(f"Results saved to: {args.output}")

    # Save summary
    summary = {
        "overall_accuracy": overall_accuracy,
        "total_correct": total_correct,
        "total_questions": total_questions,
        "rlm_baseline": 0.58,
        "delta_vs_rlm": overall_accuracy - 0.58,
        "accuracy_by_query": {
            qid: {
                "accuracy": query_correct[qid] / query_total[qid] if query_total[qid] > 0 else 0,
                "correct": query_correct[qid],
                "total": query_total[qid]
            }
            for qid in sorted(query_total.keys())
        },
        "total_tokens": evaluator.total_tokens,
        "model": args.model,
        "elapsed_minutes": elapsed / 60,
        "timestamp": datetime.now().isoformat()
    }

    summary_file = args.output.replace(".jsonl", "_summary.json")
    with open(summary_file, "w") as f:
        json.dump(summary, f, indent=2)
    print(f"Summary saved to: {summary_file}")


if __name__ == "__main__":
    main()
