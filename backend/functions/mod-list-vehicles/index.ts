// Edge Function: mod-list-vehicles
// Called by the DayZ server mod (GwarzWebsiteGUI) to find out which vehicles a
// player has claimed on the website. Same shared-secret auth as mod-list-sets --
// the mod only knows a player's SteamID, there's no Supabase session involved.
//
// GET ?steam_id=XXXX&secret=XXXX -> that player's claimed vehicles, each with the
// real classname from the vehicles table, so the mod can populate the Vehicles tab
// without needing its own copy of this data.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MOD_SHARED_SECRET = Deno.env.get("MOD_SHARED_SECRET")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function checkSecret(req: Request, url: URL): boolean {
  const provided = req.headers.get("X-Mod-Secret") ?? url.searchParams.get("secret") ?? "";
  return provided.length > 0 && provided === MOD_SHARED_SECRET;
}

// deno-lint-ignore no-explicit-any
type VehicleRow = any;

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (!checkSecret(req, url)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

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
    return new Response(JSON.stringify({ vehicles: [] }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: claims, error } = await admin
    .from("claimed_vehicles")
    .select("vehicle_key, vehicles(key, name, classname, parts, active)")
    .eq("player_id", player.id);

  if (error) {
    return new Response(JSON.stringify({ error: "lookup_failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const vehicles = (claims || [])
    .map((c: VehicleRow) => c.vehicles)
    .filter((v: VehicleRow) => v != null && v.active)
    .map((v: VehicleRow) => ({
      key: v.key,
      name: v.name,
      classname: v.classname,
      parts: v.parts || [],
    }));

  return new Response(JSON.stringify({ vehicles }), {
    headers: { "Content-Type": "application/json" },
  });
});
