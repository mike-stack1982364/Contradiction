import {
  RELATION,
  TRANSFORM,
  TRANSFORM_LABELS,
  evaluateTrial,
  generateSession,
  recommendNextNBack,
  relationSymbol,
  requiredResponses,
  summarizeResults,
} from "./game-core.js";

const STORAGE_KEYS = Object.freeze({
  settings: "metaContradiction.settings.v1",
  history: "metaContradiction.history.v1",
});
const DEFAULT_SETTINGS = Object.freeze({ nBack: 2, trialCount: 24, adaptive: true });
const state = {
  settings: loadJson(STORAGE_KEYS.settings, DEFAULT_SETTINGS),
  session: null,
  currentIndex: 0,
  responses: [],
  results: [],
  selected: emptySelection(),
  trialStartedAt: 0,
  submitted: false,
};

const els = {
  setupView: document.querySelector("#setup-view"),
  gameView: document.querySelector("#game-view"),
  summaryView: document.querySelector("#summary-view"),
  nBack: document.querySelector("#n-back"),
  trialCount: document.querySelector("#trial-count"),
  adaptive: document.querySelector("#adaptive"),
  startButton: document.querySelector("#start-game"),
  practiceButton: document.querySelector("#show-practice"),
  practicePanel: document.querySelector("#practice-panel"),
  progressText: document.querySelector("#progress-text"),
  progressBar: document.querySelector("#progress-bar"),
  nBadge: document.querySelector("#n-badge"),
  loadBadge: document.querySelector("#load-badge"),
  stimulus: document.querySelector("#stimulus"),
  responseForm: document.querySelector("#response-form"),
  repairGroup: document.querySelector("#repair-group"),
  structureGroup: document.querySelector("#structure-group"),
  metaGroup: document.querySelector("#meta-group"),
  metaNBackGroup: document.querySelector("#meta-nback-group"),
  submitButton: document.querySelector("#submit-response"),
  nextButton: document.querySelector("#next-trial"),
  feedback: document.querySelector("#feedback"),
  liveScore: document.querySelector("#live-score"),
  quitButton: document.querySelector("#quit-game"),
  summaryTitle: document.querySelector("#summary-title"),
  summaryScore: document.querySelector("#summary-score"),
  summaryGrid: document.querySelector("#summary-grid"),
  recommendation: document.querySelector("#recommendation"),
  restartButton: document.querySelector("#restart-game"),
  settingsButton: document.querySelector("#back-to-settings"),
  exportButton: document.querySelector("#export-history"),
  historyNote: document.querySelector("#history-note"),
};

initialize();

function initialize() {
  els.nBack.value = String(state.settings.nBack);
  els.trialCount.value = String(state.settings.trialCount);
  els.adaptive.checked = Boolean(state.settings.adaptive);
  els.startButton.addEventListener("click", startGame);
  els.practiceButton.addEventListener("click", togglePractice);
  els.responseForm.addEventListener("click", handleChoice);
  els.responseForm.addEventListener("submit", submitTrial);
  els.nextButton.addEventListener("click", advanceTrial);
  els.quitButton.addEventListener("click", quitGame);
  els.restartButton.addEventListener("click", restartGame);
  els.settingsButton.addEventListener("click", showSettings);
  els.exportButton.addEventListener("click", exportHistory);
  document.addEventListener("keydown", handleKeyboard);
  updateHistoryNote();
}

function loadJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? { ...fallback, ...JSON.parse(value) } : Array.isArray(fallback) ? [] : { ...fallback };
  } catch {
    return Array.isArray(fallback) ? [] : { ...fallback };
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function emptySelection() {
  return { repair: null, contradictionMatch: null, metaTransform: null, metaMatch: null };
}

function setView(name) {
  els.setupView.hidden = name !== "setup";
  els.gameView.hidden = name !== "game";
  els.summaryView.hidden = name !== "summary";
  window.scrollTo({ top: 0, behavior: "instant" });
}

function startGame() {
  const settings = {
    nBack: Number(els.nBack.value),
    trialCount: Number(els.trialCount.value),
    adaptive: els.adaptive.checked,
  };
  state.settings = settings;
  saveJson(STORAGE_KEYS.settings, settings);
  state.session = generateSession({
    nBack: settings.nBack,
    trialCount: settings.trialCount,
    seed: Date.now(),
  });
  state.currentIndex = 0;
  state.responses = [];
  state.results = [];
  state.selected = emptySelection();
  state.submitted = false;
  setView("game");
  renderTrial();
}

function restartGame() {
  els.nBack.value = String(state.settings.nBack);
  els.trialCount.value = String(state.settings.trialCount);
  els.adaptive.checked = state.settings.adaptive;
  startGame();
}

function showSettings() {
  setView("setup");
  updateHistoryNote();
}

function quitGame() {
  if (window.confirm("End this session? Current progress will not be scored.")) showSettings();
}

function togglePractice() {
  els.practicePanel.hidden = !els.practicePanel.hidden;
  els.practiceButton.setAttribute("aria-expanded", String(!els.practicePanel.hidden));
}

function currentTrial() {
  return state.session.trials[state.currentIndex];
}

function renderTrial() {
  const trial = currentTrial();
  state.selected = emptySelection();
  state.submitted = false;
  state.trialStartedAt = performance.now();
  els.progressText.textContent = `Trial ${state.currentIndex + 1} / ${state.session.trialCount}`;
  els.progressBar.style.width = `${((state.currentIndex + 1) / state.session.trialCount) * 100}%`;
  els.nBadge.textContent = `${state.session.nBack}-back`;
  els.loadBadge.textContent = `${trial.pattern.length + 1} tokens`;
  els.liveScore.textContent = liveScoreText();

  els.stimulus.replaceChildren(
    ...trial.stimulus.tokens.flatMap((token, index) => {
      const span = document.createElement("span");
      span.className = token.claim ? "relation-token claim-token" : "relation-token";
      span.textContent = token.text;
      span.setAttribute("aria-label", token.claim ? `${token.text}, contradiction claim` : token.text);
      return index === 0 ? [span] : [document.createTextNode(" "), span];
    }),
  );

  resetGroup(els.repairGroup, false);
  resetGroup(els.structureGroup, trial.contradictionMatch === null);
  resetGroup(els.metaGroup, trial.metaTransform === null);
  resetGroup(els.metaNBackGroup, trial.metaMatch === null);
  setWarmupText(els.structureGroup, trial.contradictionMatch === null, "Structure warm-up");
  setWarmupText(els.metaGroup, trial.metaTransform === null, "First structure");
  setWarmupText(els.metaNBackGroup, trial.metaMatch === null, "Meta warm-up");
  els.feedback.hidden = true;
  els.feedback.replaceChildren();
  els.submitButton.hidden = false;
  els.submitButton.disabled = true;
  els.nextButton.hidden = true;
  els.responseForm.classList.remove("is-locked");
}

function resetGroup(group, warmup) {
  group.classList.toggle("is-warmup", warmup);
  for (const button of group.querySelectorAll("button[data-value]")) {
    button.classList.remove("is-selected", "is-correct", "is-wrong");
    button.disabled = warmup;
    button.setAttribute("aria-pressed", "false");
  }
}

function setWarmupText(group, isWarmup, text) {
  const warmup = group.querySelector(".warmup-label");
  if (warmup) {
    warmup.hidden = !isWarmup;
    warmup.textContent = text;
  }
}

function handleChoice(event) {
  if (state.submitted) return;
  const button = event.target.closest("button[data-field][data-value]");
  if (!button || button.disabled) return;
  const field = button.dataset.field;
  state.selected[field] = parseChoiceValue(field, button.dataset.value);
  const group = button.closest(".response-group");
  for (const sibling of group.querySelectorAll("button[data-field]")) {
    const selected = sibling === button;
    sibling.classList.toggle("is-selected", selected);
    sibling.setAttribute("aria-pressed", String(selected));
  }
  updateSubmitState();
}

function parseChoiceValue(field, value) {
  if (field === "repair") return Number(value);
  if (field === "contradictionMatch" || field === "metaMatch") return value === "true";
  return value;
}

function updateSubmitState() {
  const required = requiredResponses(currentTrial());
  els.submitButton.disabled = Object.entries(required).some(
    ([field, needed]) => needed && state.selected[field] === null,
  );
}

function submitTrial(event) {
  event.preventDefault();
  if (els.submitButton.disabled || state.submitted) return;
  state.submitted = true;
  const trial = currentTrial();
  const responseTimeMs = performance.now() - state.trialStartedAt;
  const response = { ...state.selected };
  const evaluation = evaluateTrial(trial, response);
  state.responses.push(response);
  state.results.push({ trialIndex: state.currentIndex, response, responseTimeMs, evaluation });
  lockAndMarkResponses(trial, response, evaluation);
  showFeedback(trial, evaluation);
  els.liveScore.textContent = liveScoreText();
  els.submitButton.hidden = true;
  els.nextButton.hidden = false;
  els.nextButton.textContent = state.currentIndex === state.session.trialCount - 1
    ? "Finish session"
    : "Next trial";
  els.nextButton.focus();
}

function lockAndMarkResponses(trial, response, evaluation) {
  els.responseForm.classList.add("is-locked");
  for (const button of els.responseForm.querySelectorAll("button[data-field]")) {
    button.disabled = true;
    const field = button.dataset.field;
    const value = parseChoiceValue(field, button.dataset.value);
    const correctValue = correctValueForField(trial, field);
    if (value === correctValue) button.classList.add("is-correct");
    if (value === response[field] && !evaluation.streams[field]) button.classList.add("is-wrong");
  }
}

function correctValueForField(trial, field) {
  if (field === "repair") return trial.stimulus.correctClaim;
  if (field === "contradictionMatch") return trial.contradictionMatch;
  if (field === "metaTransform") return trial.metaTransform;
  if (field === "metaMatch") return trial.metaMatch;
  return null;
}

function showFeedback(trial, evaluation) {
  const title = document.createElement("strong");
  title.textContent = evaluation.perfect
    ? "Complete resolution"
    : `${evaluation.correctCount}/${evaluation.possibleCount} streams correct`;
  const detail = document.createElement("span");
  const repair = relationSymbol(trial.stimulus.correctClaim);
  const meta = trial.metaTransform ? TRANSFORM_LABELS[trial.metaTransform] : null;
  detail.textContent = meta ? ` Repair: ${repair}. Meta: ${meta}.` : ` Repair: ${repair}.`;
  els.feedback.replaceChildren(title, detail);
  els.feedback.className = `feedback ${evaluation.perfect ? "success" : "partial"}`;
  els.feedback.hidden = false;
}

function advanceTrial() {
  if (!state.submitted) return;
  if (state.currentIndex >= state.session.trialCount - 1) return finishSession();
  state.currentIndex += 1;
  renderTrial();
}

function liveScoreText() {
  if (state.results.length === 0) return "Score —";
  return `Score ${Math.round(summarizeResults(state.results).accuracy * 100)}%`;
}

function finishSession() {
  const summary = summarizeResults(state.results);
  const recommendedN = state.settings.adaptive
    ? recommendNextNBack(state.settings.nBack, summary)
    : state.settings.nBack;
  const record = {
    completedAt: new Date().toISOString(),
    seed: state.session.seed,
    nBack: state.session.nBack,
    trialCount: state.session.trialCount,
    summary,
    recommendedN,
  };
  const history = loadJson(STORAGE_KEYS.history, []);
  history.push(record);
  saveJson(STORAGE_KEYS.history, history.slice(-100));
  if (state.settings.adaptive) {
    state.settings.nBack = recommendedN;
    saveJson(STORAGE_KEYS.settings, state.settings);
  }
  renderSummary(summary, recommendedN);
  setView("summary");
}

function renderSummary(summary, recommendedN) {
  const percent = Math.round(summary.accuracy * 100);
  els.summaryTitle.textContent = percent >= 84
    ? "Structure held"
    : percent >= 65
      ? "Structure forming"
      : "Reduce interference";
  els.summaryScore.textContent = `${percent}%`;
  const metrics = [
    ["Contradiction", summary.streamAccuracy.repair],
    ["Structure n-back", summary.streamAccuracy.contradictionMatch],
    ["Meta distinction", summary.streamAccuracy.metaTransform],
    ["Meta n-back", summary.streamAccuracy.metaMatch],
    ["Mean response", `${(summary.meanResponseTimeMs / 1000).toFixed(1)}s`],
  ];
  els.summaryGrid.replaceChildren(
    ...metrics.map(([label, value]) => {
      const card = document.createElement("div");
      card.className = "metric-card";
      const valueEl = document.createElement("strong");
      valueEl.textContent = typeof value === "number" ? `${Math.round(value * 100)}%` : value ?? "Warm-up";
      const labelEl = document.createElement("span");
      labelEl.textContent = label;
      card.append(valueEl, labelEl);
      return card;
    }),
  );
  if (!state.settings.adaptive) {
    els.recommendation.textContent = `Adaptive progression is off. Continue at ${state.settings.nBack}-back.`;
  } else if (recommendedN > state.session.nBack) {
    els.recommendation.textContent = `Next session advances to ${recommendedN}-back.`;
  } else if (recommendedN < state.session.nBack) {
    els.recommendation.textContent = `Next session returns to ${recommendedN}-back to protect reasoning quality.`;
  } else {
    els.recommendation.textContent = `Next session remains at ${recommendedN}-back.`;
  }
}

function exportHistory() {
  const history = loadJson(STORAGE_KEYS.history, []);
  const blob = new Blob([JSON.stringify(history, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `meta-contradiction-history-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function updateHistoryNote() {
  const history = loadJson(STORAGE_KEYS.history, []);
  els.historyNote.textContent = history.length === 0
    ? "No completed sessions on this device."
    : `${history.length} completed session${history.length === 1 ? "" : "s"} stored locally.`;
}

function handleKeyboard(event) {
  if (els.gameView.hidden || state.submitted) return;
  const map = {
    "1": ["repair", String(RELATION.SAME)],
    "2": ["repair", String(RELATION.OPPOSITE)],
    s: ["metaTransform", TRANSFORM.SAME],
    m: ["metaTransform", TRANSFORM.MIRROR],
    i: ["metaTransform", TRANSFORM.INVERT],
    r: ["metaTransform", TRANSFORM.ROTATE],
    d: ["metaTransform", TRANSFORM.DEPTH],
  };
  const mapping = map[event.key.toLowerCase()];
  if (!mapping) return;
  const [field, value] = mapping;
  const button = els.responseForm.querySelector(`button[data-field="${field}"][data-value="${value}"]`);
  if (button && !button.disabled) button.click();
}
