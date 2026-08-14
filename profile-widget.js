// Header profile widget: a Steam-avatar link to profile.html.
// Wrapped in an IIFE so its Supabase client doesn't collide with the one account.js
// or profile.js create on their own pages (all pages can safely load this script).
(function () {
  const SUPABASE_URL = "https://sbbklhpmbbiaxknieojc.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_117mO-KFUzYyKJfrMXAKbA_RTvzuc4I";

  const container = document.getElementById("profile-widget");
  if (!container || typeof supabase === "undefined") return;

  const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  function renderLoggedOut() {
    container.innerHTML = `<a class="btn btn-ghost" href="account.html">Log In</a>`;
  }

  function renderLoggedIn(player) {
    const avatarUrl = player.steam_avatar_url || "";
    const initial = (player.discord_username || player.steam_username || "?").charAt(0).toUpperCase();
    container.innerHTML = `
      <a href="profile.html" class="profile-avatar-btn" aria-label="View profile">
        ${avatarUrl
          ? `<img src="${avatarUrl}" alt="" class="profile-avatar-img">`
          : `<span class="profile-avatar-fallback">${initial}</span>`}
      </a>
    `;
  }

  async function init() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      renderLoggedOut();
      return;
    }

    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      renderLoggedOut();
      return;
    }

    const { data: player } = await sb
      .from("players")
      .select("discord_username, steam_username, steam_avatar_url")
      .eq("id", user.id)
      .maybeSingle();

    if (!player) {
      renderLoggedOut();
      return;
    }

    renderLoggedIn(player);
  }

  init();
})();
