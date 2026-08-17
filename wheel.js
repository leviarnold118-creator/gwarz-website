// Wheel page: sync playtime, spin for loot, view reward claim status.
// Account linking (Discord/Steam) lives on account.html — this page only handles spins.

const SUPABASE_URL = "https://sbbklhpmbbiaxknieojc.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_117mO-KFUzYyKJfrMXAKbA_RTvzuc4I";
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

// Shared across scripts on this page — creating more than one client against the
// same project causes them to interfere with each other's session detection.
const sb = window.sb || (window.sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY));

const statusMessageEl = document.getElementById("status-message");
const loggedOutView = document.getElementById("logged-out-view");
const loggedInView = document.getElementById("logged-in-view");
const playtimeValueEl = document.getElementById("playtime-value");
const spinsValueEl = document.getElementById("spins-value");
const syncBtn = document.getElementById("sync-btn");
const spinBtn = document.getElementById("spin-btn");
const rewardsListEl = document.getElementById("rewards-list");
const tabPendingBtn = document.getElementById("tab-pending");
const tabHistoryBtn = document.getElementById("tab-history");

let allRewards = [];
let activeTab = "pending";

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
    .limit(50);

  allRewards = error || !data ? [] : data;
  renderRewards();
}

function renderRewards() {
  const filtered = allRewards.filter((r) =>
    activeTab === "pending" ? r.status !== "claimed" : r.status === "claimed"
  );

  rewardsListEl.innerHTML = "";

  if (filtered.length === 0) {
    rewardsListEl.innerHTML =
      activeTab === "pending"
        ? "<li>No rewards waiting — spin the roulette once you've earned a spin.</li>"
        : "<li>No claimed rewards yet.</li>";
    return;
  }

  for (const reward of filtered) {
    const li = document.createElement("li");
    li.textContent =
      activeTab === "pending"
        ? `${reward.item_label} — Pending in-game claim (expires 24h after winning)`
        : `${reward.item_label} — Claimed`;
    rewardsListEl.appendChild(li);
  }
}

function setActiveTab(tab) {
  activeTab = tab;
  tabPendingBtn.classList.toggle("tab-btn-active", tab === "pending");
  tabHistoryBtn.classList.toggle("tab-btn-active", tab === "history");
  renderRewards();
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

  playtimeValueEl.textContent = formatPlaytime(player.total_playtime_seconds);
  spinsValueEl.textContent = String(player.spins_available ?? 0);
  spinBtn.disabled = !(player.steam_id && player.spins_available > 0);

  if (!player.steam_id) {
    showStatus("Link your Steam account on the Account page to start earning spins.", true);
  }

  await loadRewards();
}

async function init() {
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

tabPendingBtn.addEventListener("click", () => setActiveTab("pending"));
tabHistoryBtn.addEventListener("click", () => setActiveTab("history"));

init();
