import {
  RELATION, TRANSFORM, TRANSFORM_LABELS, buildStimulus, createRng, evaluateTrial,
  generateSession, generateTransformCandidates, randomPattern, recommendNextNBack,
  relationSymbol, requiredResponses, signature, summarizeResults,
} from "./game-core.js";

const STORAGE_KEYS = Object.freeze({ settings: "metaContradiction.settings.v2", history: "metaContradiction.history.v1" });
const DEFAULTS = Object.freeze({ nBack: 2, trialCount: 24, infinite: false, adaptive: true });
const VIEWS = ["home", "learn", "play", "progress", "game", "summary"];
const LESSONS = [
  ["Meet the two signs", `<p class="lesson-lead">The whole game uses only two relation signs.</p><div class="symbol-teaching-grid"><div class="symbol-teaching-card same-card"><strong>=</strong><h3>Same</h3><p>A=B means A and B are in the same state.</p></div><div class="symbol-teaching-card opposite-card"><strong>≠</strong><h3>Opposite</h3><p>A≠B means A and B are in opposite states.</p></div></div>`],
  ["Find the wrong ending", `<p class="lesson-lead">Follow the premises. The outlined ending always disagrees with them.</p><div class="worked-example"><div class="example-puzzle"><span>A=B</span><span>B≠C</span><span class="wrong-claim">A=C</span></div><div class="answer-box">Replace <s>A=C</s> with <strong>A≠C</strong>.</div></div>`],
  ["Remember the deep pattern", `<p class="lesson-lead">Ignore changing letters. Remember the order of = and ≠ signs, then compare that structure with n trials ago.</p>`],
  ["Name how the pattern changed", `<p class="lesson-lead">Classify the previous-to-current transformation as Same, Mirror, Invert, Rotate, or Depth.</p>`],
  ["Do all four jobs together", `<div class="four-job-stack"><div class="job-one"><span>1</span><strong>Fix the ending</strong><small>Solve the contradiction.</small></div><div class="job-two"><span>2</span><strong>Remember the pattern</strong><small>Compare at n-back.</small></div><div class="job-three"><span>3</span><strong>Name the change</strong><small>Classify the transformation.</small></div><div class="job-four"><span>4</span><strong>Remember the change</strong><small>Compare transformation types.</small></div></div>`],
];

const $ = (selector) => document.querySelector(selector);
const state = {
  settings: load(STORAGE_KEYS.settings, DEFAULTS), session: null, index: 0, results: [], selected: emptySelection(),
  submitted: false, active: false, coach: true, view: "home", lesson: 0, rng: null, metaHistory: [],
};
const els = {
  nav: $("#main-navigation"), views: Object.fromEntries(VIEWS.map((name) => [name, $(`#${name}-view`)])),
  startLearning: $("#start-learning"), skip: $("#skip-to-play"), lessonNumber: $("#lesson-number"), lessonTitle: $("#lesson-title"), lessonBody: $("#lesson-body"), lessonBack: $("#lesson-back"), lessonNext: $("#lesson-next"), lessonPlay: $("#lesson-play"), lessonDots: [...document.querySelectorAll(".lesson-dot")],
  nBack: $("#n-back"), trialCount: $("#trial-count"), customTrialCount: $("#custom-trial-count"), adaptive: $("#adaptive"), startGuided: $("#start-guided"), startFull: $("#start-full"), historyNote: $("#history-note"),
  coachBanner: $("#coach-banner"), progressText: $("#progress-text"), progressBar: $("#progress-bar"), nBadge: $("#n-badge"), loadBadge: $("#load-badge"), liveScore: $("#live-score"), stimulus: $("#stimulus"), form: $("#response-form"), repair: $("#repair-group"), structure: $("#structure-group"), meta: $("#meta-group"), metaN: $("#meta-nback-group"), feedback: $("#feedback"), submit: $("#submit-response"), next: $("#next-trial"), quit: $("#quit-game"),
  summaryTitle: $("#summary-title"), summaryScore: $("#summary-score"), summaryGrid: $("#summary-grid"), recommendation: $("#recommendation"), restart: $("#restart-game"), backToPlay: $("#back-to-play"), viewProgress: $("#view-progress"), export: $("#export-history"), exportPage: $("#export-history-page"), progressList: $("#progress-list"),
};

initialize();

function initialize() {
  setTrialCountUi(state.settings);
  els.nBack.value = String(state.settings.nBack); els.adaptive.checked = Boolean(state.settings.adaptive);
  document.addEventListener("click", navigation);
  els.startLearning.addEventListener("click", () => setView("learn")); els.skip.addEventListener("click", () => setView("play"));
  els.lessonBack.addEventListener("click", () => changeLesson(-1)); els.lessonNext.addEventListener("click", () => changeLesson(1)); els.lessonPlay.addEventListener("click", () => setView("play"));
  els.lessonDots.forEach((button) => button.addEventListener("click", () => { state.lesson = Number(button.dataset.lesson); renderLesson(); }));
  els.trialCount.addEventListener("change", syncCustom);
  els.startGuided.addEventListener("click", () => startGame(true)); els.startFull.addEventListener("click", () => startGame(false));
  els.form.addEventListener("click", choose); els.form.addEventListener("submit", submitTrial); els.next.addEventListener("click", advance); els.quit.addEventListener("click", endSession);
  els.restart.addEventListener("click", () => startGame(state.coach)); els.backToPlay.addEventListener("click", () => setView("play")); els.viewProgress.addEventListener("click", () => setView("progress")); els.export.addEventListener("click", exportHistory); els.exportPage.addEventListener("click", exportHistory);
  renderLesson(); updateHistoryNote(); setView("home");
}
function load(key, fallback) { try { const parsed = JSON.parse(localStorage.getItem(key) || "null"); return parsed && typeof parsed === "object" ? { ...fallback, ...parsed } : { ...fallback }; } catch { return { ...fallback }; } }
function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
function emptySelection() { return { repair: null, contradictionMatch: null, metaTransform: null, metaMatch: null }; }
function navigation(event) { const button = event.target.closest("button[data-view]"); if (button) setView(button.dataset.view); }
function setView(name) { state.view = name; for (const [key, element] of Object.entries(els.views)) element.hidden = key !== name; els.nav.hidden = name === "game"; document.querySelectorAll("#main-navigation button[data-view]").forEach((button) => button.classList.toggle("is-active", button.dataset.view === name)); if (name === "progress") renderProgress(); if (name === "play") updateHistoryNote(); window.scrollTo({ top: 0, behavior: "auto" }); }
function renderLesson() { const [title, body] = LESSONS[state.lesson]; els.lessonNumber.textContent = String(state.lesson + 1); els.lessonTitle.textContent = title; els.lessonBody.innerHTML = body; els.lessonBack.disabled = state.lesson === 0; els.lessonNext.hidden = state.lesson === LESSONS.length - 1; els.lessonPlay.hidden = state.lesson !== LESSONS.length - 1; els.lessonDots.forEach((button, index) => button.classList.toggle("is-active", index === state.lesson)); }
function changeLesson(delta) { state.lesson = Math.max(0, Math.min(LESSONS.length - 1, state.lesson + delta)); renderLesson(); }
function setTrialCountUi(settings) { if (settings.infinite) { els.trialCount.value = "infinite"; els.customTrialCount.hidden = true; return; } const count = settings.trialCount || 24; const preset = [...els.trialCount.options].some((option) => option.value === String(count)); els.trialCount.value = preset ? String(count) : "custom"; els.customTrialCount.hidden = preset; els.customTrialCount.value = preset ? "" : String(count); }
function syncCustom() { const custom = els.trialCount.value === "custom"; els.customTrialCount.hidden = !custom; if (custom) { if (!els.customTrialCount.value) els.customTrialCount.value = String(state.settings.trialCount || 24); els.customTrialCount.focus(); } }
function settingsFromUi() { const infinite = els.trialCount.value === "infinite"; let trialCount = state.settings.trialCount || 24; if (!infinite) { trialCount = els.trialCount.value === "custom" ? Number(els.customTrialCount.value) : Number(els.trialCount.value); if (!Number.isInteger(trialCount) || trialCount < 4) throw new Error("Enter at least 4 trials."); } return { nBack: Number(els.nBack.value), trialCount, infinite, adaptive: els.adaptive.checked }; }

function startGame(coach) {
  try { state.settings = settingsFromUi(); } catch (error) { window.alert(error.message); return; }
  save(STORAGE_KEYS.settings, state.settings); state.coach = coach; const seed = Date.now(); state.rng = createRng(seed ^ 0x9e3779b9);
  const initialCount = state.settings.infinite ? Math.max(4, state.settings.nBack + 2) : state.settings.trialCount;
  state.session = generateSession({ nBack: state.settings.nBack, trialCount: initialCount, seed });
  state.metaHistory = state.session.trials.map((trial) => trial.metaTransform); state.index = 0; state.results = []; state.selected = emptySelection(); state.submitted = false; state.active = true; els.coachBanner.hidden = !coach; setView("game"); renderTrial();
}
function ensureTrial(index) { while (state.session.trials.length <= index) appendTrial(); }
function appendTrial() {
  const trials = state.session.trials; const index = trials.length; const previous = trials[index - 1]; let candidates = generateTransformCandidates(previous.pattern, { minDepth: 2, maxDepth: 4 });
  if (!candidates.length) candidates = [{ label: TRANSFORM.DEPTH, pattern: randomPattern(state.rng, 3) }];
  const structureReference = index >= state.settings.nBack ? trials[index - state.settings.nBack] : null;
  const metaReference = index - state.settings.nBack >= 1 ? state.metaHistory[index - state.settings.nBack] : null;
  const targetStructure = structureReference ? state.rng() < 0.36 : null; const targetMeta = metaReference ? state.rng() < 0.36 : null;
  const selected = candidates.map((candidate) => { const structureMatch = structureReference ? signature(candidate.pattern) === signature(structureReference.pattern) : null; const metaMatch = metaReference ? candidate.label === metaReference : null; let score = state.rng(); if (targetStructure !== null && structureMatch === targetStructure) score += 4; if (targetMeta !== null && metaMatch === targetMeta) score += 4; return { ...candidate, score }; }).sort((a, b) => b.score - a.score)[0];
  state.metaHistory[index] = selected.label;
  trials.push({ index, pattern: selected.pattern, stimulus: buildStimulus(selected.pattern, state.rng), metaTransform: selected.label, contradictionMatch: structureReference ? signature(selected.pattern) === signature(structureReference.pattern) : null, metaMatch: metaReference ? selected.label === metaReference : null });
  state.session.trialCount = trials.length;
}
function currentTrial() { return state.session.trials[state.index]; }
function renderTrial() {
  const trial = currentTrial(); state.selected = emptySelection(); state.submitted = false;
  els.progressText.textContent = state.settings.infinite ? `Trial ${state.index + 1} · Infinite` : `Trial ${state.index + 1} of ${state.settings.trialCount}`;
  els.progressBar.style.width = state.settings.infinite ? "100%" : `${((state.index + 1) / state.settings.trialCount) * 100}%`;
  els.nBadge.textContent = `${state.settings.nBack}-back`; els.loadBadge.textContent = `${trial.pattern.length + 1} relation tokens`; els.liveScore.textContent = liveScore();
  els.stimulus.replaceChildren(...trial.stimulus.tokens.flatMap((token, index) => { const span = document.createElement("span"); span.className = token.claim ? "relation-token claim-token" : "relation-token"; span.textContent = token.text; return index ? [document.createTextNode(" "), span] : [span]; }));
  resetGroup(els.repair, false); resetGroup(els.structure, trial.contradictionMatch === null); resetGroup(els.meta, trial.metaTransform === null); resetGroup(els.metaN, trial.metaMatch === null);
  warmup(els.structure, trial.contradictionMatch === null, `Memory warm-up: comparison begins after ${state.settings.nBack} earlier trial${state.settings.nBack === 1 ? "" : "s"}.`); warmup(els.meta, trial.metaTransform === null, "Change warm-up: the first trial has no earlier pattern."); warmup(els.metaN, trial.metaMatch === null, "Change-memory warm-up: comparison begins after enough transformations exist.");
  els.feedback.hidden = true; els.feedback.replaceChildren(); els.submit.hidden = false; els.submit.disabled = true; els.next.hidden = true; els.next.disabled = false; els.form.classList.remove("is-locked");
}
function resetGroup(group, isWarmup) { group.classList.toggle("is-warmup", isWarmup); group.querySelectorAll("button[data-value]").forEach((button) => { button.classList.remove("is-selected", "is-correct", "is-wrong"); button.disabled = isWarmup; button.setAttribute("aria-pressed", "false"); }); }
function warmup(group, active, text) { const label = group.querySelector(".warmup-label"); if (!label) return; label.hidden = !active; label.textContent = text; }
function choose(event) { if (state.submitted) return; const button = event.target.closest("button[data-field][data-value]"); if (!button || button.disabled) return; const field = button.dataset.field; state.selected[field] = field === "repair" ? Number(button.dataset.value) : field === "contradictionMatch" || field === "metaMatch" ? button.dataset.value === "true" : button.dataset.value; button.closest(".response-group").querySelectorAll("button[data-field]").forEach((item) => { item.classList.toggle("is-selected", item === button); item.setAttribute("aria-pressed", String(item === button)); }); updateSubmit(); }
function updateSubmit() { const required = requiredResponses(currentTrial()); els.submit.disabled = Object.entries(required).some(([field, needed]) => needed && state.selected[field] === null); }
function submitTrial(event) { event.preventDefault(); if (els.submit.disabled || state.submitted) return; state.submitted = true; const trial = currentTrial(); const evaluation = evaluateTrial(trial, state.selected); state.results.push({ trialIndex: state.index, response: { ...state.selected }, responseTimeMs: 0, evaluation }); els.form.classList.add("is-locked"); mark(trial, evaluation); feedback(trial, evaluation); els.liveScore.textContent = liveScore(); els.submit.hidden = true; els.next.hidden = false; els.next.textContent = state.settings.infinite ? "Next trial" : state.index === state.settings.trialCount - 1 ? "Finish session" : "Next trial"; }
function parseValue(field, value) { if (field === "repair") return Number(value); if (field === "contradictionMatch" || field === "metaMatch") return value === "true"; return value; }
function correctValue(trial, field) { return field === "repair" ? trial.stimulus.correctClaim : field === "contradictionMatch" ? trial.contradictionMatch : field === "metaTransform" ? trial.metaTransform : trial.metaMatch; }
function mark(trial, evaluation) { els.form.querySelectorAll("button[data-field]").forEach((button) => { button.disabled = true; const field = button.dataset.field; const value = parseValue(field, button.dataset.value); if (value === correctValue(trial, field)) button.classList.add("is-correct"); if (value === state.selected[field] && !evaluation.streams[field]) button.classList.add("is-wrong"); }); }
function feedback(trial, evaluation) { const answers = [["Ending", relationSymbol(trial.stimulus.correctClaim)], ["Pattern memory", trial.contradictionMatch === null ? null : trial.contradictionMatch ? "Match" : "Different"], ["Pattern change", trial.metaTransform ? TRANSFORM_LABELS[trial.metaTransform] : null], ["Change memory", trial.metaMatch === null ? null : trial.metaMatch ? "Match" : "Different"]].filter(([, value]) => value !== null); els.feedback.innerHTML = `<div class="feedback-heading"><strong>${evaluation.perfect ? "All available jobs correct" : `${evaluation.correctCount} of ${evaluation.possibleCount} available jobs correct`}</strong></div><div class="feedback-grid">${answers.map(([label, value]) => `<div class="feedback-item"><div><small>${label}</small><strong>${value}</strong></div></div>`).join("")}</div>`; els.feedback.hidden = false; }
function advance() { if (!state.submitted) return; if (!state.settings.infinite && state.index >= state.settings.trialCount - 1) { finish(); return; } state.index += 1; ensureTrial(state.index); renderTrial(); }
function endSession() { if (!state.active || !window.confirm(state.settings.infinite ? "End the infinite session and save completed trials?" : "End this session now and save completed trials?")) return; if (state.results.length) finish(); else { state.active = false; setView("play"); } }
function liveScore() { return state.results.length ? `Score ${Math.round(summarizeResults(state.results).accuracy * 100)}%` : "Score —"; }
function finish() { const summary = summarizeResults(state.results); const recommendedN = state.settings.adaptive ? recommendNextNBack(state.settings.nBack, summary) : state.settings.nBack; const record = { completedAt: new Date().toISOString(), seed: state.session.seed, nBack: state.settings.nBack, trialCount: state.results.length, infinite: state.settings.infinite, coachMode: state.coach, summary, recommendedN }; const history = load(STORAGE_KEYS.history, []); history.push(record); save(STORAGE_KEYS.history, history.slice(-100)); if (state.settings.adaptive) { state.settings.nBack = recommendedN; save(STORAGE_KEYS.settings, state.settings); } state.active = false; renderSummary(summary, recommendedN); setView("summary"); }
function renderSummary(summary, recommendedN) { const percent = Math.round(summary.accuracy * 100); els.summaryTitle.textContent = percent >= 84 ? "All four systems held together" : percent >= 65 ? "The structure is forming" : "Protect accuracy before increasing load"; els.summaryScore.textContent = `${percent}%`; const metrics = [["1 · Contradiction", summary.streamAccuracy.repair], ["2 · Pattern n-back", summary.streamAccuracy.contradictionMatch], ["3 · Meta distinction", summary.streamAccuracy.metaTransform], ["4 · Meta n-back", summary.streamAccuracy.metaMatch]]; els.summaryGrid.innerHTML = metrics.map(([label, value]) => `<div class="metric-card"><strong>${typeof value === "number" ? `${Math.round(value * 100)}%` : "Warm-up"}</strong><span>${label}</span></div>`).join(""); els.recommendation.textContent = `Completed ${state.results.length} trial${state.results.length === 1 ? "" : "s"}${state.settings.infinite ? " in infinite mode" : ""}. Next recommended level: ${recommendedN}-back.`; }
function renderProgress() { const history = load(STORAGE_KEYS.history, []); if (!history.length) { els.progressList.innerHTML = `<div class="empty-progress"><strong>No completed sessions yet.</strong><span>Complete a session to create a baseline.</span></div>`; return; } els.progressList.innerHTML = [...history].reverse().map((record) => `<article class="history-card"><div class="history-card-head"><div><small>${new Date(record.completedAt).toLocaleString()}</small><strong>${record.nBack}-back · ${record.trialCount} trials${record.infinite ? " · infinite mode" : ""}</strong></div><div class="history-total">${Math.round((record.summary?.accuracy || 0) * 100)}%</div></div></article>`).join(""); }
function updateHistoryNote() { const history = load(STORAGE_KEYS.history, []); els.historyNote.textContent = history.length ? `${history.length} completed session${history.length === 1 ? "" : "s"} stored on this device.` : "No completed sessions on this device."; }
function exportHistory() { const history = load(STORAGE_KEYS.history, []); if (!history.length) return; const url = URL.createObjectURL(new Blob([JSON.stringify(history, null, 2)], { type: "application/json" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `meta-contradiction-history-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url); }
