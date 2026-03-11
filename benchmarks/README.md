# Railroad Framework Benchmarks

Comprehensive evaluation of the Railroad memory framework against state-of-the-art long-context and memory systems.

## Summary Results

| Benchmark | Task Type | Railroad | Best Competitor | Delta |
|-----------|-----------|----------|-----------------|-------|
| **OOLONG-Pairs** | Quadratic pairs (32K) | **93.75%** | RLM (58%) | **+35.75%** |
| LongMemEval | Multi-category QA | 61.2% | Zep (71.2%) | -10.0% |
| LoCoMo | Multi-session memory | 22.1% | Letta (74%) | -51.9% |

## Benchmark Descriptions

### OOLONG-Pairs (State of the Art)

**Status:** Railroad achieves SOTA

Quadratic-complexity pair-finding tasks from the OOLONG benchmark suite. Requires finding all pairs of users meeting specific criteria across ~32K token contexts.

- **Latest Result:** 93.75% (MetisOS Digital Operator, Gemini 3.1 Pro + Railroad Memory) -- **March 2026**
- **Previous Result:** 85.75% (Llama 3.3 70B via Groq) -- January 2026
- **Previous SOTA:** 58.00% (RLM with GPT-5)
- **Improvement:** +35.75 percentage points over RLM

See: [`oolong_pairs/METIS_DIGITAL_OPERATOR_REPORT.md`](oolong_pairs/METIS_DIGITAL_OPERATOR_REPORT.md) | [`oolong_pairs/BENCHMARK_REPORT.md`](oolong_pairs/BENCHMARK_REPORT.md)

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
| **1** | **MetisOS Digital Operator** | Gemini 3.1 Pro + Railroad | **93.75%** |
| 2 | Railroad (direct) | Llama 3.3 70B | 85.75% |
| 3 | RLM | GPT-5 | 58.00% |
| 4 | RLM (no sub-calls) | GPT-5 | 43.93% |
| 5 | CodeAct + BM25 | GPT-5 | 24.67% |
| 6 | Summary Agent | GPT-5 | 0.01% |
| 7 | Base Model | GPT-5 | 0.04% |

### Key Insights

1. **MetisOS Digital Operator sets new SOTA** at 93.75% (+35.75% over RLM)
2. **Full agent stack beats optimized prompting** - the DO scored higher than direct LLM calls despite running a general-purpose agent with 100+ tools
3. **Token efficiency** - Railroad uses 96% fewer tokens than full-context approaches
4. **Cost effective** - ~30x cheaper than RLM while scoring 35.75% higher
5. **Room for improvement** - Temporal reasoning (pairs_17) is the sole remaining weakness

## Directory Structure

```
benchmarks/
├── README.md                    # This file
├── oolong_pairs/               # OOLONG-Pairs benchmark (SOTA)
│   ├── METIS_DIGITAL_OPERATOR_REPORT.md  # Latest: 93.75% (March 2026)
│   ├── BENCHMARK_REPORT.md               # Previous: 85.75% (January 2026)
│   ├── oolong_pairs_benchmark.py          # Groq/Llama benchmark script
│   ├── oolong_pairs_vm_benchmark.py       # MetisOS VM agent benchmark script
│   ├── metis_vm_agent_results.jsonl       # Full results (400 questions)
│   ├── metis_vm_agent_results_summary.json
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

*Last updated: March 11, 2026*
