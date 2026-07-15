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
const VIEW_NAMES = ["home", "learn", "play", "progress", "game", "summary"];

const LESSONS = [
  {
    title: "Meet the two signs",
    body: `
      <p class="lesson-lead">The whole game uses only two relation signs.</p>
      <div class="symbol-teaching-grid">
        <div class="symbol-teaching-card same-card">
          <strong>=</strong><h3>Same</h3><p>A=B means A and B are in the same state.</p>
        </div>
        <div class="symbol-teaching-card opposite-card">
          <strong>≠</strong><h3>Opposite</h3><p>A≠B means A and B are in opposite states.</p>
        </div>
      </div>
      <div class="remember-box"><strong>Remember:</strong> the letters are only names. The signs carry the pattern.</div>
    `,
  },
  {
    title: "Find the wrong ending",
    body: `
      <p class="lesson-lead">Follow the first relations. The outlined ending always disagrees with them.</p>
      <div class="worked-example">
        <div class="example-puzzle"><span>A=B</span><span>B≠C</span><span class="wrong-claim">A=C</span></div>
        <div class="thinking-path">
          <span>A is the same as B.</span><span aria-hidden="true">→</span>
          <span>B is opposite C.</span><span aria-hidden="true">→</span>
          <strong>A must be opposite C.</strong>
        </div>
        <div class="answer-box">Replace <s>A=C</s> with <strong>A≠C</strong>.</div>
      </div>
      <p>You solve a contradiction on every trial. This reasoning demand never disappears.</p>
    `,
  },
  {
    title: "Remember the deep pattern",
    body: `
      <p class="lesson-lead">Ignore changing letters. Remember the order of = and ≠ signs.</p>
      <div class="pattern-comparison">
        <div><small>Earlier</small><strong>A=B&nbsp;&nbsp;B≠C</strong><span>Pattern: = then ≠</span></div>
        <div class="comparison-arrow" aria-hidden="true">↔</div>
        <div><small>Now</small><strong>P=Q&nbsp;&nbsp;Q≠R</strong><span>Pattern: = then ≠</span></div>
      </div>
      <div class="answer-box"><strong>Match.</strong> The names changed, but the relational structure did not.</div>
      <p>At 2-back, compare with two trials ago. At 5-back, compare with five trials ago.</p>
    `,
  },
  {
    title: "Name how the pattern changed",
    body: `
      <p class="lesson-lead">The game uses five precise transformation classes.</p>
      <div class="transform-teaching-grid">
        <div><strong>Same</strong><span>= ≠ = → = ≠ =</span><small>Nothing changes.</small></div>
        <div><strong>Mirror</strong><span>= ≠ ≠ → ≠ ≠ =</span><small>The order runs backwards.</small></div>
        <div><strong>Invert</strong><span>= ≠ = → ≠ = ≠</span><small>Every sign swaps.</small></div>
        <div><strong>Rotate</strong><span>= = ≠ → = ≠ =</span><small>The first or last sign moves around.</small></div>
        <div><strong>Depth</strong><span>= ≠ → = ≠ =</span><small>One relation is added or removed.</small></div>
      </div>
      <div class="remember-box"><strong>Important:</strong> the generator excludes ambiguous cases. Only one transformation label is correct on a scored trial.</div>
    `,
  },
  {
    title: "Do all four jobs together",
    body: `
      <p class="lesson-lead">A complete trial asks every currently available question.</p>
      <div class="four-job-stack">
        <div class="job-one"><span>1</span><strong>Fix the ending</strong><small>Solve the current contradiction.</small></div>
        <div class="job-two"><span>2</span><strong>Remember the pattern</strong><small>Compare the deep pattern at n-back.</small></div>
        <div class="job-three"><span>3</span><strong>Name the change</strong><small>Classify the previous-to-current transformation.</small></div>
        <div class="job-four"><span>4</span><strong>Remember the change</strong><small>Compare transformation types at n-back.</small></div>
      </div>
      <div class="truth-banner compact"><strong>Guided play does not make these jobs easier.</strong><span>It only keeps the four answer categories visually separate and clearly explained.</span></div>
    `,
  },
];

const state = {
  settings: loadJson(STORAGE_KEYS.settings, DEFAULT_SETTINGS),
  session: null,
  currentIndex: 0,
  responses: [],
  results: [],
  selected: emptySelection(),
  trialStartedAt: 0,
  submitted: false,
  inSession: false,
  coachMode: true,
  currentView: "home",
  lessonIndex: 0,
};

const els = {
  mainNavigation: document.querySelector("#main-navigation"),
  views: Object.fromEntries(VIEW_NAMES.map((name) => [name, document.querySelector(`#${name}-view`)])),
  startLearning: document.querySelector("#start-learning"),
  skipToPlay: document.querySelector("#skip-to-play"),
  lessonNumber: document.querySelector("#lesson-number"),
  lessonTitle: document.querySelector("#lesson-title"),
  lessonBody: document.querySelector("#lesson-body"),
  lessonBack: document.querySelector("#lesson-back"),
  lessonNext: document.querySelector("#lesson-next"),
  lessonPlay: document.querySelector("#lesson-play"),
  lessonDots: [...document.querySelectorAll(".lesson-dot")],
  nBack: document.querySelector("#n-back"),
  trialCount: document.querySelector("#trial-count"),
  adaptive: document.querySelector("#adaptive"),
  startGuided: document.querySelector("#start-guided"),
  startFull: document.querySelector("#start-full"),
  historyNote: document.querySelector("#history-note"),
  progressList: document.querySelector("#progress-list"),
  exportHistoryPage: document.querySelector("#export-history-page"),
  coachBanner: document.querySelector("#coach-banner"),
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
  backToPlay: document.querySelector("#back-to-play"),
  viewProgress: document.querySelector("#view-progress"),
  exportButton: document.querySelector("#export-history"),
};

initialize();

function initialize() {
  els.nBack.value = String(state.settings.nBack);
  els.trialCount.value = String(state.settings.trialCount);
  els.adaptive.checked = Boolean(state.settings.adaptive);

  document.addEventListener("click", handleNavigationClick);
  els.startLearning.addEventListener("click", () => navigate("learn"));
  els.skipToPlay.addEventListener("click", () => navigate("play"));
  els.lessonBack.addEventListener("click", () => changeLesson(-1));
  els.lessonNext.addEventListener("click", () => changeLesson(1));
  els.lessonPlay.addEventListener("click", () => navigate("play"));
  els.lessonDots.forEach((button) => {
    button.addEventListener("click", () => {
      state.lessonIndex = Number(button.dataset.lesson);
      renderLesson();
    });
  });
  els.startGuided.addEventListener("click", () => startGame(true));
  els.startFull.addEventListener("click", () => startGame(false));
  els.responseForm.addEventListener("click", handleChoice);
  els.responseForm.addEventListener("submit", submitTrial);
  els.nextButton.addEventListener("click", advanceTrial);
  els.quitButton.addEventListener("click", quitGame);
  els.restartButton.addEventListener("click", restartGame);
  els.backToPlay.addEventListener("click", () => navigate("play"));
  els.viewProgress.addEventListener("click", () => navigate("progress"));
  els.exportButton.addEventListener("click", exportHistory);
  els.exportHistoryPage.addEventListener("click", exportHistory);
  document.addEventListener("keydown", handleKeyboard);

  renderLesson();
  updateHistoryNote();
  setView("home");
}

function loadJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    if (!value) return Array.isArray(fallback) ? [] : { ...fallback };
    const parsed = JSON.parse(value);
    if (Array.isArray(fallback)) return Array.isArray(parsed) ? parsed : [];
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? { ...fallback, ...parsed }
      : { ...fallback };
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

function handleNavigationClick(event) {
  const button = event.target.closest("button[data-view]");
  if (!button) return;
  navigate(button.dataset.view);
}

function navigate(view) {
  if (!VIEW_NAMES.includes(view) || view === "game" || view === "summary") return;
  if (state.inSession) {
    const leave = window.confirm("End this session and leave the game?");
    if (!leave) return;
    state.inSession = false;
  }
  if (view === "progress") renderProgress();
  if (view === "play") updateHistoryNote();
  setView(view);
}

function setView(name) {
  state.currentView = name;
  for (const [viewName, element] of Object.entries(els.views)) {
    element.hidden = viewName !== name;
  }
  els.mainNavigation.hidden = name === "game";
  for (const button of document.querySelectorAll("#main-navigation button[data-view]")) {
    button.classList.toggle("is-active", button.dataset.view === name);
    button.setAttribute("aria-current", button.dataset.view === name ? "page" : "false");
  }
  window.scrollTo({ top: 0, behavior: "auto" });
}

function renderLesson() {
  const lesson = LESSONS[state.lessonIndex];
  els.lessonNumber.textContent = String(state.lessonIndex + 1);
  els.lessonTitle.textContent = lesson.title;
  els.lessonBody.innerHTML = lesson.body;
  els.lessonBack.disabled = state.lessonIndex === 0;
  els.lessonNext.hidden = state.lessonIndex === LESSONS.length - 1;
  els.lessonPlay.hidden = state.lessonIndex !== LESSONS.length - 1;
  els.lessonDots.forEach((button, index) => {
    button.classList.toggle("is-active", index === state.lessonIndex);
    button.classList.toggle("is-complete", index < state.lessonIndex);
    button.setAttribute("aria-current", index === state.lessonIndex ? "step" : "false");
  });
}

function changeLesson(direction) {
  state.lessonIndex = Math.max(0, Math.min(LESSONS.length - 1, state.lessonIndex + direction));
  renderLesson();
}

function startGame(coachMode) {
  const settings = {
    nBack: Number(els.nBack.value),
    trialCount: Number(els.trialCount.value),
    adaptive: els.adaptive.checked,
  };
  state.settings = settings;
  state.coachMode = coachMode;
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
  state.inSession = true;
  els.coachBanner.hidden = !coachMode;
  setView("game");
  renderTrial();
}

function restartGame() {
  els.nBack.value = String(state.settings.nBack);
  els.trialCount.value = String(state.settings.trialCount);
  els.adaptive.checked = state.settings.adaptive;
  startGame(state.coachMode);
}

function quitGame() {
  const leave = window.confirm("End this session? Current progress will not be scored.");
  if (!leave) return;
  state.inSession = false;
  navigate("play");
}

function currentTrial() {
  return state.session.trials[state.currentIndex];
}

function renderTrial() {
  const trial = currentTrial();
  state.selected = emptySelection();
  state.submitted = false;
  state.trialStartedAt = performance.now();
  els.progressText.textContent = `Trial ${state.currentIndex + 1} of ${state.session.trialCount}`;
  els.progressBar.style.width = `${((state.currentIndex + 1) / state.session.trialCount) * 100}%`;
  els.nBadge.textContent = `${state.session.nBack}-back`;
  els.loadBadge.textContent = `${trial.pattern.length + 1} relation tokens`;
  els.liveScore.textContent = liveScoreText();

  els.stimulus.replaceChildren(
    ...trial.stimulus.tokens.flatMap((token, index) => {
      const span = document.createElement("span");
      span.className = token.claim ? "relation-token claim-token" : "relation-token";
      span.textContent = token.text;
      span.setAttribute("aria-label", token.claim ? `${token.text}, wrong ending` : token.text);
      return index === 0 ? [span] : [document.createTextNode(" "), span];
    }),
  );

  resetGroup(els.repairGroup, false);
  resetGroup(els.structureGroup, trial.contradictionMatch === null);
  resetGroup(els.metaGroup, trial.metaTransform === null);
  resetGroup(els.metaNBackGroup, trial.metaMatch === null);

  setWarmupText(
    els.structureGroup,
    trial.contradictionMatch === null,
    `Memory warm-up: this question begins when ${state.session.nBack} earlier trial${state.session.nBack === 1 ? " is" : "s are"} available.`,
  );
  setWarmupText(
    els.metaGroup,
    trial.metaTransform === null,
    "Change warm-up: the first trial has no earlier pattern to compare.",
  );
  setWarmupText(
    els.metaNBackGroup,
    trial.metaMatch === null,
    "Change-memory warm-up: this question begins after enough transformations exist.",
  );

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
  if (!warmup) return;
  warmup.hidden = !isWarmup;
  warmup.textContent = text;
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

function answerLabel(field, trial) {
  if (field === "repair") return relationSymbol(trial.stimulus.correctClaim);
  if (field === "contradictionMatch") return trial.contradictionMatch ? "Match" : "Different";
  if (field === "metaTransform") return TRANSFORM_LABELS[trial.metaTransform];
  if (field === "metaMatch") return trial.metaMatch ? "Match" : "Different";
  return "";
}

function showFeedback(trial, evaluation) {
  const heading = document.createElement("div");
  heading.className = "feedback-heading";
  const title = document.createElement("strong");
  title.textContent = evaluation.perfect
    ? "All available jobs correct"
    : `${evaluation.correctCount} of ${evaluation.possibleCount} available jobs correct`;
  const subtitle = document.createElement("span");
  subtitle.textContent = "The correct answers are separated below.";
  heading.append(title, subtitle);

  const answerGrid = document.createElement("div");
  answerGrid.className = "feedback-grid";
  const labels = {
    repair: "1 · Ending",
    contradictionMatch: "2 · Pattern memory",
    metaTransform: "3 · Pattern change",
    metaMatch: "4 · Change memory",
  };
  const required = requiredResponses(trial);
  for (const field of Object.keys(labels)) {
    if (!required[field]) continue;
    const item = document.createElement("div");
    item.className = evaluation.streams[field] ? "feedback-item correct" : "feedback-item incorrect";
    const resultMark = document.createElement("span");
    resultMark.textContent = evaluation.streams[field] ? "✓" : "✕";
    const copy = document.createElement("div");
    const label = document.createElement("small");
    label.textContent = labels[field];
    const answer = document.createElement("strong");
    answer.textContent = answerLabel(field, trial);
    copy.append(label, answer);
    item.append(resultMark, copy);
    answerGrid.append(item);
  }

  els.feedback.replaceChildren(heading, answerGrid);
  els.feedback.className = `feedback ${evaluation.perfect ? "success" : "partial"}`;
  els.feedback.hidden = false;
}

function advanceTrial() {
  if (!state.submitted) return;
  if (state.currentIndex >= state.session.trialCount - 1) {
    finishSession();
    return;
  }
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
    coachMode: state.coachMode,
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
  state.inSession = false;
  renderSummary(summary, recommendedN);
  setView("summary");
}

function renderSummary(summary, recommendedN) {
  const percent = Math.round(summary.accuracy * 100);
  els.summaryTitle.textContent = percent >= 84
    ? "All four systems held together"
    : percent >= 65
      ? "The structure is forming"
      : "Protect accuracy before increasing load";
  els.summaryScore.textContent = `${percent}%`;
  const metrics = [
    ["1 · Contradiction", summary.streamAccuracy.repair, "job-one"],
    ["2 · Pattern n-back", summary.streamAccuracy.contradictionMatch, "job-two"],
    ["3 · Meta distinction", summary.streamAccuracy.metaTransform, "job-three"],
    ["4 · Meta n-back", summary.streamAccuracy.metaMatch, "job-four"],
    ["Mean response", `${(summary.meanResponseTimeMs / 1000).toFixed(1)}s`, "time-card"],
  ];
  els.summaryGrid.replaceChildren(
    ...metrics.map(([label, value, className]) => {
      const card = document.createElement("div");
      card.className = `metric-card ${className}`;
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
    els.recommendation.textContent = `The evidence supports advancing the next session to ${recommendedN}-back.`;
  } else if (recommendedN < state.session.nBack) {
    els.recommendation.textContent = `The next session returns to ${recommendedN}-back so reasoning accuracy—not overload—remains the target.`;
  } else {
    els.recommendation.textContent = `The next session remains at ${recommendedN}-back.`;
  }
}

function renderProgress() {
  const history = loadJson(STORAGE_KEYS.history, []);
  if (history.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-progress";
    empty.innerHTML = "<strong>No completed sessions yet.</strong><span>Complete a session and each reasoning stream will appear here separately.</span>";
    els.progressList.replaceChildren(empty);
    els.exportHistoryPage.disabled = true;
    return;
  }

  els.exportHistoryPage.disabled = false;
  const newestFirst = [...history].reverse();
  els.progressList.replaceChildren(
    ...newestFirst.map((record, reverseIndex) => {
      const card = document.createElement("article");
      card.className = "history-card";
      const date = new Date(record.completedAt);
      const number = history.length - reverseIndex;
      const accuracy = Math.round((record.summary?.accuracy ?? 0) * 100);
      const streams = record.summary?.streamAccuracy ?? {};
      card.innerHTML = `
        <div class="history-card-head">
          <div><small>Session ${number}</small><strong>${date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</strong></div>
          <div class="history-total">${accuracy}%</div>
        </div>
        <div class="history-details">
          <span>${record.nBack}-back</span><span>${record.trialCount} trials</span><span>${record.coachMode === true ? "Guided screen" : record.coachMode === false ? "Full screen" : "Earlier version"}</span>
        </div>
        <div class="history-streams">
          ${historyStream("1 · Repair", streams.repair, "job-one")}
          ${historyStream("2 · Pattern", streams.contradictionMatch, "job-two")}
          ${historyStream("3 · Change", streams.metaTransform, "job-three")}
          ${historyStream("4 · Change memory", streams.metaMatch, "job-four")}
        </div>
      `;
      return card;
    }),
  );
}

function historyStream(label, value, className) {
  const displayed = typeof value === "number" ? `${Math.round(value * 100)}%` : "Warm-up";
  return `<div class="history-stream ${className}"><small>${label}</small><strong>${displayed}</strong></div>`;
}

function exportHistory() {
  const history = loadJson(STORAGE_KEYS.history, []);
  if (history.length === 0) return;
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
    : `${history.length} completed session${history.length === 1 ? "" : "s"} stored on this device.`;
}

function handleKeyboard(event) {
  if (state.currentView !== "game" || state.submitted) return;
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
