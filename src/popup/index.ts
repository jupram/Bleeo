import { isDefaultTargetHost } from "../shared/settings";
import type { EffectiveSettings, Message, Settings } from "../shared/types";

const globalEnabledInput = document.querySelector<HTMLInputElement>("#global-enabled");
const siteEnabledInput = document.querySelector<HTMLInputElement>("#site-enabled");
const sensitivityInput = document.querySelector<HTMLSelectElement>("#sensitivity");
const modeElement = document.querySelector<HTMLElement>("#mode");
const siteLabel = document.querySelector<HTMLElement>("#site-label");
const openOptionsButton = document.querySelector<HTMLButtonElement>("#open-options");

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

function bindHandlers(hostname: string) {
  globalEnabledInput?.addEventListener("change", async () => {
    await sendMessage<{ settings: Settings }>({ type: "TOGGLE_GLOBAL", enabled: Boolean(globalEnabledInput?.checked) });
  });

  siteEnabledInput?.addEventListener("change", async () => {
    await sendMessage<{ settings: Settings }>({
      type: "TOGGLE_SITE",
      hostname,
      enabled: Boolean(siteEnabledInput?.checked)
    });
  });

  sensitivityInput?.addEventListener("change", async () => {
    if (!sensitivityInput) {
      return;
    }
    await sendMessage<{ settings: Settings }>({
      type: "SET_SENSITIVITY",
      sensitivity: sensitivityInput.value as EffectiveSettings["sensitivity"]
    });
  });

  openOptionsButton?.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
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
    const defaultState = isDefaultTargetHost(hostname) ? "On by default here" : "Off by default here";
    siteLabel.textContent = hostname ? defaultState : "Site toggle is only available on web pages";
  }
}

void (async () => {
  const hostname = await getActiveHostname();
  const response = await sendMessage<{ settings: EffectiveSettings }>({
    type: "GET_POPUP_STATE",
    hostname
  });

  render(hostname, response.settings);
  bindHandlers(hostname);
})();
