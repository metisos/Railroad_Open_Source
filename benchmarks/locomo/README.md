# Railroad LoCoMo Benchmark Results

## Results Summary

| Metric | Value |
|--------|-------|
| **Overall Accuracy** | **22.11%** (341/1542) |
| Model | Llama 3.3 70B Versatile |
| Provider | Groq |
| Date | December 31, 2025 |

### Accuracy by Question Type

| Question Type | Accuracy | Correct/Total |
|---------------|----------|---------------|
| Single-hop | 25.53% | 72/282 |
| Temporal | 22.74% | 73/321 |
| Multi-hop | 20.83% | 20/96 |
| Open-domain | 20.69% | 174/841 |

### About LoCoMo

LoCoMo (Long Context Conversation) is a challenging benchmark that tests memory across:
- **10 multi-session conversations**
- **1542 QA pairs** (after filtering)
- **Up to 30 sessions per conversation**
- **~600 dialogue turns** per conversation

This benchmark is significantly harder than LongMemEval due to:
1. Longer conversations (30 sessions vs 2-3)
2. Exact date matching required for temporal questions
3. Complex multi-hop reasoning across many sessions

---

## Comparison

| Benchmark | Railroad Accuracy | Notes |
|-----------|------------------|-------|
| LongMemEval | **61.2%** | 500 questions, 2-3 sessions |
| LoCoMo | **22.1%** | 1542 questions, 10-30 sessions |

The accuracy drop is expected - LoCoMo tests memory at scale, while LongMemEval tests core memory abilities.

---

## Files

| File | Description |
|------|-------------|
| `railroad_locomo_results.jsonl` | Raw model outputs (1542 hypotheses) |
| `eval_results.json` | Evaluation summary |
| `run_benchmark.py` | Benchmark runner script |

**Note:** These files contain only Railroad's outputs, not the LoCoMo dataset.

---

## Reproducing Results

### Prerequisites

- Python 3.10+
- Groq API key

### Step 1: Get LoCoMo Dataset

```bash
git clone https://github.com/letta-ai/letta-leaderboard
# Dataset is at: letta-leaderboard/leaderboard/locomo/locomo10.json
```

### Step 2: Run Benchmark

```bash
export GROQ_API_KEY=your_key_here

python run_benchmark.py \
  --data /path/to/locomo10.json \
  --output railroad_locomo_results.jsonl
```

---

## Methodology

### Memory Building

For each conversation (10 total):
1. Process all sessions (10-30 per conversation) chronologically
2. Extract facts about each speaker using LLM
3. Build cumulative YAML state with:
   - Facts about speaker A
   - Facts about speaker B
   - Events with timestamps
   - Relationships
   - Shared experiences

### Question Answering

For each question (1542 total):
1. Load accumulated YAML memory state
2. Answer question using only memory context
3. Evaluate correctness with LLM judge

### State Structure

```yaml
conversation_id: "conv-26"
speakers:
  speaker_a: "Caroline"
  speaker_b: "Melanie"
facts_about_Caroline:
  - "Caroline is transgender"
  - "Caroline attended LGBTQ support group"
facts_about_Melanie:
  - "Melanie has kids"
  - "Melanie enjoys painting"
events:
  - "Session 1: Caroline went to LGBTQ support group"
  - "Session 5: Melanie took kids to museum"
```

---

## Known Limitations

### Temporal Reasoning (22.7%)

Railroad struggles with exact date questions because:
- Extraction captures "last Tuesday" instead of "May 7, 2023"
- Session dates not preserved as precisely as needed
- Relative time references lose context

**Potential fix:** Enhance extraction prompt to preserve exact dates.

### Open-Domain (20.7%)

Open-domain questions require:
- Synthesizing information across many sessions
- Understanding implicit relationships
- Making inferences from partial information

### Token Usage

| Metric | Value |
|--------|-------|
| Total tokens | 3,229,384 |
| Avg tokens/question | ~2,100 |

---

## Links

- **LoCoMo Dataset**: https://github.com/letta-ai/letta-leaderboard
- **Railroad Repository**: https://github.com/metisos/Railroad_Open_Source
- **npm Package**: https://www.npmjs.com/package/railroad-memory
