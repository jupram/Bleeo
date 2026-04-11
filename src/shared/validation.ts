import { normalizeHostname } from "./settings";
import type { CandidateText } from "./types";

const HOSTNAME_PATTERN = /^[a-z0-9.-]*$/;
const MAX_HOSTNAME_LENGTH = 253;
const MAX_CANDIDATE_TEXT_LENGTH = 520;
export const MAX_CLASSIFY_BATCH_SIZE = 50;

export function sanitizeHostnameInput(hostname: unknown): string {
  if (typeof hostname !== "string") {
    return "";
  }

  const normalized = normalizeHostname(hostname).slice(0, MAX_HOSTNAME_LENGTH);
  return HOSTNAME_PATTERN.test(normalized) ? normalized : "";
}

export function sanitizeCandidates(input: unknown): CandidateText[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const deduped = new Map<string, CandidateText>();
  for (const candidate of input.slice(0, MAX_CLASSIFY_BATCH_SIZE)) {
    if (!candidate || typeof candidate !== "object") {
      continue;
    }

    const raw = candidate as Record<string, unknown>;
    if (typeof raw.id !== "string" || !raw.id || raw.id.length > 64) {
      continue;
    }

    if (typeof raw.text !== "string") {
      continue;
    }

    const text = raw.text.replace(/\s+/g, " ").trim();
    if (!text || text.length > MAX_CANDIDATE_TEXT_LENGTH) {
      continue;
    }

    deduped.set(raw.id, { id: raw.id, text });
  }

  return Array.from(deduped.values());
}

export function sanitizeCount(input: unknown): number {
  if (typeof input !== "number" || !Number.isFinite(input)) {
    return 0;
  }

  return Math.max(0, Math.min(999, Math.floor(input)));
}
