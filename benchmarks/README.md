# Railroad Framework Benchmarks

Comprehensive evaluation of the Railroad memory framework against state-of-the-art long-context and memory systems.

## Summary Results

| Benchmark | Task Type | Railroad | Best Competitor | Delta |
|-----------|-----------|----------|-----------------|-------|
| **OOLONG-Pairs** | Quadratic pairs (32K) | **85.75%** | RLM (58%) | **+27.75%** |
| LongMemEval | Multi-category QA | 61.2% | Zep (71.2%) | -10.0% |
| LoCoMo | Multi-session memory | 22.1% | Letta (74%) | -51.9% |

## Benchmark Descriptions

### OOLONG-Pairs (NEW - State of the Art)

**Status:** Railroad achieves SOTA

Quadratic-complexity pair-finding tasks from the OOLONG benchmark suite. Requires finding all pairs of users meeting specific criteria across ~32K token contexts.

- **Our Result:** 85.75% (Llama 3.3 70B via Groq)
- **Previous SOTA:** 58.00% (RLM with GPT-5)
- **Improvement:** +27.75 percentage points

See: [`oolong_pairs/BENCHMARK_REPORT.md`](oolong_pairs/BENCHMARK_REPORT.md)

### LongMemEval

Evaluation across 5 question categories testing memory retention over long conversations:
- Information Extraction
- Multi-session Reasoning
- Temporal Understanding
- Knowledge Updates
- Preference Tracking

- **Our Result:** 61.2% (Llama 3.3 70B)
- **Best Known:** 71.2% (Zep)
- **Token Savings:** 96% vs full-context baseline

See: [`longmemeval/`](longmemeval/)

### LoCoMo (Long Context Conversation Memory)

10 multi-session conversations with 1986 QA pairs testing memory across:
- Single-hop questions
- Temporal reasoning
- Multi-hop inference
- Open-domain knowledge

- **Our Result:** 22.1% (Llama 3.3 70B)
- **Best Known:** 74.0% (Letta)

See: [`locomo/`](locomo/)

## Model Rankings

### OOLONG-Pairs Leaderboard

| Rank | System | Model | Accuracy |
|------|--------|-------|----------|
| **1** | **Railroad** | Llama 3.3 70B | **85.75%** |
| 2 | RLM | GPT-5 | 58.00% |
| 3 | RLM (no sub-calls) | GPT-5 | 43.93% |
| 4 | CodeAct + BM25 | GPT-5 | 24.67% |
| 5 | Summary Agent | GPT-5 | 0.01% |
| 6 | Base Model | GPT-5 | 0.04% |

### Key Insights

1. **Railroad beats RLM** on quadratic reasoning tasks (+27.75%)
2. **Token efficiency** - Railroad uses 96% fewer tokens than full-context approaches
3. **Cost effective** - Uses Llama 3.3 70B (cheap) instead of GPT-5 (expensive)
4. **Room for improvement** - Temporal reasoning and very long sessions

## Directory Structure

```
benchmarks/
├── README.md                    # This file
├── oolong_pairs/               # OOLONG-Pairs benchmark (SOTA)
│   ├── BENCHMARK_REPORT.md
│   ├── oolong_pairs_benchmark.py
│   ├── oolong_pairs_full_results.jsonl
│   └── oolong_pairs_full_results_summary.json
├── longmemeval/                # LongMemEval benchmark
│   ├── baseline_benchmark.py
│   ├── railroad_benchmark.py
│   ├── eval_results.json
│   └── results/
└── locomo/                     # LoCoMo benchmark
    ├── baseline_benchmark.py
    ├── railroad_benchmark.py
    ├── railroad_advanced.py
    └── results/
```

## Running Benchmarks

### Prerequisites

```bash
pip install groq datasets pyyaml tqdm
export GROQ_API_KEY=your_key
```

### OOLONG-Pairs

```bash
python benchmarks/oolong_pairs/oolong_pairs_benchmark.py \
    --num-samples 20 \
    --num-queries 20 \
    --output benchmarks/oolong_pairs/results.jsonl
```

### LongMemEval

```bash
python benchmarks/longmemeval/railroad_benchmark.py \
    --data LongMemEval/data.json \
    --output benchmarks/longmemeval/results.jsonl
```

### LoCoMo

```bash
python benchmarks/locomo/railroad_benchmark.py \
    --data letta-leaderboard/leaderboard/locomo/locomo10.json \
    --output benchmarks/locomo/results.jsonl
```

## References

1. **OOLONG:** Bertsch et al. (2025). "OOLONG: Evaluating Long Context Reasoning and Aggregation Capabilities." [arXiv:2511.02817](https://arxiv.org/abs/2511.02817)

2. **RLM:** Zhang et al. (2025). "Recursive Language Models." [arXiv:2512.24601](https://arxiv.org/abs/2512.24601)

3. **LongMemEval:** Wang et al. (2024). "LongMemEval: Benchmarking Chat Assistants on Long-Term Interactive Memory." [ICLR 2025](https://openreview.net/forum?id=longmemeval)

4. **LoCoMo:** Letta Leaderboard. "Long Context Memory Benchmark." [letta.com/leaderboard](https://letta.com/leaderboard)

---

*Last updated: January 20, 2026*
