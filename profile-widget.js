// Header profile widget: a Steam-avatar link to profile.html.
// Wrapped in an IIFE so its Supabase client doesn't collide with the one account.js
// or profile.js create on their own pages (all pages can safely load this script).
(function () {
  const SUPABASE_URL = "https://sbbklhpmbbiaxknieojc.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_117mO-KFUzYyKJfrMXAKbA_RTvzuc4I";

  const container = document.getElementById("profile-widget");
  if (!container || typeof supabase === "undefined") return;

  // Shared across scripts on this page — creating more than one client against the
  // same project causes them to interfere with each other's session detection.
  const sb = window.sb || (window.sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY));

  function renderLoggedOut() {
    container.innerHTML = `
      <a href="account.html" class="profile-avatar-btn" aria-label="Log in">
        <span class="profile-avatar-placeholder">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
            <path d="M12 12c2.7 0 4.9-2.2 4.9-4.9S14.7 2.2 12 2.2 7.1 4.4 7.1 7.1 9.3 12 12 12zm0 2.4c-3.3 0-9.8 1.6-9.8 4.9v2.5h19.6v-2.5c0-3.3-6.5-4.9-9.8-4.9z"/>
          </svg>
        </span>
      </a>
    `;
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
