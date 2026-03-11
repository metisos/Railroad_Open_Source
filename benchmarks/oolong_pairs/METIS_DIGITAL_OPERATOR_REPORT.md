# OOLONG-Pairs: MetisOS Digital Operator Results

**93.75% Accuracy -- New State of the Art**

**Date:** March 11, 2026
**System:** [MetisOS](https://metisos.co) Digital Operator v1.77.1
**Model:** Google Gemini 3.1 Pro + Railroad Memory
**Benchmark:** OOLONG-Pairs (Quadratic Complexity Long-Context Reasoning)

---

## Overview

The MetisOS Digital Operator -- a general-purpose AI agent built on the Railroad Memory framework -- achieved **93.75%** on the OOLONG-Pairs benchmark, setting a new state-of-the-art and surpassing all previously published results.

This result is notable because the Digital Operator was not tuned or optimized for this benchmark. It ran as a full-stack production agent with 100+ tools, a constitution-based system prompt, sovereign memory, and Railroad Memory extraction -- the same configuration that serves real users.

---

## Leaderboard

| Rank | System | Model | Accuracy | Cost/Query |
|------|--------|-------|----------|------------|
| **1** | **MetisOS Digital Operator** | **Gemini 3.1 Pro + Railroad** | **93.75%** | **~$0.004** |
| 2 | Railroad (direct prompting) | Llama 3.3 70B (Groq) | 85.75% | ~$0.001 |
| 3 | RLM (full) | GPT-5 | 58.00% | ~$0.33 |
| 4 | RLM (no sub-calls) | GPT-5 | 43.93% | ~$0.33 |
| 5 | CodeAct + BM25 | GPT-5 | 24.67% | ~$0.75 |
| 6 | RLM (no sub-calls) | Qwen3-Coder-480B | 17.34% | -- |
| 7 | Base Model | GPT-5 | 0.04% | ~$0.10 |

---

## What is OOLONG-Pairs?

OOLONG-Pairs is a synthetic benchmark derived from the [OOLONG benchmark](https://arxiv.org/abs/2511.02817) (Bertsch et al., 2025). It tests **quadratic complexity reasoning** -- tasks that require examining all possible pairs of entries in ~32K token contexts to find those meeting specific criteria.

This benchmark is extremely challenging for LLMs. Even frontier models with 128K+ context windows achieve less than 1% accuracy without scaffolding. The task requires:

1. Tracking multiple users and their attributes simultaneously
2. Enumerating and checking all possible pair combinations
3. Precise aggregation over distributed information

> "On OOLONG-Pairs, GPT-5 drops below 1% accuracy at 32K tokens, well within its context window."
> -- Zhang et al., "Recursive Language Models" (2025)

---

## Detailed Results

### Test Configuration

| Parameter | Value |
|-----------|-------|
| Samples | 20 (trec_coarse from OOLONG-synth) |
| Queries per sample | 20 |
| Total questions | 400 |
| Errors | 0 |
| Total time | 80 minutes |
| Avg latency | 11.5s per query |

### Accuracy by Query Type

| Query | Task Description | Accuracy | |
|-------|-----------------|----------|--|
| pairs_01 | Both have "numeric value" label | **100%** (20/20) | Perfect |
| pairs_02 | Both have "location" label | **100%** (20/20) | Perfect |
| pairs_03 | Both have "abbreviation" label | **100%** (20/20) | Perfect |
| pairs_04 | Both have "human being" label | **100%** (20/20) | Perfect |
| pairs_05 | Both have "entity" label | **100%** (20/20) | Perfect |
| pairs_06 | Both have "description" label | **100%** (20/20) | Perfect |
| pairs_07 | Exclusive: numeric vs location | **100%** (20/20) | Perfect |
| pairs_08 | Exclusive: abbreviation vs entity | **100%** (20/20) | Perfect |
| pairs_09 | Both have >= 2 instances | **100%** (20/20) | Perfect |
| pairs_10 | Both have >= 3 instances | **100%** (20/20) | Perfect |
| pairs_11 | Both have 2023 dates | **100%** (20/20) | Perfect |
| pairs_12 | Both have 2024 dates | **100%** (20/20) | Perfect |
| pairs_13 | Both missing "abbreviation" | **100%** (20/20) | Perfect |
| pairs_14 | Both missing "location" | **100%** (20/20) | Perfect |
| pairs_15 | Share any common label | **95%** (19/20) | Excellent |
| pairs_16 | No shared labels | **95%** (19/20) | Excellent |
| pairs_17 | Same first month | **0%** (0/20) | See notes |
| pairs_18 | One single, one multi instance | **100%** (20/20) | Perfect |
| pairs_19 | Both have "human being" (variant) | **100%** (20/20) | Perfect |
| pairs_20 | Count all pairs | **85%** (17/20) | Good |

**17 of 20 query types achieved 100% accuracy.**

Excluding pairs_17 (a known temporal parsing weakness), accuracy is **98.7%** (375/380).

---

## Comparison with Previous Results

| Metric | Railroad (Groq) | MetisOS DO | Change |
|--------|-----------------|------------|--------|
| Overall accuracy | 85.75% | **93.75%** | **+8.00%** |
| Perfect query types | 14/20 | **17/20** | +3 |
| pairs_04 (human being) | 85% | **100%** | +15% |
| pairs_11 (2023 dates) | 45% | **100%** | **+55%** |
| pairs_12 (2024 dates) | 90% | **100%** | +10% |
| pairs_16 (no shared labels) | 85% | **95%** | +10% |
| pairs_20 (count pairs) | 0% | **85%** | **+85%** |

The biggest gains came from improved temporal/date reasoning and counting accuracy.

---

## What is a MetisOS Digital Operator?

A [MetisOS Digital Operator](https://metisos.co) is a persistent, general-purpose AI agent that runs on its own server. Each user gets a dedicated agent instance with:

- **Railroad Memory**: Structured state persistence that enables indefinite context (no 280K token limit)
- **Sovereign Memory**: Local SQLite + vector embeddings for semantic fact storage
- **100+ Tools**: Code execution, web search, file management, email, calendar, and more
- **Skills System**: Dynamic skill matching and injection
- **Heartbeat System**: Autonomous background thinking
- **Multi-channel**: Web, CLI, Telegram, SMS, and API access

The benchmark was run against a production-configured Digital Operator with all systems active -- not a stripped-down benchmark build.

### Agent Stack

```
Agent Version:       1.77.1
Primary Model:       Gemini 3.1 Pro (preview)
Fallback Models:     Gemini 2.5 Pro, Gemini 2.0 Flash
Memory Framework:    Railroad Memory (structured state, 10-message sliding window)
Memory Extraction:   Groq Llama 3.3 70B (facts, decisions, nuance)
Memory Storage:      SQLite + local embeddings (all-MiniLM-L6-v2)
Tool Count:          100+ registered (21 core, rest lazy-loaded)
```

---

## Why a Full Agent Stack Beats Direct Prompting

The Digital Operator scored 8 percentage points higher than direct LLM prompting with the same Railroad framework. Several factors contribute:

1. **Stronger reasoning model**: Gemini 3.1 Pro provides superior structured data analysis compared to Llama 3.3 70B, particularly for date parsing and counting tasks.

2. **Structured system prompt**: The agent's constitution provides analytical framing that helps the model approach pair-finding systematically.

3. **Production robustness**: The agent pipeline handles edge cases (retries, model cascade, response validation) that direct API calls don't.

4. **Not over-fitted**: A general-purpose agent performing well on a benchmark it wasn't designed for demonstrates genuine capability, not benchmark gaming.

---

## Failure Analysis

### pairs_17: Same First Month (0%)

The only systematic failure. Ground truth was "No pairs found" for all 20 samples, but the model consistently returned false positive pairs. The model struggles to extract month-year from natural language date formats ("Jan 23, 2023") and compare them correctly. This is a model-level date parsing weakness, not an architecture issue.

### pairs_15 / pairs_16: Label Overlap (95%)

One sample with a complex label distribution caused a single miss on both shared-label and no-shared-label queries.

### pairs_20: Counting (85%)

Three misses where the model returned the correct count wrapped in explanatory prose rather than as a bare number, causing evaluation mismatch.

---

## Reproducibility

### Raw Data

All results are included in this repository:

- `metis_vm_agent_results.jsonl` -- Full results for all 400 questions
- `metis_vm_agent_results_summary.json` -- Summary statistics

### Running the Benchmark

```bash
# Prerequisites
pip install tqdm datasets requests

# 1. Start a MetisOS Digital Operator agent
cd operator-vm/agent-node
GEMINI_API_KEY=<key> RAILROAD_MODE=true USE_VERTEX_AI=false node src/index.js

# 2. Verify agent is ready
curl -s http://localhost:8080/health | jq .agentReady  # Must return true

# 3. Run benchmark
cd benchmarks/oolong_pairs

# Full run (20 samples, ~80 minutes)
python3 oolong_pairs_vm_benchmark.py --num-samples 20 --num-queries 20

# Quick run (5 samples, ~20 minutes)
python3 oolong_pairs_vm_benchmark.py --num-samples 5 --num-queries 20
```

---

## References

1. Bertsch, A., et al. (2025). "OOLONG: Evaluating Long Context Reasoning and Aggregation Capabilities." [arXiv:2511.02817](https://arxiv.org/abs/2511.02817)

2. Zhang, A. L., et al. (2025). "Recursive Language Models." [arXiv:2512.24601](https://arxiv.org/abs/2512.24601)

3. Railroad Memory. (2026). "Dynamic Context Memory for Long-Running AI Agent Tasks." [GitHub](https://github.com/metisos/Railroad_Open_Source)

4. MetisOS. (2026). "Digital Operator Platform." [metisos.co](https://metisos.co)

---

## Citation

```bibtex
@misc{metis_oolong_pairs_2026,
  title={MetisOS Digital Operator: 93.75\% on OOLONG-Pairs Benchmark},
  author={Metis Analytics},
  year={2026},
  note={Gemini 3.1 Pro + Railroad Memory. Full-stack agent, not benchmark-optimized.}
}
```

---

*Benchmark run: March 11, 2026 | 400 questions | 0 errors | 80 minutes*
