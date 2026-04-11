import { classifyCandidates } from "../shared/heuristics";
import { sanitizeSettings } from "../shared/settings";
import type { CandidateText, Settings } from "../shared/types";
import { sanitizeCandidates, sanitizeHostnameInput } from "../shared/validation";

interface OffscreenMessage {
  type: "OFFSCREEN_CLASSIFY";
  hostname: string;
  settings: Settings;
  candidates: CandidateText[];
}

chrome.runtime.onMessage.addListener((message: OffscreenMessage, _sender, sendResponse) => {
  if (message.type !== "OFFSCREEN_CLASSIFY") {
    return;
  }

  const settings = sanitizeSettings(message.settings);
  const candidates = sanitizeCandidates(message.candidates);
  const results = classifyCandidates(candidates, settings.sensitivity, sanitizeHostnameInput(message.hostname));
  sendResponse({ results });
  return true;
});
