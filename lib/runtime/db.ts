import fs from "node:fs"; // Triggering restart for DB schema update
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { LedgerEntry, MCPServerConfig } from "@/lib/types/runtime";
import type { MessageOutcome } from "@/lib/real-mode/types";

const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "stayhand.sqlite");

let dbInstance: DatabaseSync | null = null;

function ensureDb(): DatabaseSync {
  if (dbInstance) {
    return dbInstance;
  }

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

  dbInstance = db;
  return db;
}

export function getDb(): DatabaseSync {
  return ensureDb();
}

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
    why_appeared: row.why_appeared,
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

export function validateSession(token: string): boolean {
  const db = ensureDb();
  const now = new Date().toISOString();
  const row = db.prepare("SELECT 1 FROM reply_sessions WHERE token = ? AND expires_at > ?").get(token, now);
  return !!row;
}
