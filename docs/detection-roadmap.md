# Detection Roadmap

Bleeo should keep classification local, fast, and explainable. The current detector is rules-based because it is small, predictable, and easy to test in a browser extension.

## What Improved First

The heuristic detector now scores multiple categories of alarming language:

- alarm terms, with different weights for mild and strong words;
- fear appeals such as "could happen to you" or "before it's too late";
- outrage bait such as "people are furious" or "internet erupts";
- urgency frames such as "urgent warning";
- curiosity-gap hooks such as "nobody is talking about";
- punctuation and uppercase emphasis.

It also dampens some calm civic/reporting contexts so borderline text like a scheduled warning-system drill is less likely to be blurred.

## Why Not Fine-Tune Immediately

A browser model is possible, but it should come after a labeled evaluation set. Without that, a fine-tuned model can feel smarter while making harder-to-debug mistakes.

The right sequence is:

1. Build a labeled dataset of short headlines/posts with `safe` and `sensational` labels.
2. Add an evaluation script that reports precision, recall, false-positive examples, and false-negative examples.
3. Use the current rules as the baseline.
4. Train or fine-tune a small text classifier offline.
5. Export the model to ONNX and run it in the extension only when it beats the baseline.
6. Keep the rules as a fallback for browsers or devices where model startup is too slow.

## Browser Model Options

Two realistic local-model paths:

- Transformers.js: runs compatible ONNX models in the browser, with WebGPU support when available.
- Chrome built-in AI APIs: can run local Gemini Nano in supported Chrome environments, but availability is browser-dependent.

For Bleeo, a small text-classification model is a better fit than a general prompt model because classification needs to be fast, repeated often, and consistent.

## Suggested Hybrid Architecture

```text
content script
  collect candidate text
  batch candidates

background/offscreen classifier
  rules baseline
  optional local model classifier
  combine scores
  return labels and reason codes

content script
  blur sensational candidates
  preserve click-to-reveal behavior
```

The model should only run on candidates that pass cheap text filters. That keeps page scanning responsive and avoids classifying every text node.

## Acceptance Criteria For A Model

A model should not ship until it meets these checks:

- It improves recall for subtle alarming language without a large false-positive jump.
- It runs locally with no page text sent to a server.
- Initial model load does not make the extension feel broken.
- Classification batches complete quickly enough for social feeds.
- The extension still works when the model fails to load.
