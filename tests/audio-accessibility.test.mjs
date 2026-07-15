import test from "node:test";
import assert from "node:assert/strict";
import {
  premiseToSpeech,
  buildPremisesSpeech,
} from "../audio.js";

test("each relation is spoken without added instructions", () => {
  assert.equal(premiseToSpeech("A=B"), "A equals B");
  assert.equal(premiseToSpeech("B≠C"), "B does not equal C");
});

test("spoken output contains only the displayed premises in order", () => {
  const speech = buildPremisesSpeech(["A=B", "B≠C", "A=C"]);
  assert.equal(speech, "A equals B. B does not equal C. A equals C");
  assert.doesNotMatch(speech, /trial|job|feedback|correct|press|ending/i);
});
