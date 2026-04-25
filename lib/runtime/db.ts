import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { LedgerEntry, MCPServerConfig } from "@/lib/types/runtime";
import type { MessageOutcome } from "@/lib/real-mode/types";

function resolveDbPath(): string {
  if (process.env.STAYHAND_DB_PATH) return process.env.STAYHAND_DB_PATH;
  if (process.env.VERCEL) return path.join(os.tmpdir(), "stayhand.sqlite");
  return path.join(process.cwd(), "data", "stayhand.sqlite");
}

const dbPath = resolveDbPath();
const dataDir = path.dirname(dbPath);

let dbInstance: DatabaseSync | null = null;

// ─── Schema Migrations ──────────────────────────────────────────────────────

function hasColumn(db: DatabaseSync, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((r) => r.name === column);
}

function tableExists(db: DatabaseSync, table: string): boolean {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table) as { name: string } | undefined;
  return !!row;
}

function applyMigrations(db: DatabaseSync): void {
  // Ensure migration tracking table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(
    (db.prepare("SELECT version FROM schema_migrations").all() as Array<{ version: string }>).map((r) => r.version)
  );

  const migrate = (version: string, fn: () => void) => {
    if (applied.has(version)) return;
    fn();
    db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(version, new Date().toISOString());
    if (process.env.NODE_ENV === "development") console.log(`[DB] Applied migration: ${version}`);
  };

  // M001: Add user_id to message_outcomes if missing
  migrate("M001_message_outcomes_user_id", () => {
    if (tableExists(db, "message_outcomes") && !hasColumn(db, "message_outcomes", "user_id")) {
      db.exec(`ALTER TABLE message_outcomes ADD COLUMN user_id TEXT NOT NULL DEFAULT 'unknown';`);
    }
  });

  // M002: Add why_appeared to message_outcomes if missing
  migrate("M002_message_outcomes_why_appeared", () => {
    if (tableExists(db, "message_outcomes") && !hasColumn(db, "message_outcomes", "why_appeared")) {
      db.exec(`ALTER TABLE message_outcomes ADD COLUMN why_appeared TEXT NOT NULL DEFAULT 'Routine check';`);
    }
  });

  // M003: Create unified stayhand_moments table
  migrate("M003_stayhand_moments", () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS stayhand_moments (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        anonymous_session_id TEXT,
        surface TEXT NOT NULL,
        created_at TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        trigger_reason TEXT,
        heat_before INTEGER,
        heat_after INTEGER,
        original_input TEXT,
        ai_review TEXT,
        ai_suggestion TEXT,
        final_output TEXT,
        user_action TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_moments_user_ts
        ON stayhand_moments(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_moments_anon_ts
        ON stayhand_moments(anonymous_session_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_moments_surface
        ON stayhand_moments(surface, created_at DESC);
    `);
  });
}

// ─── DB Initialization ───────────────────────────────────────────────────────

function ensureDb(): DatabaseSync {
  if (dbInstance) return dbInstance;

  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS mcp_servers (
      name TEXT PRIMARY KEY,
      config_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS plugin_states (
      id TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ledger_entries (
      id TEXT PRIMARY KEY,
      ts TEXT NOT NULL,
      source_id TEXT NOT NULL,
      mode TEXT NOT NULL,
      action TEXT NOT NULL,
      summary TEXT NOT NULL,
      saved INTEGER,
      heat INTEGER,
      quotient INTEGER
    );
    CREATE TABLE IF NOT EXISTS reply_users (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL COLLATE NOCASE,
      passcode_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_reply_users_display_name ON reply_users(display_name);
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
      friction_json TEXT NOT NULL,
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
    CREATE TABLE IF NOT EXISTS message_outcomes (
      id TEXT PRIMARY KEY,
      surface TEXT NOT NULL,
      user_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      other_person_name TEXT NOT NULL,
      user_name TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      latest_incoming_message TEXT NOT NULL,
      user_draft TEXT NOT NULL,
      ai_review TEXT NOT NULL,
      why_appeared TEXT NOT NULL,
      warning_badge TEXT,
      reply_type TEXT NOT NULL,
      issue_type TEXT NOT NULL,
      heat_before INTEGER NOT NULL,
      heat_after INTEGER NOT NULL,
      try_message TEXT NOT NULL,
      final_sent_message TEXT NOT NULL,
      user_action TEXT NOT NULL,
      outcome_summary TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_message_outcomes_ts ON message_outcomes(timestamp);
  `);

  // Apply any pending migrations (safe column adds, new tables)
  applyMigrations(db);

  dbInstance = db;
  return db;
}

export function getDb(): DatabaseSync {
  return ensureDb();
}

// ─── MCP / Plugins / Ledger ──────────────────────────────────────────────────

export function getSavedMcpServers(): MCPServerConfig[] {
  const db = ensureDb();
  const rows = db.prepare("SELECT config_json FROM mcp_servers ORDER BY name ASC").all() as Array<{ config_json: string }>;
  return rows.map((row) => JSON.parse(row.config_json) as MCPServerConfig);
}

export function saveMcpServer(config: MCPServerConfig): void {
  const db = ensureDb();
  db.prepare("INSERT OR REPLACE INTO mcp_servers (name, config_json) VALUES (?, ?)").run(config.name, JSON.stringify(config));
}

export function removeMcpServer(name: string): void {
  const db = ensureDb();
  db.prepare("DELETE FROM mcp_servers WHERE name = ?").run(name);
}

export function getPluginState(id: string): boolean | null {
  const db = ensureDb();
  const row = db.prepare("SELECT enabled FROM plugin_states WHERE id = ?").get(id) as { enabled: number } | undefined;
  return row ? Boolean(row.enabled) : null;
}

export function savePluginState(id: string, enabled: boolean): void {
  const db = ensureDb();
  db.prepare("INSERT OR REPLACE INTO plugin_states (id, enabled) VALUES (?, ?)").run(id, enabled ? 1 : 0);
}

export function getLedgerEntries(limit = 20): LedgerEntry[] {
  const db = ensureDb();
  const rows = db
    .prepare("SELECT id, ts, source_id, mode, action, summary, saved, heat, quotient FROM ledger_entries ORDER BY ts DESC LIMIT ?")
    .all(limit) as Array<{
      id: string;
      ts: string;
      source_id: string;
      mode: LedgerEntry["mode"];
      action: string;
      summary: string;
      saved: number | null;
      heat: number | null;
      quotient: number | null;
    }>;

  return rows.map((row) => ({
    id: row.id,
    ts: row.ts,
    sourceId: row.source_id,
    mode: row.mode,
    action: row.action,
    summary: row.summary,
    saved: row.saved ?? undefined,
    heat: row.heat ?? undefined,
    quotient: row.quotient ?? undefined,
  }));
}

export function persistLedgerEntry(entry: LedgerEntry): void {
  const db = ensureDb();
  db.prepare(
    "INSERT OR REPLACE INTO ledger_entries (id, ts, source_id, mode, action, summary, saved, heat, quotient) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(entry.id, entry.ts, entry.sourceId, entry.mode, entry.action, entry.summary, entry.saved ?? null, entry.heat ?? null, entry.quotient ?? null);
}

// ─── Message Outcomes (legacy, Reply-only) ───────────────────────────────────

export function getMessageOutcomes(userId: string, limit = 50): MessageOutcome[] {
  const db = ensureDb();
  const rows = db.prepare("SELECT * FROM message_outcomes WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?").all(userId, limit) as any[];
  return rows.map((row) => ({
    id: row.id,
    surface: row.surface,
    user_id: row.user_id,
    conversation_id: row.conversation_id,
    other_person_name: row.other_person_name,
    user_name: row.user_name,
    timestamp: row.timestamp,
    latest_incoming_message: row.latest_incoming_message,
    user_draft: row.user_draft,
    ai_review: row.ai_review,
    why_appeared: row.why_appeared ?? "Routine check",
    warning_badge: row.warning_badge,
    reply_type: row.reply_type,
    issue_type: row.issue_type,
    heat_before: row.heat_before,
    heat_after: row.heat_after,
    try_message: row.try_message,
    final_sent_message: row.final_sent_message,
    user_action: row.user_action,
    outcome_summary: row.outcome_summary,
  }));
}

export function persistMessageOutcome(outcome: MessageOutcome): void {
  const db = ensureDb();
  db.prepare(`
    INSERT OR REPLACE INTO message_outcomes (
      id, surface, user_id, conversation_id, other_person_name, user_name, timestamp,
      latest_incoming_message, user_draft, ai_review, why_appeared, warning_badge,
      reply_type, issue_type, heat_before, heat_after, try_message,
      final_sent_message, user_action, outcome_summary
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    outcome.id, outcome.surface, outcome.user_id, outcome.conversation_id, outcome.other_person_name, outcome.user_name, outcome.timestamp,
    outcome.latest_incoming_message, outcome.user_draft, outcome.ai_review, outcome.why_appeared, outcome.warning_badge,
    outcome.reply_type, outcome.issue_type, outcome.heat_before, outcome.heat_after, outcome.try_message,
    outcome.final_sent_message, outcome.user_action, outcome.outcome_summary
  );
}

// ─── Unified Stayhand Moments ────────────────────────────────────────────────

export type StayhandMoment = {
  id: string;
  user_id: string | null;
  anonymous_session_id: string | null;
  surface: "reply" | "send" | "buy";
  created_at: string;
  title: string;
  status: "completed" | "dismissed" | "cooled" | "abandoned";
  trigger_reason: string | null;
  heat_before: number | null;
  heat_after: number | null;
  original_input: string | null;
  ai_review: string | null;
  ai_suggestion: string | null;
  final_output: string | null;
  user_action: string;
  payload_json: string;
};

export function getMoments(userId: string | null, anonSessionId: string | null, surface?: string, limit = 50): StayhandMoment[] {
  const db = ensureDb();
  if (!userId && !anonSessionId) return [];

  let query: string;
  let params: (string | number)[];

  if (userId) {
    query = surface
      ? "SELECT * FROM stayhand_moments WHERE user_id = ? AND surface = ? ORDER BY created_at DESC LIMIT ?"
      : "SELECT * FROM stayhand_moments WHERE user_id = ? ORDER BY created_at DESC LIMIT ?";
    params = surface ? [userId, surface, limit] : [userId, limit];
  } else {
    query = surface
      ? "SELECT * FROM stayhand_moments WHERE anonymous_session_id = ? AND surface = ? ORDER BY created_at DESC LIMIT ?"
      : "SELECT * FROM stayhand_moments WHERE anonymous_session_id = ? ORDER BY created_at DESC LIMIT ?";
    params = surface ? [anonSessionId!, surface, limit] : [anonSessionId!, limit];
  }

  return (db.prepare(query).all(...params) as any[]).map((row) => ({
    id: row.id,
    user_id: row.user_id,
    anonymous_session_id: row.anonymous_session_id,
    surface: row.surface,
    created_at: row.created_at,
    title: row.title,
    status: row.status,
    trigger_reason: row.trigger_reason,
    heat_before: row.heat_before,
    heat_after: row.heat_after,
    original_input: row.original_input,
    ai_review: row.ai_review,
    ai_suggestion: row.ai_suggestion,
    final_output: row.final_output,
    user_action: row.user_action,
    payload_json: row.payload_json,
  }));
}

export function persistMoment(moment: StayhandMoment): void {
  const db = ensureDb();
  db.prepare(`
    INSERT OR REPLACE INTO stayhand_moments (
      id, user_id, anonymous_session_id, surface, created_at, title, status,
      trigger_reason, heat_before, heat_after, original_input,
      ai_review, ai_suggestion, final_output, user_action, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    moment.id, moment.user_id, moment.anonymous_session_id, moment.surface,
    moment.created_at, moment.title, moment.status,
    moment.trigger_reason, moment.heat_before, moment.heat_after,
    moment.original_input, moment.ai_review, moment.ai_suggestion,
    moment.final_output, moment.user_action, moment.payload_json
  );
}

// ─── Session Validation ───────────────────────────────────────────────────────

export function validateSession(token: string): boolean {
  const db = ensureDb();
  const now = new Date().toISOString();
  const row = db.prepare("SELECT 1 FROM reply_sessions WHERE token = ? AND expires_at > ?").get(token, now);
  return !!row;
}
