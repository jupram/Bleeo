import type { EffectiveSettings, Settings } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  sensitivity: "medium",
  siteOverrides: {},
  showMarkers: true,
  modelMode: "rules-fallback"
};

const VALID_SENSITIVITIES = new Set<Settings["sensitivity"]>(["low", "medium", "high"]);
const VALID_MODEL_MODES = new Set<Settings["modelMode"]>(["local-ai", "rules-fallback"]);
const HOSTNAME_PATTERN = /^[a-z0-9.-]+$/;
const MAX_SITE_OVERRIDES = 200;

export const TARGET_HOST_PATTERNS = [
  "cnn.com",
  "bbc.com",
  "nytimes.com",
  "foxnews.com",
  "nypost.com",
  "theguardian.com",
  "washingtonpost.com",
  "news.google.com",
  "reddit.com",
  "x.com",
  "twitter.com",
  "youtube.com",
  "facebook.com",
  "instagram.com",
  "threads.net",
  "tiktok.com",
  "linkedin.com"
];

const SOCIAL_HOST_PATTERNS = [
  "reddit.com",
  "x.com",
  "twitter.com",
  "youtube.com",
  "facebook.com",
  "instagram.com",
  "threads.net",
  "tiktok.com",
  "linkedin.com"
];

export function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^\.+|\.+$/g, "");
}

function sanitizeSiteOverrides(input: unknown): Record<string, boolean> {
  if (!input || typeof input !== "object") {
    return {};
  }

  const overrides: Record<string, boolean> = {};
  for (const [hostname, enabled] of Object.entries(input as Record<string, unknown>)) {
    if (typeof enabled !== "boolean") {
      continue;
    }

    const normalized = normalizeHostname(hostname);
    if (!normalized || normalized.length > 253 || !HOSTNAME_PATTERN.test(normalized)) {
      continue;
    }

    overrides[normalized] = enabled;
    if (Object.keys(overrides).length >= MAX_SITE_OVERRIDES) {
      break;
    }
  }

  return overrides;
}

export function isDefaultTargetHost(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  return TARGET_HOST_PATTERNS.some((pattern) => normalized === pattern || normalized.endsWith(`.${pattern}`));
}

export function isSocialHost(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  return SOCIAL_HOST_PATTERNS.some((pattern) => normalized === pattern || normalized.endsWith(`.${pattern}`));
}

export function mergeSettings(partial?: Partial<Settings>): Settings {
  return sanitizeSettings({
    ...DEFAULT_SETTINGS,
    ...partial,
    siteOverrides: { ...DEFAULT_SETTINGS.siteOverrides, ...(partial?.siteOverrides ?? {}) }
  });
}

export function sanitizeSettings(input: unknown): Settings {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};

  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : DEFAULT_SETTINGS.enabled,
    sensitivity: VALID_SENSITIVITIES.has(raw.sensitivity as Settings["sensitivity"])
      ? (raw.sensitivity as Settings["sensitivity"])
      : DEFAULT_SETTINGS.sensitivity,
    siteOverrides: sanitizeSiteOverrides(raw.siteOverrides),
    showMarkers: typeof raw.showMarkers === "boolean" ? raw.showMarkers : DEFAULT_SETTINGS.showMarkers,
    modelMode: VALID_MODEL_MODES.has(raw.modelMode as Settings["modelMode"])
      ? (raw.modelMode as Settings["modelMode"])
      : DEFAULT_SETTINGS.modelMode
  };
}

export function getEffectiveSettings(settings: Settings, hostname: string): EffectiveSettings {
  const normalized = normalizeHostname(hostname);
  const defaultEnabledForSite = isDefaultTargetHost(normalized);
  const override = settings.siteOverrides[normalized];
  const siteEnabled = override ?? defaultEnabledForSite;

  return {
    ...settings,
    hostname: normalized,
    defaultEnabledForSite,
    siteEnabled: settings.enabled && siteEnabled
  };
}
