/**
 * Supabase access for the shared scripts.
 *
 * Reads the publishable key from `.env.local` at the repo root — the same key
 * the web app and the Android app ship, because that is what it is for. No
 * service-role key is used or needed anywhere in DeQueue.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import type {
  CounterAssignmentRow,
  CounterRow,
  FacilityRows,
  ServiceFlowEdgeRow,
  ServiceRow,
  StaffRow,
  StaffSkillRow,
  TokenRow,
} from "../../flowpilot-core/src/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, "../..");

/** Minimal `.env` parser — one dependency fewer to explain. */
function readEnvFile(path: string): Record<string, string> {
  let contents: string;
  try {
    contents = readFileSync(path, "utf8");
  } catch {
    return {};
  }

  const values: Record<string, string> = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

export interface SupabaseConfig {
  url: string;
  publishableKey: string;
}

/**
 * The variable is `*_PUBLISHABLE_KEY`, never `*_ANON_KEY`, and this project uses
 * Supabase's new `sb_publishable_` format. Either the web or the mobile prefix
 * works, since both hold the same two values.
 */
export function loadSupabaseConfig(): SupabaseConfig {
  const fileEnv = readEnvFile(resolve(REPO_ROOT, ".env.local"));
  const env = { ...fileEnv, ...process.env };

  const url =
    env.NEXT_PUBLIC_SUPABASE_URL ??
    env.EXPO_PUBLIC_SUPABASE_URL ??
    env.SUPABASE_URL;
  const publishableKey =
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    env.SUPABASE_PUBLISHABLE_KEY;

  if (url === undefined || url === "" || publishableKey === undefined || publishableKey === "") {
    throw new Error(
      [
        "Missing Supabase credentials.",
        "Copy .env.example to .env.local at the repo root and fill in:",
        "  NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co",
        "  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...",
        "(the variable is *_PUBLISHABLE_KEY, not *_ANON_KEY)",
      ].join("\n"),
    );
  }

  return { url, publishableKey };
}

export function createDeQueueClient(config = loadSupabaseConfig()): SupabaseClient {
  // supabase-js builds its Realtime client eagerly and Node 20 has no global
  // WebSocket, so it needs a transport handed to it. Node 22+ and every browser
  // and React Native runtime already have one. This script never subscribes —
  // it is the transport for a client it does not use.
  const realtime =
    typeof globalThis.WebSocket === "undefined"
      ? { transport: WebSocket as unknown as never }
      : undefined;

  return createClient(config.url, config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(realtime === undefined ? {} : { realtime }),
  });
}

/** Column lists kept beside the projection's row shapes, so the two cannot drift. */
const SELECT = {
  services:
    "id,name,slug,default_service_minutes,healthy_wait_threshold,critical_wait_threshold",
  counters: "id,name,status",
  counterAssignments:
    "id,counter_id,staff_id,service_id,assignment_type,status,started_at,ends_at",
  tokens:
    "id,service_id,token_number,status,priority,joined_at,called_at,service_started_at,completed_at,is_simulated",
  staff: "id,name,status",
  staffSkills: "staff_id,service_id,proficiency",
  serviceFlowEdges: "from_service_id,to_service_id,expected_share,source",
} as const;

/** Fails loudly rather than projecting a facility from a half-read database. */
async function selectAll<T>(
  client: SupabaseClient,
  table: string,
  columns: string,
): Promise<T[]> {
  const { data, error } = await client.from(table).select(columns).limit(5000);
  if (error !== null) {
    throw new Error(`Failed to read public.${table}: ${error.message}`);
  }
  return (data ?? []) as unknown as T[];
}

/**
 * One read of everything `projectFacility` needs. Control subscribes narrowly in
 * production; a script that runs for twenty seconds just reads it all once.
 */
export async function fetchFacilityRows(
  client: SupabaseClient,
): Promise<FacilityRows> {
  const [
    services,
    counters,
    counterAssignments,
    tokens,
    staff,
    staffSkills,
    serviceFlowEdges,
  ] = await Promise.all([
    selectAll<ServiceRow>(client, "services", SELECT.services),
    selectAll<CounterRow>(client, "counters", SELECT.counters),
    selectAll<CounterAssignmentRow>(
      client,
      "counter_assignments",
      SELECT.counterAssignments,
    ),
    selectAll<TokenRow>(client, "tokens", SELECT.tokens),
    selectAll<StaffRow>(client, "staff", SELECT.staff),
    selectAll<StaffSkillRow>(client, "staff_skills", SELECT.staffSkills),
    selectAll<ServiceFlowEdgeRow>(
      client,
      "service_flow_edges",
      SELECT.serviceFlowEdges,
    ),
  ]);

  return {
    services,
    counters,
    counterAssignments,
    tokens,
    staff,
    staffSkills,
    serviceFlowEdges,
  };
}

/** Calls an RPC and throws its Postgres message verbatim — P0001 messages are
 *  written for humans and must never be swallowed. */
export async function rpc<T = unknown>(
  client: SupabaseClient,
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await client.rpc(name, args);
  if (error !== null) {
    throw new Error(`${name}() failed: ${error.message}`);
  }
  return data as T;
}

/** Like `rpc`, but returns the Postgres error instead of throwing it. */
export async function rpcExpectingFailure(
  client: SupabaseClient,
  name: string,
  args: Record<string, unknown> = {},
): Promise<{ message: string; code?: string } | null> {
  const { error } = await client.rpc(name, args);
  if (error === null) return null;
  const result: { message: string; code?: string } = { message: error.message };
  if (error.code !== undefined && error.code !== null) result.code = error.code;
  return result;
}
