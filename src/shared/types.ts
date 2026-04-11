export type Sensitivity = "low" | "medium" | "high";
export type ModelMode = "local-ai" | "rules-fallback";

export interface Settings {
  enabled: boolean;
  sensitivity: Sensitivity;
  siteOverrides: Record<string, boolean>;
  showMarkers: boolean;
  modelMode: ModelMode;
}

export interface EffectiveSettings extends Settings {
  hostname: string;
  siteEnabled: boolean;
  defaultEnabledForSite: boolean;
}

export interface CandidateText {
  id: string;
  text: string;
}

export interface ClassificationResult {
  id: string;
  label: "safe" | "sensational";
  score: number;
  reasonCode: string;
}

export type Message =
  | { type: "GET_EFFECTIVE_SETTINGS"; hostname: string }
  | { type: "GET_POPUP_STATE"; hostname: string }
  | { type: "CLASSIFY_TEXT_BATCH"; hostname: string; candidates: CandidateText[] }
  | { type: "REPORT_FILTER_COUNT"; hostname: string; count: number }
  | { type: "TOGGLE_GLOBAL"; enabled: boolean }
  | { type: "SET_SENSITIVITY"; sensitivity: Sensitivity }
  | { type: "SET_SHOW_MARKERS"; showMarkers: boolean }
  | { type: "TOGGLE_SITE"; hostname: string; enabled: boolean }
  | { type: "REMOVE_SITE_OVERRIDE"; hostname: string }
  | { type: "GET_ALL_SETTINGS" }
  | { type: "SETTINGS_UPDATED"; settings: Settings };
