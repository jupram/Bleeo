import type { Message, PopupState, Settings } from "../shared/types";

const globalEnabledInput = document.querySelector<HTMLInputElement>("#global-enabled");
const siteEnabledInput = document.querySelector<HTMLInputElement>("#site-enabled");
const sensitivityInput = document.querySelector<HTMLSelectElement>("#sensitivity");
const modeElement = document.querySelector<HTMLElement>("#mode");
const siteLabel = document.querySelector<HTMLElement>("#site-label");
const siteStatusElement = document.querySelector<HTMLElement>("#site-status");
const stateChip = document.querySelector<HTMLElement>("#state-chip");
const snoozeSiteButton = document.querySelector<HTMLButtonElement>("#snooze-site");
const openOptionsButton = document.querySelector<HTMLButtonElement>("#open-options");
const SNOOZE_DURATION_MS = 60 * 60 * 1000;

interface ActiveTabInfo {
  hostname: string;
  siteToggleAvailable: boolean;
}

async function getActiveTabInfo(): Promise<ActiveTabInfo> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) {
    return { hostname: "", siteToggleAvailable: false };
  }

  try {
    const parsed = new URL(tab.url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { hostname: "", siteToggleAvailable: false };
    }

    const siteToggleAvailable = await chrome.permissions.contains({ origins: [tab.url] });
    return { hostname: parsed.hostname, siteToggleAvailable };
  } catch {
    return { hostname: "", siteToggleAvailable: false };
  }
}

async function sendMessage<T>(message: Message): Promise<T> {
  return chrome.runtime.sendMessage(message);
}

async function refreshPopup(hostname: string, siteToggleAvailable: boolean) {
  const response = await sendMessage<{ settings: PopupState }>({
    type: "GET_POPUP_STATE",
    hostname
  });

  render(hostname, siteToggleAvailable, response.settings);
}

function bindHandlers(hostname: string, siteToggleAvailable: boolean) {
  globalEnabledInput?.addEventListener("change", async () => {
    await sendMessage<{ settings: Settings }>({ type: "TOGGLE_GLOBAL", enabled: Boolean(globalEnabledInput?.checked) });
    await refreshPopup(hostname, siteToggleAvailable);
  });

  siteEnabledInput?.addEventListener("change", async () => {
    await sendMessage<{ settings: Settings }>({
      type: "TOGGLE_SITE",
      hostname,
      enabled: Boolean(siteEnabledInput?.checked)
    });
    await refreshPopup(hostname, siteToggleAvailable);
  });

  sensitivityInput?.addEventListener("change", async () => {
    if (!sensitivityInput) {
      return;
    }
    await sendMessage<{ settings: Settings }>({
      type: "SET_SENSITIVITY",
      sensitivity: sensitivityInput.value as PopupState["sensitivity"]
    });
    await refreshPopup(hostname, siteToggleAvailable);
  });

  snoozeSiteButton?.addEventListener("click", async () => {
    if (!siteToggleAvailable) {
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
    await refreshPopup(hostname, siteToggleAvailable);
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

function render(hostname: string, siteToggleAvailable: boolean, settings: PopupState) {
  if (globalEnabledInput) {
    globalEnabledInput.checked = settings.enabled;
  }

  if (siteEnabledInput) {
    siteEnabledInput.checked = settings.sitePreferenceEnabled;
    siteEnabledInput.disabled = !siteToggleAvailable;
  }

  if (sensitivityInput) {
    sensitivityInput.value = settings.sensitivity;
  }

  if (modeElement) {
    modeElement.textContent = settings.modelMode === "local-ai" ? "Local AI" : "Rules fallback";
  }

  if (stateChip) {
    const active = settings.enabled && settings.siteEnabled && !settings.siteSnoozed;
    stateChip.textContent = active ? "Active" : settings.siteSnoozed ? "Paused" : "Off";
    stateChip.dataset.state = active ? "active" : settings.siteSnoozed ? "paused" : "off";
  }

  if (siteLabel) {
    const defaultState = settings.siteSnoozed
      ? `Paused until ${formatSnoozeUntil(settings.siteSnoozedUntil)}`
      : settings.sitePreferenceSource === "override"
        ? settings.sitePreferenceEnabled
          ? "On for this site"
          : "Off for this site"
        : settings.defaultEnabledForSite
          ? "On by default here"
          : "Off by default here";
    siteLabel.textContent = siteToggleAvailable
      ? defaultState
      : hostname
        ? "Site toggle isn't available on this site"
        : "Site toggle is only available on web pages";
  }

  if (siteStatusElement) {
    siteStatusElement.textContent = !siteToggleAvailable
      ? "Unavailable"
      : settings.siteSnoozed
        ? "Paused"
        : settings.siteEnabled
          ? "Filtering"
          : "Not filtering";
  }

  if (snoozeSiteButton) {
    snoozeSiteButton.disabled = !siteToggleAvailable;
    snoozeSiteButton.dataset.snoozed = String(settings.siteSnoozed);
    snoozeSiteButton.textContent = settings.siteSnoozed ? "Resume this site" : "Pause this site for 1 hour";
  }
}

void (async () => {
  const { hostname, siteToggleAvailable } = await getActiveTabInfo();
  await refreshPopup(hostname, siteToggleAvailable);
  bindHandlers(hostname, siteToggleAvailable);
})();
