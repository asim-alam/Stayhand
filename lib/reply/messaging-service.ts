import crypto from "node:crypto";
import postgres from "postgres";
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
  botGenerated?: boolean;
  aiGenerated?: boolean;
  model?: string;
};

export const REPLY_SESSION_COOKIE = "stayhand_reply_session";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const PG_URL = process.env.POSTGRES_URL || process.env.DATABASE_URL || null;
const USE_POSTGRES = Boolean(PG_URL);

let pgClient: ReturnType<typeof postgres> | null = null;
let pgSchemaReady: Promise<void> | null = null;

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
  friction_json: unknown;
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

function nowIso(): string {
  return new Date().toISOString();
}

function createId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(10).toString("hex")}`;
}

function createStableId(prefix: string, value: string): string {
  return `${prefix}_${crypto.createHash("sha256").update(value).digest("hex").slice(0, 20)}`;
}

function hashPasscode(passcode: string): string {
  return crypto.createHash("sha256").update(`stayhand:${passcode}`).digest("hex");
}

function hashLegacyPasscode(passcode: string): string {
  return crypto.createHash("sha256").update(passcode).digest("hex");
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function passcodeCandidates(rawPasscode: string): string[] {
  const normalized = rawPasscode.normalize("NFKC");
  return uniqueStrings([
    rawPasscode,
    rawPasscode.trim(),
    normalized,
    normalized.trim(),
  ]).filter(Boolean);
}

function verifyStoredPasscode(storedHash: string, rawPasscode: string): { matched: boolean; needsUpgrade: boolean } {
  const candidates = passcodeCandidates(rawPasscode);
  if (!candidates.length) return { matched: false, needsUpgrade: false };

  for (const candidate of candidates) {
    if (storedHash === hashPasscode(candidate)) {
      return { matched: true, needsUpgrade: false };
    }
    if (storedHash === hashLegacyPasscode(candidate) || storedHash === candidate) {
      return { matched: true, needsUpgrade: true };
    }
  }

  return { matched: false, needsUpgrade: false };
}

function encodeSessionPayload(user: ReplyUser, expiresAt: string): string {
  const payload = Buffer.from(JSON.stringify({ id: user.id, displayName: user.displayName, expiresAt }), "utf8").toString("base64url");
  const signature = crypto.createHash("sha256").update(`${payload}:${process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY || "stayhand"}`).digest("hex").slice(0, 24);
  return `sessionv2_${payload}.${signature}`;
}

function decodeSessionPayload(token: string): { user: ReplyUser; expiresAt: string } | null {
  if (!token.startsWith("sessionv2_")) return null;
  const [payload, signature] = token.slice("sessionv2_".length).split(".");
  if (!payload || !signature) return null;
  const expected = crypto.createHash("sha256").update(`${payload}:${process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY || "stayhand"}`).digest("hex").slice(0, 24);
  if (signature !== expected) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      id?: string;
      displayName?: string;
      expiresAt?: string;
    };
    if (!parsed.id || !parsed.displayName || !parsed.expiresAt || parsed.expiresAt <= nowIso()) return null;
    return { user: { id: parsed.id, displayName: parsed.displayName }, expiresAt: parsed.expiresAt };
  } catch {
    return null;
  }
}

function normalizeName(displayName: string): string {
  return displayName.trim().replace(/\s+/g, " ").slice(0, 40);
}

function mapUser(row: DbUserRow): ReplyUser {
  return { id: row.id, displayName: row.display_name };
}

function parseFriction(raw: unknown): ReplyFrictionMeta {
  try {
    if (raw && typeof raw === "object") return raw as ReplyFrictionMeta;
    if (typeof raw === "string") {
      const parsed = JSON.parse(raw) as ReplyFrictionMeta;
      return parsed && typeof parsed === "object" ? parsed : {};
    }
    return {};
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

function pg() {
  if (!PG_URL) throw new Error("POSTGRES_URL is not configured");
  if (!pgClient) {
    pgClient = postgres(PG_URL, {
      ssl: "require",
      max: 5,
      idle_timeout: 20,
      connect_timeout: 15,
    });
  }
  return pgClient;
}

async function ensurePgSchema(): Promise<void> {
  if (!USE_POSTGRES) return;
  if (pgSchemaReady) return pgSchemaReady;
  pgSchemaReady = (async () => {
    const sql = pg();
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS reply_users (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        passcode_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_reply_users_display_name_lower ON reply_users (lower(display_name));
      CREATE TABLE IF NOT EXISTS reply_sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_reply_sessions_user_id ON reply_sessions(user_id);
      CREATE TABLE IF NOT EXISTS reply_invites (
        token TEXT PRIMARY KEY,
        inviter_id TEXT NOT NULL,
        accepted_by TEXT,
        conversation_id TEXT,
        created_at TEXT NOT NULL,
        accepted_at TEXT
      );
      CREATE TABLE IF NOT EXISTS reply_conversations (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        bot_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_message_at TEXT
      );
      CREATE TABLE IF NOT EXISTS reply_participants (
        conversation_id TEXT NOT NULL,
        participant_id TEXT NOT NULL,
        participant_type TEXT NOT NULL,
        display_name TEXT NOT NULL,
        joined_at TEXT NOT NULL,
        PRIMARY KEY (conversation_id, participant_id)
      );
      CREATE INDEX IF NOT EXISTS idx_reply_participants_participant_id ON reply_participants(participant_id);
      CREATE TABLE IF NOT EXISTS reply_messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        sender_type TEXT NOT NULL,
        sender_name TEXT NOT NULL,
        body TEXT NOT NULL,
        friction_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_reply_messages_conversation_id ON reply_messages(conversation_id, created_at);
      CREATE TABLE IF NOT EXISTS reply_memory (
        conversation_id TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        summary TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (conversation_id, subject_id)
      );
    `);
  })();
  return pgSchemaReady;
}

if (USE_POSTGRES) {
  // Eagerly initialize schema in the background to avoid blocking the first request
  void ensurePgSchema().catch((err) => console.error("[stayhand] Schema init failed:", err));
}

async function run(sqlText: string, ...params: unknown[]) {
  if (USE_POSTGRES) {
    await ensurePgSchema();
    return pg().unsafe(sqlText, params as any[]);
  }
  const sqliteSql = sqlText.replace(/\$\d+/g, "?");
  getDb().prepare(sqliteSql).run(...(params as any[]));
  return null;
}

async function all<T = any>(sqlText: string, ...params: unknown[]): Promise<T[]> {
  if (USE_POSTGRES) {
    await ensurePgSchema();
    const rows = await pg().unsafe(sqlText, params as any[]);
    return rows as unknown as T[];
  }
  const sqliteSql = sqlText.replace(/\$\d+/g, "?");
  return getDb().prepare(sqliteSql).all(...(params as any[])) as T[];
}

async function one<T = any>(sqlText: string, ...params: unknown[]): Promise<T | undefined> {
  if (USE_POSTGRES) {
    await ensurePgSchema();
    const rows = await pg().unsafe(sqlText, params as any[]);
    return (rows as unknown as T[])[0];
  }
  const sqliteSql = sqlText.replace(/\$\d+/g, "?");
  return getDb().prepare(sqliteSql).get(...(params as any[])) as T | undefined;
}

export function getBot(botId: string): ReplyBot | null {
  return REPLY_BOTS.find((bot) => bot.id === botId) ?? null;
}

export async function signInReplyUser(
  displayNameInput: string,
  passcodeInput: string,
  mode: ReplyAuthMode = "auto"
): Promise<{ user: ReplyUser; token: string; expiresAt: string }> {
  const displayName = normalizeName(displayNameInput);
  const passcode = passcodeInput.normalize("NFKC").trim();
  if (!displayName || !passcode) {
    throw new Error("display name and passcode are required");
  }

  const passcodeHash = hashPasscode(passcode);
  const existingRows = await all<DbUserRow & { passcode_hash: string }>(
    "SELECT id, display_name, passcode_hash FROM reply_users WHERE lower(display_name) = lower($1) ORDER BY created_at ASC",
    displayName
  );

  let user: ReplyUser;
  const timestamp = nowIso();
  if (existingRows.length) {
    const match = existingRows
      .map((row) => ({ row, verification: verifyStoredPasscode(row.passcode_hash, passcodeInput) }))
      .find((candidate) => candidate.verification.matched);

    if (!match) {
      if (mode === "create") {
        throw new Error("account already exists. sign in or choose another display name.");
      }
      throw new Error("that name uses a different passcode");
    }

    if (match.verification.needsUpgrade) {
      await run("UPDATE reply_users SET passcode_hash = $1 WHERE id = $2", passcodeHash, match.row.id);
    }
    await run("UPDATE reply_users SET last_seen_at = $1 WHERE id = $2", timestamp, match.row.id);
    user = mapUser(match.row);
  } else {
    if (mode === "sign-in") throw new Error("account not found. choose create account first.");
    const id = createId("user");
    await run(
      "INSERT INTO reply_users (id, display_name, passcode_hash, created_at, last_seen_at) VALUES ($1, $2, $3, $4, $5)",
      id,
      displayName,
      passcodeHash,
      timestamp,
      timestamp
    );
    user = { id, displayName };
  }

  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  const token = encodeSessionPayload(user, expiresAt);
  await run("INSERT INTO reply_sessions (token, user_id, created_at, expires_at) VALUES ($1, $2, $3, $4)", token, user.id, timestamp, expiresAt);
  // Run bot setup in the background — do NOT await so sign-in returns immediately
  void ensureDefaultBotConversations(user.id).catch(() => { /* best-effort */ });
  return { user, token, expiresAt };
}

export async function getReplyUserBySession(token?: string | null): Promise<ReplyUser | null> {
  if (!token) return null;
  const stateless = decodeSessionPayload(token);
  if (stateless) {
    return stateless.user;
  }

  const row = await one<DbUserRow>(
    `
      SELECT u.id, u.display_name
      FROM reply_sessions s
      JOIN reply_users u ON u.id = s.user_id
      WHERE s.token = $1 AND s.expires_at > $2
      LIMIT 1
    `,
    token,
    nowIso()
  );
  return row ? mapUser(row) : null;
}

export async function clearReplySession(token?: string | null): Promise<void> {
  if (!token) return;
  await run("DELETE FROM reply_sessions WHERE token = $1", token);
}

export async function getSessionParticipantIds(token?: string | null): Promise<string[]> {
  const user = await getReplyUserBySession(token);
  return user ? [user.id] : [];
}

export async function getActiveSessionTokensForUsers(userIds: string[]): Promise<string[]> {
  if (!userIds.length) return [];
  if (USE_POSTGRES) {
    await ensurePgSchema();
    const sql = pg();
    const rows = await sql<{ token: string }[]>`
      SELECT token
      FROM reply_sessions
      WHERE user_id = ANY(${sql.array(userIds)})
        AND expires_at > ${nowIso()}
    `;
    return rows.map((row) => row.token);
  }
  const placeholders = userIds.map(() => "?").join(", ");
  return getDb()
    .prepare(`SELECT token FROM reply_sessions WHERE user_id IN (${placeholders}) AND expires_at > ?`)
    .all(...userIds, nowIso())
    .map((row) => (row as { token: string }).token);
}

export async function ensureDefaultBotConversations(userId: string): Promise<void> {
  // Run all three bot setups in parallel instead of sequentially
  await Promise.all(REPLY_BOTS.map((bot) => openBotConversation(userId, bot.id)));
}

export async function openBotConversation(userId: string, botId: string): Promise<ReplyConversation> {
  const bot = getBot(botId);
  if (!bot) throw new Error("unknown bot");

  const existing = await one<DbConversationRow>(
    `
      SELECT c.id, c.kind, c.title, c.bot_id, c.updated_at, c.last_message_at
      FROM reply_conversations c
      JOIN reply_participants p ON p.conversation_id = c.id
      WHERE c.kind = 'bot' AND c.bot_id = $1 AND p.participant_id = $2
      LIMIT 1
    `,
    botId,
    userId
  );
  if (existing) return getConversationForUser(userId, existing.id);

  const conversationId = createStableId("conv", `${userId}:${bot.id}`);
  const timestamp = nowIso();
  await run(
    `
      INSERT INTO reply_conversations (id, kind, title, bot_id, created_at, updated_at, last_message_at)
      VALUES ($1, 'bot', $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO NOTHING
    `,
    conversationId,
    bot.name,
    bot.id,
    timestamp,
    timestamp,
    timestamp
  );
  await run(
    `
      INSERT INTO reply_participants (conversation_id, participant_id, participant_type, display_name, joined_at)
      VALUES ($1, $2, 'user', $3, $4)
      ON CONFLICT (conversation_id, participant_id) DO NOTHING
    `,
    conversationId,
    userId,
    await getUserName(userId),
    timestamp
  );
  await run(
    `
      INSERT INTO reply_participants (conversation_id, participant_id, participant_type, display_name, joined_at)
      VALUES ($1, $2, 'bot', $3, $4)
      ON CONFLICT (conversation_id, participant_id) DO NOTHING
    `,
    conversationId,
    bot.id,
    bot.name,
    timestamp
  );

  const countRow = await one<{ count: string | number }>("SELECT COUNT(*) AS count FROM reply_messages WHERE conversation_id = $1", conversationId);
  if (Number(countRow?.count ?? 0) === 0) {
    await insertMessage(conversationId, bot.id, "bot", bot.name, bot.opener, {});
  }
  await updateMemory(conversationId, userId);
  return getConversationForUser(userId, conversationId);
}

async function getUserName(userId: string): Promise<string> {
  const row = await one<{ display_name: string }>("SELECT display_name FROM reply_users WHERE id = $1", userId);
  return row?.display_name ?? "Someone";
}

async function assertParticipant(userId: string, conversationId: string): Promise<void> {
  const row = await one("SELECT 1 FROM reply_participants WHERE conversation_id = $1 AND participant_id = $2", conversationId, userId);
  if (!row) throw new Error("conversation not found");
}

async function getConversationRow(conversationId: string): Promise<DbConversationRow> {
  const row = await one<DbConversationRow>(
    "SELECT id, kind, title, bot_id, updated_at, last_message_at FROM reply_conversations WHERE id = $1",
    conversationId
  );
  if (!row) throw new Error("conversation not found");
  return row;
}

async function getParticipants(conversationId: string): Promise<ReplyConversation["participants"]> {
  const rows = await all<{ participant_id: string; participant_type: "user" | "bot"; display_name: string }>(
    "SELECT participant_id, participant_type, display_name FROM reply_participants WHERE conversation_id = $1 ORDER BY joined_at ASC",
    conversationId
  );
  return rows.map((row) => ({
    id: row.participant_id,
    type: row.participant_type,
    displayName: row.display_name,
  }));
}

async function getMemory(conversationId: string, subjectId: string): Promise<string> {
  const row = await one<{ summary: string }>(
    "SELECT summary FROM reply_memory WHERE conversation_id = $1 AND subject_id = $2",
    conversationId,
    subjectId
  );
  return row?.summary ?? "No memory yet.";
}

// Short-lived cache for listConversations — avoids repeated DB hits during 3s polling
const listConvCache = new Map<string, { data: ReplyConversation[]; expiresAt: number }>();

/** Call this after a message is sent to ensure next poll returns fresh data */
export function invalidateConversationCache(userIds: string[]): void {
  for (const id of userIds) listConvCache.delete(id);
}

export async function listConversations(userId: string, skipCache = false): Promise<ReplyConversation[]> {
  const cached = listConvCache.get(userId);
  if (!skipCache && cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  await ensureDefaultBotConversations(userId);
  const rows = await all<DbConversationRow>(
    `
      SELECT c.id, c.kind, c.title, c.bot_id, c.updated_at, c.last_message_at
      FROM reply_conversations c
      JOIN reply_participants p ON p.conversation_id = c.id
      WHERE p.participant_id = $1
      ORDER BY COALESCE(c.last_message_at, c.updated_at) DESC
    `,
    userId
  );
  const filtered = rows.filter((row) => row.kind !== "bot" || (row.bot_id && getBot(row.bot_id)));
  // Hydrate all conversations in parallel
  const conversations = await Promise.all(filtered.map((row) => hydrateConversation(row, userId)));
  listConvCache.set(userId, { data: conversations, expiresAt: Date.now() + 5000 });
  return conversations;
}

export async function getConversationForUser(userId: string, conversationId: string): Promise<ReplyConversation> {
  await assertParticipant(userId, conversationId);
  return hydrateConversation(await getConversationRow(conversationId), userId);
}

async function hydrateConversation(row: DbConversationRow, userId: string): Promise<ReplyConversation> {
  // Fetch last message, participants, and memory in parallel
  const [last, participants, memory] = await Promise.all([
    one<DbMessageRow>(
      `SELECT id, conversation_id, sender_id, sender_type, sender_name, body, friction_json, created_at
       FROM reply_messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 1`,
      row.id
    ),
    getParticipants(row.id),
    getMemory(row.id, row.bot_id ?? userId),
  ]);
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    botId: row.bot_id,
    updatedAt: row.updated_at,
    lastMessageAt: row.last_message_at,
    participants,
    lastMessage: last ? mapMessage(last) : null,
    memory,
  };
}

export async function listMessages(userId: string, conversationId: string): Promise<{ messages: ReplyMessage[]; memory: string; conversation: ReplyConversation }> {
  await assertParticipant(userId, conversationId);
  const rows = await all<DbMessageRow>(
    `
      SELECT id, conversation_id, sender_id, sender_type, sender_name, body, friction_json, created_at
      FROM reply_messages
      WHERE conversation_id = $1
      ORDER BY created_at ASC
    `,
    conversationId
  );
  const conversation = await getConversationForUser(userId, conversationId);
  return { messages: rows.map(mapMessage), memory: conversation.memory, conversation };
}

async function insertMessage(
  conversationId: string,
  senderId: string,
  senderType: "user" | "bot",
  senderName: string,
  body: string,
  friction: ReplyFrictionMeta
): Promise<ReplyMessage> {
  const id = createId("msg");
  const timestamp = nowIso();
  const cleanBody = body.trim();
  await run(
    `
      INSERT INTO reply_messages (id, conversation_id, sender_id, sender_type, sender_name, body, friction_json, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
    id,
    conversationId,
    senderId,
    senderType,
    senderName,
    cleanBody,
    JSON.stringify(friction),
    timestamp
  );
  await run("UPDATE reply_conversations SET updated_at = $1, last_message_at = $2 WHERE id = $3", timestamp, timestamp, conversationId);
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
  await assertParticipant(user.id, conversationId);
  const conversation = await getConversationRow(conversationId);
  const userMessage = await insertMessage(conversationId, user.id, "user", user.displayName, body, friction);
  // Run memory update in background — don't block the response
  void updateMemory(conversationId, user.id).catch(() => {});

  const created = [userMessage];
  if (conversation.kind === "bot" && conversation.bot_id) {
    const bot = getBot(conversation.bot_id);
    if (bot) {
      const botReply = await generateBotReply(conversationId, bot);
      const botMessage = await insertMessage(conversationId, bot.id, "bot", bot.name, botReply.text, {
        botGenerated: true,
        aiGenerated: botReply.live,
        model: botReply.model ?? undefined,
      });
      // Bot memory update also in background
      void updateMemory(conversationId, bot.id).catch(() => {});
      created.push(botMessage);
    }
  }

  // Hydrate conversation in parallel with the response serialization
  const hydratedConversation = await getConversationForUser(user.id, conversationId);
  return { created, conversation: hydratedConversation };
}

async function generateBotReply(conversationId: string, bot: ReplyBot): Promise<{ text: string; live: boolean; model: string | null }> {
  const rows = (await all<{ sender_name: string; sender_type: string; body: string }>(
    "SELECT sender_name, sender_type, body FROM reply_messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 12",
    conversationId
  )).reverse();
  const memory = await getMemory(conversationId, bot.id);
  const prompt = [
    `You are ${bot.name}, ${bot.role}.`,
    `Personality: ${bot.personality}.`,
    "You are not an assistant. Stay in character as a messaging contact.",
    "Reply in 1-3 short text-message sentences. Use lowercase unless a name needs capitalization.",
    "Respond to the user's latest message directly and move the conversation forward.",
    "Do not reuse canned demo replies. Write a fresh reply for this exact thread.",
    `Memory: ${memory}`,
    "",
    "Conversation:",
    ...rows.map((row) => `${row.sender_type === "bot" ? bot.name : row.sender_name}: ${row.body}`),
    "",
    `Reply as ${bot.name}. Return JSON: { "text": "..." }`,
  ].join("\n");

  try {
    const { parsed, model } = await generateJson<{ text?: string }>({ prompt, temperature: 0.65, timeoutMs: 30000 });
    if (typeof parsed.text === "string" && parsed.text.trim()) {
      return { text: parsed.text.trim(), live: true, model };
    }
  } catch (error) {
    console.warn("[reply bot] live generation failed:", error instanceof Error ? error.message : "unknown error");
  }
  return {
    text: bot.fallbackReplies[Math.floor(Math.random() * bot.fallbackReplies.length)],
    live: false,
    model: null,
  };
}

async function updateMemory(conversationId: string, subjectId: string): Promise<void> {
  const messages = (await all<{ sender_name: string; body: string; friction_json: unknown }>(
    "SELECT sender_name, body, friction_json FROM reply_messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 8",
    conversationId
  )).reverse();
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
  await run(
    `
      INSERT INTO reply_memory (conversation_id, subject_id, summary, updated_at)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (conversation_id, subject_id) DO UPDATE
      SET summary = EXCLUDED.summary, updated_at = EXCLUDED.updated_at
    `,
    conversationId,
    subjectId,
    summary,
    nowIso()
  );
}

export async function createInvite(user: ReplyUser): Promise<{ token: string; urlPath: string }> {
  const token = crypto.randomBytes(16).toString("hex");
  await run("INSERT INTO reply_invites (token, inviter_id, created_at) VALUES ($1, $2, $3)", token, user.id, nowIso());
  return { token, urlPath: `/reply/invite/${token}` };
}

export async function acceptInvite(user: ReplyUser, token: string): Promise<ReplyConversation> {
  const invite = await one<{ token: string; inviter_id: string; accepted_by: string | null; conversation_id: string | null }>(
    "SELECT token, inviter_id, accepted_by, conversation_id FROM reply_invites WHERE token = $1",
    token
  );
  if (!invite) throw new Error("invite not found");
  if (invite.inviter_id === user.id) throw new Error("you cannot accept your own invite. open this link in another browser or incognito window to accept the invite.");
  if (invite.conversation_id) {
    if (invite.accepted_by !== user.id) throw new Error("invite already accepted");
    return getConversationForUser(user.id, invite.conversation_id);
  }

  const inviterName = await getUserName(invite.inviter_id);
  const conversationId = createId("conv");
  const timestamp = nowIso();
  await run(
    "INSERT INTO reply_conversations (id, kind, title, bot_id, created_at, updated_at, last_message_at) VALUES ($1, 'human', $2, NULL, $3, $4, NULL)",
    conversationId,
    `${inviterName} + ${user.displayName}`,
    timestamp,
    timestamp
  );
  await run(
    "INSERT INTO reply_participants (conversation_id, participant_id, participant_type, display_name, joined_at) VALUES ($1, $2, 'user', $3, $4)",
    conversationId,
    invite.inviter_id,
    inviterName,
    timestamp
  );
  await run(
    "INSERT INTO reply_participants (conversation_id, participant_id, participant_type, display_name, joined_at) VALUES ($1, $2, 'user', $3, $4)",
    conversationId,
    user.id,
    user.displayName,
    timestamp
  );
  await run("UPDATE reply_invites SET accepted_by = $1, conversation_id = $2, accepted_at = $3 WHERE token = $4", user.id, conversationId, timestamp, token);
  await updateMemory(conversationId, user.id);
  await updateMemory(conversationId, invite.inviter_id);
  return getConversationForUser(user.id, conversationId);
}

export async function getConversationParticipantIds(conversationId: string): Promise<string[]> {
  const rows = await all<{ participant_id: string }>(
    "SELECT participant_id FROM reply_participants WHERE conversation_id = $1 AND participant_type = 'user'",
    conversationId
  );
  return rows.map((row) => row.participant_id);
}
