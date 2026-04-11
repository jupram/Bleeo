import { classifyCandidates } from "../shared/heuristics";
import { DEFAULT_SETTINGS, getEffectiveSettings, mergeSettings, normalizeHostname, sanitizeSettings } from "../shared/settings";
import type { CandidateText, ClassificationResult, Message, Settings } from "../shared/types";
import { sanitizeCandidates, sanitizeCount, sanitizeHostnameInput } from "../shared/validation";

interface OffscreenClassifyMessage {
  type: "OFFSCREEN_CLASSIFY";
  hostname: string;
  settings: Settings;
  candidates: CandidateText[];
}

let settingsCache: Settings = DEFAULT_SETTINGS;
let offscreenReady: Promise<void> | null = null;

async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.sync.get({ ...DEFAULT_SETTINGS });
  settingsCache = sanitizeSettings(stored);
  return settingsCache;
}

async function saveSettings(settings: Settings): Promise<void> {
  const sanitized = sanitizeSettings(settings);
  settingsCache = sanitized;
  await chrome.storage.sync.set(sanitized);
  await broadcastSettings(sanitized);
}

async function broadcastSettings(settings: Settings): Promise<void> {
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs
      .filter((tab) => typeof tab.id === "number")
      .map(async (tab) => {
        try {
          await chrome.tabs.sendMessage(tab.id as number, { type: "SETTINGS_UPDATED", settings } satisfies Message);
        } catch {
          // Ignore pages without an active content script.
        }
      })
  );
}

async function hasOffscreenDocument(): Promise<boolean> {
  if (typeof chrome.runtime.getContexts !== "function") {
    return false;
  }

  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [chrome.runtime.getURL("offscreen.html")]
  });
  return contexts.length > 0;
}

async function ensureOffscreenDocument(): Promise<void> {
  if (await hasOffscreenDocument()) {
    return;
  }

  if (!offscreenReady) {
    offscreenReady = chrome.offscreen
      .createDocument({
        url: "offscreen.html",
        reasons: [chrome.offscreen.Reason.WORKERS],
        justification: "Run local classification without coupling it to page context."
      })
      .catch((error) => {
        offscreenReady = null;
        throw error;
      });
  }

  await offscreenReady;
}

async function classifyBatch(hostname: string, candidates: CandidateText[]) {
  await ensureOffscreenDocument();

  try {
    const response = await chrome.runtime.sendMessage<OffscreenClassifyMessage, { results?: ClassificationResult[] }>({
      type: "OFFSCREEN_CLASSIFY",
      hostname,
      settings: settingsCache,
      candidates
    });

    if (response?.results) {
      return response.results;
    }
  } catch {
    // Fall through to background classification.
  }

  return classifyCandidates(candidates, settingsCache.sensitivity, hostname);
}

async function toggleSite(hostname: string, enabled: boolean): Promise<Settings> {
  const normalized = normalizeHostname(hostname);
  const next = mergeSettings(settingsCache);
  next.siteOverrides = { ...next.siteOverrides, [normalized]: enabled };
  await saveSettings(next);
  return next;
}

async function updateBadge(tabId: number, count: number): Promise<void> {
  const text = count > 0 ? String(Math.min(count, 99)) : "";
  const color = count > 0 ? "#d96443" : "#8f775d";
  await chrome.action.setBadgeText({ tabId, text });
  await chrome.action.setBadgeBackgroundColor({ tabId, color });
}

chrome.runtime.onInstalled.addListener(async () => {
  await loadSettings();
});

chrome.runtime.onStartup.addListener(async () => {
  await loadSettings();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync") {
    return;
  }

  void loadSettings();
});

chrome.runtime.onMessage.addListener((message: Message | OffscreenClassifyMessage, _sender, sendResponse) => {
  if (message.type === "OFFSCREEN_CLASSIFY") {
    return;
  }

  void (async () => {
    const currentSettings = await loadSettings();

    switch (message.type) {
      case "GET_EFFECTIVE_SETTINGS": {
        sendResponse({ settings: getEffectiveSettings(currentSettings, sanitizeHostnameInput(message.hostname)) });
        return;
      }
      case "GET_POPUP_STATE": {
        sendResponse({ settings: getEffectiveSettings(currentSettings, sanitizeHostnameInput(message.hostname)) });
        return;
      }
      case "CLASSIFY_TEXT_BATCH": {
        const hostname = sanitizeHostnameInput(message.hostname);
        const candidates = sanitizeCandidates(message.candidates);
        const results = candidates.length ? await classifyBatch(hostname, candidates) : [];
        sendResponse({ results });
        return;
      }
      case "REPORT_FILTER_COUNT": {
        if (typeof _sender.tab?.id === "number") {
          await updateBadge(_sender.tab.id, sanitizeCount(message.count));
        }
        sendResponse({});
        return;
      }
      case "GET_ALL_SETTINGS": {
        sendResponse({ settings: currentSettings });
        return;
      }
      case "TOGGLE_GLOBAL": {
        const next = mergeSettings({ ...currentSettings, enabled: message.enabled });
        await saveSettings(next);
        sendResponse({ settings: next });
        return;
      }
      case "SET_SENSITIVITY": {
        const next = mergeSettings({ ...currentSettings, sensitivity: message.sensitivity });
        await saveSettings(next);
        sendResponse({ settings: next });
        return;
      }
      case "SET_SHOW_MARKERS": {
        const next = mergeSettings({ ...currentSettings, showMarkers: message.showMarkers });
        await saveSettings(next);
        sendResponse({ settings: next });
        return;
      }
      case "TOGGLE_SITE": {
        const hostname = sanitizeHostnameInput(message.hostname);
        const next = hostname ? await toggleSite(hostname, message.enabled) : currentSettings;
        sendResponse({ settings: next });
        return;
      }
      case "REMOVE_SITE_OVERRIDE": {
        const normalized = sanitizeHostnameInput(message.hostname);
        const next = mergeSettings(currentSettings);
        const overrides = { ...next.siteOverrides };
        if (normalized) {
          delete overrides[normalized];
          next.siteOverrides = overrides;
          await saveSettings(next);
        }
        sendResponse({ settings: next });
        return;
      }
      default: {
        sendResponse({});
      }
    }
  })();

  return true;
});
