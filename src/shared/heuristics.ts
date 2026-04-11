import { isSocialHost, normalizeHostname } from "./settings";
import type { CandidateText, ClassificationResult, Sensitivity } from "./types";

const ALARM_WORDS = [
  "shocking",
  "horrifying",
  "devastating",
  "terrifying",
  "panic",
  "chaos",
  "outrage",
  "furious",
  "slammed",
  "explodes",
  "meltdown",
  "nightmare",
  "disaster",
  "crisis",
  "rage",
  "brutal",
  "doomed",
  "warning",
  "urgent"
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
  const lower = normalized.toLowerCase();
  const normalizedHostname = hostname ? normalizeHostname(hostname) : "";
  let score = 0;
  let reasonCode = "neutral";

  const socialUppercaseReason =
    normalizedHostname && isSocialHost(normalizedHostname) ? getSocialUppercaseReason(normalized) : null;

  if (socialUppercaseReason) {
    return {
      score: 1,
      reasonCode: socialUppercaseReason
    };
  }

  const alarmMatches = ALARM_WORDS.filter((word) => lower.includes(word));
  if (alarmMatches.length) {
    score += Math.min(0.4, alarmMatches.length * 0.12);
    reasonCode = "alarmist-language";
  }

  const clickbaitMatch = CLICKBAIT_PATTERNS.find((pattern) => pattern.test(normalized));
  if (clickbaitMatch) {
    score += 0.34;
    reasonCode = "clickbait-phrase";
  }

  const bangCount = (normalized.match(/[!?]/g) ?? []).length;
  if (bangCount >= 2) {
    score += 0.12;
    reasonCode = reasonCode === "neutral" ? "punctuation-spike" : reasonCode;
  }

  if (uppercaseRatio(normalized) > 0.28) {
    score += 0.14;
    reasonCode = reasonCode === "neutral" ? "uppercase-emphasis" : reasonCode;
  }

  if (/\b(exposed|unbelievable|jaw-dropping|bombshell|stunning)\b/i.test(normalized)) {
    score += 0.18;
    reasonCode = reasonCode === "neutral" ? "loaded-language" : reasonCode;
  }

  if (/\d+\s+(reasons|ways|signs)\b/i.test(normalized)) {
    score += 0.08;
    reasonCode = reasonCode === "neutral" ? "listicle-hook" : reasonCode;
  }

  if (/^(breaking|alert)\b/i.test(lower)) {
    score += 0.18;
    reasonCode = "breaking-frame";
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
