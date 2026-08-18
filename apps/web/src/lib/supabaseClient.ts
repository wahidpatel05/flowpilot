import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  throw new Error(
    "DeQueue: missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. " +
      "Note the variable is *_PUBLISHABLE_KEY, not *_ANON_KEY — see .env.example.",
  );
}

/**
 * One client, shared by every surface in this app. Calls the RPCs as `anon`
 * via the publishable key, which is safe to ship in a client bundle.
 */
export const supabase = createClient(url, publishableKey, {
  realtime: {
    params: { eventsPerSecond: 10 },
  },
});
