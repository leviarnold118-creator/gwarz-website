// Edge Function: mod-list-sets
// Called by the DayZ server mod (GwarzWebsiteGUI) to find out which clothing sets a
// player has claimed on the website. Same shared-secret auth as mod-claim-rewards --
// the mod only knows a player's SteamID, there's no Supabase session involved.
//
// GET ?steam_id=XXXX&secret=XXXX -> that player's claimed sets, each with the real
// per-slot classnames from clothing_sets, so the mod can populate the Clothing tab's
// arrow lists without needing its own copy of this data.

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
type ClothingSetRow = any;

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
    return new Response(JSON.stringify({ sets: [] }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: claims, error } = await admin
    .from("claimed_sets")
    .select(
      "set_key, clothing_sets(key, name, active, body_classname, body_label, legs_classname, legs_label, feet_classname, feet_label, gloves_classname, gloves_label, mask_classname, mask_label, headgear_classname, headgear_label)"
    )
    .eq("player_id", player.id);

  if (error) {
    return new Response(JSON.stringify({ error: "lookup_failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const sets = (claims || [])
    .map((c: ClothingSetRow) => c.clothing_sets)
    .filter((s: ClothingSetRow) => s != null && s.active)
    .map((s: ClothingSetRow) => ({
      key: s.key,
      name: s.name,
      bodyClassname: s.body_classname,
      bodyLabel: s.body_label,
      legsClassname: s.legs_classname,
      legsLabel: s.legs_label,
      feetClassname: s.feet_classname,
      feetLabel: s.feet_label,
      glovesClassname: s.gloves_classname,
      glovesLabel: s.gloves_label,
      maskClassname: s.mask_classname,
      maskLabel: s.mask_label,
      headgearClassname: s.headgear_classname,
      headgearLabel: s.headgear_label,
    }));

  return new Response(JSON.stringify({ sets }), {
    headers: { "Content-Type": "application/json" },
  });
});
