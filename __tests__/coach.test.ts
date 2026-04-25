import { buildFallbackAnalysis } from "../lib/real-mode/reply-service";

describe("Reply Coach Strict Validations", () => {
  it("should not invent facts for fallbacks", () => {
    const draft = "No, I can't do that.";
    const result = buildFallbackAnalysis({
      draft,
      incomingMessage: "Can you take this shift?",
      userName: "Alex",
      otherPartyName: "Manager",
    });

    // The Try message should be tightly grounded to the draft.
    // It should NOT invent reasons like "I have a doctor's appointment".
    expect(result.try_message).not.toMatch(/appointment/i);
    expect(result.try_message).not.toMatch(/busy/i);
    // It should stay close to "I can't agree to that as-is..."
    expect(result.try_message).toMatch(/can't agree to that/i);
  });

  it("should label aggressive messages appropriately and set why_appeared", () => {
    const draft = "You ALWAYS do this to me! I can't believe you.";
    const result = buildFallbackAnalysis({
      draft,
      incomingMessage: "I forgot to pick up the milk.",
      userName: "Alex",
      otherPartyName: "Partner",
    });

    expect(result.issue_type).toBe("too_aggressive");
    expect(result.why_appeared).toBe("High heat detected");
    expect(result.heat).toBeGreaterThanOrEqual(50);
  });

  it("should distill profanity and insults into a calmer rewrite", () => {
    const draft = "hello madman fuck you";
    const result = buildFallbackAnalysis({
      draft,
      incomingMessage: "Why did you ignore me?",
      userName: "Arif",
      otherPartyName: "Mehidy",
    });

    expect(result.issue_type).toBe("too_aggressive");
    expect(result.should_intervene).toBe(true);
    expect(result.try_message.toLowerCase()).not.toContain("fuck");
    expect(result.try_message.toLowerCase()).not.toContain("madman");
    expect(result.try_message.toLowerCase()).not.toEqual(draft.toLowerCase());
  });

  it("should not intercept calm, clear messages", () => {
    const draft = "That sounds good to me, see you at 5.";
    const result = buildFallbackAnalysis({
      draft,
      incomingMessage: "Want to meet at 5?",
      userName: "Alex",
      otherPartyName: "Friend",
    });

    expect(result.issue_type).toBe("none");
    expect(result.why_appeared).toBe("Routine check");
    expect(result.heat).toBeLessThan(40);
  });
});
