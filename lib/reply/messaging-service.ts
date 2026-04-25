import crypto from "node:crypto";
import { getDb } from "@/lib/runtime/db";
import { generateJson } from "@/lib/real-mode/gemini";

export type ReplyUser = {
  id: string;
  displayName: string;
};

export type ReplyBot = {
  id: string;
  name: string;
  role: string;
  personality: string;
  opener: string;
  fallbackReplies: string[];
};

export type ReplyAuthMode = "create" | "sign-in" | "auto";

export type ReplyConversation = {
  id: string;
  kind: "bot" | "human";
  title: string;
  botId: string | null;
  updatedAt: string;
  lastMessageAt: string | null;
  participants: Array<{
    id: string;
    type: "user" | "bot";
    displayName: string;
  }>;
  lastMessage: ReplyMessage | null;
  memory: string;
};

export type ReplyMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  senderType: "user" | "bot";
  senderName: string;
  body: string;
  friction: ReplyFrictionMeta;
  createdAt: string;
};

export type ReplyFrictionMeta = {
  heat?: number;
  category?: string;
  cooled?: boolean;
  softened?: boolean;
  apology?: boolean;
  sentAnyway?: boolean;
};

export const REPLY_SESSION_COOKIE = "stayhand_reply_session";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export const REPLY_BOTS: ReplyBot[] = [
  {
    id: "bot-alex",
    name: "Alex",
    role: "conflict repair partner",
    personality: "sensitive but fair; names the emotional impact and responds better to accountability than defensiveness",
    opener: "i need to talk to you about something. i saw your message in the group chat and it felt like you were making fun of my idea in front of everyone. maybe i'm reading into it, but it stung.",
    fallbackReplies: [
      "i can hear that. i just need to know you understand why it landed badly.",
      "that helps more than arguing the details. what i need is for it not to happen in front of everyone again.",
      "okay. i appreciate you saying it directly.",
    ],
  },
  {
    id: "bot-maya",
    name: "Maya",
    role: "deadline-focused coworker",
    personality: "direct, practical, low patience for vague replies; wants ownership and a specific next step",
    opener: "quick check: you told the client we'd deliver friday, but i didn't see the final files. are we actually ready or am i walking into another surprise?",
    fallbackReplies: [
      "i need a concrete answer, not a vibe. what is done and what is still moving?",
      "thanks. if you own the next update, i can stop guessing.",
      "that is clearer. send me the exact timeline and i'll adjust my side.",
    ],
  },
  {
    id: "bot-priya",
    name: "Priya",
    role: "calm mediator",
    personality: "measured, curious, and clarifying; helps turn tension into a concrete shared decision",
    opener: "before this gets bigger, can we name the actual disagreement? i think we're reacting to different versions of the problem.",
    fallbackReplies: [
      "that gives us something to work with. what decision do you want from this conversation?",
      "good. let's separate the feeling from the request so neither gets lost.",
      "that sounds fair. say the ask in one sentence and we can move.",
    ],
  },
];

type DbUserRow = {
  id: string;
  display_name: string;
};

type DbMessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_type: "user" | "bot";
  sender_name: string;
  body: string;
  friction_json: string;
  created_at: string;
};

type DbConversationRow = {
  id: string;
  kind: "bot" | "human";
  title: string;
  bot_id: string | null;
  updated_at: string;
  last_message_at: string | null;
};

function nowIso(): string {
  return new Date().toISOString();
}

function createId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(10).toString("hex")}`;
}

function hashPasscode(passcode: string): string {
  return crypto.createHash("sha256").update(`stayhand:${passcode}`).digest("hex");
}

function normalizeName(displayName: string): string {
  return displayName.trim().replace(/\s+/g, " ").slice(0, 40);
}

function mapUser(row: DbUserRow): ReplyUser {
  return { id: row.id, displayName: row.display_name };
}

function parseFriction(raw: string): ReplyFrictionMeta {
  try {
    const value = JSON.parse(raw) as ReplyFrictionMeta;
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function mapMessage(row: DbMessageRow): ReplyMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    senderType: row.sender_type,
    senderName: row.sender_name,
    body: row.body,
    friction: parseFriction(row.friction_json),
    createdAt: row.created_at,
  };
}

export function getBot(botId: string): ReplyBot | null {
  return REPLY_BOTS.find((bot) => bot.id === botId) ?? null;
}

export function signInReplyUser(
  displayNameInput: string,
  passcodeInput: string,
  mode: ReplyAuthMode = "auto"
): { user: ReplyUser; token: string; expiresAt: string } {
  const displayName = normalizeName(displayNameInput);
  const passcode = passcodeInput.trim();
  if (!displayName || !passcode) {
    throw new Error("display name and passcode are required");
  }

  const db = getDb();
  const passcodeHash = hashPasscode(passcode);
  const existing = db.prepare("SELECT id, display_name, passcode_hash FROM reply_users WHERE display_name = ? COLLATE NOCASE").get(displayName) as
    | (DbUserRow & { passcode_hash: string })
    | undefined;

  let user: ReplyUser;
  const timestamp = nowIso();
  if (existing) {
    if (mode === "create") {
      throw new Error("that account already exists");
    }
    if (existing.passcode_hash !== passcodeHash) {
      throw new Error("that name uses a different passcode");
    }
    db.prepare("UPDATE reply_users SET last_seen_at = ? WHERE id = ?").run(timestamp, existing.id);
    user = mapUser(existing);
  } else {
    if (mode === "sign-in") {
      throw new Error("account not found");
    }
    const id = createId("user");
    db.prepare("INSERT INTO reply_users (id, display_name, passcode_hash, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, displayName, passcodeHash, timestamp, timestamp);
    user = { id, displayName };
  }

  const token = createId("session");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  db.prepare("INSERT INTO reply_sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .run(token, user.id, timestamp, expiresAt);
  ensureDefaultBotConversations(user.id);
  return { user, token, expiresAt };
}

export function getReplyUserBySession(token?: string | null): ReplyUser | null {
  if (!token) return null;
  const db = getDb();
  const row = db.prepare(`
    SELECT u.id, u.display_name
    FROM reply_sessions s
    JOIN reply_users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > ?
  `).get(token, nowIso()) as DbUserRow | undefined;
  return row ? mapUser(row) : null;
}

export function clearReplySession(token?: string | null): void {
  if (!token) return;
  getDb().prepare("DELETE FROM reply_sessions WHERE token = ?").run(token);
}

export function getSessionParticipantIds(token?: string | null): string[] {
  const user = getReplyUserBySession(token);
  return user ? [user.id] : [];
}

export function getActiveSessionTokensForUsers(userIds: string[]): string[] {
  if (!userIds.length) return [];
  const placeholders = userIds.map(() => "?").join(", ");
  return getDb()
    .prepare(`SELECT token FROM reply_sessions WHERE user_id IN (${placeholders}) AND expires_at > ?`)
    .all(...userIds, nowIso())
    .map((row) => (row as { token: string }).token);
}

export function ensureDefaultBotConversations(userId: string): void {
  REPLY_BOTS.forEach((bot) => {
    openBotConversation(userId, bot.id);
  });
}

export function openBotConversation(userId: string, botId: string): ReplyConversation {
  const bot = getBot(botId);
  if (!bot) throw new Error("unknown bot");
  const db = getDb();
  const existing = db.prepare(`
    SELECT c.id, c.kind, c.title, c.bot_id, c.updated_at, c.last_message_at
    FROM reply_conversations c
    JOIN reply_participants p ON p.conversation_id = c.id
    WHERE c.kind = 'bot' AND c.bot_id = ? AND p.participant_id = ?
    LIMIT 1
  `).get(botId, userId) as DbConversationRow | undefined;

  if (existing) {
    return getConversationForUser(userId, existing.id);
  }

  const conversationId = createId("conv");
  const timestamp = nowIso();
  db.prepare("INSERT INTO reply_conversations (id, kind, title, bot_id, created_at, updated_at, last_message_at) VALUES (?, 'bot', ?, ?, ?, ?, ?)")
    .run(conversationId, bot.name, bot.id, timestamp, timestamp, timestamp);
  db.prepare("INSERT INTO reply_participants (conversation_id, participant_id, participant_type, display_name, joined_at) VALUES (?, ?, 'user', ?, ?)")
    .run(conversationId, userId, getUserName(userId), timestamp);
  db.prepare("INSERT INTO reply_participants (conversation_id, participant_id, participant_type, display_name, joined_at) VALUES (?, ?, 'bot', ?, ?)")
    .run(conversationId, bot.id, bot.name, timestamp);
  insertMessage(conversationId, bot.id, "bot", bot.name, bot.opener, {});
  updateMemory(conversationId, userId);
  return getConversationForUser(userId, conversationId);
}

function getUserName(userId: string): string {
  const row = getDb().prepare("SELECT display_name FROM reply_users WHERE id = ?").get(userId) as { display_name: string } | undefined;
  return row?.display_name ?? "Someone";
}

function assertParticipant(userId: string, conversationId: string): void {
  const row = getDb().prepare("SELECT 1 FROM reply_participants WHERE conversation_id = ? AND participant_id = ?").get(conversationId, userId);
  if (!row) throw new Error("conversation not found");
}

function getConversationRow(conversationId: string): DbConversationRow {
  const row = getDb().prepare("SELECT id, kind, title, bot_id, updated_at, last_message_at FROM reply_conversations WHERE id = ?")
    .get(conversationId) as DbConversationRow | undefined;
  if (!row) throw new Error("conversation not found");
  return row;
}

function getParticipants(conversationId: string): ReplyConversation["participants"] {
  return getDb()
    .prepare("SELECT participant_id, participant_type, display_name FROM reply_participants WHERE conversation_id = ? ORDER BY joined_at ASC")
    .all(conversationId)
    .map((row) => {
      const item = row as { participant_id: string; participant_type: "user" | "bot"; display_name: string };
      return { id: item.participant_id, type: item.participant_type, displayName: item.display_name };
    });
}

function getMemory(conversationId: string, subjectId: string): string {
  const row = getDb().prepare("SELECT summary FROM reply_memory WHERE conversation_id = ? AND subject_id = ?")
    .get(conversationId, subjectId) as { summary: string } | undefined;
  return row?.summary ?? "No memory yet.";
}

export function listConversations(userId: string): ReplyConversation[] {
  ensureDefaultBotConversations(userId);
  const rows = getDb().prepare(`
    SELECT c.id, c.kind, c.title, c.bot_id, c.updated_at, c.last_message_at
    FROM reply_conversations c
    JOIN reply_participants p ON p.conversation_id = c.id
    WHERE p.participant_id = ?
    ORDER BY COALESCE(c.last_message_at, c.updated_at) DESC
  `).all(userId) as DbConversationRow[];
  return rows
    .filter((row) => row.kind !== "bot" || (row.bot_id && getBot(row.bot_id)))
    .map((row) => hydrateConversation(row, userId));
}

export function getConversationForUser(userId: string, conversationId: string): ReplyConversation {
  assertParticipant(userId, conversationId);
  return hydrateConversation(getConversationRow(conversationId), userId);
}

function hydrateConversation(row: DbConversationRow, userId: string): ReplyConversation {
  const last = getDb().prepare("SELECT id, conversation_id, sender_id, sender_type, sender_name, body, friction_json, created_at FROM reply_messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(row.id) as DbMessageRow | undefined;
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    botId: row.bot_id,
    updatedAt: row.updated_at,
    lastMessageAt: row.last_message_at,
    participants: getParticipants(row.id),
    lastMessage: last ? mapMessage(last) : null,
    memory: getMemory(row.id, row.bot_id ?? userId),
  };
}

export function listMessages(userId: string, conversationId: string): { messages: ReplyMessage[]; memory: string; conversation: ReplyConversation } {
  assertParticipant(userId, conversationId);
  const rows = getDb()
    .prepare("SELECT id, conversation_id, sender_id, sender_type, sender_name, body, friction_json, created_at FROM reply_messages WHERE conversation_id = ? ORDER BY created_at ASC")
    .all(conversationId) as DbMessageRow[];
  const conversation = getConversationForUser(userId, conversationId);
  return { messages: rows.map(mapMessage), memory: conversation.memory, conversation };
}

function insertMessage(
  conversationId: string,
  senderId: string,
  senderType: "user" | "bot",
  senderName: string,
  body: string,
  friction: ReplyFrictionMeta
): ReplyMessage {
  const id = createId("msg");
  const timestamp = nowIso();
  const cleanBody = body.trim();
  getDb().prepare("INSERT INTO reply_messages (id, conversation_id, sender_id, sender_type, sender_name, body, friction_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(id, conversationId, senderId, senderType, senderName, cleanBody, JSON.stringify(friction), timestamp);
  getDb().prepare("UPDATE reply_conversations SET updated_at = ?, last_message_at = ? WHERE id = ?")
    .run(timestamp, timestamp, conversationId);
  return {
    id,
    conversationId,
    senderId,
    senderType,
    senderName,
    body: cleanBody,
    friction,
    createdAt: timestamp,
  };
}

export async function sendReplyMessage(
  user: ReplyUser,
  conversationId: string,
  body: string,
  friction: ReplyFrictionMeta = {}
): Promise<{ created: ReplyMessage[]; conversation: ReplyConversation }> {
  assertParticipant(user.id, conversationId);
  const conversation = getConversationRow(conversationId);
  const userMessage = insertMessage(conversationId, user.id, "user", user.displayName, body, friction);
  updateMemory(conversationId, user.id);

  const created = [userMessage];
  if (conversation.kind === "bot" && conversation.bot_id) {
    const bot = getBot(conversation.bot_id);
    if (bot) {
      const botText = await generateBotReply(conversationId, bot);
      const botMessage = insertMessage(conversationId, bot.id, "bot", bot.name, botText, {});
      updateMemory(conversationId, bot.id);
      created.push(botMessage);
    }
  }

  return { created, conversation: getConversationForUser(user.id, conversationId) };
}

async function generateBotReply(conversationId: string, bot: ReplyBot): Promise<string> {
  const rows = getDb()
    .prepare("SELECT sender_name, sender_type, body FROM reply_messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 12")
    .all(conversationId)
    .reverse() as Array<{ sender_name: string; sender_type: string; body: string }>;
  const memory = getMemory(conversationId, bot.id);
  const prompt = [
    `You are ${bot.name}, ${bot.role}.`,
    `Personality: ${bot.personality}.`,
    "You are not an assistant. Stay in character as a messaging contact.",
    "Reply in 1-3 short text-message sentences. Use lowercase unless a name needs capitalization.",
    `Memory: ${memory}`,
    "",
    "Conversation:",
    ...rows.map((row) => `${row.sender_type === "bot" ? bot.name : row.sender_name}: ${row.body}`),
    "",
    `Reply as ${bot.name}. Return JSON: { "text": "..." }`,
  ].join("\n");

  try {
    const { parsed } = await generateJson<{ text?: string }>({ prompt, temperature: 0.65, timeoutMs: 8000 });
    if (typeof parsed.text === "string" && parsed.text.trim()) {
      return parsed.text.trim();
    }
  } catch {
    // fall back below
  }
  return bot.fallbackReplies[Math.floor(Math.random() * bot.fallbackReplies.length)];
}

function updateMemory(conversationId: string, subjectId: string): void {
  const messages = getDb()
    .prepare("SELECT sender_name, body, friction_json FROM reply_messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 8")
    .all(conversationId)
    .reverse() as Array<{ sender_name: string; body: string; friction_json: string }>;
  const last = messages[messages.length - 1];
  const friction = last ? parseFriction(last.friction_json) : {};
  const flags = [
    friction.cooled ? "cooled" : "",
    friction.softened ? "softened" : "",
    friction.apology ? "apology" : "",
    friction.sentAnyway ? "sent anyway" : "",
  ].filter(Boolean);
  const summary = messages.length
    ? `Recent thread: ${messages.map((message) => `${message.sender_name}: ${message.body}`).join(" / ").slice(-900)}${flags.length ? ` | Last friction: ${flags.join(", ")}.` : ""}`
    : "No memory yet.";
  getDb().prepare("INSERT OR REPLACE INTO reply_memory (conversation_id, subject_id, summary, updated_at) VALUES (?, ?, ?, ?)")
    .run(conversationId, subjectId, summary, nowIso());
}

export function createInvite(user: ReplyUser): { token: string; urlPath: string } {
  const token = crypto.randomBytes(16).toString("hex");
  getDb().prepare("INSERT INTO reply_invites (token, inviter_id, created_at) VALUES (?, ?, ?)")
    .run(token, user.id, nowIso());
  return { token, urlPath: `/reply/invite/${token}` };
}

export function acceptInvite(user: ReplyUser, token: string): ReplyConversation {
  const db = getDb();
  const invite = db.prepare("SELECT token, inviter_id, accepted_by, conversation_id FROM reply_invites WHERE token = ?").get(token) as
    | { token: string; inviter_id: string; accepted_by: string | null; conversation_id: string | null }
    | undefined;
  if (!invite) throw new Error("invite not found");
  if (invite.inviter_id === user.id) throw new Error("you cannot accept your own invite. open this link in another browser or incognito window to accept the invite.");
  if (invite.conversation_id) {
    if (invite.accepted_by !== user.id) throw new Error("invite already accepted");
    return getConversationForUser(user.id, invite.conversation_id);
  }

  const inviterName = getUserName(invite.inviter_id);
  const conversationId = createId("conv");
  const timestamp = nowIso();
  db.prepare("INSERT INTO reply_conversations (id, kind, title, bot_id, created_at, updated_at, last_message_at) VALUES (?, 'human', ?, NULL, ?, ?, NULL)")
    .run(conversationId, `${inviterName} + ${user.displayName}`, timestamp, timestamp);
  db.prepare("INSERT INTO reply_participants (conversation_id, participant_id, participant_type, display_name, joined_at) VALUES (?, ?, 'user', ?, ?)")
    .run(conversationId, invite.inviter_id, inviterName, timestamp);
  db.prepare("INSERT INTO reply_participants (conversation_id, participant_id, participant_type, display_name, joined_at) VALUES (?, ?, 'user', ?, ?)")
    .run(conversationId, user.id, user.displayName, timestamp);
  db.prepare("UPDATE reply_invites SET accepted_by = ?, conversation_id = ?, accepted_at = ? WHERE token = ?")
    .run(user.id, conversationId, timestamp, token);
  updateMemory(conversationId, user.id);
  updateMemory(conversationId, invite.inviter_id);
  return getConversationForUser(user.id, conversationId);
}

export function getConversationParticipantIds(conversationId: string): string[] {
  return getDb()
    .prepare("SELECT participant_id FROM reply_participants WHERE conversation_id = ? AND participant_type = 'user'")
    .all(conversationId)
    .map((row) => (row as { participant_id: string }).participant_id);
}
