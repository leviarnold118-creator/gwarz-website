// Account page: Discord login, Steam linking, playtime sync, and the reward wheel.
// Talks directly to Supabase (safe — the anon/publishable key is meant to be public)
// and to our own Edge Functions for anything that needs to run server-side.

const SUPABASE_URL = "https://sbbklhpmbbiaxknieojc.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_117mO-KFUzYyKJfrMXAKbA_RTvzuc4I";
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const statusMessageEl = document.getElementById("status-message");
const loggedOutView = document.getElementById("logged-out-view");
const loggedInView = document.getElementById("logged-in-view");
const discordLoginBtn = document.getElementById("discord-login-btn");
const discordStatusEl = document.getElementById("discord-status");
const steamStatusEl = document.getElementById("steam-status");
const steamLinkBtn = document.getElementById("steam-link-btn");
const playtimeValueEl = document.getElementById("playtime-value");
const spinsValueEl = document.getElementById("spins-value");
const syncBtn = document.getElementById("sync-btn");
const spinBtn = document.getElementById("spin-btn");
const rewardsListEl = document.getElementById("rewards-list");
const logoutBtn = document.getElementById("logout-btn");

function showStatus(text, isError = false) {
  statusMessageEl.textContent = text;
  statusMessageEl.hidden = false;
  statusMessageEl.classList.toggle("status-error", isError);
}

function formatPlaytime(totalSeconds) {
  const hours = Math.floor((totalSeconds || 0) / 3600);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
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

async function loadRewards() {
  const { data, error } = await sb
    .from("rewards")
    .select("item_label, status, created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  rewardsListEl.innerHTML = "";
  if (error || !data || data.length === 0) {
    rewardsListEl.innerHTML = "<li>No rewards yet — spin the wheel once you've earned a spin.</li>";
    return;
  }

  for (const reward of data) {
    const li = document.createElement("li");
    li.textContent = `${reward.item_label} — ${reward.status === "claimed" ? "Claimed" : "Pending in-game claim"}`;
    rewardsListEl.appendChild(li);
  }
}

async function refreshPlayerData() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;

  const { data: player } = await sb
    .from("players")
    .select("discord_username, steam_username, steam_id, total_playtime_seconds, spins_available")
    .eq("id", user.id)
    .maybeSingle();

  if (!player) return;

  discordStatusEl.textContent = player.discord_username || "Linked";

  if (player.steam_id) {
    steamStatusEl.textContent = player.steam_username || player.steam_id;
    steamLinkBtn.hidden = true;
  } else {
    steamStatusEl.textContent = "Not linked";
    steamLinkBtn.hidden = false;
  }

  playtimeValueEl.textContent = formatPlaytime(player.total_playtime_seconds);
  spinsValueEl.textContent = String(player.spins_available ?? 0);
  spinBtn.disabled = !(player.steam_id && player.spins_available > 0);

  await loadRewards();
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

syncBtn.addEventListener("click", async () => {
  syncBtn.disabled = true;
  syncBtn.textContent = "Syncing...";
  try {
    const res = await authedFetch("cftools-sync", { method: "POST" });
    const body = await res.json();
    if (body.error === "steam_not_linked") {
      showStatus("Link your Steam account first to sync playtime.", true);
    } else if (body.error) {
      showStatus("Couldn't sync playtime right now. Try again later.", true);
    } else {
      showStatus("Playtime synced!");
    }
  } catch (e) {
    showStatus("Couldn't sync playtime right now. Try again later.", true);
  }
  syncBtn.disabled = false;
  syncBtn.textContent = "Sync Playtime";
  await refreshPlayerData();
});

spinBtn.addEventListener("click", async () => {
  spinBtn.disabled = true;
  try {
    const res = await authedFetch("spin-wheel", { method: "POST" });
    const body = await res.json();
    if (body.error === "no_spins_available") {
      showStatus("No spins available right now.", true);
    } else if (body.error) {
      showStatus("Spin failed. Please try again.", true);
    } else {
      showStatus(`You won: ${body.reward.label}! Claim it in-game from the GWARZ menu.`);
    }
  } catch (e) {
    showStatus("Spin failed. Please try again.", true);
  }
  await refreshPlayerData();
});

logoutBtn.addEventListener("click", async () => {
  await sb.auth.signOut();
  window.location.reload();
});

init();
