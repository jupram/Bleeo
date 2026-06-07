import { isSocialHost, normalizeHostname } from "./settings";
import type { CandidateText, ClassificationResult, Sensitivity } from "./types";

const ALARM_TERMS: Array<{ term: string; weight: number }> = [
  { term: "alarming", weight: 0.14 },
  { term: "attack", weight: 0.12 },
  { term: "bombshell", weight: 0.18 },
  { term: "brutal", weight: 0.14 },
  { term: "catastrophe", weight: 0.18 },
  { term: "chaos", weight: 0.14 },
  { term: "chilling", weight: 0.16 },
  { term: "collapse", weight: 0.14 },
  { term: "crisis", weight: 0.12 },
  { term: "danger", weight: 0.13 },
  { term: "deadly", weight: 0.16 },
  { term: "devastating", weight: 0.16 },
  { term: "disaster", weight: 0.13 },
  { term: "disturbing", weight: 0.14 },
  { term: "doomed", weight: 0.16 },
  { term: "explodes", weight: 0.14 },
  { term: "exposed", weight: 0.16 },
  { term: "frightening", weight: 0.15 },
  { term: "furious", weight: 0.14 },
  { term: "horrifying", weight: 0.18 },
  { term: "meltdown", weight: 0.16 },
  { term: "nightmare", weight: 0.16 },
  { term: "outrage", weight: 0.14 },
  { term: "panic", weight: 0.16 },
  { term: "rage", weight: 0.14 },
  { term: "shocking", weight: 0.15 },
  { term: "slammed", weight: 0.12 },
  { term: "stunning", weight: 0.12 },
  { term: "terrifying", weight: 0.18 },
  { term: "threat", weight: 0.13 },
  { term: "unbelievable", weight: 0.16 },
  { term: "urgent", weight: 0.14 },
  { term: "warning", weight: 0.12 }
];

const CLICKBAIT_PATTERNS = [
  /you won'?t believe/i,
  /what happened next/i,
  /this is why/i,
  /stuns? the internet/i,
  /breaks the internet/i,
  /goes viral/i,
  /leaves .* speechless/i,
  /everyone is saying/i,
  /must see/i,
  /the truth about/i
];

const FEAR_APPEAL_PATTERNS = [
  /hidden danger/i,
  /before it'?s too late/i,
  /could happen to you/i,
  /what they don'?t want you to know/i,
  /puts? .* at risk/i,
  /under attack/i,
  /no one is safe/i,
  /sparks? panic/i,
  /sends? shockwaves/i
];

const OUTRAGE_PATTERNS = [
  /people are furious/i,
  /internet erupts/i,
  /massive backlash/i,
  /slammed for/i,
  /called out for/i,
  /faces? outrage/i,
  /draws? fury/i
];

const URGENCY_PATTERNS = [
  /^(breaking|alert|urgent|warning)\b/i,
  /\burgent\b.*\bwarning\b/i,
  /\bwarning\b.*\burgent\b/i,
  /\bright now\b/i,
  /\bimmediately\b/i,
  /\bmust act\b/i,
  /\bact now\b/i
];

const CURIOSITY_GAP_PATTERNS = [
  /nobody is talking about/i,
  /you need to see/i,
  /secret .* revealed/i,
  /hidden truth/i,
  /truth behind/i,
  /one thing .* don'?t/i
];

const CALM_CONTEXT_PATTERNS = [
  /\b(approves?|announces?|publishes?|releases?|reviews?|debates?|extends?|opens?|tests?)\b/i,
  /\b(budget|meeting|hearing|training|drill|preparedness|relief|recovery|aid|guidance|guide|tips)\b/i,
  /\b(according to|study finds|report says|officials said|after community feedback)\b/i
];

const THRESHOLDS: Record<Sensitivity, number> = {
  low: 0.84,
  medium: 0.68,
  high: 0.56
};

export function isCandidateText(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length < 24 || normalized.length > 260) {
    return false;
  }

  const wordCount = normalized.split(/\s+/).length;
  if (wordCount < 4 || wordCount > 42) {
    return false;
  }

  return /[!?]|[A-Za-z]{4,}/.test(normalized);
}

export function isAggregateCandidateText(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length < 24 || normalized.length > 520) {
    return false;
  }

  const wordCount = normalized.split(/\s+/).length;
  if (wordCount < 4 || wordCount > 90) {
    return false;
  }

  return /[!?]|[A-Za-z]{4,}/.test(normalized);
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(1, score));
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesWholeWord(text: string, term: string): boolean {
  return new RegExp(`\\b${escapeRegExp(term)}\\b`, "i").test(text);
}

function uppercaseRatio(text: string): number {
  const letters = Array.from(text).filter((char) => /[a-z]/i.test(char));
  if (!letters.length) {
    return 0;
  }

  const uppercase = letters.filter((char) => /[A-Z]/.test(char)).length;
  return uppercase / letters.length;
}

function hasUppercaseHook(text: string): boolean {
  return /^(BREAKING|ALERT|WARNING|URGENT|WATCH NOW|MUST WATCH|EXPOSED)\b[:!\-]*/.test(text);
}

function hasAllCapsSentence(text: string): boolean {
  const words = text.match(/\b[A-Za-z]{2,}\b/g) ?? [];
  if (words.length < 5) {
    return false;
  }

  const allCapsWords = words.filter((word) => word === word.toUpperCase() && /[A-Z]/.test(word));
  const ratio = allCapsWords.length / words.length;

  if (ratio >= 0.7 && words.length >= 6) {
    return true;
  }

  return /\b(?:[A-Z]{2,}\s+){4,}[A-Z]{2,}\b/.test(text);
}

function hasLeadingAllCapsHeadline(text: string): boolean {
  const leadingSlice = text.slice(0, 140).trim();
  const words = leadingSlice.match(/[A-Za-z][A-Za-z'-]*/g) ?? [];
  if (words.length < 6) {
    return false;
  }

  const sample = words.slice(0, Math.min(words.length, 14));
  const allCapsWords = sample.filter((word) => word === word.toUpperCase() && /[A-Z]/.test(word));
  const ratio = allCapsWords.length / sample.length;

  return ratio >= 0.72 && allCapsWords.length >= 6;
}

function getSocialUppercaseReason(text: string): string | null {
  if (hasUppercaseHook(text)) {
    return "social-uppercase-hook";
  }

  if (hasLeadingAllCapsHeadline(text)) {
    return "social-uppercase-headline";
  }

  if (hasAllCapsSentence(text)) {
    return "social-all-caps-sentence";
  }

  return null;
}

export function scoreSensationalism(text: string, hostname?: string): { score: number; reasonCode: string } {
  const normalized = text.replace(/\s+/g, " ").trim();
  const normalizedHostname = hostname ? normalizeHostname(hostname) : "";
  let score = 0;
  let reasonCode = "neutral";

  function addSignal(points: number, reason: string) {
    if (points <= 0) {
      return;
    }

    score += points;
    if (reasonCode === "neutral" || points >= 0.18) {
      reasonCode = reason;
    }
  }

  const socialUppercaseReason =
    normalizedHostname && isSocialHost(normalizedHostname) ? getSocialUppercaseReason(normalized) : null;

  if (socialUppercaseReason) {
    return {
      score: 1,
      reasonCode: socialUppercaseReason
    };
  }

  const alarmScore = ALARM_TERMS.reduce(
    (total, { term, weight }) => (matchesWholeWord(normalized, term) ? total + weight : total),
    0
  );
  addSignal(Math.min(0.42, alarmScore), "alarmist-language");

  const clickbaitMatch = CLICKBAIT_PATTERNS.find((pattern) => pattern.test(normalized));
  if (clickbaitMatch) {
    addSignal(0.32, "clickbait-phrase");
  }

  const fearSignalCount = FEAR_APPEAL_PATTERNS.filter((pattern) => pattern.test(normalized)).length;
  addSignal(Math.min(0.56, fearSignalCount * 0.22), "fear-appeal");

  const outrageSignalCount = OUTRAGE_PATTERNS.filter((pattern) => pattern.test(normalized)).length;
  addSignal(Math.min(0.42, outrageSignalCount * 0.22), "outrage-bait");

  const urgencySignalCount = URGENCY_PATTERNS.filter((pattern) => pattern.test(normalized)).length;
  addSignal(Math.min(0.36, urgencySignalCount * 0.18), "urgency-frame");

  const curiositySignalCount = CURIOSITY_GAP_PATTERNS.filter((pattern) => pattern.test(normalized)).length;
  addSignal(Math.min(0.4, curiositySignalCount * 0.22), "curiosity-gap");

  const bangCount = (normalized.match(/[!?]/g) ?? []).length;
  if (bangCount >= 2) {
    addSignal(Math.min(0.18, bangCount * 0.05), "punctuation-spike");
  }

  if (uppercaseRatio(normalized) > 0.28) {
    addSignal(0.14, "uppercase-emphasis");
  }

  if (/\b(exposed|unbelievable|jaw-dropping|bombshell|stunning)\b/i.test(normalized)) {
    addSignal(0.18, "loaded-language");
  }

  if (/\d+\s+(reasons|ways|signs)\b/i.test(normalized)) {
    addSignal(0.08, "listicle-hook");
  }

  if (CALM_CONTEXT_PATTERNS.some((pattern) => pattern.test(normalized)) && score < 0.62) {
    score = Math.max(0, score - 0.14);
    if (score === 0) {
      reasonCode = "neutral";
    }
  }

  return {
    score: clampScore(score),
    reasonCode
  };
}

export function classifyCandidates(
  candidates: CandidateText[],
  sensitivity: Sensitivity,
  hostname?: string
): ClassificationResult[] {
  const threshold = THRESHOLDS[sensitivity];

  return candidates.map(({ id, text }) => {
    const { score, reasonCode } = scoreSensationalism(text, hostname);
    return {
      id,
      label: score >= threshold ? "sensational" : "safe",
      score,
      reasonCode
    };
  });
}
