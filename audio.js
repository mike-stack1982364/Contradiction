const AUDIO_STORAGE_KEY = "metaContradiction.spokenPremises.v1";

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
  return premises
    .map(premiseToSpeech)
    .filter(Boolean)
    .join(". ");
}

function loadEnabled() {
  try {
    return localStorage.getItem(AUDIO_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function saveEnabled(enabled) {
  try {
    localStorage.setItem(AUDIO_STORAGE_KEY, String(enabled));
  } catch {
    // Storage is optional; speech still works for the current page.
  }
}

function initializeSpokenPremises() {
  const toggle = document.querySelector("#spoken-premises");
  const stimulus = document.querySelector("#stimulus");
  const startButtons = document.querySelectorAll("#start-guided, #start-full");
  const synth = window.speechSynthesis;
  const supported = Boolean(synth && window.SpeechSynthesisUtterance);
  let enabled = loadEnabled() && supported;
  let scheduledFrame = 0;

  if (!toggle || !stimulus) return;

  toggle.checked = enabled;
  toggle.disabled = !supported;
  if (!supported) {
    toggle.closest("label")?.querySelector("small")?.replaceChildren(
      document.createTextNode("Speech synthesis is unavailable in this browser."),
    );
  }

  function cancelSpeech() {
    if (!supported) return;
    try {
      synth.cancel();
    } catch {
      // Ignore browser-specific cancellation failures.
    }
  }

  function primeSpeech() {
    if (!enabled || !supported) return;
    try {
      synth.cancel();
      synth.resume();
      const primer = new SpeechSynthesisUtterance(" ");
      primer.volume = 0;
      synth.speak(primer);
    } catch {
      // The next user-started session remains the fallback activation gesture.
    }
  }

  function speakCurrentPremises() {
    if (!enabled || !supported || document.querySelector("#game-view")?.hidden) return;
    const premises = [...stimulus.querySelectorAll(".relation-token")]
      .map((token) => token.textContent?.trim() || "")
      .filter(Boolean);
    const text = buildPremisesSpeech(premises);
    if (!text) return;

    cancelSpeech();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-AU";
    utterance.rate = 0.85;
    utterance.volume = 1;
    utterance.pitch = 1;
    try {
      synth.speak(utterance);
    } catch {
      // Visual play remains unaffected if speech fails.
    }
  }

  function schedulePremises() {
    if (scheduledFrame) cancelAnimationFrame(scheduledFrame);
    scheduledFrame = requestAnimationFrame(() => {
      scheduledFrame = 0;
      speakCurrentPremises();
    });
  }

  toggle.addEventListener("change", () => {
    enabled = toggle.checked && supported;
    saveEnabled(enabled);
    if (!enabled) cancelSpeech();
  });

  for (const button of startButtons) {
    button.addEventListener("pointerdown", primeSpeech, { capture: true });
    button.addEventListener("click", primeSpeech, { capture: true });
  }

  const observer = new MutationObserver(schedulePremises);
  observer.observe(stimulus, { childList: true });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) cancelSpeech();
  });
  window.addEventListener("beforeunload", cancelSpeech);
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  initializeSpokenPremises();
}
