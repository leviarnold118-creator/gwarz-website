// Edge Function: claim-set
// Called by shop.js when a logged-in player claims a playtime-unlocked clothing set.
// Auth is a real Supabase session (unlike mod-list-sets/mod-claim-rewards, which use
// the mod's shared secret) -- claiming only ever happens from the website. Claiming
// just records ownership; wearing the set happens later in-game via the Clothing
// tab, which asks mod-list-sets for whatever's in claimed_sets.
//
// DELETE { set_key } also lives here (not a separate function) -- it's the "Unclaim"
// button on the shop page, there mainly so claiming can be tested repeatedly without
// having to delete rows in the Supabase table editor by hand. No playtime check on
// the way out -- removing ownership doesn't need the same gate that granting it does.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SITE_URL = Deno.env.get("SITE_URL")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": new URL(SITE_URL).origin,
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
};

async function getUserFromAuthHeader(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data?.user) return null;
  return data.user;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST" && req.method !== "DELETE") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const user = await getUserFromAuthHeader(req);
  if (!user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { set_key?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!body.set_key) {
    return new Response(JSON.stringify({ error: "set_key_required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: player, error: playerError } = await admin
    .from("players")
    .select("id, total_playtime_seconds")
    .eq("id", user.id)
    .single();

  if (playerError || !player) {
    return new Response(JSON.stringify({ error: "player_not_found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (req.method === "DELETE") {
    const { error: deleteError } = await admin
      .from("claimed_sets")
      .delete()
      .eq("player_id", player.id)
      .eq("set_key", body.set_key);

    if (deleteError) {
      return new Response(JSON.stringify({ error: "unclaim_failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: set, error: setError } = await admin
    .from("clothing_sets")
    .select("key, unlock_hours, active")
    .eq("key", body.set_key)
    .maybeSingle();

  if (setError || !set || !set.active) {
    return new Response(JSON.stringify({ error: "set_not_found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const playtimeHours = (player.total_playtime_seconds || 0) / 3600;
  if (playtimeHours < set.unlock_hours) {
    return new Response(JSON.stringify({ error: "not_unlocked" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { error: insertError } = await admin
    .from("claimed_sets")
    .upsert(
      { player_id: player.id, set_key: set.key },
      { onConflict: "player_id,set_key", ignoreDuplicates: true }
    );

  if (insertError) {
    return new Response(JSON.stringify({ error: "claim_failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
