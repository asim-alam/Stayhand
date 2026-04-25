import { generateJson } from "@/lib/real-mode/gemini";

export type Turn = { role: "alex" | "user"; body: string };

type TrainerNextResult = { text: string };
type TrainerCoachResult = { comment: string; suggestion: string };

const ALEX_OPENERS = [
  "hey. so, you know how we agreed to split the utility bills 50/50? i just saw the statement and your half is three weeks late. i'm kind of stressing because the autopay is about to hit my empty savings account. what's going on with that?",
  "i need to talk to you about something. i saw your message in the group chat and honestly it felt like you were making fun of my idea in front of everyone. maybe i'm reading into it but it stung.",
  "so i found out you went to dinner with the team last night and didn't mention it. i get that it's not a big deal on paper but it's the third time this month and it's starting to feel intentional.",
  "hey, can we talk about the deadline? you told the client we'd deliver by friday but you didn't check with me first. now i'm looking at a weekend of work i didn't agree to.",
  "i don't want to make this weird but i lent you money two months ago and you haven't brought it up since. i'm not in a position where i can just forget about it.",
];

const ALEX_REPLIES: Record<string, string[]> = {
  dismissive: [
    "okay. that doesn't really address what i said though.",
    "sure. but that still leaves the actual problem sitting there.",
    "i hear you but i'm not sure that changes anything for me right now.",
  ],
  defensive: [
    "wait, are you saying this is my fault? because that's not how i see it.",
    "i feel like you're turning this around on me and that's not fair.",
    "honestly that response is making me more frustrated, not less.",
  ],
  receptive: [
    "okay. that lands better. i can work with that.",
    "thank you for saying that plainly. i think we can figure this out.",
    "fair. let's talk about the actual issue then.",
    "that's clearer. i appreciate you not just getting defensive.",
  ],
  repair: [
    "i appreciate you saying that. it means something.",
    "thank you. that actually helps a lot.",
    "okay. i believe you. let's move forward.",
  ],
};

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function heuristicAlexReply(userMessage: string): string {
  const lower = userMessage.toLowerCase();
  const isApology = ["sorry", "my fault", "i was wrong", "apologize", "my bad"].some((p) => lower.includes(p));
  if (isApology) return pickRandom(ALEX_REPLIES.repair);

  const isDismissive = ["fine", "whatever", "okay sure", "i guess", "not sure"].some((p) => lower.includes(p));
  if (isDismissive) return pickRandom(ALEX_REPLIES.dismissive);

  const isDefensive = ["you always", "you never", "that's not", "it's not my"].some((p) => lower.includes(p));
  if (isDefensive) return pickRandom(ALEX_REPLIES.defensive);

  return pickRandom(ALEX_REPLIES.receptive);
}

function heuristicCoach(draft: string): TrainerCoachResult {
  const lower = draft.toLowerCase();
  const isApology = ["sorry", "my fault", "my bad", "i was wrong"].some((p) => lower.includes(p));
  if (isApology) {
    return {
      comment: "This reads as a sincere repair. Keep it specific and resist the urge to over-explain.",
      suggestion: draft,
    };
  }
  const isDismissive = ["fine", "whatever", "i guess", "okay sure"].some((p) => lower.includes(p));
  if (isDismissive) {
    return {
      comment: "This reply is too dismissive and will likely increase the other person's stress since it doesn't address the money or the timeline.",
      suggestion: "I'm sorry, I honestly lost track of the date. Let me check my bank account right now and I'll send it over today so your savings are covered.",
    };
  }
  const isHot = ["you always", "you never", "can't believe", "shut up", "seriously?"].some((p) => lower.includes(p));
  if (isHot) {
    return {
      comment: "The absolutes in this reply ('always', 'never') will put Alex on the defensive. Your point is valid but the wording will become the argument.",
      suggestion: draft
        .replace(/you always/gi, "this keeps happening")
        .replace(/you never/gi, "this still hasn't happened"),
    };
  }
  return {
    comment: "This reply is clear and direct. It addresses the issue without adding unnecessary heat.",
    suggestion: "",
  };
}

export async function trainerNext(history: Turn[]): Promise<TrainerNextResult> {
  if (history.length === 0) {
    return { text: pickRandom(ALEX_OPENERS) };
  }

  const lastUserMsg = [...history].reverse().find((t) => t.role === "user")?.body || "";

  const prompt = [
    "You are Alex, a realistic conversational partner in a training scenario.",
    "Alex is NOT an AI assistant. Alex is a real person with feelings, boundaries, and stress.",
    "Alex stays in character. Alex never breaks the fourth wall.",
    "Alex responds naturally to what the user said — if they were dismissive, Alex pushes back. If they were kind, Alex softens.",
    "Keep responses under 40 words. Use lowercase. Sound like a real text message.",
    "",
    "Conversation so far:",
    ...history.map((t) => `${t.role}: ${t.body}`),
    "",
    "Respond as alex. Return JSON: { \"text\": \"...\" }",
  ].join("\n");

  try {
    const { parsed } = await generateJson<Partial<TrainerNextResult>>({
      prompt,
      temperature: 0.7,
      timeoutMs: 8000,
    });
    if (typeof parsed.text === "string" && parsed.text.trim()) {
      return { text: parsed.text.trim() };
    }
    return { text: heuristicAlexReply(lastUserMsg) };
  } catch {
    return { text: heuristicAlexReply(lastUserMsg) };
  }
}

export async function trainerCoach(history: Turn[], draft: string): Promise<TrainerCoachResult> {
  if (!draft.trim()) {
    return { comment: "", suggestion: "" };
  }

  const prompt = [
    "You are a communication coach reviewing a draft reply in a difficult conversation.",
    "The user is practicing replying to 'Alex' in a conflict scenario.",
    "",
    "Conversation so far:",
    ...history.map((t) => `${t.role}: ${t.body}`),
    "",
    `User's draft reply: "${draft}"`,
    "",
    "Evaluate the draft honestly. Return JSON with:",
    "- comment: 1-2 sentences on what this reply will likely cause (be specific, not preachy)",
    "- suggestion: a rewritten version that keeps the user's meaning but lowers the heat. If the original is already good, return empty string.",
  ].join("\n");

  try {
    const { parsed } = await generateJson<Partial<TrainerCoachResult>>({
      prompt,
      temperature: 0.35,
      timeoutMs: 8000,
    });
    return {
      comment: typeof parsed.comment === "string" ? parsed.comment : heuristicCoach(draft).comment,
      suggestion: typeof parsed.suggestion === "string" ? parsed.suggestion : "",
    };
  } catch {
    return heuristicCoach(draft);
  }
}
