# dtp.vexoul.net

<!-- conventions:begin: synced from vexouLuna/conventions; edit it there, then run `conventions sync` -->
[![CI](https://github.com/vexouLuna/doomtp-web/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/vexouLuna/doomtp-web/actions/workflows/ci.yml?query=branch%3Amain)
[![publish](https://github.com/vexouLuna/doomtp-web/actions/workflows/publish.yml/badge.svg?branch=main)](https://github.com/vexouLuna/doomtp-web/actions/workflows/publish.yml?query=branch%3Amain)
[![conventions v4.1.0](https://img.shields.io/badge/conventions-v4.1.0-blue)](https://github.com/vexouLuna/conventions/tree/v4.1.0)
[![websites_dtp](https://status.vexoul.net/api/v1/endpoints/websites_dtp/health/badge.svg)](https://status.vexoul.net)
[![websites_dtp uptime 7d](https://status.vexoul.net/api/v1/endpoints/websites_dtp/uptimes/7d/badge.svg)](https://status.vexoul.net)
<!-- conventions:end -->

The web pages of [doomtp-bot](https://github.com/vexouLuna/doomtp-bot), a Twitch chat bot with a composable command
language: its docs, the command reference, channel pages and chat's explain links. Vue 3 + TypeScript on the shared
[`@vex/ui`](https://github.com/vexouLuna/vex-ui) design, over the bot's JSON API. It replaces the bot's own
server-rendered pages (doomtp-bot ADR-0016).

```bash
npm install
npm run dev         # http://localhost:5176 (proxies the bot's paths, see below)
npm run typecheck   # vue-tsc
npm test            # vitest
npm run build       # → dist/
git config core.hooksPath .conventions/githooks   # once per clone: branch-name rules, see CONTRIBUTING.md
```

`main` is merge-only and branches follow [Conventional Branch](https://conventional-branch.github.io/)
(`feature/…`, `bugfix/…`, `hotfix/…`, `release/…`, `chore/…`). See [CONTRIBUTING.md](CONTRIBUTING.md).

## Pages

The same URLs as the bot's own pages, so links already out there keep working (chat's explain links included).

| path | what |
|---|---|
| `/` | what the bot is, "try it in chat", where to start, the channels it's in |
| `/docs/features` | every part of the bot, section by section |
| `/docs/commands` | every built-in and everything published for every channel, in a searchable table |
| `/docs/language` | the language reference, with the bot's own editor to try a line in, and the grammar |
| `/docs/api` | every endpoint of the JSON API, read from the bot's `/openapi.json` |
| `/channels/:login` | a channel's sign, tier and status, and the custom commands published there |
| `/overlay/:login` | the OBS chat overlay (below): bare, see-through, no sign-in |
| `/explain/:token` | the report behind a chat `explain` link |
| anything else | 404 |

### The chat overlay (`/overlay/:login`)

A bare, transparent page for an OBS browser source: the channel's chat as it is said. It follows the bot's live feed
(`GET /api/v2/channels/{login}/chat/live`, server-sent events, doomtp-bot ADR-0038), which is public for a channel whose
public chat log is on, and draws lines with the same renderer as the chat log (Twitch, 7TV, BTTV and FFZ emotes,
badges). A deleted message, a timed-out chatter's messages and a cleared chat disappear at once. A bot that doesn't
have the feed yet (404), or a channel that keeps its log private (401), leaves the page empty, asked again every
5 s, then 10, 20, 40 and every minute; the page never shows an error. After the feed's `end` event a `too_slow` or
`shutdown` reconnects, `log_private` stops. Lines missed while the connection was down are not filled in.

vexoul.net/obs_sources builds the link. By hand, every setting is optional and bounded:

| query | default | |
|---|---|---|
| `size` | 24 | text size, px (12 to 96) |
| `emote` | 0 | emote height, px (0 is 1.4 × the text; up to 192) |
| `color` | chatter's own | one colour for every name, `rrggbb` |
| `names` | `display` | `display`, `login` or `both` |
| `badges` | `on` | `off` hides badges |
| `pronouns` | off | `1` shows pronouns (below) |
| `lines` | 20 | the most lines on the page (1 to 100); older ones are removed from the page |
| `fade` | 0 | seconds a line stays before it fades and is removed (0 keeps it; 5 to 3600) |
| `history` | 0 | lines of the log's recent past shown at the start (0 to 100) |
| `notices` | off | `1` shows subs, raids and the like |
| `hidecommands` | off | `1` leaves out messages that are commands (`!so someone`) |
| `shadow` | `on` | `0`/`off` drops the text shadow |
| `p` | | a saved preset's public id on vex-auth, in place of the settings above |

**Pronouns.** With `pronouns=1` the page asks <https://api.pronouns.alejo.io/v1> (the service the Twitch Chat Pronouns
extension uses) from the browser OBS runs: one request for its table of pronouns, then one `GET /v1/users/<login>` per
chatter, once per chatter while the source is open. What that service receives is each chatter's Twitch login (and the
usual request metadata: the streamer's IP address); no message text, no channel. A failure shows no pronouns and nothing
else. The service publishes no written API reference or terms: this relies on what it answers. With the setting off
(the default) nothing is sent.

### Manage

Signing in adds a **Manage** bar at the top of every page, with a switcher for the channels you manage. There's no
separate admin site. Everything under `/manage` needs a session with the bot. Without one, you go through the bot's
Twitch sign-in and come back; if that isn't set up, you land on `/admin/login`. There are two ways in (the bot's
ADR-0017 and ADR-0026):

- **Sign in with Twitch** (`/auth/admin/login` on the bot, offered when the bot's `/api/v1/session` says
  `twitch_login`). The account menu's "Sign in" uses it too. Someone already signed in to their vexoul.net account
  without a bot session goes through it once per tab, silently.
  - **The bot's owners and admins** see everything.
  - **Everyone else** gets what they may do in chat:
    - In a channel they **moderate**: settings, modules, command rules, publications, triggers, filters, ignored
      users, backfill, runs and the chat log.
    - As the channel's **broadcaster**, also: logging, the "who may" roles, and leaving.
    - **Anyone signed in** gets Me, Explain, their own changes in Audit, and a button to add the bot to their own
      channel (at once), or to connect it for the full tier.

  The bot refuses anything above your rank itself; the pages just don't offer it. Failures come back as
  `/admin/login?error=<reason>`.
- **The admin password** (`ADMIN_PASSWORD`): the admin view, and the way in when Twitch is down. The bot takes it
  only from its local network by default (`ADMIN_PASSWORD_NETWORKS`), so from outside the page offers Twitch alone.

| path | what |
|---|---|
| `/admin/login` | sign in with Twitch, or with the admin password |
| `/manage` | your channels and your rank in each, adding the bot to your channel, recent changes |
| `/manage/me` | your channel, the channels you moderate, and what you changed |
| `/manage/channels/:login` | one channel: settings, modules, command rules (on or off, who may run it, log level), published packs, triggers and timers, word filter, ignored users; leave or rejoin |
| `/manage/explain` | explain an expression in any channel, and optionally run it; in a channel you manage, as a chatter you name, with the badges you pick |
| `/manage/audit` | configuration changes, from chat, here or an API key, and the writes the bot refused (`/api/v2/audit`): every channel's for an admin, else your channels' and your own |
| `/manage/bot` | bot admins: health, joining a channel, API keys |

Old `/admin/...` links redirect to `/manage/...`. The public channel page shows a "Manage" button to anyone who
manages that channel.

The session is the bot's cookie (`/api/v1/session`); every write sends the CSRF token it returns as
`X-CSRF-Token`. When the session runs out, the next request sends you to sign in again.

## The bot, same origin

The site expects to share an origin with the bot. The bot keeps serving:

- `/api/*`: the JSON API these pages read.
- `/auth/*`: the bot's Twitch OAuth (bot account, broadcaster connect).
- `/static/*`: the expression editor (`/static/editor/editor.js`, a `<dtb-editor>` web component), the bot's lexer
  (`/static/editor/tokens.js`, which colours every command line on these pages the way the editor does) and the
  railroad diagrams.
- `/healthz`, `/readyz`: health.
- Exactly `/docs` and `/openapi.json`: the bot's Swagger UI and OpenAPI document (`/docs/api` reads the latter).
  **`/docs/…` below it are this site's pages.**

Everything else is this site: a single-page app, so the server answers unknown paths with `index.html`. Because it
is one origin, there is no CORS, and the admin session stays a plain same-origin cookie.

In `npm run dev`, Vite forwards those paths to `VITE_DEV_BOT_TARGET` (see `.env.example`). The default is
`http://127.0.0.1:8080`, where doomtp-bot's `scripts/dev_api.py` serves the real API with made-up data and no Twitch:

```bash
# in a doomtp-bot checkout
docker compose --profile test up -d postgres-test
python scripts/dev_api.py
```

It has no Twitch sign-in; for the moderator view, open `http://127.0.0.1:8080/dev/login-as?user=alice` (a
moderator of `vexouluna`; `newcomer` is a plain user), then this site at `http://127.0.0.1:5176/manage`: the session cookie belongs to the host,
so use `127.0.0.1` for both, not `localhost`.

## Publishing

`.github/workflows/publish.yml` builds and pushes `dist/` to the `deploy` branch on every merge to `main`.
`@vex/ui` is pinned to a git tag in `package.json`, and Renovate opens the bumps.

## Infrastructure

This repo is host-agnostic: it builds and publishes, nothing more. Details about where or how the site is hosted
(machines, addresses, proxy or tunnel config, server paths, deploy scripts) belong in the private `homelab-docs`
repo and must never be committed here. `.gitignore` blocks `.env*` (except `.env.example`), `*.local.*` and
`/deploy.local/` so local host files can't slip in.

## Fonts

`public/fonts/twemoji-sign.woff2` is one glyph (🏜, the default command sign) cut from Twemoji, so the sign looks
the same in text, inputs and the editor on every system. Licences and how to rebuild it: `public/fonts/ATTRIBUTION.md`.

