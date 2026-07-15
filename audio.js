const AUDIO_STORAGE_KEY = "metaContradiction.audio.v1";

const DEFAULT_AUDIO_SETTINGS = Object.freeze({
  enabled: false,
  voiceURI: "",
  rate: 0.85,
  volume: 1,
  detailedPrompts: true,
  spokenFeedback: true,
  announceSelections: true,
});

const FIELD_LABELS = Object.freeze({
  repair: "Job 1, ending",
  contradictionMatch: "Job 2, pattern memory",
  metaTransform: "Job 3, pattern change",
  metaMatch: "Job 4, change memory",
});

const VALUE_LABELS = Object.freeze({
  repair: { "0": "same", "1": "opposite" },
  contradictionMatch: { true: "match", false: "different" },
  metaTransform: {
    same: "same",
    mirror: "mirror",
    invert: "invert",
    rotate: "rotate",
    depth: "depth",
  },
  metaMatch: { true: "match", false: "different" },
});

export function relationTokenToSpeech(token, isClaim = false) {
  const normalized = String(token ?? "").trim().replace(/\s+/g, "");
  const match = normalized.match(/^(.+?)(=|≠)(.+)$/u);
  if (!match) return normalized;
  const [, left, operator, right] = match;
  const relation = operator === "=" ? "is the same as" : "is opposite to";
  const sentence = `${left} ${relation} ${right}`;
  return isClaim ? `The contradictory ending says ${sentence}` : sentence;
}

export function buildTrialNarration({
  progressText,
  nBackText,
  tokens,
  structureAvailable,
  metaAvailable,
  metaMemoryAvailable,
  detailedPrompts = true,
}) {
  const spokenTokens = tokens.map((token, index) =>
    relationTokenToSpeech(token.text, token.claim || index === tokens.length - 1),
  );
  const parts = [
    progressText || "New trial",
    nBackText || "",
    "Puzzle",
    ...spokenTokens,
  ].filter(Boolean);

  if (detailedPrompts) {
    parts.push("Job 1. Fix the ending. Press 1 for same, or 2 for opposite.");
    parts.push(
      structureAvailable
        ? "Job 2. Compare the deep sign pattern with the pattern from n trials ago. Press 3 for match, or 4 for different."
        : "Job 2 is still warming up because there is not yet an n-back comparison.",
    );
    parts.push(
      metaAvailable
        ? "Job 3. Name how the previous pattern became this pattern. Press S for same, M for mirror, I for invert, R for rotate, or D for depth."
        : "Job 3 is warming up because the first trial has no previous pattern.",
    );
    parts.push(
      metaMemoryAvailable
        ? "Job 4. Compare this change type with the change type from n transitions ago. Press 5 for match, or 6 for different."
        : "Job 4 is still warming up because there are not yet enough transformations.",
    );
    parts.push("Press Enter to check all answers. Press Q to hear this trial again.");
  } else {
    parts.push("Keys: 1 same, 2 opposite.");
    if (structureAvailable) parts.push("3 pattern match, 4 pattern different.");
    if (metaAvailable) parts.push("S same, M mirror, I invert, R rotate, D depth.");
    if (metaMemoryAvailable) parts.push("5 change match, 6 change different.");
    parts.push("Enter checks answers. Q repeats the trial.");
  }

  return parts.join(". ").replace(/\.\s*\./g, ".");
}

export function buildFeedbackNarration({ title, answers }) {
  const parts = [title || "Answers checked"];
  for (const answer of answers) {
    parts.push(`${answer.correct ? "Correct" : "Incorrect"}. ${answer.label}: ${answer.value}`);
  }
  parts.push("Press Enter for the next trial.");
  return parts.join(". ");
}

function loadAudioSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(AUDIO_STORAGE_KEY) || "null");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? { ...DEFAULT_AUDIO_SETTINGS, ...parsed }
      : { ...DEFAULT_AUDIO_SETTINGS };
  } catch {
    return { ...DEFAULT_AUDIO_SETTINGS };
  }
}

function saveAudioSettings(settings) {
  try {
    localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // The game remains usable if storage is blocked.
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function initializeAudioAccessibility() {
  const synth = window.speechSynthesis || null;
  const supported = Boolean(synth && window.SpeechSynthesisUtterance);
  const settings = loadAudioSettings();
  let voices = [];
  let speechEpoch = 0;
  let lastTrialNarration = "";
  let safetyTimer = null;

  const $ = (selector) => document.querySelector(selector);
  const elements = {
    enabled: $("#spoken-mode"),
    voice: $("#speech-voice"),
    rate: $("#speech-rate"),
    rateValue: $("#speech-rate-value"),
    volume: $("#speech-volume"),
    volumeValue: $("#speech-volume-value"),
    detailed: $("#speech-detailed"),
    feedback: $("#speech-feedback"),
    selections: $("#speech-selections"),
    test: $("#speech-test"),
    status: $("#speech-support-status"),
    gameToolbar: $("#audio-game-toolbar"),
    gameStatus: $("#audio-game-status"),
    repeat: $("#repeat-trial"),
    stop: $("#stop-speaking"),
    startAudio: $("#start-audio"),
    startGuided: $("#start-guided"),
    startFull: $("#start-full"),
    hearIntroduction: $("#hear-introduction"),
    readLesson: $("#read-lesson"),
    stimulus: $("#stimulus"),
    feedbackPanel: $("#feedback"),
    summaryView: $("#summary-view"),
  };

  if (!elements.enabled) return;

  function setStatus(message, speaking = false) {
    if (elements.status) elements.status.textContent = message;
    if (elements.gameStatus) elements.gameStatus.textContent = message;
    document.documentElement.classList.toggle("speech-is-active", speaking);
  }

  function cancelSpeech(message = "Speech stopped") {
    speechEpoch += 1;
    if (safetyTimer) clearTimeout(safetyTimer);
    safetyTimer = null;
    if (synth) {
      try { synth.cancel(); } catch {}
    }
    setStatus(message, false);
  }

  function selectedVoice() {
    if (!voices.length) return null;
    return voices.find((voice) => voice.voiceURI === settings.voiceURI) || pickPreferredVoice(voices);
  }

  function pickPreferredVoice(availableVoices) {
    const preferences = [
      /Karen/i,
      /Google.*English.*Australia/i,
      /Microsoft.*Natasha/i,
      /Samantha/i,
      /Microsoft.*Aria/i,
      /Daniel/i,
      /^en-AU$/i,
      /^en-GB$/i,
      /^en-US$/i,
      /^en/i,
    ];
    for (const pattern of preferences) {
      const match = availableVoices.find((voice) => pattern.test(voice.name) || pattern.test(voice.lang));
      if (match) return match;
    }
    return availableVoices[0] || null;
  }

  function populateVoices() {
    if (!supported) return;
    voices = synth.getVoices().slice().sort((a, b) =>
      `${a.lang} ${a.name}`.localeCompare(`${b.lang} ${b.name}`),
    );
    if (!elements.voice) return;
    const previous = settings.voiceURI;
    elements.voice.replaceChildren();
    for (const voice of voices) {
      const option = document.createElement("option");
      option.value = voice.voiceURI;
      option.textContent = `${voice.name} (${voice.lang})${voice.default ? " — device default" : ""}`;
      elements.voice.append(option);
    }
    const preferred = voices.find((voice) => voice.voiceURI === previous) || pickPreferredVoice(voices);
    if (preferred) {
      settings.voiceURI = preferred.voiceURI;
      elements.voice.value = preferred.voiceURI;
      saveAudioSettings(settings);
    }
  }

  function primeFromUserGesture() {
    if (!supported || !settings.enabled) return;
    try {
      synth.cancel();
      synth.resume();
      const primer = new SpeechSynthesisUtterance(" ");
      primer.volume = 0;
      primer.rate = 1;
      synth.speak(primer);
    } catch {
      setStatus("Your browser blocked spoken audio. Press Test voice to retry.");
    }
  }

  function speak(text, { interrupt = true, status = "Speaking" } = {}) {
    if (!supported || !settings.enabled || !text) return Promise.resolve(false);
    if (interrupt) cancelSpeech("Preparing speech");
    const myEpoch = ++speechEpoch;
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = selectedVoice();
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang || "en-AU";
    const configuredRate = Number(settings.rate);
    const configuredVolume = Number(settings.volume);
    utterance.rate = clamp(Number.isFinite(configuredRate) ? configuredRate : 0.85, 0.5, 1.5);
    utterance.volume = clamp(Number.isFinite(configuredVolume) ? configuredVolume : 1, 0, 1);
    utterance.pitch = 1;

    return new Promise((resolve) => {
      let finished = false;
      const finish = (message = "Speech complete") => {
        if (finished) return;
        finished = true;
        if (safetyTimer) clearTimeout(safetyTimer);
        safetyTimer = null;
        if (myEpoch === speechEpoch) setStatus(message, false);
        resolve(true);
      };
      utterance.onstart = () => setStatus(status, true);
      utterance.onend = () => finish();
      utterance.onerror = () => finish("Speech could not be completed");
      const words = text.trim().split(/\s+/).length;
      const estimatedMs = (words / Math.max(0.5, utterance.rate)) * 650 + 3000;
      safetyTimer = setTimeout(() => {
        try { synth.cancel(); } catch {}
        finish("Speech timed out; press Q to repeat");
      }, Math.min(45000, estimatedMs * 2));
      try {
        if (synth.paused) synth.resume();
        synth.speak(utterance);
      } catch {
        finish("Speech is unavailable in this browser");
      }
    });
  }

  function updateControls() {
    elements.enabled.checked = Boolean(settings.enabled);
    if (elements.rate) elements.rate.value = String(settings.rate);
    if (elements.rateValue) elements.rateValue.textContent = `${Number(settings.rate).toFixed(2)}×`;
    if (elements.volume) elements.volume.value = String(Math.round(Number(settings.volume) * 100));
    if (elements.volumeValue) elements.volumeValue.textContent = `${Math.round(Number(settings.volume) * 100)}%`;
    if (elements.detailed) elements.detailed.checked = Boolean(settings.detailedPrompts);
    if (elements.feedback) elements.feedback.checked = Boolean(settings.spokenFeedback);
    if (elements.selections) elements.selections.checked = Boolean(settings.announceSelections);
    if (elements.voice) elements.voice.disabled = !supported;
    if (elements.test) elements.test.disabled = !supported;
    if (elements.startAudio) elements.startAudio.disabled = !supported;
    if (elements.gameToolbar) elements.gameToolbar.hidden = !settings.enabled;
    setStatus(
      supported
        ? settings.enabled
          ? "Spoken accessibility is ready"
          : "Spoken accessibility is off"
        : "This browser does not provide speech synthesis. Screen-reader and keyboard controls remain available.",
    );
  }

  function currentTrialNarration() {
    if (!elements.stimulus || $("#game-view")?.hidden) return "";
    const tokenElements = [...elements.stimulus.querySelectorAll(".relation-token")];
    if (!tokenElements.length) return "";
    return buildTrialNarration({
      progressText: $("#progress-text")?.textContent?.trim(),
      nBackText: $("#n-badge")?.textContent?.trim(),
      tokens: tokenElements.map((token) => ({
        text: token.textContent?.trim() || "",
        claim: token.classList.contains("claim-token"),
      })),
      structureAvailable: !$("#structure-group")?.classList.contains("is-warmup"),
      metaAvailable: !$("#meta-group")?.classList.contains("is-warmup"),
      metaMemoryAvailable: !$("#meta-nback-group")?.classList.contains("is-warmup"),
      detailedPrompts: settings.detailedPrompts,
    });
  }

  function announceCurrentTrial() {
    if (!settings.enabled) return;
    const narration = currentTrialNarration();
    if (!narration) return;
    lastTrialNarration = narration;
    speak(narration, { status: "Reading trial" });
  }

  function feedbackNarration() {
    if (!elements.feedbackPanel || elements.feedbackPanel.hidden) return "";
    const title = elements.feedbackPanel.querySelector(".feedback-heading strong")?.textContent?.trim();
    const answers = [...elements.feedbackPanel.querySelectorAll(".feedback-item")].map((item) => ({
      correct: item.classList.contains("correct"),
      label: item.querySelector("small")?.textContent?.trim() || "Answer",
      value: item.querySelector("div > strong")?.textContent?.trim() || "",
    }));
    return buildFeedbackNarration({ title, answers });
  }

  function announceFeedback() {
    if (!settings.enabled || !settings.spokenFeedback) return;
    const narration = feedbackNarration();
    if (narration) speak(narration, { status: "Reading feedback" });
  }

  function announceSummary() {
    if (!settings.enabled || elements.summaryView?.hidden) return;
    const title = $("#summary-title")?.textContent?.trim() || "Session complete";
    const score = $("#summary-score")?.textContent?.trim() || "";
    const metrics = [...document.querySelectorAll("#summary-grid .metric-card")]
      .map((card) => `${card.querySelector("span")?.textContent?.trim()}: ${card.querySelector("strong")?.textContent?.trim()}`)
      .filter(Boolean);
    const recommendation = $("#recommendation")?.textContent?.trim() || "";
    speak(["Session complete", title, `Overall score ${score}`, ...metrics, recommendation].filter(Boolean).join(". "), {
      status: "Reading session summary",
    });
  }

  function announceIntroduction() {
    settings.enabled = true;
    saveAudioSettings(settings);
    updateControls();
    primeFromUserGesture();
    speak(
      "Welcome to Meta Contradiction. Every full trial has four jobs. First, repair the contradictory ending. Second, compare the deep relation pattern with n trials ago. Third, name how the previous pattern transformed into the current pattern. Fourth, compare the transformation type with n transitions ago. Open the Learn portal for five lessons, or the Play portal for a session.",
      { status: "Reading introduction" },
    );
  }

  function announceLesson() {
    settings.enabled = true;
    saveAudioSettings(settings);
    updateControls();
    primeFromUserGesture();
    const number = $("#lesson-number")?.textContent?.trim() || "";
    const title = $("#lesson-title")?.textContent?.trim() || "Lesson";
    const body = $("#lesson-body")?.textContent?.replace(/\s+/g, " ").trim() || "";
    speak(`Lesson ${number}. ${title}. ${body}`, { status: "Reading lesson" });
  }

  function clickChoice(field, value) {
    const button = document.querySelector(`#response-form button[data-field="${field}"][data-value="${value}"]`);
    if (button && !button.disabled) button.click();
  }

  function handleAudioKeyboard(event) {
    if ($("#game-view")?.hidden) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return;
    const key = event.key.toLowerCase();
    if (key === "3") {
      event.preventDefault();
      clickChoice("contradictionMatch", "true");
    } else if (key === "4") {
      event.preventDefault();
      clickChoice("contradictionMatch", "false");
    } else if (key === "5") {
      event.preventDefault();
      clickChoice("metaMatch", "true");
    } else if (key === "6") {
      event.preventDefault();
      clickChoice("metaMatch", "false");
    } else if (key === "q") {
      event.preventDefault();
      if (lastTrialNarration) speak(lastTrialNarration, { status: "Repeating trial" });
      else announceCurrentTrial();
    } else if (key === "x") {
      event.preventDefault();
      cancelSpeech();
    } else if (key === "enter") {
      const next = $("#next-trial");
      const submit = $("#submit-response");
      if (next && !next.hidden && !next.disabled) {
        event.preventDefault();
        next.click();
      } else if (submit && !submit.hidden && !submit.disabled) {
        event.preventDefault();
        submit.click();
      }
    }
  }

  elements.enabled.addEventListener("change", () => {
    settings.enabled = elements.enabled.checked;
    saveAudioSettings(settings);
    updateControls();
    if (settings.enabled) {
      primeFromUserGesture();
      speak("Spoken accessibility enabled. Use the Audio session button or start either normal portal.", {
        status: "Testing spoken accessibility",
      });
    } else {
      cancelSpeech("Spoken accessibility is off");
    }
  });

  elements.voice?.addEventListener("change", () => {
    settings.voiceURI = elements.voice.value;
    saveAudioSettings(settings);
  });
  elements.rate?.addEventListener("input", () => {
    settings.rate = clamp(Number(elements.rate.value), 0.5, 1.5);
    if (elements.rateValue) elements.rateValue.textContent = `${settings.rate.toFixed(2)}×`;
    saveAudioSettings(settings);
  });
  elements.volume?.addEventListener("input", () => {
    settings.volume = clamp(Number(elements.volume.value) / 100, 0, 1);
    if (elements.volumeValue) elements.volumeValue.textContent = `${Math.round(settings.volume * 100)}%`;
    saveAudioSettings(settings);
  });
  elements.detailed?.addEventListener("change", () => {
    settings.detailedPrompts = elements.detailed.checked;
    saveAudioSettings(settings);
  });
  elements.feedback?.addEventListener("change", () => {
    settings.spokenFeedback = elements.feedback.checked;
    saveAudioSettings(settings);
  });
  elements.selections?.addEventListener("change", () => {
    settings.announceSelections = elements.selections.checked;
    saveAudioSettings(settings);
  });
  elements.test?.addEventListener("click", () => {
    settings.enabled = true;
    saveAudioSettings(settings);
    updateControls();
    primeFromUserGesture();
    speak("Meta Contradiction spoken accessibility is working. A is the same as B. B is opposite to C.", {
      status: "Testing voice",
    });
  });
  elements.repeat?.addEventListener("click", () => {
    if (lastTrialNarration) speak(lastTrialNarration, { status: "Repeating trial" });
    else announceCurrentTrial();
  });
  elements.stop?.addEventListener("click", () => cancelSpeech());
  elements.hearIntroduction?.addEventListener("click", announceIntroduction);
  elements.readLesson?.addEventListener("click", announceLesson);

  const primeForActivation = (event) => {
    const target = event.target.closest("#start-guided, #start-full, #start-audio, #speech-test, #hear-introduction, #read-lesson");
    if (!target) return;
    if (target.id === "start-audio" || target.id === "speech-test" || target.id === "hear-introduction" || target.id === "read-lesson") {
      settings.enabled = true;
      saveAudioSettings(settings);
      updateControls();
    }
    primeFromUserGesture();
  };
  document.addEventListener("pointerdown", primeForActivation, true);
  document.addEventListener("click", primeForActivation, true);

  elements.startAudio?.addEventListener("click", () => {
    if (!supported) return;
    settings.enabled = true;
    saveAudioSettings(settings);
    updateControls();
    primeFromUserGesture();
    elements.startGuided?.click();
  });

  document.addEventListener("click", (event) => {
    const choice = event.target.closest("#response-form button[data-field][data-value]");
    if (!choice || !settings.enabled || !settings.announceSelections) return;
    const field = choice.dataset.field;
    const value = choice.dataset.value;
    const label = FIELD_LABELS[field] || "Answer";
    const spokenValue = VALUE_LABELS[field]?.[value] || value;
    speak(`${label} selected: ${spokenValue}`, { status: "Answer selected" });
  });

  document.addEventListener("keydown", handleAudioKeyboard, true);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) cancelSpeech("Speech paused while the page is hidden");
    else if (settings.enabled && synth?.paused) {
      try { synth.resume(); } catch {}
    }
  });
  window.addEventListener("beforeunload", () => cancelSpeech(""));

  if (supported) {
    synth.addEventListener?.("voiceschanged", populateVoices);
    synth.onvoiceschanged = populateVoices;
    populateVoices();
    window.setTimeout(populateVoices, 250);
  }

  const trialObserver = new MutationObserver(() => {
    if (!settings.enabled || $("#game-view")?.hidden) return;
    window.setTimeout(announceCurrentTrial, 0);
  });
  if (elements.stimulus) trialObserver.observe(elements.stimulus, { childList: true });

  const feedbackObserver = new MutationObserver(() => {
    if (!settings.enabled || !settings.spokenFeedback || elements.feedbackPanel?.hidden) return;
    window.setTimeout(announceFeedback, 0);
  });
  if (elements.feedbackPanel) feedbackObserver.observe(elements.feedbackPanel, { childList: true, attributes: true, attributeFilter: ["hidden"] });

  const summaryObserver = new MutationObserver(() => {
    if (!settings.enabled || elements.summaryView?.hidden) return;
    window.setTimeout(announceSummary, 0);
  });
  if (elements.summaryView) summaryObserver.observe(elements.summaryView, { attributes: true, attributeFilter: ["hidden"] });

  updateControls();
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  initializeAudioAccessibility();
}
