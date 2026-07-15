export const RELATION = Object.freeze({ SAME: 0, OPPOSITE: 1 });

export const TRANSFORM = Object.freeze({
  SAME: "same",
  MIRROR: "mirror",
  INVERT: "invert",
  ROTATE: "rotate",
  DEPTH: "depth",
});

export const TRANSFORM_LABELS = Object.freeze({
  [TRANSFORM.SAME]: "Same",
  [TRANSFORM.MIRROR]: "Mirror",
  [TRANSFORM.INVERT]: "Invert",
  [TRANSFORM.ROTATE]: "Rotate",
  [TRANSFORM.DEPTH]: "Depth",
});

const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ".split("");

export function createRng(seed = Date.now()) {
  let value = Number(seed) >>> 0;
  return function rng() {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomInt(rng, min, maxInclusive) {
  return Math.floor(rng() * (maxInclusive - min + 1)) + min;
}

export function shuffle(values, rng) {
  const output = [...values];
  for (let i = output.length - 1; i > 0; i -= 1) {
    const j = randomInt(rng, 0, i);
    [output[i], output[j]] = [output[j], output[i]];
  }
  return output;
}

export function parity(pattern) {
  return pattern.reduce((total, bit) => total ^ bit, 0);
}

export function signature(pattern) {
  return pattern.join("");
}

export function relationSymbol(bit) {
  return bit === RELATION.SAME ? "=" : "≠";
}

function rotateLeft(pattern) {
  if (pattern.length < 2) return [...pattern];
  return [...pattern.slice(1), pattern[0]];
}

function rotateRight(pattern) {
  if (pattern.length < 2) return [...pattern];
  return [pattern.at(-1), ...pattern.slice(0, -1)];
}

export function generateTransformCandidates(
  pattern,
  { minDepth = 2, maxDepth = 4 } = {},
) {
  const raw = [];
  const add = (label, nextPattern) => {
    if (
      nextPattern.length >= minDepth &&
      nextPattern.length <= maxDepth &&
      nextPattern.every((bit) => bit === 0 || bit === 1)
    ) raw.push({ label, pattern: nextPattern });
  };

  add(TRANSFORM.SAME, [...pattern]);
  add(TRANSFORM.MIRROR, [...pattern].reverse());
  add(TRANSFORM.INVERT, pattern.map((bit) => 1 - bit));
  add(TRANSFORM.ROTATE, rotateLeft(pattern));
  add(TRANSFORM.ROTATE, rotateRight(pattern));

  if (pattern.length < maxDepth) {
    for (let index = 0; index <= pattern.length; index += 1) {
      for (const bit of [0, 1]) {
        const expanded = [...pattern];
        expanded.splice(index, 0, bit);
        add(TRANSFORM.DEPTH, expanded);
      }
    }
  }

  if (pattern.length > minDepth) {
    for (let index = 0; index < pattern.length; index += 1) {
      add(TRANSFORM.DEPTH, pattern.filter((_, i) => i !== index));
    }
  }

  const byPattern = new Map();
  for (const candidate of raw) {
    const key = signature(candidate.pattern);
    const existing = byPattern.get(key) ?? [];
    existing.push(candidate);
    byPattern.set(key, existing);
  }

  const unambiguous = [];
  for (const candidates of byPattern.values()) {
    const labels = new Set(candidates.map((candidate) => candidate.label));
    if (labels.size === 1) unambiguous.push(candidates[0]);
  }
  return unambiguous;
}

export function randomPattern(rng, depth) {
  const pattern = Array.from({ length: depth }, () =>
    rng() < 0.5 ? RELATION.SAME : RELATION.OPPOSITE,
  );
  if (depth >= 3 && pattern.every((bit) => bit === pattern[0])) {
    pattern[randomInt(rng, 0, depth - 1)] = 1 - pattern[0];
  }
  return pattern;
}

function uniqueEntityLabels(rng, count) {
  return shuffle(LETTERS, rng).slice(0, count);
}

export function buildStimulus(pattern, rng) {
  const entities = uniqueEntityLabels(rng, pattern.length + 1);
  const correctClaim = parity(pattern);
  const displayedClaim = 1 - correctClaim;
  const tokens = [];

  for (let index = 0; index < pattern.length; index += 1) {
    tokens.push({
      text: `${entities[index]}${relationSymbol(pattern[index])}${entities[index + 1]}`,
      claim: false,
    });
  }
  tokens.push({
    text: `${entities[0]}${relationSymbol(displayedClaim)}${entities.at(-1)}`,
    claim: true,
  });

  return { entities, tokens, correctClaim, displayedClaim, wordCount: tokens.length };
}

function selectCandidate({ candidates, trials, metaHistory, index, nBack, rng }) {
  const structureReference = index >= nBack ? trials[index - nBack] : null;
  const metaReferenceIndex = index - nBack;
  const metaReference = metaReferenceIndex >= 1 ? metaHistory[metaReferenceIndex] : null;
  const targetStructureMatch = structureReference ? rng() < 0.36 : null;
  const targetMetaMatch = metaReference ? rng() < 0.36 : null;

  return candidates
    .map((candidate) => {
      const structureMatch = structureReference
        ? signature(candidate.pattern) === signature(structureReference.pattern)
        : null;
      const metaMatch = metaReference ? candidate.label === metaReference : null;
      let score = rng();
      if (targetStructureMatch !== null) score += structureMatch === targetStructureMatch ? 4 : 0;
      if (targetMetaMatch !== null) score += metaMatch === targetMetaMatch ? 4 : 0;
      if (candidate.label !== TRANSFORM.SAME) score += 0.2;
      return { ...candidate, score };
    })
    .sort((a, b) => b.score - a.score)[0];
}

function initialDepthForLevel(nBack, rng, maxDepth) {
  const base = nBack <= 1 ? 2 : nBack === 2 ? 3 : 4;
  return Math.min(maxDepth, Math.max(2, base + (rng() < 0.3 ? -1 : 0)));
}

export function generateSession({
  trialCount = 24,
  nBack = 2,
  seed = Date.now(),
  minDepth = 2,
  maxDepth = 4,
} = {}) {
  if (!Number.isInteger(trialCount) || trialCount < 4) throw new Error("trialCount must be at least 4");
  if (!Number.isInteger(nBack) || nBack < 1 || nBack > 5) throw new Error("nBack must be 1–5");
  if (minDepth < 2 || maxDepth > 4 || minDepth > maxDepth) throw new Error("depth must be 2–4");

  const rng = createRng(seed);
  const trials = [];
  const metaHistory = [];
  const firstDepth = initialDepthForLevel(nBack, rng, maxDepth);
  const firstPattern = randomPattern(rng, Math.max(minDepth, firstDepth));

  trials.push({
    index: 0,
    pattern: firstPattern,
    stimulus: buildStimulus(firstPattern, rng),
    metaTransform: null,
    contradictionMatch: null,
    metaMatch: null,
  });
  metaHistory[0] = null;

  for (let index = 1; index < trialCount; index += 1) {
    const previous = trials[index - 1];
    let candidates = generateTransformCandidates(previous.pattern, { minDepth, maxDepth });
    if (candidates.length === 0) {
      candidates = [{
        label: TRANSFORM.DEPTH,
        pattern: randomPattern(rng, randomInt(rng, minDepth, maxDepth)),
      }];
    }

    const selected = selectCandidate({ candidates, trials, metaHistory, index, nBack, rng });
    metaHistory[index] = selected.label;
    const contradictionMatch = index >= nBack
      ? signature(selected.pattern) === signature(trials[index - nBack].pattern)
      : null;
    const metaMatch = index - nBack >= 1
      ? selected.label === metaHistory[index - nBack]
      : null;

    trials.push({
      index,
      pattern: selected.pattern,
      stimulus: buildStimulus(selected.pattern, rng),
      metaTransform: selected.label,
      contradictionMatch,
      metaMatch,
    });
  }

  return { seed, nBack, trialCount, minDepth, maxDepth, trials };
}

export function requiredResponses(trial) {
  return {
    repair: true,
    contradictionMatch: trial.contradictionMatch !== null,
    metaTransform: trial.metaTransform !== null,
    metaMatch: trial.metaMatch !== null,
  };
}

export function evaluateTrial(trial, response) {
  const required = requiredResponses(trial);
  const streams = {
    repair: response.repair === trial.stimulus.correctClaim,
    contradictionMatch: !required.contradictionMatch || response.contradictionMatch === trial.contradictionMatch,
    metaTransform: !required.metaTransform || response.metaTransform === trial.metaTransform,
    metaMatch: !required.metaMatch || response.metaMatch === trial.metaMatch,
  };
  const activeKeys = Object.keys(required).filter((key) => required[key]);
  const correctCount = activeKeys.filter((key) => streams[key]).length;
  return {
    required,
    streams,
    correctCount,
    possibleCount: activeKeys.length,
    perfect: correctCount === activeKeys.length,
  };
}

export function summarizeResults(results) {
  const totals = Object.fromEntries(
    ["repair", "contradictionMatch", "metaTransform", "metaMatch"].map((key) => [key, { correct: 0, possible: 0 }]),
  );
  let correct = 0;
  let possible = 0;
  let responseTimeTotal = 0;

  for (const result of results) {
    correct += result.evaluation.correctCount;
    possible += result.evaluation.possibleCount;
    responseTimeTotal += result.responseTimeMs;
    for (const key of Object.keys(totals)) {
      if (result.evaluation.required[key]) {
        totals[key].possible += 1;
        totals[key].correct += result.evaluation.streams[key] ? 1 : 0;
      }
    }
  }

  return {
    correct,
    possible,
    accuracy: possible > 0 ? correct / possible : 0,
    streamAccuracy: Object.fromEntries(
      Object.entries(totals).map(([key, value]) => [
        key,
        value.possible > 0 ? value.correct / value.possible : null,
      ]),
    ),
    meanResponseTimeMs: results.length > 0 ? responseTimeTotal / results.length : 0,
  };
}

export function recommendNextNBack(currentNBack, summary) {
  const structural = summary.streamAccuracy.contradictionMatch;
  const meta = summary.streamAccuracy.metaMatch;
  if (
    summary.accuracy >= 0.84 &&
    (structural === null || structural >= 0.78) &&
    (meta === null || meta >= 0.78)
  ) return Math.min(5, currentNBack + 1);
  if (
    summary.accuracy < 0.62 ||
    (structural !== null && structural < 0.55) ||
    (meta !== null && meta < 0.55)
  ) return Math.max(1, currentNBack - 1);
  return currentNBack;
}
