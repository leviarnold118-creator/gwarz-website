// Shop page: browse gear sets/items, some free after enough playtime, some
// (eventually) purchasable. Selecting/wearing what you've unlocked happens in-game
// through the GWARZ menu's Clothing tab -- this page is informational, it doesn't
// push a "claim" anywhere. NOTE: the in-game mod doesn't check this playtime lock
// yet (see GwarzClothingSpawnHook.c) -- that wiring is a follow-up, not done here.

const SUPABASE_URL = "https://sbbklhpmbbiaxknieojc.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_117mO-KFUzYyKJfrMXAKbA_RTvzuc4I";
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

const sb = window.sb || (window.sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY));

// unlockHours is a placeholder pick from the 20-30hr range discussed -- adjust freely.
// The four Vanilla sets mirror GwarzClothingCatalog.c's option list on the mod side
// (real base-game classnames only, verified against a DayZ classname reference) --
// Red matches the mod's existing "Vanilla Test Set" exactly; Black/Green/Blue are
// new, color-coordinated the same way, ready to wire into the mod's catalog once
// this end-to-end unlock flow is being tested for real.
const SHOP_ITEMS = [
  {
    id: "green_palm_set",
    name: "Green Palm Set",
    type: "free_playtime",
    unlockHours: 25,
    theme: "palm",
    pieces: ["Jacket", "Pants", "Socks", "Gloves", "Mask", "Hat"],
  },
  {
    id: "red_vanilla_set",
    name: "Red Set",
    type: "free_playtime",
    unlockHours: 25,
    theme: "red",
    pieces: ["Red Hoodie", "Blue Jeans", "White Sneakers", "Leather Gloves", "Black Balaclava", "Red Cap"],
  },
  {
    id: "black_vanilla_set",
    name: "Black Set",
    type: "free_playtime",
    unlockHours: 25,
    theme: "black",
    pieces: ["Black Hoodie", "Black Jeans", "Black Sneakers", "Leather Gloves", "Black Balaclava", "Black Cap"],
  },
  {
    id: "green_vanilla_set",
    name: "Green Set",
    type: "free_playtime",
    unlockHours: 25,
    theme: "green",
    pieces: ["Green Hoodie", "Green Jeans", "Green Sneakers", "Tactical Gloves", "Green Balaclava", "Olive Cap"],
  },
  {
    id: "blue_vanilla_set",
    name: "Blue Set",
    type: "free_playtime",
    unlockHours: 25,
    theme: "blue",
    pieces: ["Blue Hoodie", "Dark Blue Jeans", "White Sneakers", "Leather Gloves", "Blue Balaclava", "Blue Cap"],
  },
];

const statusMessageEl = document.getElementById("status-message");
const loggedOutHintEl = document.getElementById("logged-out-hint");
const shopGridEl = document.getElementById("shop-grid");

function showStatus(text, isError = false) {
  statusMessageEl.textContent = text;
  statusMessageEl.hidden = false;
  statusMessageEl.classList.toggle("status-error", isError);
}

function abbreviate(label) {
  const words = label.split(" ").filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return label.slice(0, 2).toUpperCase();
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

function renderCard(item, ownedHours) {
  const card = document.createElement("div");
  card.className = "shop-card";

  const unlocked = ownedHours !== null && ownedHours >= item.unlockHours;

  const icon = document.createElement("div");
  icon.className = "shop-icon";
  if (item.theme) icon.classList.add(`shop-icon-theme-${item.theme}`);
  if (!unlocked) icon.classList.add("shop-icon-locked");
  icon.textContent = abbreviate(item.name);
  card.appendChild(icon);

  const name = document.createElement("div");
  name.className = "shop-name";
  name.textContent = item.name;
  card.appendChild(name);

  const pieces = document.createElement("div");
  pieces.className = "shop-pieces";
  pieces.textContent = item.pieces.join(" • ");
  card.appendChild(pieces);

  const priceTag = document.createElement("div");
  priceTag.className = "shop-price-tag";
  priceTag.textContent = "FREE";
  card.appendChild(priceTag);

  const note = document.createElement("div");
  note.className = "shop-unlock-note";
  const btn = document.createElement("div");
  btn.className = "shop-action";

  if (ownedHours === null) {
    note.textContent = `Unlocks at ${item.unlockHours} hours played. Log in to check your progress.`;
    btn.textContent = "Locked";
    btn.classList.add("shop-action-locked");
  } else if (unlocked) {
    note.textContent = "Unlocked! Pick it in the GWARZ menu's Clothing tab in-game.";
    btn.textContent = "Available In-Game";
    btn.classList.add("shop-action-available");
  } else {
    const remaining = Math.max(0, item.unlockHours - Math.floor(ownedHours));
    note.textContent = `${Math.floor(ownedHours)}/${item.unlockHours} hours played -- ${remaining} hour${remaining === 1 ? "" : "s"} to go.`;
    btn.textContent = "Locked";
    btn.classList.add("shop-action-locked");
  }

  card.appendChild(note);
  card.appendChild(btn);

  return card;
}

function renderGrid(playtimeHours) {
  shopGridEl.innerHTML = "";
  for (const item of SHOP_ITEMS) {
    shopGridEl.appendChild(renderCard(item, playtimeHours));
  }
}

async function init() {
  renderGrid(null);

  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    loggedOutHintEl.hidden = false;
    return;
  }
  loggedOutHintEl.hidden = true;

  try {
    const res = await authedFetch("ensure-profile", { method: "POST" });
    const body = await res.json();
    if (!body.player) return;
    const hours = (body.player.total_playtime_seconds || 0) / 3600;
    renderGrid(hours);
  } catch (e) {
    showStatus("Couldn't load your playtime right now. Try again later.", true);
  }
}

init();
