import { isDefaultTargetHost } from "../shared/settings";
import type { EffectiveSettings, Message, Settings } from "../shared/types";

const globalEnabledInput = document.querySelector<HTMLInputElement>("#global-enabled");
const siteEnabledInput = document.querySelector<HTMLInputElement>("#site-enabled");
const sensitivityInput = document.querySelector<HTMLSelectElement>("#sensitivity");
const modeElement = document.querySelector<HTMLElement>("#mode");
const siteLabel = document.querySelector<HTMLElement>("#site-label");
const snoozeSiteButton = document.querySelector<HTMLButtonElement>("#snooze-site");
const openOptionsButton = document.querySelector<HTMLButtonElement>("#open-options");
const SNOOZE_DURATION_MS = 60 * 60 * 1000;

async function getActiveHostname(): Promise<string> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) {
    return "";
  }

  try {
    const parsed = new URL(tab.url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.hostname : "";
  } catch {
    return "";
  }
}

async function sendMessage<T>(message: Message): Promise<T> {
  return chrome.runtime.sendMessage(message);
}

async function refreshPopup(hostname: string) {
  const response = await sendMessage<{ settings: EffectiveSettings }>({
    type: "GET_POPUP_STATE",
    hostname
  });

  render(hostname, response.settings);
}

function bindHandlers(hostname: string) {
  globalEnabledInput?.addEventListener("change", async () => {
    await sendMessage<{ settings: Settings }>({ type: "TOGGLE_GLOBAL", enabled: Boolean(globalEnabledInput?.checked) });
    await refreshPopup(hostname);
  });

  siteEnabledInput?.addEventListener("change", async () => {
    await sendMessage<{ settings: Settings }>({
      type: "TOGGLE_SITE",
      hostname,
      enabled: Boolean(siteEnabledInput?.checked)
    });
    await refreshPopup(hostname);
  });

  sensitivityInput?.addEventListener("change", async () => {
    if (!sensitivityInput) {
      return;
    }
    await sendMessage<{ settings: Settings }>({
      type: "SET_SENSITIVITY",
      sensitivity: sensitivityInput.value as EffectiveSettings["sensitivity"]
    });
    await refreshPopup(hostname);
  });

  snoozeSiteButton?.addEventListener("click", async () => {
    if (!hostname) {
      return;
    }

    if (snoozeSiteButton.dataset.snoozed === "true") {
      await sendMessage<{ settings: Settings }>({ type: "CLEAR_SITE_SNOOZE", hostname });
    } else {
      await sendMessage<{ settings: Settings }>({
        type: "SNOOZE_SITE",
        hostname,
        until: Date.now() + SNOOZE_DURATION_MS
      });
    }
    await refreshPopup(hostname);
  });

  openOptionsButton?.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
}

function formatSnoozeUntil(until?: number): string {
  if (!until) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(until));
}

function render(hostname: string, settings: EffectiveSettings) {
  const siteToggleAvailable = Boolean(hostname);

  if (globalEnabledInput) {
    globalEnabledInput.checked = settings.enabled;
  }

  if (siteEnabledInput) {
    siteEnabledInput.checked = settings.siteEnabled;
    siteEnabledInput.disabled = !siteToggleAvailable;
  }

  if (sensitivityInput) {
    sensitivityInput.value = settings.sensitivity;
  }

  if (modeElement) {
    modeElement.textContent = settings.modelMode === "local-ai" ? "Local AI" : "Rules fallback";
  }

  if (siteLabel) {
    const defaultState = settings.siteSnoozed
      ? `Paused until ${formatSnoozeUntil(settings.siteSnoozedUntil)}`
      : isDefaultTargetHost(hostname)
        ? "On by default here"
        : "Off by default here";
    siteLabel.textContent = hostname ? defaultState : "Site toggle is only available on web pages";
  }

  if (snoozeSiteButton) {
    snoozeSiteButton.disabled = !siteToggleAvailable;
    snoozeSiteButton.dataset.snoozed = String(settings.siteSnoozed);
    snoozeSiteButton.textContent = settings.siteSnoozed ? "Resume this site" : "Pause this site for 1 hour";
  }
}

void (async () => {
  const hostname = await getActiveHostname();
  await refreshPopup(hostname);
  bindHandlers(hostname);
})();
