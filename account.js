// Account page: Discord login, Steam linking, logout. Playtime sync, spins, and
// rewards live on wheel.html — this page only handles account identity.

const SUPABASE_URL = "https://sbbklhpmbbiaxknieojc.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_117mO-KFUzYyKJfrMXAKbA_RTvzuc4I";
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

// Shared across scripts on this page — creating more than one client against the
// same project causes them to interfere with each other's session detection.
const sb = window.sb || (window.sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY));

const statusMessageEl = document.getElementById("status-message");
const loggedOutView = document.getElementById("logged-out-view");
const loggedInView = document.getElementById("logged-in-view");
const discordLoginBtn = document.getElementById("discord-login-btn");
const discordStatusEl = document.getElementById("discord-status");
const steamStatusEl = document.getElementById("steam-status");
const steamLinkBtn = document.getElementById("steam-link-btn");
const logoutBtn = document.getElementById("logout-btn");

function showStatus(text, isError = false) {
  statusMessageEl.textContent = text;
  statusMessageEl.hidden = false;
  statusMessageEl.classList.toggle("status-error", isError);
}

async function authedFetch(path, options = {}) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) throw new Error("not_logged_in");
  return fetch(`${FUNCTIONS_URL}/${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
  });
}

async function refreshPlayerData() {
  let player;
  try {
    const res = await authedFetch("ensure-profile", { method: "POST" });
    const body = await res.json();
    if (!body.player) return;
    player = body.player;
  } catch (e) {
    return;
  }

  discordStatusEl.textContent = player.discord_username || "Linked";

  if (player.steam_id) {
    steamStatusEl.textContent = player.steam_username || player.steam_id;
    steamLinkBtn.hidden = true;
  } else {
    steamStatusEl.textContent = "Not linked";
    steamLinkBtn.hidden = false;
  }
}

async function init() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("steam_linked") === "1") {
    showStatus("Steam account linked successfully!");
  } else if (params.get("steam_link_error")) {
    showStatus(`Steam linking failed (${params.get("steam_link_error")}). Please try again.`, true);
  }
  if (params.toString()) {
    window.history.replaceState({}, "", window.location.pathname);
  }

  const { data: { session } } = await sb.auth.getSession();

  if (!session) {
    loggedOutView.hidden = false;
    loggedInView.hidden = true;
    return;
  }

  loggedOutView.hidden = true;
  loggedInView.hidden = false;
  await refreshPlayerData();
}

discordLoginBtn.addEventListener("click", async () => {
  await sb.auth.signInWithOAuth({
    provider: "discord",
    options: { redirectTo: window.location.origin + window.location.pathname },
  });
});

steamLinkBtn.addEventListener("click", async () => {
  try {
    const res = await authedFetch("steam-login", { method: "POST" });
    const body = await res.json();
    if (body.redirectUrl) {
      window.location.href = body.redirectUrl;
    } else {
      showStatus("Couldn't start Steam login. Please try again.", true);
    }
  } catch (e) {
    showStatus("Couldn't start Steam login. Please try again.", true);
  }
});

logoutBtn.addEventListener("click", async () => {
  await sb.auth.signOut();
  window.location.reload();
});

init();
