# LongMemEval Benchmark Results

Railroad Framework evaluation on [LongMemEval](https://github.com/xiaowu0162/LongMemEval) (ICLR 2025) - a comprehensive benchmark for testing long-term memory in chat assistants.

## Results Summary

| Metric | Value |
|--------|-------|
| **Overall Accuracy** | **61.2%** (306/500) |
| Total Tokens Used | 1,912,516 |
| Avg Tokens/Question | 3,825 |

### Accuracy by Question Type

| Question Type | Accuracy | Correct/Total |
|---------------|----------|---------------|
| Abstention | **90.0%** | 27/30 |
| Knowledge Update | **70.8%** | 51/72 |
| Single-Session Preference | 66.7% | 20/30 |
| Temporal Reasoning | 65.4% | 83/127 |
| Multi-Session | 62.8% | 76/121 |
| Single-Session User | 62.5% | 40/64 |
| Single-Session Assistant | 16.1% | 9/56 |

## Comparison to Other Systems

| System | Accuracy | Notes |
|--------|----------|-------|
| Emergence AI (SOTA) | 82-86% | RAG + chain-of-thought |
| Oracle GPT-4o | 82.4% | Given only relevant sessions |
| Mem0 | 66.9% | Graph-enhanced memory |
| **Railroad** | **61.2%** | YAML state, no RAG |
| GPT-4o (full context) | 58-60% | 115K tokens |
| Naive RAG | 52% | Simple retrieval |

Railroad achieves GPT-4o-level performance with ~75% fewer tokens and no RAG infrastructure.

## Files

| File | Description |
|------|-------------|
| `railroad_longmemeval_results.jsonl` | Raw model outputs (500 answers) |
| `eval_results.json` | Scored results with per-category breakdown |
| `run_benchmark.py` | Benchmark runner script |
| `evaluate.py` | Evaluation script using Groq |

## Reproduce Results

### 1. Setup

```bash
# Clone LongMemEval dataset
git clone https://github.com/xiaowu0162/LongMemEval.git
cd LongMemEval/data
wget https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_oracle.json

# Install dependencies
pip install groq pyyaml tqdm
```

### 2. Run Benchmark

```bash
export GROQ_API_KEY=your_key

python run_benchmark.py \
    --data LongMemEval/data/longmemeval_oracle.json \
    --output my_results.jsonl \
    --model llama-3.3-70b-versatile
```

### 3. Evaluate Results

```bash
python evaluate.py my_results.jsonl LongMemEval/data/longmemeval_oracle.json
```

## Methodology

Railroad's approach on LongMemEval:

1. **Memory Extraction**: Each chat session is processed to extract:
   - `user_facts`: Factual information about the user
   - `user_preferences`: Likes, dislikes, opinions
   - `events`: Timestamped occurrences
   - `key_decisions`: Decisions made
   - `relationships`: People/places mentioned

2. **State Injection**: Instead of full conversation history, only the YAML state is injected:
   ```yaml
   user_facts:
     - "User bought silver Honda Civic on February 10th"
   events:
     - "On March 15th: got car serviced"
     - "On 3/22: had GPS system issue"
   ```

3. **Question Answering**: The accumulated memory is used to answer questions about past conversations.

## Configuration

| Parameter | Value |
|-----------|-------|
| LLM | Groq LLaMA 3.3 70B |
| Dataset | longmemeval_oracle.json |
| Temperature | 0.3 |
| Max Tokens | 4096 |

## Verification

To verify our results:

```bash
# Re-run evaluation on our raw outputs
python evaluate.py railroad_longmemeval_results.jsonl \
    LongMemEval/data/longmemeval_oracle.json
```

Expected output:
```
Overall Accuracy: 0.6120 (306/500)
```

## Key Findings

**Strengths:**
- Abstention (90%): Excellent at knowing what it doesn't know
- Knowledge Updates (71%): Tracks evolving information well
- Token efficient: ~3,825 tokens/question vs ~15,000+ for full history

**Weaknesses:**
- Single-Session Assistant (16%): Memory extraction focuses on user facts, missing assistant-provided information

## License

Benchmark scripts: MIT
LongMemEval dataset: CC BY 4.0 (see [original repo](https://github.com/xiaowu0162/LongMemEval))
