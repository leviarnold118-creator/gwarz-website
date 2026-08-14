# GWARZ Website — Project Notes

## Live site
https://leviarnold118-creator.github.io/gwarz-website/
Repo: https://github.com/leviarnold118-creator/gwarz-website
Edit files locally in this folder, then `git add` / `git commit` / `git push` — Pages auto-rebuilds within a minute or two.

## Site structure
- `index.html` — landing page: hero, Gallery (screenshots + auto-playing YouTube intro
  video with a mute toggle), Connect, Rules, Support
- `account.html` — Discord login + Steam account linking only
- `wheel.html` — playtime sync, spin-the-wheel, and the rewards claim list
- `profile.html` — read-only avatar + combat stats (kills/deaths/K:D/longest shot/etc)
- `profile-widget.js` — shared header avatar (links to profile.html when logged in,
  placeholder silhouette linking to account.html when logged out); loaded on every page
- `script.js` — shared config (server IP/ports/links) + intro video mute toggle
- `style.css` — gritty military/survival theme: Black Ops One (headings), Rajdhani
  (body), Share Tech Mono (numbers/labels/IP), angular clip-path cards/buttons instead
  of rounded corners, film-grain/scanline overlay, hazard-stripe accents
- `media/` — screenshot-1.jpg, screenshot-2.jpg (from `C:\Users\levia\Downloads\namalsk*.jpg`)
- `backend/sql/` — numbered migrations, run in order in Supabase's SQL Editor
- `backend/functions/` — source-of-truth copies of each deployed Edge Function
- `SECRETS.local.md` — gitignored, holds every credential; never paste its contents
  into chat again once recorded there

## Feature: login + Steam/Discord linking + playtime loot wheel

**Goal:** Players earn a wheel spin every 4 hours of playtime on the GWARZ DayZ server.
To claim a win, they log into the website and link both Discord and Steam. Reward
delivery: an in-game claim menu (still to build) in the Gwarz-UI mod
(`C:\Users\levia\Desktop\Gwarz-UI`) that spawns the won item near the player.

**Stack:** Supabase (Postgres + Auth + Edge Functions, free tier) for everything
backend — no separate host needed. CFTools Cloud Data API for playtime/combat stats.

### Status: fully built and verified working live (as of 2026-08-14)
- [x] Supabase project `sbbklhpmbbiaxknieojc`, all accounts/credentials set up
- [x] Database schema (migrations 001–006, see `backend/sql/`)
- [x] Edge Functions, all deployed and confirmed working: `steam-login`,
      `cftools-sync`, `spin-wheel`, `mod-claim-rewards`, `ensure-profile`
- [x] Website: login, Steam linking, playtime sync, wheel spin, profile stats,
      dedicated wheel page — all tested end-to-end with real data
- [x] Homepage gallery: screenshots + auto-playing muted YouTube intro video
- [x] Gritty military visual redesign across all pages
- [ ] **Not yet built:** Gwarz-UI mod in-game claim menu (the only remaining piece —
      players can win rewards on the site but can't claim them in-game yet)

### Wheel/reward rules
- 1 spin earned per 4 hours of playtime
- Rewards are in-game items only — **still placeholder items** (`PLACEHOLDER_*`
  classnames in `backend/functions/spin-wheel/index.ts`) until real DayZ classnames/
  weights are given
- Spins and unclaimed rewards bank indefinitely, no expiry

### CFTools Cloud Data API — confirmed real shape (learned by trial, 2026-08-14)
- Base URL: `https://data.cftools.cloud`; every request needs a `User-Agent` header
  containing the application_id
- `POST /v1/auth/register` `{application_id, secret}` → bearer token (24h, but can go
  stale early — `cftools-sync` retries once with a fresh token on `bad-token` errors)
- `GET /v1/users/lookup?identifier={steam64}` → resolves to a CFTools account id
- `GET /v2/server/{server_api_id}/player?cftools_id={id}` → real shape:
  ```
  { "<opaque_id>": { "game": { "dayz": {
        deaths, kdratio, longest_kill, longest_shot, suicides,
        kills: { ai, animals, infected, players },   // NOT a single number!
        weapons: { "<classname>": { kills, deaths, longest_kill, ... }, ... }
      } },
      "omega": { playtime, sessions, name_history } },
    "identities": { "steam": { "steam64" }, ... }, "status": true }
  ```
  "Kills" for the site = `dayz.kills.players` (PvP kills). `kills_infected` =
  `dayz.kills.infected`. `total_playtime_seconds` = `omega.playtime`.
- `CFTOOLS_SERVER_ID` env var = the GUID from the game-server plugin's own "Server ID"
  page (`045158ac-672e-4287-90ac-5ff7bb4824fc`) — confirmed correct, no need to resolve
  via `/v1/@app/grants` dynamically.

### Bugs found + fixed during build (for future reference — check these first if
something new breaks the same way)
- **Supabase table grants:** `service_role` and `authenticated` both lacked explicit
  table GRANTs on new tables (separate from RLS policies) — this project doesn't
  auto-grant them like older Supabase projects do. Fixed via migrations 004 and 006.
  Any new table will need the same treatment.
- **CSS `[hidden]` override:** `.account-grid { display: grid }` (now removed) beat the
  browser's default `[hidden] { display: none }` because author CSS always wins over
  user-agent CSS regardless of specificity. Fixed with a global
  `[hidden] { display: none !important; }` rule — keep that rule if adding any new
  `display:` value on an element that also uses the `hidden` attribute.
- **Multiple Supabase clients per page:** account.js/profile.js/wheel.js each making
  their own client, plus profile-widget.js making another, caused session-detection to
  fail intermittently. Fixed by sharing one client via `window.sb`; every page's script
  tags must load the page's own script *before* `profile-widget.js`.
- **CFTools stat field guessing:** a generic recursive field-name search matched the
  wrong nested value (a random weapon's kill count instead of total PvP kills). Fixed
  by hardcoding the confirmed response shape (see above) instead of guessing.
- **Edge Function slug mismatch:** the dashboard's "Name" field on function creation is
  just a display label — the actual URL slug locks in from whatever was in the name box
  *at deploy time*. Always set the name before pasting code/deploying, not after.

## Known open items
- Rules section still has placeholder text (`index.html` #rules)
- Wheel rewards are placeholder items — swap in real DayZ classnames/weights whenever
  ready (`backend/functions/spin-wheel/index.ts`)
- Gwarz-UI mod in-game claim menu not built yet — the last piece connecting the website
  wheel to actually receiving items in-game
