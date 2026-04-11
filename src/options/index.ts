import type { Message, Settings } from "../shared/types";

const enabledInput = document.querySelector<HTMLInputElement>("#enabled");
const sensitivityInput = document.querySelector<HTMLSelectElement>("#sensitivity");
const markersInput = document.querySelector<HTMLInputElement>("#markers");
const modeElement = document.querySelector<HTMLElement>("#mode");
const refreshButton = document.querySelector<HTMLButtonElement>("#refresh");
const tableBody = document.querySelector<HTMLTableSectionElement>("#site-overrides");
const emptyState = document.querySelector<HTMLElement>("#empty-state");

async function sendMessage<T>(message: Message): Promise<T> {
  return chrome.runtime.sendMessage(message);
}

function renderOverrides(settings: Settings) {
  if (!tableBody || !emptyState) {
    return;
  }

  tableBody.innerHTML = "";
  const overrides = Object.entries(settings.siteOverrides).sort(([left], [right]) => left.localeCompare(right));

  if (!overrides.length) {
    emptyState.dataset.visible = "true";
    return;
  }

  emptyState.dataset.visible = "false";
  for (const [hostname, enabled] of overrides) {
    const row = document.createElement("tr");

    const hostCell = document.createElement("td");
    hostCell.textContent = hostname;

    const stateCell = document.createElement("td");
    const pill = document.createElement("span");
    pill.className = "pill";
    pill.textContent = enabled ? "Enabled" : "Disabled";
    stateCell.appendChild(pill);

    const actionCell = document.createElement("td");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Remove";
    button.addEventListener("click", async () => {
      const response = await sendMessage<{ settings: Settings }>({
        type: "REMOVE_SITE_OVERRIDE",
        hostname
      });
      render(response.settings);
    });
    actionCell.appendChild(button);

    row.append(hostCell, stateCell, actionCell);
    tableBody.appendChild(row);
  }
}

function render(settings: Settings) {
  if (enabledInput) {
    enabledInput.checked = settings.enabled;
  }
  if (sensitivityInput) {
    sensitivityInput.value = settings.sensitivity;
  }
  if (markersInput) {
    markersInput.checked = settings.showMarkers;
  }
  if (modeElement) {
    modeElement.textContent = settings.modelMode === "local-ai" ? "Local AI" : "Rules fallback";
  }
  renderOverrides(settings);
}

async function refresh() {
  const response = await sendMessage<{ settings: Settings }>({ type: "GET_ALL_SETTINGS" });
  render(response.settings);
}

enabledInput?.addEventListener("change", async () => {
  const response = await sendMessage<{ settings: Settings }>({
    type: "TOGGLE_GLOBAL",
    enabled: Boolean(enabledInput?.checked)
  });
  render(response.settings);
});

sensitivityInput?.addEventListener("change", async () => {
  if (!sensitivityInput) {
    return;
  }

  const response = await sendMessage<{ settings: Settings }>({
    type: "SET_SENSITIVITY",
    sensitivity: sensitivityInput.value as Settings["sensitivity"]
  });
  render(response.settings);
});

markersInput?.addEventListener("change", async () => {
  const response = await sendMessage<{ settings: Settings }>({
    type: "SET_SHOW_MARKERS",
    showMarkers: Boolean(markersInput?.checked)
  });
  render(response.settings);
});

refreshButton?.addEventListener("click", () => {
  void refresh();
});

void refresh();
