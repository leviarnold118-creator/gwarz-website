// Edge Function: claim-vehicle
// Called by vehicles.js when a logged-in player claims a playtime-unlocked vehicle.
// Auth is a real Supabase session (unlike mod-list-vehicles, which uses the mod's
// shared secret) -- claiming only ever happens from the website. Claiming just
// records ownership; spawning the vehicle happens later in-game via the Vehicles
// tab, which asks mod-list-vehicles for whatever's in claimed_vehicles.
//
// DELETE { vehicle_key } also lives here (not a separate function) -- the "Unclaim"
// button on the vehicles page, a real permanent feature letting a player drop a
// vehicle they've claimed. No playtime check on the way out -- removing ownership
// doesn't need the same gate that granting it does.

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

  let body: { vehicle_key?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!body.vehicle_key) {
    return new Response(JSON.stringify({ error: "vehicle_key_required" }), {
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
      .from("claimed_vehicles")
      .delete()
      .eq("player_id", player.id)
      .eq("vehicle_key", body.vehicle_key);

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

  const { data: vehicle, error: vehicleError } = await admin
    .from("vehicles")
    .select("key, unlock_hours, active")
    .eq("key", body.vehicle_key)
    .maybeSingle();

  if (vehicleError || !vehicle || !vehicle.active) {
    return new Response(JSON.stringify({ error: "vehicle_not_found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const playtimeHours = (player.total_playtime_seconds || 0) / 3600;
  if (playtimeHours < vehicle.unlock_hours) {
    return new Response(JSON.stringify({ error: "not_unlocked" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Vehicles are a single loadout slot, not a stackable collection like Clothing
  // Sets -- claiming a new one replaces whatever was claimed before (so the mod's
  // Vehicles tab only ever shows one option), rather than adding to a list.
  const { error: replaceError } = await admin
    .from("claimed_vehicles")
    .delete()
    .eq("player_id", player.id);

  if (replaceError) {
    return new Response(JSON.stringify({ error: "claim_failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { error: insertError } = await admin
    .from("claimed_vehicles")
    .insert({ player_id: player.id, vehicle_key: vehicle.key });

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
