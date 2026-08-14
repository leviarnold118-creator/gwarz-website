// Edge Function: ensure-profile
// Called by the frontend right after login. Creates the player's row if it doesn't
// exist yet, (re)fills in their Discord identity info, and returns their current
// profile — so the account page always has real data to show instead of blanks.

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

  // deno-lint-ignore no-explicit-any
  const discordIdentity = (user.identities as any[] | undefined)?.find(
    (i) => i.provider === "discord"
  );
  const identityData = discordIdentity?.identity_data ?? {};
  const discordId = identityData.provider_id ?? discordIdentity?.id ?? null;
  const discordUsername =
    identityData.full_name ?? identityData.name ?? identityData.custom_claims?.global_name ?? null;
  const discordAvatarUrl = identityData.avatar_url ?? identityData.picture ?? null;

  await admin
    .from("players")
    .upsert(
      {
        id: user.id,
        discord_id: discordId,
        discord_username: discordUsername,
        discord_avatar_url: discordAvatarUrl,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

  const { data: player, error } = await admin
    .from("players")
    .select(
      "discord_username, steam_username, steam_id, total_playtime_seconds, spins_awarded_total, spins_used_total, spins_available"
    )
    .eq("id", user.id)
    .single();

  if (error) {
    console.error("ensure-profile fetch error:", error);
    return new Response(JSON.stringify({ error: "profile_fetch_failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, player }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
