import { describe, expect, it } from "vitest";

import { sanitizeCandidates, sanitizeCount, sanitizeHostnameInput } from "../src/shared/validation";

describe("validation", () => {
  it("normalizes hostnames and rejects invalid characters", () => {
    expect(sanitizeHostnameInput(" WWW.Example.com ")).toBe("www.example.com");
    expect(sanitizeHostnameInput("bad host")).toBe("");
  });

  it("deduplicates and bounds candidate batches", () => {
    const candidates = sanitizeCandidates([
      { id: "a", text: " first line " },
      { id: "a", text: "second line" },
      { id: "", text: "ignored" },
      { id: "b", text: "valid" }
    ]);

    expect(candidates).toEqual([
      { id: "a", text: "second line" },
      { id: "b", text: "valid" }
    ]);
  });

  it("clamps reported badge counts", () => {
    expect(sanitizeCount(42.9)).toBe(42);
    expect(sanitizeCount(-5)).toBe(0);
    expect(sanitizeCount(5000)).toBe(999);
  });
});
