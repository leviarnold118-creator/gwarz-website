// Edge Function: steam-login
// Handles both steps of linking a Steam account to the currently logged-in player:
//   1. POST (with Authorization: Bearer <supabase access token>) — returns the Steam
//      login URL to redirect the browser to.
//   2. GET with openid.mode=... (Steam redirecting the player back) — verifies the
//      response with Steam, resolves their Steam64 ID, and saves it on the player.
//
// Deploy with "Enforce JWT Verification" turned OFF — the callback from Steam carries
// no Supabase auth header at all, so auth is handled manually inside this function
// instead (via the `state` row for the callback, and the Authorization header for start).

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const STEAM_API_KEY = Deno.env.get("STEAM_API_KEY")!;
const SITE_URL = Deno.env.get("SITE_URL")!; // e.g. https://leviarnold118-creator.github.io/gwarz-website

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/steam-login`;
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

async function ensurePlayerRow(userId: string) {
  const { data } = await admin.from("players").select("id").eq("id", userId).maybeSingle();
  if (!data) {
    await admin.from("players").insert({ id: userId });
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const isCallback = url.searchParams.get("openid.mode") !== null;

  // ---- Step 2: Steam redirecting the player back ----
  if (isCallback) {
    const state = url.searchParams.get("state") ?? "";
    const { data: linkState } = await admin
      .from("steam_link_states")
      .select("player_id")
      .eq("state", state)
      .maybeSingle();

    if (!linkState) {
      return Response.redirect(`${SITE_URL}/account.html?steam_link_error=expired`, 302);
    }

    const verifyParams = new URLSearchParams(url.search);
    verifyParams.set("openid.mode", "check_authentication");
    const verifyRes = await fetch("https://steamcommunity.com/openid/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: verifyParams.toString(),
    });
    const verifyText = await verifyRes.text();

    await admin.from("steam_link_states").delete().eq("state", state);

    if (!verifyText.includes("is_valid:true")) {
      return Response.redirect(`${SITE_URL}/account.html?steam_link_error=invalid`, 302);
    }

    const claimedId = url.searchParams.get("openid.claimed_id") ?? "";
    const match = claimedId.match(/\/openid\/id\/(\d+)$/);
    if (!match) {
      return Response.redirect(`${SITE_URL}/account.html?steam_link_error=no_id`, 302);
    }
    const steamId = match[1];

    let steamUsername: string | null = null;
    let steamAvatar: string | null = null;
    try {
      const summaryRes = await fetch(
        `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_API_KEY}&steamids=${steamId}`
      );
      const summaryJson = await summaryRes.json();
      const player = summaryJson?.response?.players?.[0];
      if (player) {
        steamUsername = player.personaname ?? null;
        steamAvatar = player.avatarfull ?? null;
      }
    } catch (_e) {
      // Best-effort only — don't fail the whole link over a profile-fetch hiccup.
    }

    const { error: updateError } = await admin
      .from("players")
      .update({
        steam_id: steamId,
        steam_username: steamUsername,
        steam_avatar_url: steamAvatar,
        updated_at: new Date().toISOString(),
      })
      .eq("id", linkState.player_id);

    if (updateError) {
      return Response.redirect(`${SITE_URL}/account.html?steam_link_error=save_failed`, 302);
    }

    return Response.redirect(`${SITE_URL}/account.html?steam_linked=1`, 302);
  }

  // ---- Step 1: authenticated request asking for the Steam login URL ----
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

  await ensurePlayerRow(user.id);

  const state = crypto.randomUUID().replace(/-/g, "");
  await admin.from("steam_link_states").insert({ state, player_id: user.id });

  const returnTo = `${FUNCTION_URL}?state=${state}`;
  const params = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.return_to": returnTo,
    "openid.realm": `${SUPABASE_URL}/`,
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
  });

  const redirectUrl = `https://steamcommunity.com/openid/login?${params.toString()}`;

  return new Response(JSON.stringify({ redirectUrl }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
