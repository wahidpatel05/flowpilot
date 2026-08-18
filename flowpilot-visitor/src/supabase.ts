/**
 * The Visitor's Supabase client.
 *
 * The publishable key is designed to ship inside a client bundle — that is what
 * it is for, and no service-role key belongs anywhere in DeQueue. A Visitor
 * never has an account, so sessions are switched off entirely; that also spares
 * the app an AsyncStorage dependency it would otherwise need only for auth.
 */
import "react-native-url-polyfill/auto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * These two reads must stay literal `process.env.EXPO_PUBLIC_*` member
 * expressions. Expo inlines them at build time by static substitution, so any
 * indirection — `process.env[name]`, destructuring, a wrapper taking the name as
 * a string — leaves `undefined` in the bundle with no error at build time and an
 * unauthorised fetch much later. Verify with:
 *
 *   npx expo export --platform android && grep -a "<your-project-ref>" <bundle>
 */
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

function required(name: string, value: string | undefined): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(
      `${name} is not set. Copy .env.example to .env.local in flowpilot-visitor/ ` +
        `and restart the bundler — Expo inlines EXPO_PUBLIC_* at build time, so ` +
        `a running bundler will not pick it up.`,
    );
  }
  return value;
}

let client: SupabaseClient | undefined;

/**
 * Built on first use, not at import time. A module-scope throw would take the
 * whole app down with a red box before anything rendered; raising here lets the
 * missing variable surface on the screen's existing error state, which can say
 * what is wrong and offer a retry.
 */
export function getSupabaseClient(): SupabaseClient {
  if (client === undefined) {
    client = createClient(
      required("EXPO_PUBLIC_SUPABASE_URL", supabaseUrl),
      required("EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY", supabasePublishableKey),
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
    );
  }
  return client;
}
