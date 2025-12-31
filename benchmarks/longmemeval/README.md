# Railroad LongMemEval Benchmark Results

## Results Summary

| Metric | Value |
|--------|-------|
| **Overall Accuracy** | **61.20%** (306/500) |
| **% of SOTA** | **74%** (SOTA: EmergenceMem @ 82.4%) |
| Model | Llama 3.3 70B Versatile |
| Provider | Groq |
| Date | December 31, 2025 |

### Accuracy by Question Type

| Question Type | Accuracy | Correct/Total |
|---------------|----------|---------------|
| Abstention | 90.00% | 27/30 |
| Knowledge Update | 70.83% | 51/72 |
| Single-Session Preference | 66.67% | 20/30 |
| Temporal Reasoning | 65.35% | 83/127 |
| Multi-Session | 62.81% | 76/121 |
| Single-Session User | 62.50% | 40/64 |
| Single-Session Assistant | 16.07% | 9/56 |

### Comparison

| System | Accuracy | % of SOTA | Model | Infrastructure |
|--------|----------|-----------|-------|----------------|
| EmergenceMem | 82.4% | SOTA | Frontier | Complex RAG |
| o4-mini | 72.8% | 88% | GPT-4 class | 200K context |
| Zep | 72.3% | 88% | GPT-4o | Neo4j |
| **Railroad** | **61.2%** | **74%** | **Llama 3.3 70B** | **YAML files** |
| GPT-4o | 60.6% | 74% | GPT-4o | 128K context |
| GPT-4.1 | 56.7% | 69% | GPT-4.1 | 1M context |

---

## Files

| File | Description |
|------|-------------|
| `eval_results.json` | Evaluation results with per-question scores |
| `railroad_longmemeval_results.jsonl` | Raw model outputs (500 hypotheses) |
| `run_benchmark.py` | Benchmark runner script |
| `evaluate.py` | Evaluation script |

**Note:** These files contain only Railroad's outputs, not the LongMemEval dataset. The dataset must be downloaded separately for verification.

---

## Reproducing Results

### Prerequisites

- Node.js 18+
- Python 3.10+
- Groq API key

### Step 1: Download LongMemEval Dataset

```bash
git clone https://github.com/xiaowu0162/LongMemEval
cd LongMemEval/data
# Download longmemeval_oracle.json from their releases or HuggingFace
```

Dataset source: https://github.com/xiaowu0162/LongMemEval

### Step 2: Install Railroad

```bash
npm install railroad-memory
```

### Step 3: Run Benchmark

```bash
export GROQ_API_KEY=your_key_here

python run_benchmark.py \
  --data /path/to/LongMemEval/data/longmemeval_oracle.json \
  --output railroad_longmemeval_results.jsonl
```

### Step 4: Evaluate

```bash
python evaluate.py \
  railroad_longmemeval_results.jsonl \
  /path/to/LongMemEval/data/longmemeval_oracle.json \
  --output eval_results.json
```

---

## Methodology

### Memory Pattern

For each conversation session in LongMemEval:

1. Load YAML state from previous sessions (if any)
2. Inject state into system prompt
3. Process conversation turns
4. Extract facts from conversation using LLM
5. Update YAML state with new facts
6. Persist state to disk
7. Discard conversation history

For each evaluation question:

1. Load accumulated YAML state
2. Answer question using only state context (no conversation history)
3. Compare to ground truth

### State Structure

```yaml
session_id: "benchmark-session-001"

user_facts:
  - "User bought silver Honda Civic on February 10th"
  - "User's pet is named Tesla, a rescue greyhound"

events:
  - "On March 15th: got car serviced for the first time"
  - "On March 22nd: had GPS system issue"

user_preferences:
  - "Prefers data-driven communication"
```

### Evaluation

Questions evaluated by Llama 3.3 70B comparing Railroad's hypothesis to ground truth answer. Scoring:

- **Correct**: Response contains accurate information matching ground truth
- **Incorrect**: Response contains wrong information or fails to answer
- **Abstention**: Response correctly indicates information is unavailable (scored correct for abstention-type questions)

---

## Known Limitations

### Single-Session Assistant (16.1%)

Railroad scored poorly on questions about assistant-provided information (recommendations, explanations). Our extraction prompt focuses on user facts; assistant statements are not captured.

**This is fixable** by modifying the extraction prompt to include assistant-side information.

### Token Usage

| Metric | Value |
|--------|-------|
| Total tokens | 1,912,516 |
| Avg tokens/question | 3,825 |
| vs. full context (~115K) | **97% reduction** |

---

## Verification

To verify our results:

1. Download LongMemEval dataset from the official source
2. Run evaluation script against our `railroad_longmemeval_results.jsonl`
3. Compare `question_id` and `hypothesis` against ground truth

Our outputs contain only:
- `question_id` - Links to LongMemEval dataset
- `hypothesis` - Railroad's answer

We do not redistribute the LongMemEval questions or answers.

---

## Citation

If you use these results, please cite both Railroad and LongMemEval:

```bibtex
@software{railroad2025,
  title = {Railroad: State-based Memory for AI Agents},
  author = {Metis Analytics},
  year = {2025},
  url = {https://github.com/metisos/Railroad_Open_Source}
}

@inproceedings{wu2025longmemeval,
  title = {LongMemEval: Benchmarking Chat Assistants on Long-Term Interactive Memory},
  author = {Wu, Di and Wang, Hongwei and Yu, Wenhao and Zhang, Yuwei and Chang, Kai-Wei and Yu, Dong},
  booktitle = {ICLR},
  year = {2025}
}
```

---

## Links

- **Railroad Repository**: https://github.com/metisos/Railroad_Open_Source
- **LongMemEval Benchmark**: https://github.com/xiaowu0162/LongMemEval
- **LongMemEval Paper**: https://arxiv.org/abs/2410.10813
- **npm Package**: https://www.npmjs.com/package/railroad-memory