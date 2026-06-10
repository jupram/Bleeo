import { describe, expect, it } from "vitest";

import { classifyCandidates, isAggregateCandidateText, isCandidateText, scoreSensationalism } from "../src/shared/heuristics";

describe("heuristics", () => {
  it("identifies viable candidate text blocks", () => {
    expect(isCandidateText("BREAKING: Shocking footage leaves viewers speechless!")).toBe(true);
    expect(isCandidateText("short")).toBe(false);
  });

  it("accepts longer aggregate social posts", () => {
    expect(
      isAggregateCandidateText(
        "this guy vibe coded an AI SURVIVAL APP that works COMPLETELY OFFLINE and now everyone is arguing about it"
      )
    ).toBe(true);
  });

  it("scores sensational language above calm reporting", () => {
    const sensational = scoreSensationalism("BREAKING: You won't believe the shocking chaos unfolding now!!!");
    const calm = scoreSensationalism("City council approves revised public transit budget after debate.");

    expect(sensational.score).toBeGreaterThan(calm.score);
    expect(sensational.reasonCode).not.toBe("neutral");
  });

  it("classifies based on sensitivity threshold", () => {
    const candidates = [
      { id: "a", text: "BREAKING: You won't believe this shocking chaos as furious viewers demand answers!!!" },
      { id: "b", text: "Local library extends weekend hours after community feedback." }
    ];

    const results = classifyCandidates(candidates, "medium");
    expect(results[0]?.label).toBe("sensational");
    expect(results[1]?.label).toBe("safe");
  });

  it("keeps borderline text sensitivity-dependent", () => {
    const candidates = [{ id: "a", text: "Hidden danger in your kitchen before it's too late" }];

    expect(classifyCandidates(candidates, "high")[0]?.label).toBe("sensational");
    expect(classifyCandidates(candidates, "medium")[0]?.label).toBe("safe");
    expect(classifyCandidates(candidates, "low")[0]?.label).toBe("safe");
  });

  it("filters uppercase-emphasis posts on social hosts", () => {
    const candidates = [{ id: "a", text: "THIS IS EXACTLY WHY I AM NEVER GOING BACK THERE AGAIN" }];

    const results = classifyCandidates(candidates, "low", "reddit.com");
    expect(results[0]?.label).toBe("sensational");
    expect(results[0]?.reasonCode).toMatch(/^social-/);
  });

  it("does not auto-filter ordinary capitalization on non-social hosts", () => {
    const result = scoreSensationalism("The Mayor Said New Transit Rules Begin Monday.", "cnn.com");
    expect(result.reasonCode).not.toMatch(/^social-/);
  });

  it("does not match alarm words inside ordinary words", () => {
    const result = scoreSensationalism("Community courage grows after students organize a calm weekend fundraiser.");
    expect(result.reasonCode).toBe("neutral");
    expect(result.score).toBe(0);
  });

  it("detects fear-appeal wording even without heavy punctuation", () => {
    const results = classifyCandidates(
      [{ id: "a", text: "This hidden danger in your kitchen could happen to you before it's too late" }],
      "medium"
    );

    expect(results[0]?.label).toBe("sensational");
    expect(results[0]?.reasonCode).toBe("fear-appeal");
  });

  it("detects outrage bait without all-caps text", () => {
    const results = classifyCandidates(
      [{ id: "a", text: "People are furious after the shocking decision sends shockwaves through the city" }],
      "medium"
    );

    expect(results[0]?.label).toBe("sensational");
    expect(results[0]?.reasonCode).toBe("outrage-bait");
  });

  it("detects curiosity-gap hooks", () => {
    const results = classifyCandidates(
      [{ id: "a", text: "Nobody is talking about the hidden truth behind this urgent warning" }],
      "medium"
    );

    expect(results[0]?.label).toBe("sensational");
    expect(results[0]?.reasonCode).toBe("curiosity-gap");
  });

  it("keeps calm civic reporting below the medium threshold", () => {
    const results = classifyCandidates(
      [{ id: "a", text: "Officials test emergency warning system during scheduled preparedness drill" }],
      "medium"
    );

    expect(results[0]?.label).toBe("safe");
    expect(results[0]?.score).toBeLessThan(0.68);
  });

  it("does not auto-filter mixed-case social posts with only a few uppercase words", () => {
    const results = classifyCandidates(
      [{ id: "a", text: "this guy vibe coded an AI SURVIVAL APP that works COMPLETELY OFFLINE" }],
      "low",
      "x.com"
    );

    expect(results[0]?.label).toBe("safe");
  });

  it("filters uppercase hook prefixes on social posts", () => {
    const results = classifyCandidates(
      [{ id: "a", text: "BREAKING: this changes everything for creators on X" }],
      "low",
      "x.com"
    );

    expect(results[0]?.label).toBe("sensational");
    expect(results[0]?.reasonCode).toBe("social-uppercase-hook");
  });

  it("filters social posts with a leading all-caps headline", () => {
    const results = classifyCandidates(
      [
        {
          id: "a",
          text:
            "THE BEST OPEN-SOURCE AI AGENT REPO I'VE SEEN IN A WHILE most agent repos are just glorified prompt folders. this one actually feels like a real team."
        }
      ],
      "low",
      "x.com"
    );

    expect(results[0]?.label).toBe("sensational");
    expect(results[0]?.reasonCode).toBe("social-uppercase-headline");
  });
});
