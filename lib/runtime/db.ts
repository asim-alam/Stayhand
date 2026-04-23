import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { LedgerEntry, MCPServerConfig } from "@/lib/types/runtime";

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
