// Edge Function: spin-wheel
// Spends one banked spin for the authenticated player and awards a random item.
//
// Real vanilla DayZ classnames (cross-checked against two independent DayZ item-ID
// references, 2026-08-16) — a starter set for testing the claim/spawn flow end to
// end. Adjust the list/weights/labels whenever you want different rewards; weights
// are relative (they don't need to add to 100).

const WHEEL_ITEMS = [
  { classname: "BandageDressing", label: "Bandage", weight: 25 },
  { classname: "PainkillerTablets", label: "Painkillers", weight: 20 },
  { classname: "Morphine", label: "Morphine", weight: 15 },
  { classname: "TetracyclineAntibiotics", label: "Antibiotics", weight: 10 },
  { classname: "Mag_STANAG_30Rnd", label: "M4 30rd Mag", weight: 12 },
  { classname: "Mag_AKM_30Rnd", label: "AKM 30rd Mag", weight: 10 },
  { classname: "AKM", label: "AKM Rifle", weight: 5 },
  { classname: "M4A1", label: "M4A1 Rifle", weight: 3 },
];

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SITE_URL = Deno.env.get("SITE_URL")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": new URL(SITE_URL).origin,
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

function pickWeighted(items: typeof WHEEL_ITEMS) {
  const total = items.reduce((sum, i) => sum + i.weight, 0);
  let roll = Math.random() * total;
  for (const item of items) {
    if (roll < item.weight) return item;
    roll -= item.weight;
  }
  return items[items.length - 1];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const user = await getUserFromAuthHeader(req);
  if (!user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const chosen = pickWeighted(WHEEL_ITEMS);

  const { data, error } = await admin.rpc("spin_wheel", {
    p_player_id: user.id,
    p_item_classname: chosen.classname,
    p_item_label: chosen.label,
  });

  if (error) {
    const message = error.message ?? "";
    if (message.includes("no_spins_available")) {
      return new Response(JSON.stringify({ error: "no_spins_available" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (message.includes("player_not_found")) {
      return new Response(JSON.stringify({ error: "player_not_found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.error("spin_wheel rpc error:", error);
    return new Response(JSON.stringify({ error: "spin_failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const result = Array.isArray(data) ? data[0] : data;

  return new Response(
    JSON.stringify({
      ok: true,
      reward: { classname: chosen.classname, label: chosen.label },
      spins_available: result?.spins_available,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
