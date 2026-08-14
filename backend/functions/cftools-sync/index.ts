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

async function getCftoolsToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh) {
    const { data: cached } = await admin
      .from("cftools_token_cache")
      .select("token, expires_at")
      .eq("id", 1)
      .maybeSingle();

    if (cached && new Date(cached.expires_at).getTime() > Date.now() + 60_000) {
      return cached.token;
    }
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

// The /v1/users/lookup response schema wasn't confirmed from CFTools' docs, so this
// still walks the JSON looking for a plausibly-named id field rather than assuming
// one exact shape. The player-stats response shape below IS confirmed (see the
// explicit dayz/omega access further down), so that part no longer needs this.
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

// Our cached token can go stale even before its recorded expiry (CFTools may
// invalidate it early). If a request comes back with a bad/expired token error,
// fetch a fresh one (bypassing the cache) and retry that request exactly once.
async function cftoolsFetch(url: string, tokenBox: { token: string }): Promise<Response> {
  const doFetch = () =>
    fetch(url, {
      headers: {
        Authorization: `Bearer ${tokenBox.token}`,
        "User-Agent": CFTOOLS_APPLICATION_ID,
      },
    });

  let res = await doFetch();
  if (res.status === 401 || res.status === 403) {
    const bodyText = await res.clone().text();
    if (bodyText.includes("bad-token") || bodyText.includes("expired-token") || bodyText.includes("token-regeneration-required")) {
      console.log("CFTools token rejected, fetching a fresh one and retrying:", bodyText);
      tokenBox.token = await getCftoolsToken(true);
      res = await doFetch();
    }
  }
  return res;
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
    const tokenBox = { token: await getCftoolsToken() };

    const lookupRes = await cftoolsFetch(
      `https://data.cftools.cloud/v1/users/lookup?identifier=${encodeURIComponent(player.steam_id)}`,
      tokenBox
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

    const statsRes = await cftoolsFetch(
      `https://data.cftools.cloud/v2/server/${CFTOOLS_SERVER_ID}/player?cftools_id=${encodeURIComponent(cftoolsId)}`,
      tokenBox
    );
    if (!statsRes.ok) {
      throw new Error(`CFTools player stats failed: ${statsRes.status} ${await statsRes.text()}`);
    }
    const statsBody = await statsRes.json();

    // The response is keyed by an opaque per-player document id (not a fixed name),
    // alongside sibling "identities"/"status" keys — find that one and drill into
    // the confirmed shape: { game: { dayz: { kills: {players, infected, ...}, ... } }, omega: { playtime } }
    const rootKey = Object.keys(statsBody).find((k) => k !== "identities" && k !== "status");
    const dayz = rootKey ? statsBody[rootKey]?.game?.dayz : undefined;
    const omega = rootKey ? statsBody[rootKey]?.omega : undefined;

    const playtimeSeconds = typeof omega?.playtime === "number" ? omega.playtime : null;
    if (playtimeSeconds === null) {
      console.error("CFTools player stats response had no playtime field:", JSON.stringify(statsBody));
      throw new Error("Could not find playtime in CFTools player stats response");
    }

    const newSpinsAwardedTotal = Math.floor(playtimeSeconds / SECONDS_PER_SPIN);
    const updates: Record<string, unknown> = {
      total_playtime_seconds: Math.round(playtimeSeconds),
      updated_at: new Date().toISOString(),
      kills: typeof dayz?.kills?.players === "number" ? dayz.kills.players : null,
      deaths: typeof dayz?.deaths === "number" ? dayz.deaths : null,
      kd_ratio: typeof dayz?.kdratio === "number" ? dayz.kdratio : null,
      longest_kill: typeof dayz?.longest_kill === "number" ? dayz.longest_kill : null,
      longest_shot: typeof dayz?.longest_shot === "number" ? dayz.longest_shot : null,
      kills_infected: typeof dayz?.kills?.infected === "number" ? dayz.kills.infected : null,
      suicides: typeof dayz?.suicides === "number" ? dayz.suicides : null,
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
