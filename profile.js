// Profile page: read-only stat display (avatar, names, combat stats) plus a
// button to trigger a fresh CFTools sync. Account linking/wheel actions live on
// account.html — this page is just the "who am I / how am I doing" view.

const SUPABASE_URL = "https://sbbklhpmbbiaxknieojc.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_117mO-KFUzYyKJfrMXAKbA_RTvzuc4I";
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

// Shared across scripts on this page — creating more than one client against the
// same project causes them to interfere with each other's session detection.
const sb = window.sb || (window.sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY));

const loggedOutNotice = document.getElementById("logged-out-notice");
const profileView = document.getElementById("profile-view");
const avatarLargeEl = document.getElementById("profile-avatar-large");
const nameEl = document.getElementById("profile-name");
const subEl = document.getElementById("profile-sub");
const syncBtn = document.getElementById("sync-btn");

const statEls = {
  kills: document.getElementById("stat-kills"),
  deaths: document.getElementById("stat-deaths"),
  kd: document.getElementById("stat-kd"),
  longestShot: document.getElementById("stat-longest-shot"),
  longestKill: document.getElementById("stat-longest-kill"),
  infected: document.getElementById("stat-infected"),
  suicides: document.getElementById("stat-suicides"),
  playtime: document.getElementById("stat-playtime"),
  spins: document.getElementById("stat-spins"),
};

function fmt(n) {
  return n === null || n === undefined ? "—" : n;
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

function renderPlayer(player) {
  const avatarUrl = player.steam_avatar_url || "";
  const initial = (player.discord_username || player.steam_username || "?").charAt(0).toUpperCase();
  avatarLargeEl.innerHTML = avatarUrl
    ? `<img src="${avatarUrl}" alt="" class="profile-avatar-large-img">`
    : `<span class="profile-avatar-large-fallback">${initial}</span>`;

  nameEl.textContent = player.discord_username || "Player";
  subEl.textContent = player.steam_username ? `Steam: ${player.steam_username}` : "Steam not linked";

  statEls.kills.textContent = fmt(player.kills);
  statEls.deaths.textContent = fmt(player.deaths);
  statEls.kd.textContent = fmt(player.kd_ratio);
  statEls.longestShot.textContent = player.longest_shot ? `${Math.round(player.longest_shot)}m` : "—";
  statEls.longestKill.textContent = player.longest_kill ? `${Math.round(player.longest_kill)}m` : "—";
  statEls.infected.textContent = fmt(player.kills_infected);
  statEls.suicides.textContent = fmt(player.suicides);
  statEls.playtime.textContent = formatPlaytime(player.total_playtime_seconds);
  statEls.spins.textContent = fmt(player.spins_available);
}

async function loadProfile() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;

  const { data: player } = await sb
    .from("players")
    .select(
      "discord_username, steam_username, steam_avatar_url, kills, deaths, kd_ratio, longest_shot, longest_kill, kills_infected, suicides, total_playtime_seconds, spins_available"
    )
    .eq("id", user.id)
    .maybeSingle();

  if (!player) return;
  renderPlayer(player);
}

async function init() {
  const { data: { session } } = await sb.auth.getSession();

  if (!session) {
    loggedOutNotice.hidden = false;
    profileView.hidden = true;
    return;
  }

  loggedOutNotice.hidden = true;
  profileView.hidden = false;
  await loadProfile();
}

syncBtn.addEventListener("click", async () => {
  syncBtn.disabled = true;
  syncBtn.textContent = "Syncing...";
  try {
    await authedFetch("cftools-sync", { method: "POST" });
  } catch (e) {
    // Ignore — loadProfile below will just show whatever's currently stored.
  }
  syncBtn.disabled = false;
  syncBtn.textContent = "Sync Stats";
  await loadProfile();
});

init();
