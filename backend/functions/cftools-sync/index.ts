// Edge Function: cftools-sync
// Called by the authenticated frontend when a player views their account page.
// Pulls their playtime on the GWARZ NAMALSK server from CFTools Cloud, and awards
// wheel spins at a rate of 1 per 4 hours played (self-correcting: always recomputed
// from total playtime, so it's safe to call this repeatedly).

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const CFTOOLS_APPLICATION_ID = Deno.env.get("CFTOOLS_APPLICATION_ID")!;
const CFTOOLS_APPLICATION_SECRET = Deno.env.get("CFTOOLS_APPLICATION_SECRET")!;
const CFTOOLS_SERVER_ID = Deno.env.get("CFTOOLS_SERVER_ID")!;
const SITE_URL = Deno.env.get("SITE_URL")!;

const SECONDS_PER_SPIN = 4 * 60 * 60; // 1 spin per 4 hours played

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

async function getCftoolsToken(): Promise<string> {
  const { data: cached } = await admin
    .from("cftools_token_cache")
    .select("token, expires_at")
    .eq("id", 1)
    .maybeSingle();

  if (cached && new Date(cached.expires_at).getTime() > Date.now() + 60_000) {
    return cached.token;
  }

  const res = await fetch("https://data.cftools.cloud/v1/auth/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": CFTOOLS_APPLICATION_ID,
    },
    body: JSON.stringify({
      application_id: CFTOOLS_APPLICATION_ID,
      secret: CFTOOLS_APPLICATION_SECRET,
    }),
  });

  if (!res.ok) {
    throw new Error(`CFTools auth failed: ${res.status} ${await res.text()}`);
  }

  const body = await res.json();
  const token = body?.token ?? body?.data?.token;
  if (!token) {
    throw new Error(`CFTools auth response had no token: ${JSON.stringify(body)}`);
  }

  const expiresAt = new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString();
  await admin.from("cftools_token_cache").upsert({ id: 1, token, expires_at: expiresAt });

  return token;
}

// Response schemas for these CFTools endpoints weren't confirmed from their docs,
// so these walk the JSON looking for a plausibly-named field rather than assuming
// one exact shape. If CFTools changes structure, check the Edge Function logs —
// unmatched responses are logged in full before failing.
function findString(obj: unknown, keys: string[]): string | null {
  if (obj === null || typeof obj !== "object") return null;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (keys.some((key) => key.toLowerCase() === k.toLowerCase()) && typeof v === "string") {
      return v;
    }
    if (typeof v === "object") {
      const found = findString(v, keys);
      if (found !== null) return found;
    }
  }
  return null;
}

function findNumber(obj: unknown, key: string): number | null {
  if (obj === null || typeof obj !== "object") return null;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (k.toLowerCase() === key.toLowerCase() && typeof v === "number") return v;
    if (typeof v === "object") {
      const found = findNumber(v, key);
      if (found !== null) return found;
    }
  }
  return null;
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

  const { data: player, error: playerError } = await admin
    .from("players")
    .select("id, steam_id, total_playtime_seconds, spins_awarded_total, spins_used_total, spins_available")
    .eq("id", user.id)
    .maybeSingle();

  if (playerError || !player) {
    return new Response(JSON.stringify({ error: "player_not_found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!player.steam_id) {
    return new Response(JSON.stringify({ error: "steam_not_linked" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const token = await getCftoolsToken();
    const authHeaders = {
      Authorization: `Bearer ${token}`,
      "User-Agent": CFTOOLS_APPLICATION_ID,
    };

    const lookupRes = await fetch(
      `https://data.cftools.cloud/v1/users/lookup?identifier=${encodeURIComponent(player.steam_id)}`,
      { headers: authHeaders }
    );
    if (!lookupRes.ok) {
      throw new Error(`CFTools user lookup failed: ${lookupRes.status} ${await lookupRes.text()}`);
    }
    const lookupBody = await lookupRes.json();
    const cftoolsId = findString(lookupBody, ["cftools_id", "id", "user_id"]);
    if (!cftoolsId) {
      console.error("CFTools lookup response had no recognizable id:", JSON.stringify(lookupBody));
      throw new Error("Could not resolve CFTools account id from lookup response");
    }

    const statsRes = await fetch(
      `https://data.cftools.cloud/v2/server/${CFTOOLS_SERVER_ID}/player?cftools_id=${encodeURIComponent(cftoolsId)}`,
      { headers: authHeaders }
    );
    if (!statsRes.ok) {
      throw new Error(`CFTools player stats failed: ${statsRes.status} ${await statsRes.text()}`);
    }
    const statsBody = await statsRes.json();
    const playtimeSeconds = findNumber(statsBody, "playtime");
    if (playtimeSeconds === null) {
      console.error("CFTools player stats response had no playtime field:", JSON.stringify(statsBody));
      throw new Error("Could not find playtime in CFTools player stats response");
    }

    const newSpinsAwardedTotal = Math.floor(playtimeSeconds / SECONDS_PER_SPIN);
    const updates: Record<string, unknown> = {
      total_playtime_seconds: Math.round(playtimeSeconds),
      updated_at: new Date().toISOString(),
      kills: findNumber(statsBody, "kills"),
      deaths: findNumber(statsBody, "deaths"),
      kd_ratio: findNumber(statsBody, "kdratio"),
      longest_kill: findNumber(statsBody, "longest_kill"),
      longest_shot: findNumber(statsBody, "longest_shot"),
      kills_infected: findNumber(statsBody, "kills_infected"),
      suicides: findNumber(statsBody, "suicides"),
    };
    if (newSpinsAwardedTotal > player.spins_awarded_total) {
      updates.spins_awarded_total = newSpinsAwardedTotal;
    }

    const { data: updated, error: updateError } = await admin
      .from("players")
      .update(updates)
      .eq("id", player.id)
      .select(
        "total_playtime_seconds, spins_awarded_total, spins_used_total, spins_available, kills, deaths, kd_ratio, longest_shot"
      )
      .single();

    if (updateError) throw updateError;

    return new Response(JSON.stringify({ ok: true, player: updated }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("cftools-sync error:", e);
    return new Response(JSON.stringify({ error: "cftools_sync_failed", detail: String(e) }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
