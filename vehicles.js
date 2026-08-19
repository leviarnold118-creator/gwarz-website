// Vehicles page: claim a vehicle here, spawn it in-game through the GWARZ menu's
// Vehicles tab (only works while standing in a designated spawn zone -- that check
// happens entirely in the mod, this page has no zone awareness). vehicles is the
// single source of truth for what's spawnable (real DayZ classnames) -- the mod
// reads the exact same table (via mod-list-vehicles, joined against
// claimed_vehicles), so there's nothing hardcoded here to drift out of sync.

const SUPABASE_URL = "https://sbbklhpmbbiaxknieojc.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_117mO-KFUzYyKJfrMXAKbA_RTvzuc4I";
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

const sb = window.sb || (window.sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY));

const statusMessageEl = document.getElementById("status-message");
const loggedOutHintEl = document.getElementById("logged-out-hint");
const vehiclesGridEl = document.getElementById("vehicles-grid");

let currentPlaytimeHours = null;
let currentClaimedKeys = new Set();
let claimInFlightKey = null;
let currentVehicles = [];

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

async function claimVehicle(vehicleKey) {
  if (claimInFlightKey) return;
  claimInFlightKey = vehicleKey;
  renderGrid();

  try {
    const res = await authedFetch("claim-vehicle", {
      method: "POST",
      body: JSON.stringify({ vehicle_key: vehicleKey }),
    });
    const body = await res.json();

    if (!res.ok) {
      if (body.error === "not_unlocked") {
        showStatus("That vehicle isn't unlocked yet -- keep playing.", true);
      } else {
        showStatus("Claim failed. Try again in a moment.", true);
      }
      return;
    }

    // Claiming replaces whatever was claimed before (server enforces this too) --
    // only one vehicle is ever "yours" at a time, not a growing collection like
    // Clothing Sets.
    currentClaimedKeys = new Set([vehicleKey]);
    showStatus("Claimed! Spawn it in the GWARZ menu's Vehicles tab in-game (you'll need to be in a spawn zone).");
  } catch (e) {
    showStatus("Couldn't reach the server to claim that. Try again.", true);
  } finally {
    claimInFlightKey = null;
    renderGrid();
  }
}

async function unclaimVehicle(vehicleKey) {
  if (claimInFlightKey) return;
  claimInFlightKey = vehicleKey;
  renderGrid();

  try {
    const res = await authedFetch("claim-vehicle", {
      method: "DELETE",
      body: JSON.stringify({ vehicle_key: vehicleKey }),
    });

    if (!res.ok) {
      showStatus("Unclaim failed. Try again in a moment.", true);
      return;
    }

    currentClaimedKeys.delete(vehicleKey);
    showStatus("Unclaimed.");
  } catch (e) {
    showStatus("Couldn't reach the server to unclaim that. Try again.", true);
  } finally {
    claimInFlightKey = null;
    renderGrid();
  }
}

function renderCard(vehicle) {
  const card = document.createElement("div");
  card.className = "shop-card";

  const ownedHours = currentPlaytimeHours;
  const unlocked = ownedHours !== null && ownedHours >= vehicle.unlock_hours;
  const claimed = currentClaimedKeys.has(vehicle.key);
  const claiming = claimInFlightKey === vehicle.key;

  const icon = document.createElement("div");
  icon.className = "shop-icon";
  if (!unlocked && !claimed) icon.classList.add("shop-icon-locked");
  icon.textContent = abbreviate(vehicle.name);
  card.appendChild(icon);

  const name = document.createElement("div");
  name.className = "shop-name";
  name.textContent = vehicle.name;
  card.appendChild(name);

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
    note.textContent = "Claimed! Spawn it in the GWARZ menu's Vehicles tab in-game.";
    btn.textContent = claiming ? "..." : "Claimed";
    btn.classList.add("shop-action-claimed");
    btn.disabled = true;
  } else if (ownedHours === null) {
    note.textContent = `Unlocks at ${vehicle.unlock_hours} hours played. Log in to check your progress.`;
    btn.textContent = "Locked";
    btn.classList.add("shop-action-locked");
    btn.disabled = true;
  } else if (unlocked) {
    note.textContent = "Unlocked! Claim it, then spawn it in the GWARZ menu's Vehicles tab in-game.";
    btn.textContent = claiming ? "Claiming..." : "Claim";
    btn.classList.add("shop-action-available");
    btn.disabled = claiming;
    btn.addEventListener("click", () => claimVehicle(vehicle.key));
  } else {
    const remaining = Math.max(0, vehicle.unlock_hours - Math.floor(ownedHours));
    note.textContent = `${Math.floor(ownedHours)}/${vehicle.unlock_hours} hours played -- ${remaining} hour${remaining === 1 ? "" : "s"} to go.`;
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
    unclaimBtn.addEventListener("click", () => unclaimVehicle(vehicle.key));
    card.appendChild(unclaimBtn);
  }

  return card;
}

function renderGrid() {
  vehiclesGridEl.innerHTML = "";
  for (const vehicle of currentVehicles) {
    vehiclesGridEl.appendChild(renderCard(vehicle));
  }
}

async function init() {
  const { data: vehicles, error: vehiclesError } = await sb
    .from("vehicles")
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: true });

  if (vehiclesError || !vehicles) {
    showStatus("Couldn't load the vehicles page right now. Try again later.", true);
    return;
  }
  currentVehicles = vehicles;
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

    const { data: claims } = await sb.from("claimed_vehicles").select("vehicle_key");
    currentClaimedKeys = new Set((claims || []).map((c) => c.vehicle_key));

    renderGrid();
  } catch (e) {
    showStatus("Couldn't load your playtime right now. Try again later.", true);
  }
}

init();
