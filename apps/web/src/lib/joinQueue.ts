import { supabase } from "./supabaseClient";
import { generateTokenNumber } from "./tokenNumber";

export interface JoinedToken {
  tokenId: string;
  tokenNumber: string;
  serviceId: string;
}

/**
 * Writes a real `tokens` row for a Visitor picking a Service off the plain
 * list — the one Join Queue hop this route owns (INTEGRATION.md: "Visitor
 * joins -> Android / PWA writes tokens"). No RPC exists for this; Desk and
 * Control never insert a Visitor's Token, so the write belongs here.
 */
export async function joinQueue(
  serviceId: string,
  serviceSlug: string | undefined,
): Promise<JoinedToken> {
  const tokenNumber = generateTokenNumber(serviceSlug);
  const { data, error } = await supabase
    .from("tokens")
    .insert({
      service_id: serviceId,
      token_number: tokenNumber,
      status: "waiting",
      is_simulated: false,
    })
    .select("id,token_number,service_id")
    .single();

  if (error !== null) {
    throw new Error(`FlowPilot: could not join the queue — ${error.message}`);
  }

  return {
    tokenId: data.id as string,
    tokenNumber: data.token_number as string,
    serviceId: data.service_id as string,
  };
}
