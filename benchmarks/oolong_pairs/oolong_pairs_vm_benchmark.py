"""
OOLONG-Pairs Benchmark Runner — Metis VM Agent Edition
Routes queries through the local VM agent (localhost:8080/chat) instead of Groq directly.
Tests the full Metis agent stack: Gemini 2.5/3.1 Pro + Railroad Memory + Sovereign Memory.

Original benchmark: 85.75% with Llama 3.3 70B via Groq (direct prompting)
RLM Baseline (GPT-5): 58.00%
"""

import os
import sys
import json
import time
import argparse
import re
import requests
from datetime import datetime
from pathlib import Path
from dataclasses import dataclass, field
from typing import List, Dict, Set, Tuple, Optional
from collections import defaultdict

try:
    from tqdm import tqdm
except ImportError:
    print("Install tqdm: pip install tqdm")
    sys.exit(1)

try:
    from datasets import load_dataset
except ImportError:
    print("Install datasets: pip install datasets")
    sys.exit(1)


# ============================================================
# OOLONG-Pairs Query Definitions (same as original)
# ============================================================

LABEL_CATEGORIES = [
    "abbreviation",
    "entity",
    "human being",
    "numeric value",
    "location",
    "description and abstract concept"
]

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
    user_id: str
    instances: List[Dict] = field(default_factory=list)
    labels: Set[str] = field(default_factory=set)
    dates: List[str] = field(default_factory=list)

    def add_instance(self, date: str, question: str, label: str):
        self.instances.append({"date": date, "question": question, "label": label})
        self.labels.add(label)
        self.dates.append(date)


def parse_context(context: str, use_labels: bool = True) -> Dict[str, UserData]:
    users = {}
    if use_labels and "|| Label:" in context:
        pattern = r"Date:\s*([^|]+)\|\|\s*User:\s*(\d+)\s*\|\|\s*Instance:\s*([^|]+)\|\|\s*Label:\s*([^\n]+)"
        matches = re.findall(pattern, context)
        for date, user_id, question, label in matches:
            date, user_id, question, label = date.strip(), user_id.strip(), question.strip(), label.strip()
            if user_id not in users:
                users[user_id] = UserData(user_id=user_id)
            users[user_id].add_instance(date, question, label)
    else:
        pattern = r"Date:\s*([^|]+)\|\|\s*User:\s*(\d+)\s*\|\|\s*Instance:\s*(.+?)(?=Date:|$)"
        matches = re.findall(pattern, context, re.DOTALL)
        for date, user_id, question in matches:
            date, user_id, question = date.strip(), user_id.strip(), question.strip()
            if user_id not in users:
                users[user_id] = UserData(user_id=user_id)
            label = infer_label(question)
            users[user_id].add_instance(date, question, label)
    return users


def infer_label(question: str) -> str:
    q_lower = question.lower()
    if any(x in q_lower for x in ["stand for", "abbreviat", "acronym"]):
        return "abbreviation"
    if any(x in q_lower for x in ["how many", "how much", "how old", "how long", "what year", "how far", "what number", "how tall"]):
        return "numeric value"
    if any(x in q_lower for x in ["where", "city", "country", "located", "location", "place", "capital"]):
        return "location"
    if any(x in q_lower for x in ["who ", "who's", "whose", "whom", "author", "president", "inventor", "founder", "actor"]):
        return "human being"
    if any(x in q_lower for x in ["what is the name", "what film", "what movie", "what book", "what company", "what product"]):
        return "entity"
    return "description and abstract concept"


def compute_ground_truth(users: Dict[str, UserData], query: Dict) -> str:
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
                if users[uid1].labels & users[uid2].labels:
                    pairs.append((uid1, uid2))
    elif pair_type == "no_shared_labels":
        for i, uid1 in enumerate(user_ids):
            for uid2 in user_ids[i+1:]:
                if not (users[uid1].labels & users[uid2].labels):
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
            first = min(user.dates)
            match = re.match(r"(\w+)\s+\d+,\s+(\d+)", first)
            if match:
                return f"{match.group(1)} {match.group(2)}"
            return None
        for i, uid1 in enumerate(user_ids):
            for uid2 in user_ids[i+1:]:
                m1, m2 = get_first_month(users[uid1]), get_first_month(users[uid2])
                if m1 and m2 and m1 == m2:
                    pairs.append((uid1, uid2))
    elif pair_type == "count_all_pairs":
        n = len(user_ids)
        return str(n * (n - 1) // 2)

    if not pairs:
        return "No pairs found"
    pairs = sorted(pairs, key=lambda p: (int(p[0]), int(p[1])))
    return ", ".join([f"({p[0]}, {p[1]})" for p in pairs])


def normalize_pairs(text: str) -> Set[Tuple[str, str]]:
    pairs = set()
    pattern = r'\((\d+),\s*(\d+)\)'
    for match in re.finditer(pattern, text):
        id1, id2 = match.groups()
        if int(id1) > int(id2):
            id1, id2 = id2, id1
        pairs.add((id1, id2))
    return pairs


def evaluate_answer(predicted: str, ground_truth: str, query: str) -> bool:
    pred_pairs = normalize_pairs(predicted)
    truth_pairs = normalize_pairs(ground_truth)

    if "count" in query.lower() or ground_truth.isdigit():
        pred_num = re.search(r'\d+', predicted)
        truth_num = re.search(r'\d+', ground_truth)
        if pred_num and truth_num:
            return pred_num.group() == truth_num.group()
        return False

    if not truth_pairs and "no pairs" in ground_truth.lower():
        return "no pairs" in predicted.lower()

    if truth_pairs:
        if pred_pairs == truth_pairs:
            return True
        intersection = pred_pairs & truth_pairs
        precision = len(intersection) / len(pred_pairs) if pred_pairs else 0
        recall = len(intersection) / len(truth_pairs)
        if precision >= 0.8 and recall >= 0.8:
            return True

    return False


class VMAgentEvaluator:
    """Evaluator that routes queries through the local Metis VM agent"""

    def __init__(self, vm_url: str = "http://localhost:8080", verbose: bool = False):
        self.vm_url = vm_url
        self.verbose = verbose
        self.total_requests = 0
        self.total_errors = 0

    def check_health(self) -> bool:
        try:
            resp = requests.get(f"{self.vm_url}/health", timeout=5)
            data = resp.json()
            return data.get("agentReady", False)
        except Exception as e:
            print(f"Health check failed: {e}")
            return False

    def answer_pairs_query(self, context: str, query: str) -> Tuple[str, float]:
        """Send query to VM agent's /chat endpoint, return (answer, latency_seconds)"""

        # Construct a focused message that includes the context data and query
        message = f"""You are analyzing structured data to find pairs of user IDs. Be precise and exhaustive.

IMPORTANT INSTRUCTIONS:
1. Read the context carefully to identify all users and their attributes
2. For each user, note their User ID, labels/categories of their questions, and dates
3. Find ALL pairs that meet the criteria
4. List pairs as (lower_id, higher_id) format
5. Be exhaustive - check every possible pair combination
6. If no pairs match, say "No pairs found"
7. Do NOT use any tools. Just analyze the data and respond directly.

CONTEXT DATA:
{context}

QUERY: {query}

Analyze the data above and provide your answer. List all matching pairs in the format (id1, id2) where id1 < id2."""

        self.total_requests += 1
        start = time.time()

        try:
            resp = requests.post(
                f"{self.vm_url}/chat",
                json={
                    "message": message,
                    "conversationHistory": []
                },
                headers={"Content-Type": "application/json"},
                timeout=120
            )
            latency = time.time() - start

            if resp.status_code != 200:
                self.total_errors += 1
                if self.verbose:
                    print(f"  HTTP {resp.status_code}: {resp.text[:200]}")
                return "", latency

            data = resp.json()
            # The VM agent returns response in 'text' field
            answer = data.get("text", data.get("response", ""))

            if self.verbose:
                print(f"  Response ({latency:.1f}s): {answer[:150]}...")

            return answer, latency

        except requests.exceptions.Timeout:
            self.total_errors += 1
            latency = time.time() - start
            print(f"  TIMEOUT after {latency:.0f}s")
            return "", latency
        except Exception as e:
            self.total_errors += 1
            latency = time.time() - start
            print(f"  ERROR: {e}")
            return "", latency


def load_oolong_samples(num_samples: int = 50) -> List[Dict]:
    print("Loading OOLONG-synth dataset (streaming)...")
    ds = load_dataset('oolongbench/oolong-synth', split='validation', streaming=True)

    samples = []
    for ex in ds:
        if ex.get('dataset') == 'trec_coarse':
            labeled_context = ex.get('context_window_text_with_labels', '')
            unlabeled_context = ex.get('context_window_text', '')
            samples.append({
                "id": ex.get('id'),
                "context": unlabeled_context,
                "labeled_context": labeled_context,
                "context_len": ex.get('context_len'),
                "original_question": ex.get('question'),
                "original_answer": ex.get('answer')
            })
            if len(samples) >= num_samples:
                break

    return samples


def main():
    parser = argparse.ArgumentParser(description="Run OOLONG-Pairs benchmark via Metis VM Agent")
    parser.add_argument("--vm-url", type=str, default="http://localhost:8080",
                       help="VM agent URL (default: http://localhost:8080)")
    parser.add_argument("--num-samples", type=int, default=5,
                       help="Number of context samples to test (default: 5, full: 20)")
    parser.add_argument("--num-queries", type=int, default=20,
                       help="Number of pair queries per sample (default: 20)")
    parser.add_argument("--output", type=str, default=None,
                       help="Output file (default: auto-generated)")
    parser.add_argument("--verbose", action="store_true")

    args = parser.parse_args()

    if args.output is None:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        args.output = f"vm_benchmark_results_{timestamp}.jsonl"

    # Initialize evaluator
    evaluator = VMAgentEvaluator(vm_url=args.vm_url, verbose=args.verbose)

    # Health check
    print(f"Checking VM agent at {args.vm_url}...")
    if not evaluator.check_health():
        print("ERROR: VM agent not ready. Start it first:")
        print("  cd /root/agentpattern/operator-vm/agent-node")
        print("  GEMINI_API_KEY=... RAILROAD_MODE=true USE_VERTEX_AI=false node src/index.js")
        sys.exit(1)

    # Get agent info
    health = requests.get(f"{args.vm_url}/health").json()
    model = health.get("primaryModel", "unknown")
    version = health.get("version", "unknown")
    print(f"VM Agent v{version} | Model: {model} | Railroad: {health.get('sovereignMemory', {}).get('enabled', False)}")
    print()

    # Load samples
    samples = load_oolong_samples(args.num_samples)
    print(f"Loaded {len(samples)} trec_coarse samples")

    queries = OOLONG_PAIRS_QUERIES[:args.num_queries]
    total_questions = len(samples) * len(queries)
    print(f"Using {len(queries)} pair-finding queries")
    print(f"Total questions: {total_questions}")
    print(f"Estimated time: ~{total_questions * 8 / 60:.0f}-{total_questions * 15 / 60:.0f} minutes")
    print()

    results = []
    total_correct = 0
    total_questions_done = 0
    total_latency = 0.0
    query_correct = defaultdict(int)
    query_total = defaultdict(int)

    start_time = time.time()

    output_path = Path(args.output)
    with open(output_path, "w") as out_f:
        for sample_idx, sample in enumerate(samples):
            labeled_context = sample.get("labeled_context", sample["context"])
            users = parse_context(labeled_context, use_labels=True)

            print(f"\n--- Sample {sample_idx + 1}/{len(samples)} ({len(users)} users, ~{sample.get('context_len', '?')} tokens) ---")

            for qi, query in enumerate(queries):
                query_id = query["id"]
                query_text = query["query"]

                ground_truth = compute_ground_truth(users, query)

                # Send to VM agent
                predicted, latency = evaluator.answer_pairs_query(labeled_context, query_text)
                total_latency += latency

                is_correct = evaluate_answer(predicted, ground_truth, query_text) if predicted else False

                result = {
                    "sample_id": sample["id"],
                    "sample_idx": sample_idx,
                    "query_id": query_id,
                    "query": query_text,
                    "ground_truth": ground_truth,
                    "predicted": predicted[:1000],
                    "is_correct": is_correct,
                    "latency_s": round(latency, 2),
                    "model": model,
                    "agent_version": version
                }
                results.append(result)

                total_questions_done += 1
                if is_correct:
                    total_correct += 1
                query_correct[query_id] += 1 if is_correct else 0
                query_total[query_id] += 1

                out_f.write(json.dumps(result) + "\n")
                out_f.flush()

                # Progress
                acc_so_far = total_correct / total_questions_done
                status = "OK" if is_correct else "MISS"
                print(f"  [{total_questions_done}/{total_questions}] {query_id}: {status} ({latency:.1f}s) | Running: {acc_so_far:.1%}")

                # Small delay to avoid overwhelming the agent
                time.sleep(0.5)

    # Final results
    elapsed = time.time() - start_time
    overall_accuracy = total_correct / total_questions_done if total_questions_done > 0 else 0
    avg_latency = total_latency / total_questions_done if total_questions_done > 0 else 0

    print("\n" + "=" * 70)
    print("OOLONG-PAIRS BENCHMARK RESULTS (Metis VM Agent)")
    print("=" * 70)
    print(f"\n  Model:            {model}")
    print(f"  Agent Version:    v{version}")
    print(f"  Railroad Memory:  Enabled")
    print(f"  Samples:          {len(samples)}")
    print(f"  Queries/sample:   {len(queries)}")
    print(f"  Total questions:  {total_questions_done}")
    print(f"  Errors:           {evaluator.total_errors}")
    print()
    print(f"  Overall Accuracy: {overall_accuracy:.2%} ({total_correct}/{total_questions_done})")
    print(f"  Avg Latency:      {avg_latency:.1f}s per query")
    print(f"  Total Time:       {elapsed/60:.1f} minutes")
    print()
    print("  Comparison:")
    print(f"    Railroad (Groq/Llama):   85.75%")
    print(f"    RLM Baseline (GPT-5):    58.00%")
    print(f"    Metis VM Agent:          {overall_accuracy:.2%}  {'NEW BEST' if overall_accuracy > 0.8575 else ''}")
    print(f"    Delta vs Groq:           {(overall_accuracy - 0.8575) * 100:+.2f}%")
    print(f"    Delta vs RLM:            {(overall_accuracy - 0.58) * 100:+.2f}%")

    print("\n  Accuracy by Query Type:")
    for qid in sorted(query_total.keys()):
        acc = query_correct[qid] / query_total[qid] if query_total[qid] > 0 else 0
        bar = "#" * int(acc * 20)
        print(f"    {qid}: {acc:6.1%} ({query_correct[qid]}/{query_total[qid]}) {bar}")

    # Save summary
    summary = {
        "overall_accuracy": overall_accuracy,
        "total_correct": total_correct,
        "total_questions": total_questions_done,
        "total_errors": evaluator.total_errors,
        "avg_latency_s": round(avg_latency, 2),
        "total_time_minutes": round(elapsed / 60, 1),
        "model": model,
        "agent_version": version,
        "railroad_mode": True,
        "comparison": {
            "railroad_groq_llama": 0.8575,
            "rlm_gpt5": 0.58,
            "metis_vm_agent": overall_accuracy
        },
        "accuracy_by_query": {
            qid: {
                "accuracy": query_correct[qid] / query_total[qid] if query_total[qid] > 0 else 0,
                "correct": query_correct[qid],
                "total": query_total[qid]
            }
            for qid in sorted(query_total.keys())
        },
        "num_samples": len(samples),
        "num_queries": len(queries),
        "timestamp": datetime.now().isoformat()
    }

    summary_file = str(output_path).replace(".jsonl", "_summary.json")
    with open(summary_file, "w") as f:
        json.dump(summary, f, indent=2)

    print(f"\n  Results: {args.output}")
    print(f"  Summary: {summary_file}")
    print("=" * 70)


if __name__ == "__main__":
    main()
