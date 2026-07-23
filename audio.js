const AUDIO_STORAGE_KEY = "metaContradiction.audioSettings.v2";

const DEFAULT_AUDIO_SETTINGS = Object.freeze({
  enabled: false,
  speechRate: 0.85,
  trialDelayMs: 0,
});

export function premiseToSpeech(premise) {
  const normalized = String(premise ?? "").trim().replace(/\s+/g, "");
  const match = normalized.match(/^(.+?)(=|≠)(.+)$/u);
  if (!match) return normalized;
  const [, left, operator, right] = match;
  return operator === "="
    ? `${left} equals ${right}`
    : `${left} does not equal ${right}`;
}

export function buildPremisesSpeech(premises) {
  return premises.map(premiseToSpeech).filter(Boolean).join(". ");
}

function loadSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(AUDIO_STORAGE_KEY) || "null");
    return parsed && typeof parsed === "object"
      ? { ...DEFAULT_AUDIO_SETTINGS, ...parsed }
      : { ...DEFAULT_AUDIO_SETTINGS };
  } catch {
    return { ...DEFAULT_AUDIO_SETTINGS };
  }
}

function saveSettings(settings) {
  try {
    localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage is optional; current-page speech remains available.
  }
}

function initializeSpokenPremises() {
  const toggle = document.querySelector("#spoken-premises");
  const rate = document.querySelector("#speech-rate");
  const delay = document.querySelector("#trial-delay");
  const stimulus = document.querySelector("#stimulus");
  const startButtons = document.querySelectorAll("#start-guided, #start-full");
  const nextButton = document.querySelector("#next-trial");
  const synth = window.speechSynthesis;
  const supported = Boolean(synth && window.SpeechSynthesisUtterance);
  const settings = loadSettings();
  let scheduledFrame = 0;
  let scheduledTimeout = 0;

  if (!toggle || !stimulus) return;

  toggle.checked = Boolean(settings.enabled && supported);
  if (rate) rate.value = String(settings.speechRate);
  if (delay) delay.value = String(settings.trialDelayMs);
  toggle.disabled = !supported;
  if (!supported) {
    toggle.closest("label")?.querySelector("small")?.replaceChildren(
      document.createTextNode("Speech synthesis is unavailable in this browser."),
    );
  }

  function currentSettings() {
    return {
      enabled: toggle.checked && supported,
      speechRate: Math.min(2, Math.max(0.5, Number(rate?.value || 0.85))),
      trialDelayMs: Math.min(10000, Math.max(0, Number(delay?.value || 0))),
    };
  }

  function persist() {
    Object.assign(settings, currentSettings());
    saveSettings(settings);
  }

  function cancelSpeech() {
    if (scheduledTimeout) window.clearTimeout(scheduledTimeout);
    scheduledTimeout = 0;
    if (!supported) return;
    try { synth.cancel(); } catch { /* Browser-specific cancellation failure. */ }
  }

  function primeSpeech() {
    if (!currentSettings().enabled || !supported) return;
    try {
      synth.cancel();
      synth.resume();
      const primer = new SpeechSynthesisUtterance(" ");
      primer.volume = 0;
      synth.speak(primer);
    } catch {
      // The user-started session remains the fallback activation gesture.
    }
  }

  function speakCurrentPremises() {
    const current = currentSettings();
    if (!current.enabled || !supported || document.querySelector("#game-view")?.hidden) return;
    const premises = [...stimulus.querySelectorAll(".relation-token")]
      .map((token) => token.textContent?.trim() || "")
      .filter(Boolean);
    const text = buildPremisesSpeech(premises);
    if (!text) return;

    cancelSpeech();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-AU";
    utterance.rate = current.speechRate;
    utterance.volume = 1;
    utterance.pitch = 1;
    try { synth.speak(utterance); } catch { /* Visual play remains unaffected. */ }
  }

  function schedulePremises() {
    if (scheduledFrame) cancelAnimationFrame(scheduledFrame);
    scheduledFrame = requestAnimationFrame(() => {
      scheduledFrame = 0;
      speakCurrentPremises();
    });
  }

  toggle.addEventListener("change", () => {
    persist();
    if (!toggle.checked) cancelSpeech();
  });
  rate?.addEventListener("change", persist);
  delay?.addEventListener("change", persist);

  for (const button of startButtons) {
    button.addEventListener("pointerdown", primeSpeech, { capture: true });
    button.addEventListener("click", primeSpeech, { capture: true });
  }

  nextButton?.addEventListener("click", (event) => {
    const wait = currentSettings().trialDelayMs;
    if (!wait || nextButton.dataset.delayed === "true") {
      nextButton.dataset.delayed = "false";
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    nextButton.disabled = true;
    scheduledTimeout = window.setTimeout(() => {
      scheduledTimeout = 0;
      nextButton.disabled = false;
      nextButton.dataset.delayed = "true";
      nextButton.click();
    }, wait);
  }, { capture: true });

  const observer = new MutationObserver(schedulePremises);
  observer.observe(stimulus, { childList: true });
  document.addEventListener("visibilitychange", () => { if (document.hidden) cancelSpeech(); });
  window.addEventListener("beforeunload", cancelSpeech);
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  initializeSpokenPremises();
}
