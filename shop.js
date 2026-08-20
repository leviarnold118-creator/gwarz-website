// Shop page: browse gear sets, free once you've put in the hours. clothing_sets is
// the single source of truth for what's in each set (real DayZ classnames) -- the
// mod reads the exact same table (via mod-list-sets, joined against claimed_sets) to
// populate the in-game Clothing tab, so there's nothing hardcoded here to drift out
// of sync with the mod's catalog. Claiming happens here (via claim-set); wearing a
// claimed set happens in-game through the GWARZ menu's Clothing tab.

const SUPABASE_URL = "https://sbbklhpmbbiaxknieojc.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_117mO-KFUzYyKJfrMXAKbA_RTvzuc4I";
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

const sb = window.sb || (window.sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY));

// Cosmetic only -- falls back to no theme class if a set's key isn't listed here.
const SET_THEMES = {
  red_vanilla_set: "red",
  black_vanilla_set: "black",
  green_vanilla_set: "green",
  blue_vanilla_set: "blue",
  green_palm_set: "palm",
};

// Real character-preview pictures for sets that have one -- falls back to the
// abbreviated-letters icon (see abbreviate()) for any set not listed here.
const SET_IMAGES = {
  green_palm_set: "images/sets/green-palm-set.png",
  purple_palm_set: "images/sets/purple-palm-set.png",
  red_palm_set: "images/sets/red-palm-set.png",
  black_nike_tech: "images/sets/black-nike-tech.png",
  white_nike_tech: "images/sets/white-nike-tech.png",
  shadow_serpent_set: "images/sets/shadow-serpent-set.png",
  nightmare_static_set: "images/sets/nightmare-static-set.png",
};

const statusMessageEl = document.getElementById("status-message");
const loggedOutHintEl = document.getElementById("logged-out-hint");
const shopGridEl = document.getElementById("shop-grid");

let currentPlaytimeHours = null;
let currentClaimedKeys = new Set();
let claimInFlightKey = null;

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

function piecesOf(set) {
  return [set.body_label, set.legs_label, set.feet_label, set.gloves_label, set.mask_label, set.headgear_label]
    .filter((label) => label && label.length > 0);
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

async function claimSet(setKey) {
  if (claimInFlightKey) return;
  claimInFlightKey = setKey;
  renderGrid();

  try {
    const res = await authedFetch("claim-set", {
      method: "POST",
      body: JSON.stringify({ set_key: setKey }),
    });
    const body = await res.json();

    if (!res.ok) {
      if (body.error === "not_unlocked") {
        showStatus("That set isn't unlocked yet -- keep playing.", true);
      } else {
        showStatus("Claim failed. Try again in a moment.", true);
      }
      return;
    }

    currentClaimedKeys.add(setKey);
    showStatus("Claimed! Pick it in the GWARZ menu's Clothing tab in-game.");
  } catch (e) {
    showStatus("Couldn't reach the server to claim that. Try again.", true);
  } finally {
    claimInFlightKey = null;
    renderGrid();
  }
}

// Lets a player drop a set they've claimed (e.g. to free up which sets show as
// claimed if they change their mind). No confirmation dialog on purpose -- it only
// removes ownership on the website, it doesn't touch anything already applied
// in-game, so there's nothing destructive enough here to need one.
async function unclaimSet(setKey) {
  if (claimInFlightKey) return;
  claimInFlightKey = setKey;
  renderGrid();

  try {
    const res = await authedFetch("claim-set", {
      method: "DELETE",
      body: JSON.stringify({ set_key: setKey }),
    });

    if (!res.ok) {
      showStatus("Unclaim failed. Try again in a moment.", true);
      return;
    }

    currentClaimedKeys.delete(setKey);
    showStatus("Unclaimed.");
  } catch (e) {
    showStatus("Couldn't reach the server to unclaim that. Try again.", true);
  } finally {
    claimInFlightKey = null;
    renderGrid();
  }
}

function renderCard(set) {
  const card = document.createElement("div");
  card.className = "shop-card";

  const ownedHours = currentPlaytimeHours;
  const unlocked = ownedHours !== null && ownedHours >= set.unlock_hours;
  const claimed = currentClaimedKeys.has(set.key);
  const claiming = claimInFlightKey === set.key;

  const imageSrc = SET_IMAGES[set.key];
  if (imageSrc) {
    const frame = document.createElement("div");
    frame.className = "shop-preview-frame";
    const preview = document.createElement("img");
    preview.className = "shop-preview-image";
    if (!unlocked && !claimed) preview.classList.add("shop-preview-image-locked");
    preview.src = imageSrc;
    preview.alt = set.name;
    frame.appendChild(preview);
    card.appendChild(frame);
  } else {
    const icon = document.createElement("div");
    icon.className = "shop-icon";
    const theme = SET_THEMES[set.key];
    if (theme) icon.classList.add(`shop-icon-theme-${theme}`);
    if (!unlocked && !claimed) icon.classList.add("shop-icon-locked");
    icon.textContent = abbreviate(set.name);
    card.appendChild(icon);
  }

  const name = document.createElement("div");
  name.className = "shop-name";
  name.textContent = set.name;
  card.appendChild(name);

  const pieces = document.createElement("div");
  pieces.className = "shop-pieces";
  pieces.textContent = piecesOf(set).join(" • ");
  card.appendChild(pieces);

  const priceTag = document.createElement("div");
  priceTag.className = "shop-price-tag";
  priceTag.textContent = "FREE";
  card.appendChild(priceTag);

  const note = document.createElement("div");
  note.className = "shop-unlock-note";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "shop-action";

  if (claimed) {
    note.textContent = "Claimed! Pick it in the GWARZ menu's Clothing tab in-game.";
    btn.textContent = claiming ? "..." : "Claimed";
    btn.classList.add("shop-action-claimed");
    btn.disabled = true;
  } else if (ownedHours === null) {
    note.textContent = `Unlocks at ${set.unlock_hours} hours played. Log in to check your progress.`;
    btn.textContent = "Locked";
    btn.classList.add("shop-action-locked");
    btn.disabled = true;
  } else if (unlocked) {
    note.textContent = "Unlocked! Claim it, then pick it in the GWARZ menu's Clothing tab in-game.";
    btn.textContent = claiming ? "Claiming..." : "Claim";
    btn.classList.add("shop-action-available");
    btn.disabled = claiming;
    btn.addEventListener("click", () => claimSet(set.key));
  } else {
    const remaining = Math.max(0, set.unlock_hours - Math.floor(ownedHours));
    note.textContent = `${Math.floor(ownedHours)}/${set.unlock_hours} hours played -- ${remaining} hour${remaining === 1 ? "" : "s"} to go.`;
    btn.textContent = "Locked";
    btn.classList.add("shop-action-locked");
    btn.disabled = true;
  }

  card.appendChild(note);
  card.appendChild(btn);

  if (claimed) {
    const unclaimBtn = document.createElement("button");
    unclaimBtn.type = "button";
    unclaimBtn.className = "shop-action shop-action-unclaim";
    unclaimBtn.textContent = claiming ? "Unclaiming..." : "Unclaim";
    unclaimBtn.disabled = claiming;
    unclaimBtn.addEventListener("click", () => unclaimSet(set.key));
    card.appendChild(unclaimBtn);
  }

  return card;
}

let currentSets = [];

function renderGrid() {
  shopGridEl.innerHTML = "";
  for (const set of currentSets) {
    shopGridEl.appendChild(renderCard(set));
  }
}

async function init() {
  const { data: sets, error: setsError } = await sb
    .from("clothing_sets")
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: true });

  if (setsError || !sets) {
    showStatus("Couldn't load the shop right now. Try again later.", true);
    return;
  }
  currentSets = sets;
  renderGrid();

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
    currentPlaytimeHours = (body.player.total_playtime_seconds || 0) / 3600;

    const { data: claims } = await sb.from("claimed_sets").select("set_key");
    currentClaimedKeys = new Set((claims || []).map((c) => c.set_key));

    renderGrid();
  } catch (e) {
    showStatus("Couldn't load your playtime right now. Try again later.", true);
  }
}

init();
