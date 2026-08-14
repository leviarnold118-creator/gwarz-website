# GWARZ Website — Project Notes

## Live site
https://leviarnold118-creator.github.io/gwarz-website/
Repo: https://github.com/leviarnold118-creator/gwarz-website
Edit files locally in this folder, then `git add` / `git commit` / `git push` — Pages auto-rebuilds.

## Feature in progress: login + Steam/Discord linking + playtime roulette wheel

**Goal:** Players earn a roulette-wheel spin every few hours of playtime on the GWARZ DayZ
server. To claim a win, they must log into the website and link both their Discord and
Steam accounts. Reward delivery: an in-game claim menu added to the Gwarz-UI mod
(`C:\Users\levia\Desktop\Gwarz-UI`) that spawns the won item near the player.

**Playtime source:** CFTools Cloud (already managing the GWARZ server). Their Data API
may require a paid "Basic" subscription tier for the player-stats endpoints — confirm
before relying on it.

**Backend plan:** Supabase (free tier) for the database, auth, and serverless backend
logic (Edge Functions) — one service instead of a separate host + database. No Cloudflare
Workers needed.

### Accounts/credentials needed (create these yourself — I can't do account creation for you)
- [x] Supabase account + project — "gwarz website" project, ref `sbbklhpmbbiaxknieojc`
      - Project URL: `https://sbbklhpmbbiaxknieojc.supabase.co`
      - Publishable (anon) key: `sb_publishable_117mO-KFUzYyKJfrMXAKbA_RTvzuc4I` (safe to expose client-side)
      - Secret key: stored only in Supabase dashboard — never paste this one into chat or commit it
- [~] Discord Developer app — "gwarz website" app created, Client ID `1537463084938035270`.
      Secret goes straight into Supabase Auth Providers, not stored here. Redirect URI
      set to `https://sbbklhpmbbiaxknieojc.supabase.co/auth/v1/callback`.
- [x] Steam Web API key — registered to domain `leviarnold118-creator.github.io`.
      Value saved in `SECRETS.local.md` (gitignored, never pushed to GitHub).
- [x] CFTools Cloud Data API application — application_id `6a7dd37607702b3c7063e814`,
      authorized against the NAMALSK server. Secret in `SECRETS.local.md`.

**All four setup accounts complete as of 2026-08-13.**

### Backend build status
- [x] Database schema applied (001 + 002)
- [x] `steam-login` Edge Function deployed. Secrets set: STEAM_API_KEY, SITE_URL.
      TODO: confirm whether a gateway-level JWT-verification toggle needs disabling —
      couldn't find one in the dashboard; will confirm during end-to-end login testing.
- [ ] `cftools-sync` Edge Function
- [ ] `spin-wheel` Edge Function
- [ ] `mod-claim-rewards` Edge Function
- [x] Website login/account/wheel UI — pushed live 2026-08-13, commit c364150
- [ ] Gwarz-UI mod in-game claim menu
- [ ] End-to-end testing of login -> Steam link -> sync -> spin (not yet verified live)

### Wheel/reward rules (decided 2026-08-13)
- 1 spin earned per 4 hours of playtime
- Rewards are in-game items only (placeholder item list until real classnames/weights given)
- Spins and unclaimed rewards bank indefinitely, no expiry

### CFTools Cloud Data API (confirmed from their docs, 2026-08-13)
- Base URL: `https://data.cftools.cloud`
- Auth: `POST /v1/auth/register` with JSON body `{application_id, secret}` → bearer token, valid 24h (rate limit 2/min)
- All requests need `User-Agent` header containing the application_id
- Authenticated requests: `Authorization: Bearer {token}`
- `GET /v1/@app/grants` — lists servers this app is authorized against (rate limit 1/min);
  Edge Function will call this at runtime to resolve the `server_api_id` rather than
  hardcoding it, since it wasn't confirmed whether it matches the game-server plugin's
  `Server ID` GUID.
- `GET /v1/users/lookup?identifier={steam64}` — resolves a Steam64 ID to a CFTools
  account id (rate limit 20/min). Response schema not shown in docs — handle defensively.
- `GET /v2/server/{server_api_id}/player?cftools_id={id}` — individual player stats
  including `playtime` for that server (rate limit 120/min)
- `GET /v1/server/{server_api_id}/leaderboard?stat=playtime&order=-1&limit=N` — also
  available if a public leaderboard page is wanted later

### Once credentials exist, Claude writes:
- Discord OAuth2 login flow
- Steam OpenID 2.0 login flow
- Account-linking (one player profile with both identities attached)
- Supabase schema: players, linked_accounts, playtime_cache, rewards_ledger
- Wheel-spin eligibility logic based on CFTools playtime
- Secured REST endpoint for the Gwarz-UI mod to fetch/claim pending rewards
- In-game claim menu (mod-side Enforce Script)

## Known open items on the base site
- Rules section still has placeholder text
- Steam Query Port in `script.js` is a guess (2402) — worth confirming via
  dayzsalauncher.com's "Check Server" tool
