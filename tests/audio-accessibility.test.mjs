import test from "node:test";
import assert from "node:assert/strict";
import {
  relationTokenToSpeech,
  buildTrialNarration,
  buildFeedbackNarration,
} from "../audio.js";

test("relation tokens are spoken unambiguously", () => {
  assert.equal(relationTokenToSpeech("A=B"), "A is the same as B");
  assert.equal(relationTokenToSpeech("B≠C"), "B is opposite to C");
  assert.equal(
    relationTokenToSpeech("A=C", true),
    "The contradictory ending says A is the same as C",
  );
});

test("trial narration includes every available reasoning stream", () => {
  const narration = buildTrialNarration({
    progressText: "Trial 4 of 12",
    nBackText: "2-back",
    tokens: [
      { text: "A=B", claim: false },
      { text: "B≠C", claim: false },
      { text: "A=C", claim: true },
    ],
    structureAvailable: true,
    metaAvailable: true,
    metaMemoryAvailable: true,
    detailedPrompts: true,
  });
  assert.match(narration, /Job 1/);
  assert.match(narration, /Job 2/);
  assert.match(narration, /Job 3/);
  assert.match(narration, /Job 4/);
  assert.match(narration, /Press Q/);
});

test("warm-up narration does not invent unavailable answers", () => {
  const narration = buildTrialNarration({
    progressText: "Trial 1 of 12",
    nBackText: "3-back",
    tokens: [
      { text: "A=B", claim: false },
      { text: "B=C", claim: false },
      { text: "A≠C", claim: true },
    ],
    structureAvailable: false,
    metaAvailable: false,
    metaMemoryAvailable: false,
  });
  assert.match(narration, /Job 2 is still warming up/);
  assert.match(narration, /Job 3 is warming up/);
  assert.match(narration, /Job 4 is still warming up/);
});

test("feedback narration separates each scored stream", () => {
  const narration = buildFeedbackNarration({
    title: "3 of 4 available jobs correct",
    answers: [
      { correct: true, label: "1 · Ending", value: "≠" },
      { correct: false, label: "3 · Pattern change", value: "Mirror" },
    ],
  });
  assert.match(narration, /Correct\. 1 · Ending: ≠/);
  assert.match(narration, /Incorrect\. 3 · Pattern change: Mirror/);
});
