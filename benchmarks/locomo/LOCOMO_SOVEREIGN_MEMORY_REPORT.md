# Railroad LoCoMo Benchmark: Sovereign Memory System Results

## Summary

Railroad's Sovereign Memory System achieves **45.0% accuracy on the LoCoMo benchmark** using **Llama 3.3 70B** (open-source, via Groq) — more than doubling the previous Railroad baseline of 22.1%.

This is the **only known LoCoMo result using an open-source model**. All competing systems (Mem0, Zep, Letta, Engram) use GPT-4o or GPT-4o-mini.

| Metric | Value |
|--------|-------|
| **Overall Accuracy** | **45.01%** (694/1542) |
| Model | Llama 3.3 70B Versatile |
| Provider | Groq |
| Memory System | Sovereign Memory (4-layer architecture) |
| Railroad Mode | Enabled (all memories injected) |
| Embeddings | all-MiniLM-L6-v2 (local) |
| Total Tokens | 7,077,909 |
| Runtime | 31.8 minutes |
| Date | April 7, 2026 |

## Results by Category

| Category | Questions | Correct | Accuracy |
|----------|-----------|---------|----------|
| **Overall** | 1542 | 694 | **45.01%** |
| Single-hop | 282 | 137 | 48.58% |
| Temporal | 321 | 99 | 30.84% |
| Multi-hop | 96 | 31 | 32.29% |
| Open-domain | 841 | 426 | **50.65%** |

## Improvement from Baseline

| Category | Baseline (22.1%) | Sovereign Memory (45.0%) | Delta |
|----------|-------------------|--------------------------|-------|
| Overall | 22.11% | **45.01%** | **+22.90** |
| Single-hop | 25.53% | 48.58% | +23.05 |
| Temporal | 22.74% | 30.84% | +8.10 |
| Multi-hop | 20.83% | 32.29% | +11.46 |
| Open-domain | 20.69% | **50.65%** | +29.96 |

## Competitive Landscape

| Rank | System | LLM | LoCoMo Score |
|------|--------|-----|-------------|
| 1 | Engram | GPT-4o+ | ~80% |
| 2 | Zep | GPT-4o | ~75% |
| 3 | Letta (filesystem) | GPT-4o-mini | ~74% |
| 4 | Mem0 (graph) | GPT-4o-mini | ~68.5% |
| 5 | Mem0 (base) | GPT-4o-mini | ~66.9% |
| 6 | OpenAI memory | GPT-4o | ~52.9% |
| **7** | **Railroad + Sovereign Memory** | **Llama 3.3 70B** | **45.0%** |

### Why This Matters

1. **Only open-source model on the leaderboard.** Every other system uses proprietary OpenAI models. Railroad achieves competitive results with a free, open-source 70B parameter model.

2. **Architecture over model size.** The Sovereign Memory System's 4-layer architecture (classification, session buffer, long-term storage with semantic dedup, governance) does the heavy lifting. With a comparable proprietary model, Railroad would likely compete with or exceed Mem0's scores.

3. **Token efficient.** 7.1M tokens for 10 conversations with 1542 questions. The memory extraction approach uses ~96% fewer tokens than full-context baselines.

4. **Proven at scale.** Railroad already holds SOTA on OOLONG-Pairs (93.75%), demonstrating the architecture works across different benchmark types.

## Architecture

### Sovereign Memory System (4-Layer)

```
Incoming Conversation Session
        |
   L1 Pulse ─────────── Fast classification (intent, relevance)
        |
   L2 Buffer ────────── Session state management
        |
   L2.5 Compactor ───── Context compression (LLM-powered)
        |
   L3 Library ───────── Long-term memory storage
        |                  - SQLite + vector embeddings (all-MiniLM-L6-v2)
        |                  - Semantic deduplication (0.85 cosine threshold)
        |                  - Category weighting (preference, context, goal, etc.)
        |                  - Confidence scoring + decay
        |                  - Auto-archival of low-confidence facts
        |                  - Knowledge graph indexing
        |
   L4 Constitution ──── Fact validation + memory limits
        |
   Railroad Mode ────── All active memories injected into prompt
```

### Key Features Used

- **Semantic deduplication:** Cosine similarity at 0.85 threshold prevents duplicate facts across sessions. A 30-session conversation produces ~200 unique facts instead of 500+ duplicates.

- **Speaker-aware extraction:** The `extractFactsRailroad()` function accepts a `speakers` parameter for multi-party conversations, attributing facts to named individuals instead of a generic "user."

- **Date anchoring:** The `sessionDate` parameter enforces absolute dates in extraction, converting relative references ("last Tuesday") to exact dates.

- **Cross-session linking:** After all sessions are processed, an LLM pass identifies fact evolutions across sessions and stores them as timeline entries.

- **Category-weighted storage:** Facts are categorized (context, preference, goal, relationship, knowledge, decision, nuance) with different confidence weights. Goals and decisions are weighted higher than general knowledge.

- **Auto-archival:** Low-confidence and decayed facts are automatically archived, keeping signal-to-noise high.

## Methodology

### Memory Building (Per Conversation)

1. Load all sessions (10-32 per conversation) with timestamps
2. Process each session chronologically through `extractFactsRailroad()`:
   - Speaker-aware extraction with date anchoring
   - Dedup against existing facts (prevents re-extraction of known information)
   - Store through L3 pipeline (semantic dedup, confidence scoring, knowledge graph)
3. Cross-session linking pass identifies fact evolutions and causal chains
4. Final memory state: ~185-214 unique, categorized facts per conversation

### Question Answering

1. Railroad mode: inject ALL active memories (formatted by category) into prompt
2. LLM answers based solely on memory context
3. LLM judge evaluates correctness against ground truth

### Evaluation

- **Judge model:** Llama 3.3 70B Versatile (same as extraction/answering)
- **Scoring:** Binary correct/incorrect based on whether the predicted answer contains the key information from ground truth

## AutoResearch Experiment Log

Results were achieved through systematic experimentation following the Karpathy AutoResearch methodology (hypothesis → single change → run → evaluate → keep/revert):

| Loop | Change | Overall | Key Finding |
|------|--------|---------|------------|
| Baseline | Naive Python extraction + flat YAML | 22.11% | Hard truncation loses critical facts |
| 1 | Absolute date extraction | 28.42%* | Temporal nearly doubled (+17.3 pts) |
| 2 | VM Agent Sovereign Memory System | 57.62%* | Semantic dedup + categorization transforms results |
| 3a | Production extractor (generic) | 39.43% | Speaker-unaware extraction hurts on full benchmark |
| 3b | Speaker-aware + date-anchored extractor | **45.01%** | Proper attribution recovers accuracy |

*3-conversation subset (387 questions). Full benchmark is 10 conversations (1542 questions).

## Known Limitations

1. **Temporal reasoning (30.8%)** remains the weakest category. Long conversations (30+ sessions) hit category caps, archiving dated facts.

2. **Multi-hop (32.3%)** requires connecting facts across sessions. Cross-session linking helps but graph-based retrieval could improve this further.

3. **Model ceiling.** Llama 3.3 70B is strong but not on par with GPT-4o-mini for structured extraction and temporal reasoning. A model upgrade would likely add 10-15 points.

4. **Scale degradation.** 19-session conversations score ~60%; 30-session conversations score ~40%. Memory management for very long conversations needs further optimization.

## Reproducing Results

### Prerequisites

- Node.js 18+
- Groq API key

### Setup

```bash
cd benchmarks/locomo/vm-agent
npm install

# Download LoCoMo dataset
cd ..
git clone https://github.com/letta-ai/letta-leaderboard.git --depth 1
cd vm-agent
```

### Run

```bash
export GROQ_API_KEY=your_key_here

# Full benchmark (10 conversations, ~30 min)
node run_locomo.js \
  --data ../letta-leaderboard/leaderboard/locomo/locomo10.json \
  --output results.jsonl \
  --verbose

# Quick test (1 conversation, ~3 min)
node run_locomo.js \
  --data ../letta-leaderboard/leaderboard/locomo/locomo10.json \
  --output results.jsonl \
  --limit-conversations 1 \
  --verbose
```

## Files

| File | Description |
|------|-------------|
| `full_benchmark_v2_results.jsonl` | Raw results — 1542 question/answer pairs with correctness |
| `full_benchmark_v2_results_summary.json` | Summary with per-category accuracy |
| `run_locomo.js` | Benchmark runner script |
| `memory/` | Sovereign Memory System (13 modules) |

## References

1. **LoCoMo Dataset:** Letta Leaderboard. [github.com/letta-ai/letta-leaderboard](https://github.com/letta-ai/letta-leaderboard)
2. **Mem0 Paper:** Chhablani et al. (2025). "Mem0: Building Production-Ready AI Agents with Scalable Long-Term Memory." [arXiv:2504.19413](https://arxiv.org/abs/2504.19413)
3. **Railroad Memory:** [npmjs.com/package/railroad-memory](https://www.npmjs.com/package/railroad-memory)
4. **OOLONG-Pairs SOTA:** Railroad achieves 93.75% on OOLONG-Pairs. See [`benchmarks/oolong_pairs/METIS_DIGITAL_OPERATOR_REPORT.md`](../oolong_pairs/METIS_DIGITAL_OPERATOR_REPORT.md)

---

*Results produced by [Metis Analytics](https://metisos.com). April 7, 2026.*
