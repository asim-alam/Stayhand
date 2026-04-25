import postgres from "postgres";
import { getDb, type StayhandMoment } from "@/lib/runtime/db";

const PG_URL = process.env.POSTGRES_URL || process.env.DATABASE_URL || null;
const USE_POSTGRES = Boolean(PG_URL);

let pgClient: ReturnType<typeof postgres> | null = null;
let pgSchemaReady: Promise<void> | null = null;

function pg() {
  if (!PG_URL) throw new Error("POSTGRES_URL is not configured");
  if (!pgClient) {
    pgClient = postgres(PG_URL, {
      ssl: "require",
      max: 5,
      idle_timeout: 20,
      connect_timeout: 30,
    });
  }
  return pgClient;
}

async function ensurePgSchema(): Promise<void> {
  if (!USE_POSTGRES) return;
  if (pgSchemaReady) return pgSchemaReady;

  pgSchemaReady = pg().unsafe(`
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
  `).then(() => undefined);

  return pgSchemaReady;
}

function mapMoment(row: any): StayhandMoment {
  return {
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
  };
}

export async function getStoredMoments(userId: string | null, anonSessionId: string | null, surface?: string, limit = 50): Promise<StayhandMoment[]> {
  if (!userId && !anonSessionId) return [];

  if (USE_POSTGRES) {
    await ensurePgSchema();
    const sql = pg();
    if (userId) {
      const rows = surface
        ? await sql`SELECT * FROM stayhand_moments WHERE user_id = ${userId} AND surface = ${surface} ORDER BY created_at DESC LIMIT ${limit}`
        : await sql`SELECT * FROM stayhand_moments WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT ${limit}`;
      return rows.map(mapMoment);
    }

    const rows = surface
      ? await sql`SELECT * FROM stayhand_moments WHERE anonymous_session_id = ${anonSessionId} AND surface = ${surface} ORDER BY created_at DESC LIMIT ${limit}`
      : await sql`SELECT * FROM stayhand_moments WHERE anonymous_session_id = ${anonSessionId} ORDER BY created_at DESC LIMIT ${limit}`;
    return rows.map(mapMoment);
  }

  const db = getDb();
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

  return (db.prepare(query).all(...(params as any[])) as any[]).map(mapMoment);
}

export async function persistStoredMoment(moment: StayhandMoment): Promise<void> {
  if (USE_POSTGRES) {
    await ensurePgSchema();
    await pg()`
      INSERT INTO stayhand_moments (
        id, user_id, anonymous_session_id, surface, created_at, title, status,
        trigger_reason, heat_before, heat_after, original_input,
        ai_review, ai_suggestion, final_output, user_action, payload_json
      ) VALUES (
        ${moment.id}, ${moment.user_id}, ${moment.anonymous_session_id}, ${moment.surface}, ${moment.created_at},
        ${moment.title}, ${moment.status}, ${moment.trigger_reason}, ${moment.heat_before}, ${moment.heat_after},
        ${moment.original_input}, ${moment.ai_review}, ${moment.ai_suggestion}, ${moment.final_output},
        ${moment.user_action}, ${moment.payload_json}
      )
      ON CONFLICT (id) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        anonymous_session_id = EXCLUDED.anonymous_session_id,
        surface = EXCLUDED.surface,
        created_at = EXCLUDED.created_at,
        title = EXCLUDED.title,
        status = EXCLUDED.status,
        trigger_reason = EXCLUDED.trigger_reason,
        heat_before = EXCLUDED.heat_before,
        heat_after = EXCLUDED.heat_after,
        original_input = EXCLUDED.original_input,
        ai_review = EXCLUDED.ai_review,
        ai_suggestion = EXCLUDED.ai_suggestion,
        final_output = EXCLUDED.final_output,
        user_action = EXCLUDED.user_action,
        payload_json = EXCLUDED.payload_json
    `;
    return;
  }

  getDb().prepare(`
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
