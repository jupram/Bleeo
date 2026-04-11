import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, getEffectiveSettings, isDefaultTargetHost, mergeSettings, sanitizeSettings } from "../src/shared/settings";

describe("settings", () => {
  it("detects default target hosts", () => {
    expect(isDefaultTargetHost("www.cnn.com")).toBe(true);
    expect(isDefaultTargetHost("example.com")).toBe(false);
  });

  it("merges site overrides without losing defaults", () => {
    const merged = mergeSettings({ siteOverrides: { "example.com": true } });
    expect(merged.enabled).toBe(DEFAULT_SETTINGS.enabled);
    expect(merged.siteOverrides["example.com"]).toBe(true);
  });

  it("computes effective site enablement", () => {
    const onTarget = getEffectiveSettings(DEFAULT_SETTINGS, "news.google.com");
    expect(onTarget.siteEnabled).toBe(true);

    const overridden = getEffectiveSettings(
      mergeSettings({ siteOverrides: { "news.google.com": false } }),
      "news.google.com"
    );
    expect(overridden.siteEnabled).toBe(false);
  });

  it("sanitizes invalid stored settings", () => {
    const sanitized = sanitizeSettings({
      enabled: "yes",
      sensitivity: "extreme",
      showMarkers: false,
      modelMode: "remote-ai",
      siteOverrides: {
        " Example.COM ": true,
        "bad host name": true,
        "news.google.com": "nope"
      }
    });

    expect(sanitized.enabled).toBe(DEFAULT_SETTINGS.enabled);
    expect(sanitized.sensitivity).toBe(DEFAULT_SETTINGS.sensitivity);
    expect(sanitized.showMarkers).toBe(false);
    expect(sanitized.modelMode).toBe(DEFAULT_SETTINGS.modelMode);
    expect(sanitized.siteOverrides).toEqual({ "example.com": true });
  });
});
