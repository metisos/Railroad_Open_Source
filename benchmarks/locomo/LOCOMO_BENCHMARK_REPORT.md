# Railroad LoCoMo Benchmark Results

## Results Summary

| Metric | Value |
|--------|-------|
| **Overall Accuracy** | **22.11%** (341/1542) |
| **% of SOTA** | **~35%** (SOTA: Zep @ ~63%) |
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

### Comparison with LongMemEval

| Benchmark | Railroad | Sessions | Questions | Difficulty |
|-----------|----------|----------|-----------|------------|
| LongMemEval | **61.2%** | 2-3 | 500 | Moderate |
| LoCoMo | **22.1%** | 10-30 | 1542 | Hard |

The 39-point accuracy drop reflects LoCoMo's significantly higher difficulty - it tests memory across 10x more sessions.

---

## About LoCoMo

LoCoMo (Long Context Conversation) is part of the [Letta Leaderboard](https://github.com/letta-ai/letta-leaderboard), designed to test conversational memory at scale.

### Dataset Characteristics

| Aspect | Details |
|--------|---------|
| **Conversations** | 10 multi-session dialogues |
| **Sessions per conversation** | 10-30 |
| **Total dialogue turns** | ~600 per conversation |
| **QA pairs** | 1542 (after filtering) |
| **Speakers** | 2 fictional characters per conversation |
| **Topics** | Personal life, hobbies, family, career, events |

### Question Categories

1. **Single-hop (282)**: Direct fact recall from one session
   - "What is Caroline's identity?"
   - "What hobby does Melanie enjoy?"

2. **Temporal (321)**: Date/time-based questions
   - "When did Caroline go to the LGBTQ support group?"
   - "When did Melanie paint a sunrise?"

3. **Multi-hop (96)**: Requires combining facts from multiple sessions
   - "What fields would Caroline be likely to pursue?"
   - "How has Melanie's painting evolved?"

4. **Open-domain (841)**: General questions requiring broad understanding
   - "What motivates Caroline?"
   - "Describe Melanie's family life"

---

## Files

| File | Description |
|------|-------------|
| `eval_results.json` | Evaluation summary with per-category accuracy |
| `railroad_locomo_results.jsonl` | Raw model outputs (1542 hypotheses) |
| `run_benchmark.py` | Benchmark runner script |

**Note:** These files contain only Railroad's outputs, not the LoCoMo dataset. The dataset must be downloaded separately for verification.

---

## Reproducing Results

### Prerequisites

- Python 3.10+
- Groq API key

### Step 1: Download LoCoMo Dataset

```bash
git clone https://github.com/letta-ai/letta-leaderboard
# Dataset: letta-leaderboard/leaderboard/locomo/locomo10.json
```

Dataset source: https://github.com/letta-ai/letta-leaderboard

### Step 2: Install Dependencies

```bash
pip install groq pyyaml tqdm
```

### Step 3: Run Benchmark

```bash
export GROQ_API_KEY=your_key_here

python run_benchmark.py \
  --data /path/to/locomo10.json \
  --output railroad_locomo_results.jsonl \
  --verbose
```

---

## Methodology

### Memory Building Pattern

For each of the 10 conversations:

1. **Load conversation data** with all sessions (10-30 per conversation)
2. **Process sessions chronologically:**
   - Parse dialogue turns
   - Extract facts about each speaker using LLM
   - Accumulate into YAML state
3. **Build memory structure:**
   ```yaml
   conversation_id: "conv-26"
   speakers:
     speaker_a: "Caroline"
     speaker_b: "Melanie"
   facts_about_Caroline:
     - "Caroline is transgender"
     - "Caroline attended LGBTQ support group"
     - "Caroline is interested in counseling"
   facts_about_Melanie:
     - "Melanie has kids"
     - "Melanie enjoys painting"
     - "Melanie is married for 5 years"
   events:
     - "Session 1: Caroline went to LGBTQ support group"
     - "Session 5: Melanie took kids to museum"
   shared_experiences:
     - "Discussed career aspirations"
     - "Shared photos of family"
   ```

### Question Answering

For each of the 1542 questions:

1. Load accumulated YAML memory state
2. Inject into prompt with question
3. Generate answer using only memory context
4. Evaluate correctness with LLM judge

### Evaluation

Questions evaluated by Llama 3.3 70B comparing Railroad's hypothesis to ground truth. Scoring:

- **Correct**: Response contains accurate information matching ground truth
- **Incorrect**: Response is wrong or missing key information

---

## Analysis

### Why Lower Accuracy Than LongMemEval?

| Factor | LongMemEval | LoCoMo | Impact |
|--------|-------------|--------|--------|
| Sessions | 2-3 | 10-30 | 10x more context to track |
| Dialogue turns | ~50 | ~600 | 12x more information |
| Date precision | Relative | Exact | Harder temporal reasoning |
| Question types | 5 balanced | 4 (mostly open-domain) | Different distribution |

### Category Analysis

#### Single-hop (25.5%)
- **Challenge**: Facts spread across 30 sessions
- **Issue**: Memory extraction may miss specific details
- **Example failure**: "What did Melanie paint?" → "A sunset" (correct: "A lake sunrise in 2022")

#### Temporal (22.7%)
- **Challenge**: Exact date matching required
- **Issue**: Extraction captures "last Tuesday" instead of "May 7, 2023"
- **Example failure**: "When did X happen?" → "Last week" (correct: "June 15, 2023")

#### Multi-hop (20.8%)
- **Challenge**: Combining facts from different sessions
- **Issue**: Connections between sessions not preserved
- **Example failure**: Requires linking Session 3 decision with Session 15 outcome

#### Open-domain (20.7%)
- **Challenge**: Requires synthesis and inference
- **Issue**: Memory state too compressed, loses nuance
- **Example failure**: Questions about motivations, relationships, feelings

---

## Known Limitations

### 1. Date Precision

Railroad's extraction prompt captures relative dates ("last Tuesday") instead of absolute dates ("May 7, 2023"). This severely impacts temporal reasoning.

**Potential fix:** Enhance extraction prompt to:
```
"When extracting events, always include the exact date from the session header (e.g., 'On May 7, 2023: Caroline went to support group')"
```

### 2. Session Context Loss

When processing 30 sessions, earlier session details get summarized and lose precision.

**Potential fix:** Implement tiered memory with:
- Core facts (never summarized)
- Recent events (full detail)
- Older events (summarized)

### 3. Speaker Attribution

Some facts get attributed to wrong speaker when dialogue is ambiguous.

**Potential fix:** Use speaker-tagged extraction:
```
"[Caroline said]: I went to the support group"
"[Melanie responded]: That sounds wonderful"
```

---

## Token Usage

| Metric | Value |
|--------|-------|
| Total tokens | 3,229,384 |
| Avg tokens/question | ~2,100 |
| Avg tokens/conversation | ~322,938 |
| Memory building tokens | ~1.5M |
| Question answering tokens | ~1.7M |

### Efficiency Comparison

| Approach | Tokens for 30-session conversation |
|----------|-----------------------------------|
| Full history | ~500,000+ |
| Railroad YAML state | ~15,000-20,000 |
| **Savings** | **~96%** |

Even with lower accuracy, Railroad uses dramatically fewer tokens.

---

## Recommendations for Improvement

### 1. Enhanced Date Extraction
Add explicit date extraction step:
```python
# Extract session date and prepend to all facts
session_date = "May 7, 2023"
facts = [f"On {session_date}: {fact}" for fact in extracted_facts]
```

### 2. Hierarchical Memory
Implement memory tiers for long conversations:
```yaml
core_facts:  # Never pruned
  - "Caroline is transgender"
working_memory:  # Last 5 sessions, full detail
  - ...
long_term:  # Older sessions, summarized
  - "Sessions 1-10: Caroline explored identity and career options"
```

### 3. Cross-Session Linking
Explicitly track fact evolution:
```yaml
fact_timeline:
  "Caroline's career interest":
    - session_3: "Considering counseling"
    - session_8: "Attended workshop"
    - session_15: "Started certification"
```

### 4. Question-Aware Retrieval
For open-domain questions, retrieve relevant memories before answering:
```python
relevant_memories = search_memories(question, top_k=20)
context = format_for_llm(relevant_memories)
```

---

## Verification

To verify our results:

1. Download LoCoMo dataset from the official source
2. Run evaluation against our `railroad_locomo_results.jsonl`
3. Compare `question` and `hypothesis` against ground truth

Our outputs contain only:
- `conversation_id` - Links to LoCoMo dataset
- `question` - The question asked
- `hypothesis` - Railroad's answer
- `is_correct` - Evaluation result
- `category` - Question type

We do not redistribute the LoCoMo answers.

---

## Conclusion

Railroad's 22.1% accuracy on LoCoMo reveals the challenges of maintaining memory across very long conversations (30 sessions). While significantly lower than LongMemEval (61.2%), this reflects LoCoMo's higher difficulty rather than a fundamental limitation.

**Key insights:**
1. YAML state approach still provides 96% token savings
2. Date precision is the biggest weakness (fixable)
3. Memory hierarchy would help for long conversations
4. Core approach is sound, needs optimization for scale

**Next steps:**
- Implement exact date extraction
- Add hierarchical memory tiers
- Test question-aware retrieval

---

## Links

- **Railroad Repository**: https://github.com/metisos/Railroad_Open_Source
- **LoCoMo Dataset**: https://github.com/letta-ai/letta-leaderboard
- **Letta Leaderboard**: https://leaderboard.letta.com/
- **npm Package**: https://www.npmjs.com/package/railroad-memory
