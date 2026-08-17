// Wheel page: sync playtime, spin for loot, view reward claim status.
// Account linking (Discord/Steam) lives on account.html — this page only handles spins.

const SUPABASE_URL = "https://sbbklhpmbbiaxknieojc.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_117mO-KFUzYyKJfrMXAKbA_RTvzuc4I";
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

// Shared across scripts on this page — creating more than one client against the
// same project causes them to interfere with each other's session detection.
const sb = window.sb || (window.sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY));

// Mirrors backend/functions/spin-wheel/index.ts's WHEEL_ITEMS exactly -- the actual
// winner is always picked server-side, this copy only drives what the wheel/grid look
// like. Keep classname/label/weight in sync whenever the backend list changes.
// "category" picks an icon color; these are placeholder monogram badges until real
// item screenshots are gathered, at which point swap renderIcon() for real <img> tags.
const WHEEL_ITEMS = [
  { classname: "BandageDressing", label: "Bandage", weight: 25, category: "medical" },
  { classname: "PainkillerTablets", label: "Painkillers", weight: 20, category: "medical" },
  { classname: "Morphine", label: "Morphine", weight: 15, category: "medical" },
  { classname: "TetracyclineAntibiotics", label: "Antibiotics", weight: 10, category: "medical" },
  { classname: "Mag_STANAG_30Rnd", label: "M4 30rd Mag", weight: 12, category: "ammo" },
  { classname: "Mag_AKM_30Rnd", label: "AKM 30rd Mag", weight: 10, category: "ammo" },
  { classname: "AKM", label: "AKM Rifle", weight: 5, category: "weapon" },
  { classname: "M4A1", label: "M4A1 Rifle", weight: 3, category: "weapon" },
];

const SLICE_FILLS = ["#241209", "#170d09"];

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
const wheelRotorEl = document.getElementById("wheel-rotor");
const winningsGridEl = document.getElementById("winnings-grid");

let allRewards = [];
let activeTab = "pending";
let wheelSegments = [];
let currentRotation = 0;

function showStatus(text, isError = false) {
  statusMessageEl.textContent = text;
  statusMessageEl.hidden = false;
  statusMessageEl.classList.toggle("status-error", isError);
}

function formatPlaytime(totalSeconds) {
  const hours = Math.floor((totalSeconds || 0) / 3600);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

function abbreviate(label) {
  const words = label.split(" ").filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return label.slice(0, 2).toUpperCase();
}

function rarityTier(weight) {
  if (weight >= 15) return "common";
  if (weight >= 8) return "uncommon";
  return "rare";
}

// --- Wheel geometry -------------------------------------------------------
// Angles are degrees measured clockwise from 12 o'clock (0 = top), matching how
// CSS rotate() visually spins the SVG group. Slice sizes follow each item's weight
// so the wheel's visual odds match the backend's actual odds.

function buildWheelSegments() {
  const total = WHEEL_ITEMS.reduce((sum, i) => sum + i.weight, 0);
  let angle = 0;
  return WHEEL_ITEMS.map((item) => {
    const span = (item.weight / total) * 360;
    const start = angle;
    const end = angle + span;
    angle = end;
    return { item, start, end, mid: (start + end) / 2 };
  });
}

function pointOnCircle(cx, cy, r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}

function slicePath(cx, cy, r, start, end) {
  const p1 = pointOnCircle(cx, cy, r, start);
  const p2 = pointOnCircle(cx, cy, r, end);
  const largeArc = end - start > 180 ? 1 : 0;
  return `M ${cx},${cy} L ${p1.x.toFixed(2)},${p1.y.toFixed(2)} A ${r},${r} 0 ${largeArc} 1 ${p2.x.toFixed(2)},${p2.y.toFixed(2)} Z`;
}

const SVG_NS = "http://www.w3.org/2000/svg";

function renderWheel() {
  wheelSegments = buildWheelSegments();
  wheelRotorEl.innerHTML = "";

  wheelSegments.forEach((seg, i) => {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", slicePath(150, 150, 138, seg.start, seg.end));
    path.setAttribute("fill", SLICE_FILLS[i % SLICE_FILLS.length]);
    path.setAttribute("stroke", "#cfa254");
    path.setAttribute("stroke-width", "1");
    wheelRotorEl.appendChild(path);

    const iconPos = pointOnCircle(150, 150, 95, seg.mid);
    const badge = document.createElementNS(SVG_NS, "g");
    badge.setAttribute("transform", `translate(${iconPos.x.toFixed(2)},${iconPos.y.toFixed(2)})`);

    const circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("r", "18");
    circle.setAttribute("fill", categoryFill(seg.item.category));
    circle.setAttribute("stroke", "#ffcc66");
    circle.setAttribute("stroke-width", "1");
    badge.appendChild(circle);

    const text = document.createElementNS(SVG_NS, "text");
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dominant-baseline", "central");
    text.setAttribute("font-size", "11");
    text.setAttribute("font-family", "Rajdhani, sans-serif");
    text.setAttribute("font-weight", "700");
    text.setAttribute("fill", categoryText(seg.item.category));
    text.textContent = abbreviate(seg.item.label);
    badge.appendChild(text);

    wheelRotorEl.appendChild(badge);
  });
}

function categoryFill(category) {
  if (category === "medical") return "rgba(179, 20, 10, 0.35)";
  if (category === "ammo") return "rgba(255, 204, 102, 0.25)";
  return "rgba(100, 35, 35, 0.55)";
}

function categoryText(category) {
  if (category === "ammo") return "#ffcc66";
  return "#f3ece1";
}

function renderIcon(item, size) {
  const div = document.createElement("div");
  div.className = `winnings-icon tier-${item.category}`;
  div.style.width = `${size}px`;
  div.style.height = `${size}px`;
  div.textContent = abbreviate(item.label);
  return div;
}

function renderWinningsGrid() {
  winningsGridEl.innerHTML = "";
  for (const item of WHEEL_ITEMS) {
    const card = document.createElement("div");
    card.className = "winnings-card";
    card.appendChild(renderIcon(item, 56));

    const label = document.createElement("div");
    label.className = "winnings-label";
    label.textContent = item.label;
    card.appendChild(label);

    const underline = document.createElement("div");
    underline.className = `winnings-underline rarity-${rarityTier(item.weight)}`;
    card.appendChild(underline);

    winningsGridEl.appendChild(card);
  }
}

// Spins the wheel so the given classname's segment ends up under the fixed top
// pointer, always rotating forward (never resetting), with a random offset inside
// the segment so it doesn't land dead-center every time. Resolves once the CSS
// transition finishes.
function spinToItem(classname) {
  const seg = wheelSegments.find((s) => s.item.classname === classname);
  if (!seg) return Promise.resolve();

  const jitter = (Math.random() - 0.5) * (seg.end - seg.start) * 0.6;
  const targetAngle = ((seg.mid + jitter) % 360 + 360) % 360;
  const neededOffset = (360 - targetAngle) % 360;
  const previousMod = ((currentRotation % 360) + 360) % 360;
  const fullSpins = 6;
  const addAmount = fullSpins * 360 + ((neededOffset - previousMod) + 360) % 360;

  currentRotation += addAmount;

  return new Promise((resolve) => {
    const onEnd = () => {
      wheelRotorEl.removeEventListener("transitionend", onEnd);
      resolve();
    };
    wheelRotorEl.addEventListener("transitionend", onEnd);
    wheelRotorEl.style.transform = `rotate(${currentRotation}deg)`;
  });
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
  const spins = player.spins_available ?? 0;
  spinsValueEl.textContent = `${spins} spin${spins === 1 ? "" : "s"} available`;
  spinBtn.disabled = !(player.steam_id && spins > 0);

  if (!player.steam_id) {
    showStatus("Link your Steam account on the Account page to start earning spins.", true);
  }

  await loadRewards();
}

async function init() {
  renderWheel();
  renderWinningsGrid();

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
      showStatus("Spinning...");
      await spinToItem(body.reward.classname);
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
