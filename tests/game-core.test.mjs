import test from "node:test";
import assert from "node:assert/strict";
import {
  TRANSFORM,
  evaluateTrial,
  generateSession,
  generateTransformCandidates,
  parity,
  signature,
} from "../game-core.js";

test("parity composes same/opposite relations", () => {
  assert.equal(parity([0, 0, 0]), 0);
  assert.equal(parity([0, 1, 0]), 1);
  assert.equal(parity([1, 1, 0]), 0);
});

test("generated stimuli never exceed five relation tokens", () => {
  for (let seed = 1; seed <= 250; seed += 1) {
    const session = generateSession({ trialCount: 48, nBack: 3, seed });
    for (const trial of session.trials) {
      assert.ok(trial.stimulus.wordCount <= 5);
      assert.ok(trial.stimulus.wordCount >= 3);
    }
  }
});

test("every displayed claim contradicts the relation chain", () => {
  const session = generateSession({ trialCount: 48, nBack: 2, seed: 91731 });
  for (const trial of session.trials) {
    assert.equal(trial.stimulus.displayedClaim, 1 - parity(trial.pattern));
    assert.equal(trial.stimulus.correctClaim, parity(trial.pattern));
  }
});

test("transform candidates have one unambiguous meta-label per resulting pattern", () => {
  const patterns = [[0, 1], [1, 0], [0, 1, 1], [1, 0, 1, 0]];
  for (const pattern of patterns) {
    const candidates = generateTransformCandidates(pattern);
    const labelsByPattern = new Map();
    for (const candidate of candidates) {
      const key = signature(candidate.pattern);
      assert.equal(labelsByPattern.has(key), false);
      labelsByPattern.set(key, candidate.label);
      assert.ok(Object.values(TRANSFORM).includes(candidate.label));
    }
  }
});

test("session n-back truth values match their references", () => {
  const nBack = 3;
  const session = generateSession({ trialCount: 40, nBack, seed: 4412 });
  session.trials.forEach((trial, index) => {
    if (index >= nBack) {
      assert.equal(
        trial.contradictionMatch,
        signature(trial.pattern) === signature(session.trials[index - nBack].pattern),
      );
    } else {
      assert.equal(trial.contradictionMatch, null);
    }
    if (index - nBack >= 1) {
      assert.equal(
        trial.metaMatch,
        trial.metaTransform === session.trials[index - nBack].metaTransform,
      );
    } else {
      assert.equal(trial.metaMatch, null);
    }
  });
});

test("evaluation scores all four streams correctly", () => {
  const session = generateSession({ trialCount: 12, nBack: 1, seed: 831 });
  const trial = session.trials[3];
  const response = {
    repair: trial.stimulus.correctClaim,
    contradictionMatch: trial.contradictionMatch,
    metaTransform: trial.metaTransform,
    metaMatch: trial.metaMatch,
  };
  const result = evaluateTrial(trial, response);
  assert.equal(result.perfect, true);
  assert.equal(result.correctCount, result.possibleCount);
});
