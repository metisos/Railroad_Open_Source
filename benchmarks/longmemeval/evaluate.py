"""
LongMemEval Evaluation Script using Groq
Evaluates Railroad benchmark results using LLaMA 3.3 70B as the judge
"""

import os
import sys
import json
import time
from tqdm import tqdm
from groq import Groq

def get_anscheck_prompt(task, question, answer, response, abstention=False):
    """Generate evaluation prompt based on question type"""
    if not abstention:
        if task in ['single-session-user', 'single-session-assistant', 'multi-session']:
            template = "I will give you a question, a correct answer, and a response from a model. Please answer yes if the response contains the correct answer. Otherwise, answer no. If the response is equivalent to the correct answer or contains all the intermediate steps to get the correct answer, you should also answer yes. If the response only contains a subset of the information required by the answer, answer no. \n\nQuestion: {}\n\nCorrect Answer: {}\n\nModel Response: {}\n\nIs the model response correct? Answer yes or no only."
        elif task == 'temporal-reasoning':
            template = "I will give you a question, a correct answer, and a response from a model. Please answer yes if the response contains the correct answer. Otherwise, answer no. If the response is equivalent to the correct answer or contains all the intermediate steps to get the correct answer, you should also answer yes. If the response only contains a subset of the information required by the answer, answer no. In addition, do not penalize off-by-one errors for the number of days. If the question asks for the number of days/weeks/months, etc., and the model makes off-by-one errors (e.g., predicting 19 days when the answer is 18), the model's response is still correct. \n\nQuestion: {}\n\nCorrect Answer: {}\n\nModel Response: {}\n\nIs the model response correct? Answer yes or no only."
        elif task == 'knowledge-update':
            template = "I will give you a question, a correct answer, and a response from a model. Please answer yes if the response contains the correct answer. Otherwise, answer no. If the response contains some previous information along with an updated answer, the response should be considered as correct as long as the updated answer is the required answer.\n\nQuestion: {}\n\nCorrect Answer: {}\n\nModel Response: {}\n\nIs the model response correct? Answer yes or no only."
        elif task == 'single-session-preference':
            template = "I will give you a question, a rubric for desired personalized response, and a response from a model. Please answer yes if the response satisfies the desired response. Otherwise, answer no. The model does not need to reflect all the points in the rubric. The response is correct as long as it recalls and utilizes the user's personal information correctly.\n\nQuestion: {}\n\nRubric: {}\n\nModel Response: {}\n\nIs the model response correct? Answer yes or no only."
        else:
            template = "I will give you a question, a correct answer, and a response from a model. Please answer yes if the response contains the correct answer. Otherwise, answer no.\n\nQuestion: {}\n\nCorrect Answer: {}\n\nModel Response: {}\n\nIs the model response correct? Answer yes or no only."
    else:
        template = "I will give you an unanswerable question, an explanation, and a response from a model. Please answer yes if the model correctly identifies the question as unanswerable. The model could say that the information is incomplete, or some other information is given but the asked information is not.\n\nQuestion: {}\n\nExplanation: {}\n\nModel Response: {}\n\nDoes the model correctly identify the question as unanswerable? Answer yes or no only."

    return template.format(question, answer, response)


def main():
    if len(sys.argv) < 3:
        print('Usage: python evaluate_with_groq.py hyp_file ref_file')
        sys.exit(1)

    hyp_file = sys.argv[1]
    ref_file = sys.argv[2]

    # Initialize Groq client
    client = Groq()
    model = "llama-3.3-70b-versatile"

    # Load data
    print(f"Loading hypotheses from {hyp_file}...")
    hypotheses = [json.loads(line) for line in open(hyp_file).readlines()]

    print(f"Loading references from {ref_file}...")
    references = json.load(open(ref_file))

    qid2qdata = {entry['question_id']: entry for entry in references}
    qid2qtype = {entry['question_id']: entry['question_type'] for entry in references}
    qtypes = set(list(qid2qtype.values()))
    qtype2acc = {t: [] for t in qtypes}
    qtype2acc['abstention'] = []

    results = []
    total_correct = 0
    total_count = 0

    print(f"\nEvaluating {len(hypotheses)} responses with Groq ({model})...\n")

    for entry in tqdm(hypotheses):
        qid = entry['question_id']

        if qid not in qid2qtype:
            print(f'Warning: skipping {qid} as it is not in reference data.')
            continue

        qtype = qid2qtype[qid]
        q = qid2qdata[qid]['question']
        ans = qid2qdata[qid]['answer']
        hyp = entry['hypothesis']
        is_abstention = '_abs' in qid

        prompt = get_anscheck_prompt(qtype, q, ans, hyp, abstention=is_abstention)

        try:
            response = client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0,
                max_tokens=10
            )
            eval_response = response.choices[0].message.content.strip().lower()
            label = 'yes' in eval_response
        except Exception as e:
            print(f"Error evaluating {qid}: {e}")
            label = False
            time.sleep(1)

        result = {
            'question_id': qid,
            'question_type': qtype,
            'question': q,
            'correct_answer': ans,
            'hypothesis': hyp,
            'is_correct': label,
            'is_abstention': is_abstention
        }
        results.append(result)

        if is_abstention:
            qtype2acc['abstention'].append(1 if label else 0)
        else:
            qtype2acc[qtype].append(1 if label else 0)

        total_correct += 1 if label else 0
        total_count += 1

        # Rate limiting
        time.sleep(0.1)

    # Calculate metrics
    overall_accuracy = total_correct / total_count if total_count > 0 else 0

    print("\n" + "=" * 60)
    print("EVALUATION RESULTS")
    print("=" * 60)
    print(f"\nOverall Accuracy: {overall_accuracy:.4f} ({total_correct}/{total_count})")
    print("\nAccuracy by Question Type:")

    type_results = {}
    for qtype, scores in sorted(qtype2acc.items()):
        if scores:
            acc = sum(scores) / len(scores)
            type_results[qtype] = {'accuracy': acc, 'correct': sum(scores), 'total': len(scores)}
            print(f"  {qtype}: {acc:.4f} ({sum(scores)}/{len(scores)})")

    # Save detailed results
    output_file = hyp_file.replace('.jsonl', '_eval_results.json')
    eval_summary = {
        'overall_accuracy': overall_accuracy,
        'total_correct': total_correct,
        'total_count': total_count,
        'accuracy_by_type': type_results,
        'model_used': model,
        'detailed_results': results
    }

    with open(output_file, 'w') as f:
        json.dump(eval_summary, f, indent=2)

    print(f"\nDetailed results saved to: {output_file}")

    return eval_summary


if __name__ == "__main__":
    main()
