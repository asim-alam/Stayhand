import type { MomentSurface, ScenarioFixture } from "@/lib/core/types";

export const SURFACE_META: Record<
  MomentSurface,
  {
    label: string;
    eyebrow: string;
    oneLiner: string;
    accent: string;
  }
> = {
  send: {
    label: "Send",
    eyebrow: "Before you send",
    oneLiner: "Catch emotional, risky, or late-night messages before regret leaves your outbox.",
    accent: "warm",
  },
  buy: {
    label: "Buy",
    eyebrow: "Before you buy",
    oneLiner: "Slow down urgent, duplicate, or misaligned purchases before they become expensive mistakes.",
    accent: "gold",
  },
  reply: {
    label: "Reply",
    eyebrow: "Before you reply",
    oneLiner: "Interpret tone on both sides and offer a safer response before conflict hardens.",
    accent: "sage",
  },
};

export const JUDGE_DEMO_ORDER: MomentSurface[] = ["send", "buy", "reply"];

const SCENARIOS: ScenarioFixture[] = [
  {
    id: "send-coworker-heat",
    surface: "send",
    title: "Emotional message to a coworker",
    summary: "A blunt message is about to go to a teammate right after a rough launch.",
    actor: "You",
    content:
      "I cannot believe you shipped this without checking with me first. This is exactly why the rollout was a mess. Fix it now.",
    context: {
      channel: "Work email",
      recipient: "Jordan, product lead",
      draftTone: "angry",
      timing: "11:42 PM",
      cues: ["late-night", "blame framing", "urgent command"],
      history: ["Tense handoff earlier today", "Shared release pressure"],
    },
    originalLabel: "Draft email",
    fallbackSuggestion:
      "I am frustrated with how the rollout landed, and I do not want to make that worse in email. Can we review what happened tomorrow morning and agree on the fixes together?",
    fallbackReflection: "This draft is clear about the issue without turning frustration into blame.",
    fallbackAlternatives: [
      "Wait until tomorrow morning and send nothing tonight.",
      "Ask for a 15-minute debrief instead of assigning fault by email.",
    ],
    featured: true,
  },
  {
    id: "send-client-blunt",
    surface: "send",
    title: "Overly blunt client follow-up",
    summary: "A stressed client update risks sounding accusatory instead of direct.",
    actor: "You",
    content:
      "We already asked for this twice. If your team cannot send the files by noon, the delay is on you, not us.",
    context: {
      channel: "Client email",
      recipient: "Nadiya, client success lead",
      draftTone: "sharp",
      timing: "2:15 PM",
      cues: ["relationship risk", "public accountability"],
      history: ["Long-running delivery delay", "Renewal conversation next week"],
    },
    originalLabel: "Client email",
    fallbackSuggestion:
      "We still need the files by noon to hold the current timeline. If that deadline no longer works for your team, tell us today and we will adjust the handoff plan together.",
    fallbackReflection: "The revised draft keeps the deadline firm without making the client defensive.",
    fallbackAlternatives: [
      "Turn the message into a checklist instead of a reprimand.",
      "Offer two next-step options so the client can recover the timeline.",
    ],
  },
  {
    id: "send-late-night-apology",
    surface: "send",
    title: "Late-night apology draft",
    summary: "The intent is good, but the timing and guilt-heavy phrasing could reopen the issue.",
    actor: "You",
    content:
      "I am sorry for everything. I know I ruin things and I should have handled tonight better. I just needed to say that right now.",
    context: {
      channel: "SMS",
      recipient: "Maya",
      draftTone: "over-apologetic",
      timing: "12:08 AM",
      cues: ["late-night", "self-judgment", "repair attempt"],
      history: ["Recent argument", "Both sides asked for a little space"],
    },
    originalLabel: "Text message",
    fallbackSuggestion:
      "I am sorry for how I handled tonight. You do not need to respond now. I want to come back to this with more care tomorrow.",
    fallbackReflection: "It keeps the repair intent while reducing pressure on the other person to respond immediately.",
    fallbackAlternatives: [
      "Save the apology and send it in the morning.",
      "Write the message in notes first and trim anything self-punishing.",
    ],
  },
  {
    id: "buy-limited-offer",
    surface: "buy",
    title: "Urgent limited-time purchase",
    summary: "A countdown checkout is pushing speed harder than judgment.",
    actor: "You",
    content: "UltraFocus Masterclass annual plan - $249 - 12 minutes left to claim 40% off.",
    context: {
      channel: "Checkout",
      merchant: "UltraFocus",
      amount: 249,
      currency: "USD",
      timing: "10:51 PM",
      cues: ["countdown pressure", "late-night browsing"],
      goals: ["Save for travel", "Reduce impulse subscriptions"],
      history: ["Two productivity subscriptions already active"],
    },
    originalLabel: "Checkout cart",
    fallbackSuggestion:
      "Compare this course against the two subscriptions you already pay for, then decide in daylight. A discount is not savings if the purchase is redundant.",
    fallbackReflection: "The friction is about alignment, not punishment. The cart is urgent, but your goals are long-lived.",
    fallbackAlternatives: [
      "Save the cart and revisit after 24 hours.",
      "Compare this purchase against what you already own before paying.",
    ],
    featured: true,
  },
  {
    id: "buy-duplicate-purchase",
    surface: "buy",
    title: "Duplicate purchase risk",
    summary: "A fast reorder looks nearly identical to something already bought recently.",
    actor: "You",
    content: "Noise-canceling headphones - $329 - Buy now",
    context: {
      channel: "Retail checkout",
      merchant: "SonicHouse",
      amount: 329,
      currency: "USD",
      timing: "3:22 PM",
      cues: ["duplicate category", "one-click checkout"],
      goals: ["Keep spending intentional"],
      history: ["Bought headphones 18 days ago", "Currently tracking gadget spending"],
    },
    originalLabel: "One-click purchase",
    fallbackSuggestion:
      "Pause and compare this purchase against the pair you bought earlier this month. If the issue is fit or battery, solve that first instead of buying a second pair by default.",
    fallbackReflection: "This is likely a duplicate decision, not a fresh need.",
    fallbackAlternatives: [
      "Save for later and check your recent orders first.",
      "Write down the actual reason you need a second pair before continuing.",
    ],
  },
  {
    id: "buy-goal-mismatch",
    surface: "buy",
    title: "Expensive purchase that conflicts with recent goals",
    summary: "The product is attractive, but it conflicts with the goals you set this week.",
    actor: "You",
    content: "Designer weekender bag - $480 - Checkout",
    context: {
      channel: "Mobile checkout",
      merchant: "Northline Atelier",
      amount: 480,
      currency: "USD",
      timing: "8:34 PM",
      cues: ["goal mismatch", "aspirational spending"],
      goals: ["Pay down card balance", "Keep April discretionary spend under $300"],
      history: ["Added to cart three times this week"],
    },
    originalLabel: "Cart",
    fallbackSuggestion:
      "This purchase looks more like mood-driven reward than a planned buy. Put it on a 24-hour hold and compare it against the budget target you set earlier this week.",
    fallbackReflection: "The pause gives your long-term goal a seat at the table.",
    fallbackAlternatives: [
      "Save the item and revisit with your budget open.",
      "Swap the impulse checkout for a compare step against your monthly goal.",
    ],
  },
  {
    id: "reply-passive-aggressive",
    surface: "reply",
    title: "Passive-aggressive coworker thread",
    summary: "The incoming note is sharp, and your draft reply is matching the tone.",
    actor: "You",
    content:
      "If you had actually read the spec, you would know why the timeline moved. I am not repeating the same explanation again.",
    context: {
      channel: "Team chat",
      recipient: "Alex, engineering manager",
      incomingMessage: "Interesting that this slipped again. I thought we had already aligned on the timeline.",
      incomingTone: "passive-aggressive",
      draftTone: "defensive",
      timing: "4:07 PM",
      cues: ["tone mirroring", "manager-visible"],
      history: ["Cross-team deadline tension", "Visible to project stakeholders"],
    },
    originalLabel: "Reply draft",
    fallbackSuggestion:
      "The timeline moved after the scope change in yesterday's review. I can summarize that change here and list the remaining dependencies so we are aligned.",
    fallbackReflection: "The safer reply answers the issue without escalating the relationship.",
    fallbackAlternatives: [
      "Respond with facts only and remove the implied blame.",
      "Take the thread to a short call if tone keeps distorting intent.",
    ],
    featured: true,
  },
  {
    id: "reply-group-chat-heat",
    surface: "reply",
    title: "Heated group chat reply",
    summary: "A group thread is turning into a pile-on and the current reply adds more heat.",
    actor: "You",
    content:
      "Everyone keeps talking in circles. If nobody wants to make a decision, stop tagging me like I am the blocker.",
    context: {
      channel: "Group chat",
      recipient: "Launch team",
      incomingMessage: "Can someone finally confirm why this keeps stalling?",
      incomingTone: "frustrated",
      draftTone: "heated",
      timing: "6:18 PM",
      cues: ["group visibility", "high heat", "blame risk"],
      history: ["Three unresolved threads today"],
    },
    originalLabel: "Group reply",
    fallbackSuggestion:
      "The blocker is the unresolved asset review. I can close that today or we can decide to ship without it. Here are the two options so we can stop looping.",
    fallbackReflection: "A calmer reply reduces heat by converting blame into a decision frame.",
    fallbackAlternatives: [
      "Name the blocker and two next steps instead of naming the frustration.",
      "Pause for five minutes before sending anything into the group thread.",
    ],
  },
  {
    id: "reply-boundary",
    surface: "reply",
    title: "Manipulative message that needs a calm boundary",
    summary: "The incoming message is emotionally loaded and the first draft reply gives away too much ground.",
    actor: "You",
    content:
      "Fine, I will rearrange everything again. I do not want another argument, so I guess I will make it work somehow.",
    context: {
      channel: "Private chat",
      recipient: "Family member",
      incomingMessage: "If you cared, you would just make time tonight instead of making excuses.",
      incomingTone: "manipulative",
      draftTone: "resentful",
      timing: "9:09 PM",
      cues: ["boundary needed", "emotional pressure"],
      history: ["Repeated last-minute asks", "You already said tonight would not work"],
    },
    originalLabel: "Boundary reply",
    fallbackSuggestion:
      "I cannot make tonight work. I can talk tomorrow after 6 PM if that still helps.",
    fallbackReflection: "The calmer reply keeps the boundary intact without feeding the pressure pattern.",
    fallbackAlternatives: [
      "State the limit once and offer one realistic alternative.",
      "Do not explain past the boundary if the message is trying to hook guilt.",
    ],
  },
];

export function listScenarios(surface?: MomentSurface): ScenarioFixture[] {
  return surface ? SCENARIOS.filter((scenario) => scenario.surface === surface) : [...SCENARIOS];
}

export function getScenario(surface: MomentSurface, scenarioId?: string): ScenarioFixture {
  const pool = listScenarios(surface);
  return pool.find((scenario) => scenario.id === scenarioId)
    || pool.find((scenario) => scenario.featured)
    || pool[0];
}
