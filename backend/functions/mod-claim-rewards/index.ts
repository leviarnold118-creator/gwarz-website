// Edge Function: mod-claim-rewards
// Called by the DayZ server mod (GwarzWebsiteGUI), not by the website. Auth is a
// shared secret — there's no Supabase login involved here, since the mod only knows
// a player's SteamID, not a website session. Accepted either as the X-Mod-Secret
// header OR a ?secret= query param (DayZ's Enfusion REST API's custom-header syntax
// wasn't something we could verify in advance, so the query param is the reliable
// fallback the mod actually uses).
//
// GET  ?steam_id=XXXX&secret=XXXX          -> list that player's pending rewards
// POST ?secret=XXXX  { reward_id: "..." }  -> mark one reward as claimed

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MOD_SHARED_SECRET = Deno.env.get("MOD_SHARED_SECRET")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function checkSecret(req: Request, url: URL): boolean {
  const provided = req.headers.get("X-Mod-Secret") ?? url.searchParams.get("secret") ?? "";
  return provided.length > 0 && provided === MOD_SHARED_SECRET;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (!checkSecret(req, url)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (req.method === "GET") {
    const steamId = url.searchParams.get("steam_id") ?? "";
    if (!steamId) {
      return new Response(JSON.stringify({ error: "steam_id_required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: player } = await admin
      .from("players")
      .select("id")
      .eq("steam_id", steamId)
      .maybeSingle();

    if (!player) {
      return new Response(JSON.stringify({ rewards: [] }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: rewards, error } = await admin
      .from("rewards")
      .select("id, item_classname, item_label, created_at")
      .eq("player_id", player.id)
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    if (error) {
      return new Response(JSON.stringify({ error: "lookup_failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ rewards }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (req.method === "POST") {
    let body: { reward_id?: string };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "invalid_json" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!body.reward_id) {
      return new Response(JSON.stringify({ error: "reward_id_required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: updated, error } = await admin
      .from("rewards")
      .update({ status: "claimed", claimed_at: new Date().toISOString() })
      .eq("id", body.reward_id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (error) {
      return new Response(JSON.stringify({ error: "claim_failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!updated) {
      return new Response(JSON.stringify({ error: "reward_not_found_or_already_claimed" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response("Method not allowed", { status: 405 });
});
