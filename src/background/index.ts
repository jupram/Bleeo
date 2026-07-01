import { classifyCandidates } from "../shared/heuristics";
import { DEFAULT_SETTINGS, getEffectiveSettings, getPopupState, mergeSettings, normalizeHostname, sanitizeSettings } from "../shared/settings";
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

const GLOBAL_DEFAULTS = {
  enabled: DEFAULT_SETTINGS.enabled,
  sensitivity: DEFAULT_SETTINGS.sensitivity,
  showMarkers: DEFAULT_SETTINGS.showMarkers,
  modelMode: DEFAULT_SETTINGS.modelMode
};

const LOCAL_DEFAULTS = {
  siteOverrides: DEFAULT_SETTINGS.siteOverrides,
  siteSnoozes: DEFAULT_SETTINGS.siteSnoozes
};

function recordsEqual<T extends string | number | boolean>(left: Record<string, T>, right: Record<string, T>): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key) => left[key] === right[key]);
}

async function loadSettings(): Promise<Settings> {
  const [syncData, localData] = await Promise.all([
    chrome.storage.sync.get(GLOBAL_DEFAULTS),
    chrome.storage.local.get(LOCAL_DEFAULTS)
  ]);
  settingsCache = sanitizeSettings({ ...syncData, ...localData });
  return settingsCache;
}

async function saveSettings(settings: Settings): Promise<void> {
  const sanitized = sanitizeSettings(settings);
  const { siteOverrides, siteSnoozes, ...globalPrefs } = sanitized;
  const globalChanged =
    sanitized.enabled !== settingsCache.enabled ||
    sanitized.sensitivity !== settingsCache.sensitivity ||
    sanitized.showMarkers !== settingsCache.showMarkers ||
    sanitized.modelMode !== settingsCache.modelMode;
  const localChanged =
    !recordsEqual(siteOverrides, settingsCache.siteOverrides) ||
    !recordsEqual(siteSnoozes, settingsCache.siteSnoozes);

  const writes: Array<Promise<void>> = [];
  if (globalChanged) {
    writes.push(chrome.storage.sync.set(globalPrefs));
  }

  if (localChanged) {
    writes.push(chrome.storage.local.set({ siteOverrides, siteSnoozes }));
  }

  if (writes.length > 0) {
    await Promise.all(writes);
  }

  settingsCache = sanitized;
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

async function snoozeSite(hostname: string, until: number): Promise<Settings> {
  const normalized = normalizeHostname(hostname);
  const next = mergeSettings(settingsCache);
  next.siteSnoozes = { ...next.siteSnoozes, [normalized]: until };
  await saveSettings(next);
  return next;
}

async function clearSiteSnooze(hostname: string): Promise<Settings> {
  const normalized = normalizeHostname(hostname);
  const next = mergeSettings(settingsCache);
  const snoozes = { ...next.siteSnoozes };
  delete snoozes[normalized];
  next.siteSnoozes = snoozes;
  await saveSettings(next);
  return next;
}

async function updateBadge(tabId: number, count: number): Promise<void> {
  const text = count > 0 ? String(Math.min(count, 99)) : "";
  const color = count > 0 ? "#d96443" : "#8f775d";
  await chrome.action.setBadgeText({ tabId, text });
  await chrome.action.setBadgeBackgroundColor({ tabId, color });
}

async function migratePerSiteDataFromSync(): Promise<void> {
  const [synced, localData] = await Promise.all([
    chrome.storage.sync.get(["siteOverrides", "siteSnoozes"]),
    chrome.storage.local.get(LOCAL_DEFAULTS)
  ]);
  const hasSiteOverrides = Object.prototype.hasOwnProperty.call(synced, "siteOverrides");
  const hasSiteSnoozes = Object.prototype.hasOwnProperty.call(synced, "siteSnoozes");
  if (!hasSiteOverrides && !hasSiteSnoozes) {
    return;
  }

  const legacyPerSite = sanitizeSettings({
    siteOverrides: hasSiteOverrides ? synced.siteOverrides : undefined,
    siteSnoozes: hasSiteSnoozes ? synced.siteSnoozes : undefined
  });
  const existingPerSite = sanitizeSettings({
    siteOverrides: localData.siteOverrides,
    siteSnoozes: localData.siteSnoozes
  });

  const mergedPerSite = {
    siteOverrides: { ...legacyPerSite.siteOverrides, ...existingPerSite.siteOverrides },
    siteSnoozes: { ...legacyPerSite.siteSnoozes, ...existingPerSite.siteSnoozes }
  };

  if (Object.keys(mergedPerSite.siteOverrides).length > 0 || Object.keys(mergedPerSite.siteSnoozes).length > 0) {
    await chrome.storage.local.set(mergedPerSite);
  }
  await chrome.storage.sync.remove(["siteOverrides", "siteSnoozes"]);
}

chrome.runtime.onInstalled.addListener(async () => {
  await migratePerSiteDataFromSync();
  await loadSettings();
});

chrome.runtime.onStartup.addListener(async () => {
  await loadSettings();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync" && areaName !== "local") {
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
        sendResponse({ settings: getPopupState(currentSettings, sanitizeHostnameInput(message.hostname)) });
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
        if (typeof _sender.tab?.id === "number" && _sender.id === chrome.runtime.id) {
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
      case "SNOOZE_SITE": {
        const hostname = sanitizeHostnameInput(message.hostname);
        const next = hostname ? await snoozeSite(hostname, message.until) : currentSettings;
        sendResponse({ settings: next });
        return;
      }
      case "CLEAR_SITE_SNOOZE": {
        const hostname = sanitizeHostnameInput(message.hostname);
        const next = hostname ? await clearSiteSnooze(hostname) : currentSettings;
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
        sendResponse({ error: "UNKNOWN_MESSAGE_TYPE" });
        return;
      }
    }
  })();

  return true;
});
