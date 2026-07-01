import { isAggregateCandidateText, isCandidateText } from "../shared/heuristics";
import { DEFAULT_SETTINGS, getEffectiveSettings, isSocialHost, mergeSettings, normalizeHostname } from "../shared/settings";
import type { CandidateText, ClassificationResult, EffectiveSettings, Message, Settings } from "../shared/types";

const CLASSIFIER_BATCH_SIZE = 20;
const MAX_RESULT_CACHE_ENTRIES = 1500;
const REVEAL_TIMEOUT_MS = 9000;
const SCAN_DEBOUNCE_MS = 450;

let processedNodes = new WeakMap<Text, string>();
const resultCache = new Map<string, ClassificationResult>();
let currentSettings: EffectiveSettings = getEffectiveSettings(DEFAULT_SETTINGS, window.location.hostname);
let scanTimer: number | null = null;
let snoozeTimer: number | null = null;
let observer: MutationObserver | null = null;
let signalElement: HTMLDivElement | null = null;
let scanInFlight = false;
let rescanQueued = false;
let suppressObserver = 0;

interface ScanEntry {
  candidate: CandidateText;
  nodes: Text[];
}

function hashText(text: string): string {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16);
}

function normalizeTextContent(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function cacheKey(id: string, sensitivity = currentSettings.sensitivity): string {
  return `${sensitivity}:${id}`;
}

function getCachedResult(id: string, sensitivity = currentSettings.sensitivity): ClassificationResult | undefined {
  return resultCache.get(cacheKey(id, sensitivity));
}

function markProcessedNode(textNode: Text) {
  processedNodes.set(textNode, normalizeTextContent(textNode.textContent ?? ""));
}

function hasProcessedNode(textNode: Text): boolean {
  return processedNodes.get(textNode) === normalizeTextContent(textNode.textContent ?? "");
}

function isHiddenByAncestor(element: Element): boolean {
  for (let current: Element | null = element; current; current = current.parentElement) {
    const style = window.getComputedStyle(current);
    if (style.visibility === "hidden" || style.visibility === "collapse" || style.display === "none") {
      return true;
    }
  }

  return false;
}

function shouldSkipNode(textNode: Text): boolean {
  const parent = textNode.parentElement;
  if (!parent) {
    return true;
  }

  if (hasProcessedNode(textNode)) {
    return true;
  }

  if (parent.closest(".bleeo-filtered")) {
    return true;
  }

  if (parent.closest("script, style, noscript, textarea, input, option, select, button, code, pre")) {
    return true;
  }

  if (parent.isContentEditable) {
    return true;
  }

  const text = textNode.textContent ?? "";
  if (!isCandidateText(text)) {
    return true;
  }

  if (isHiddenByAncestor(parent)) {
    return true;
  }

  return false;
}

function shouldSkipAggregateNode(textNode: Text): boolean {
  const parent = textNode.parentElement;
  if (!parent) {
    return true;
  }

  if (hasProcessedNode(textNode)) {
    return true;
  }

  if (parent.closest(".bleeo-filtered")) {
    return true;
  }

  if (parent.closest("script, style, noscript, textarea, input, option, select, button, code, pre")) {
    return true;
  }

  if (parent.isContentEditable) {
    return true;
  }

  const text = normalizeTextContent(textNode.textContent ?? "");
  if (!text) {
    return true;
  }

  if (isHiddenByAncestor(parent)) {
    return true;
  }

  return false;
}

function isInsideRoots(node: Node, roots: Element[]): boolean {
  return roots.some((root) => root.contains(node));
}

function aggregateSelectorsForHost(hostname: string): string[] {
  const normalized = normalizeHostname(hostname);

  if (normalized === "x.com" || normalized.endsWith(".x.com") || normalized === "twitter.com" || normalized.endsWith(".twitter.com")) {
    return ['article[data-testid="tweet"]'];
  }

  if (normalized === "reddit.com" || normalized.endsWith(".reddit.com")) {
    return ['shreddit-post', '[data-testid="post-container"]', 'article[data-testid="post-container"]'];
  }

  if (normalized === "youtube.com" || normalized.endsWith(".youtube.com")) {
    return ["ytd-rich-item-renderer", "ytd-video-renderer", "ytd-compact-video-renderer", "ytd-reel-item-renderer"];
  }

  if (normalized === "facebook.com" || normalized.endsWith(".facebook.com")) {
    return ['div[role="article"]'];
  }

  if (normalized === "threads.net" || normalized.endsWith(".threads.net")) {
    return ['div[role="article"]'];
  }

  if (normalized === "linkedin.com" || normalized.endsWith(".linkedin.com")) {
    return ['div[data-id^="urn:li:activity:"]', 'div.feed-shared-update-v2'];
  }

  return [];
}

function collectAggregateEntries(root: ParentNode = document.body): { entries: ScanEntry[]; roots: Element[] } {
  const selectors = aggregateSelectorsForHost(window.location.hostname);
  if (!selectors.length) {
    return { entries: [], roots: [] };
  }

  const roots = Array.from(
    new Set(
      selectors.flatMap((selector) => Array.from(root.querySelectorAll(selector)))
    )
  );

  const entries: ScanEntry[] = [];
  for (const container of roots) {
    if (container.closest(".bleeo-filtered")) {
      continue;
    }

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];

    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      if (shouldSkipAggregateNode(node)) {
        continue;
      }
      nodes.push(node);
    }

    if (!nodes.length) {
      continue;
    }

    const text = nodes
      .map((node) => normalizeTextContent(node.textContent ?? ""))
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    if (!isAggregateCandidateText(text)) {
      continue;
    }

    const id = hashText(text);
    if (getCachedResult(id)?.label === "safe") {
      nodes.forEach(markProcessedNode);
      continue;
    }

    entries.push({ candidate: { id, text }, nodes });
  }

  return { entries, roots };
}

function collectCandidates(root: ParentNode = document.body, excludedRoots: Element[] = []): ScanEntry[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const collected: ScanEntry[] = [];

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (excludedRoots.length && isInsideRoots(node, excludedRoots)) {
      continue;
    }

    if (shouldSkipNode(node)) {
      continue;
    }

    const text = normalizeTextContent(node.textContent ?? "");
    const id = hashText(text);

    if (getCachedResult(id)?.label === "sensational") {
      collected.push({ candidate: { id, text }, nodes: [node] });
      continue;
    }

    if (!getCachedResult(id)) {
      collected.push({ candidate: { id, text }, nodes: [node] });
    }
  }

  return collected;
}

async function sendMessage<T>(message: Message): Promise<T | null> {
  try {
    return await chrome.runtime.sendMessage(message);
  } catch {
    return null;
  }
}

function getSignalElement(): HTMLDivElement {
  if (signalElement && document.contains(signalElement)) {
    return signalElement;
  }

  signalElement = document.createElement("div");
  signalElement.className = "bleeo-signal";
  signalElement.dataset.state = "idle";
  signalElement.setAttribute("role", "status");
  signalElement.setAttribute("aria-live", "polite");
  signalElement.hidden = true;
  document.documentElement.appendChild(signalElement);
  return signalElement;
}

function setSignalMessage(signal: HTMLDivElement, count: number) {
  signal.replaceChildren();

  if (count > 0) {
    const strong = document.createElement("strong");
    strong.textContent = String(count);
    signal.append(strong, ` post${count === 1 ? "" : "s"} softened by Bleeo`);
    return;
  }

  signal.textContent = "Bleeo is watching for sharp language";
}

function withObserverSuppressed<T>(callback: () => T): T {
  suppressObserver += 1;
  try {
    return callback();
  } finally {
    suppressObserver -= 1;
  }
}

function cacheResult(result: ClassificationResult, sensitivity = currentSettings.sensitivity) {
  const key = cacheKey(result.id, sensitivity);
  if (resultCache.has(key)) {
    resultCache.delete(key);
  }

  resultCache.set(key, result);
  if (resultCache.size <= MAX_RESULT_CACHE_ENTRIES) {
    return;
  }

  const oldestKey = resultCache.keys().next().value;
  if (oldestKey) {
    resultCache.delete(oldestKey);
  }
}

function filteredCount(): number {
  return document.querySelectorAll(".bleeo-filtered").length;
}

async function reportFilteredCount() {
  const count = currentSettings.siteEnabled ? filteredCount() : 0;
  const signal = getSignalElement();

  withObserverSuppressed(() => {
    signal.hidden = !currentSettings.siteEnabled;
    signal.dataset.state = count > 0 ? "active" : "idle";
    setSignalMessage(signal, count);
  });

  await sendMessage({
    type: "REPORT_FILTER_COUNT",
    hostname: window.location.hostname,
    count
  });
}

function applyFilteredWrapper(node: Text, result: ClassificationResult) {
  const parent = node.parentNode;
  if (!parent || !node.textContent) {
    return;
  }

  const wrapper = document.createElement("span");
  wrapper.className = "bleeo-filtered";
  wrapper.dataset.bleeoId = result.id;
  wrapper.dataset.bleeoReason = result.reasonCode;
  wrapper.dataset.bleeoRevealed = "false";
  wrapper.dataset.bleeoMarkers = String(currentSettings.showMarkers);
  wrapper.title = "Filtered by Bleeo. Click to reveal temporarily.";

  parent.replaceChild(wrapper, node);
  wrapper.textContent = node.textContent;
}

async function classifyAndFilter(entries: ScanEntry[]) {
  const sensitivity = currentSettings.sensitivity;
  const uncachedCandidates = Array.from(
    new Map(
      entries
        .filter(({ candidate }) => !getCachedResult(candidate.id, sensitivity))
        .map(({ candidate }) => [candidate.id, candidate] as const)
    ).values()
  );

  for (let index = 0; index < uncachedCandidates.length; index += CLASSIFIER_BATCH_SIZE) {
    const batch = uncachedCandidates.slice(index, index + CLASSIFIER_BATCH_SIZE);
    if (!batch.length) {
      continue;
    }

    const response = await sendMessage<{ results: ClassificationResult[] }>({
      type: "CLASSIFY_TEXT_BATCH",
      hostname: window.location.hostname,
      candidates: batch
    });

    for (const result of response?.results ?? []) {
      cacheResult(result, sensitivity);
    }
  }

  if (!currentSettings.siteEnabled || sensitivity !== currentSettings.sensitivity) {
    await reportFilteredCount();
    return;
  }

  withObserverSuppressed(() => {
    for (const entry of entries) {
      const result = getCachedResult(entry.candidate.id, sensitivity);
      if (!result) {
        continue;
      }

      if (result.label === "sensational") {
        for (const node of entry.nodes) {
          applyFilteredWrapper(node, result);
        }
      } else {
        for (const node of entry.nodes) {
          markProcessedNode(node);
        }
      }
    }
  });

  await reportFilteredCount();
}

function updateMarkerState() {
  document.querySelectorAll<HTMLElement>(".bleeo-filtered").forEach((element) => {
    element.dataset.bleeoMarkers = String(currentSettings.showMarkers);
  });
}

function removeFilteredWrappers() {
  withObserverSuppressed(() => {
    document.querySelectorAll<HTMLElement>(".bleeo-filtered").forEach((wrapper) => {
      const parent = wrapper.parentNode;
      if (!parent) {
        return;
      }

      const textNode = document.createTextNode(wrapper.textContent ?? "");
      parent.replaceChild(textNode, wrapper);
    });
  });

  void reportFilteredCount();
}

async function scanPage() {
  if (!document.body || !currentSettings.siteEnabled) {
    return;
  }

  const aggregate = isSocialHost(window.location.hostname) ? collectAggregateEntries() : { entries: [], roots: [] };
  const standaloneEntries = collectCandidates(document.body, aggregate.roots);
  const entries = [...aggregate.entries, ...standaloneEntries];
  if (!entries.length) {
    await reportFilteredCount();
    return;
  }

  await classifyAndFilter(entries);
}

async function runScan() {
  if (scanInFlight) {
    rescanQueued = true;
    return;
  }

  scanInFlight = true;
  try {
    await scanPage();
  } finally {
    scanInFlight = false;
    if (rescanQueued && currentSettings.siteEnabled) {
      rescanQueued = false;
      scheduleScan();
    }
  }
}

function scheduleScan() {
  if (scanTimer !== null) {
    window.clearTimeout(scanTimer);
  }

  scanTimer = window.setTimeout(() => {
    scanTimer = null;
    void runScan();
  }, SCAN_DEBOUNCE_MS);
}

function clearSnoozeTimer() {
  if (snoozeTimer !== null) {
    window.clearTimeout(snoozeTimer);
    snoozeTimer = null;
  }
}

function scheduleSnoozeExpiry() {
  clearSnoozeTimer();
  if (!currentSettings.siteSnoozedUntil) {
    return;
  }

  const delay = Math.max(0, currentSettings.siteSnoozedUntil - Date.now() + 250);
  snoozeTimer = window.setTimeout(() => {
    snoozeTimer = null;
    currentSettings = getEffectiveSettings(mergeSettings(currentSettings), window.location.hostname);

    if (!currentSettings.siteEnabled) {
      scheduleSnoozeExpiry();
      return;
    }

    startObserver();
    scheduleScan();
    void reportFilteredCount();
  }, delay);
}

function startObserver() {
  observer?.disconnect();
  observer = new MutationObserver(() => {
    if (suppressObserver > 0) {
      return;
    }

    scheduleScan();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
}

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  const wrapper = target.closest<HTMLElement>(".bleeo-filtered");
  if (!wrapper) {
    return;
  }

  wrapper.dataset.bleeoRevealed = "true";
  window.setTimeout(() => {
    wrapper.dataset.bleeoRevealed = "false";
  }, REVEAL_TIMEOUT_MS);
});

async function loadSettings() {
  const response = await sendMessage<{ settings: EffectiveSettings }>({
    type: "GET_EFFECTIVE_SETTINGS",
    hostname: window.location.hostname
  });
  if (response?.settings) {
    currentSettings = response.settings;
  }
}

function applySettingsUpdate(settings: Settings) {
  const previousSensitivity = currentSettings.sensitivity;
  const merged = mergeSettings(settings);
  currentSettings = getEffectiveSettings(merged, window.location.hostname);
  scheduleSnoozeExpiry();
  updateMarkerState();

  if (previousSensitivity !== currentSettings.sensitivity) {
    resultCache.clear();
    processedNodes = new WeakMap<Text, string>();
    removeFilteredWrappers();
  }

  if (!currentSettings.siteEnabled) {
    observer?.disconnect();
    if (scanTimer !== null) {
      window.clearTimeout(scanTimer);
      scanTimer = null;
    }
    removeFilteredWrappers();
    getSignalElement().hidden = true;
    return;
  }

  startObserver();
  scheduleScan();
}

chrome.runtime.onMessage.addListener((message: Message) => {
  if (message.type !== "SETTINGS_UPDATED") {
    return;
  }

  applySettingsUpdate(message.settings as Settings);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync" && areaName !== "local") {
    return;
  }

  const changedSettings = Object.fromEntries(
    Object.entries(changes).map(([key, change]) => [key, change.newValue])
  ) as Partial<Settings>;

  applySettingsUpdate({ ...currentSettings, ...changedSettings });
});

void (async () => {
  await loadSettings();
  if (!currentSettings.siteEnabled) {
    scheduleSnoozeExpiry();
    await reportFilteredCount();
    return;
  }

  await reportFilteredCount();
  startObserver();
  await runScan();
})();
