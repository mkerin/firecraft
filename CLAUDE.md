# Firecraft

Two-player hot-seat card game in the browser. Each player is a "firecrafting wizard" who summons hellfire creatures (Dante's Inferno / biblical theme) to reduce the other wizard's health to 0. Plain ES modules, no build step, no dependencies.

## Hosting

- Public repo: https://github.com/mkerin/firecraft. GitHub Pages serves `main` (root) at https://mkerin.github.io/firecraft/, and every push to `main` redeploys within a minute or two. `.nojekyll` makes Pages serve the files as-is.
- Use relative asset paths only (the site lives under `/firecraft/`, not `/`).
- **Online play** is live at https://firecraft.emberworks.workers.dev (Cloudflare Workers free plan; workers.dev subdomain `emberworks`). One Worker serves the game files *and* the server, so the page and API share an origin (no CORS). `wrangler.toml` serves the repo root as static assets; `.assetsignore` keeps everything except the game files private. Deploy with `npx wrangler deploy` (the user must have run `npx wrangler login`). Until the user moves everyone over, GitHub Pages still serves the client; "Play online" there just reports that online play isn't available.
- Players' saves and decks are in their own browser's localStorage. Changing the save shape can break "Continue" for live players, so keep old saves loadable or discard them gracefully.

## Run & test

- Serve: `.venv/bin/python -m http.server 8123` (also the `firecraft` config in `.claude/launch.json`), open http://localhost:8123. ES modules need HTTP; `file://` won't work.
- Tests: `npm test` (Node's built-in `node:test`, `tests/engine.test.mjs`). Keep them green; add a test for every new rule.
- Python lives in the project `.venv` (made with `uv`); it is only used to serve files.
- Online, locally: the `firecraft-online` launch config runs `npx wrangler dev` on http://localhost:8787 (no Cloudflare login needed). Its database lives in `../.firecraft-dev-state`, outside the repo: inside the Dropbox-synced repo it made wrangler reload every second and drop every socket. Use `localhost` for one player and `127.0.0.1` for a second, since they are separate origins with separate storage.
- `node server/smoke.mjs [url]` (with the server running) signs up two users, challenges, and plays a whole game over the socket with the AI. Run it after server changes. It leaves those users and the game behind, so never point it at the live server (it refuses unless given `--prod`).
- **Test server:** `npx wrangler deploy --env test` publishes `firecraft-test` (https://firecraft-test.emberworks.workers.dev) with its own database. Deploy there and smoke-test it before deploying the live server.
- Wrangler runs via `npx` (no `node_modules` in the Dropbox folder).

## Layout

- `js/cards.js`: card pool, `RULES` constants, type wheel (`BEATS`), ability text (`ABILITIES`), deck helpers (`validateDeck`, `fillWithEmbers`, `randomDeck`). No DOM access.
- `js/engine.js`: all game rules. `applyAction(state, {type, ...})` runs a move given as data (used by the AI and the server), `actor(state)` is who must act, `viewFor(state, seat)` is what one player may see (other hand and both decks become `{hidden: true}`, other players' log secrets removed), and `concede`. Pure and DOM-free so the UI, tests and a future AI player share it. Actions mutate the state and return `{ ok, reason }` instead of throwing. Blocks are `[{ blocker, attacker }]` uids in the defender's order. `previewCombat(state, blocks)` computes the result without mutating; `declareBlock` validates it (`blockProblem`) and applies it.
- `js/ai.js`: the computer opponent ("Virgil"). `chooseAction(state)` returns the next action for whoever must act (the defender during a block, otherwise the active player), and `applyAction` performs it through the engine. Rules: martyr when at or below 30% health; summon the costliest affordable creature (Moloch eats the weakest non-Lucifer creature, and only if that's an upgrade); attack with everything that can (attackers never take damage except from Salt); block greedily, adding whichever single blocker→attacker pairing most improves a score until none does. The score: −damage (×2 at low health), −1000 for lethal, −worth of lost blockers, +worth of salted attackers. It never redraws. Tests are in `tests/ai.test.mjs`.
- `js/art.js`: a hand-built SVG scene (200×140) per card. Shared gradients/filters are in `ART_DEFS`, injected into the page once.
- `js/ui.js`: screens (title → deck builder P1 → pass → builder P2 → pass → battle; vs computer: title → builder → battle; online: title → login → lobby → builder (to challenge or accept) → battle). Re-renders `#app` via `innerHTML`, with event delegation on `data-action`.
- `js/net.js`: online transport. `login()` over HTTP, then `connect()` opens one WebSocket that sends `{type:'hello', token, v: PROTOCOL}` first and reconnects with backoff.
- `server/worker.js`: the Worker plus one Durable Object, `World`, that holds every user, challenge and game in its SQLite (tables `users`, `challenges`, `games`; game state is engine JSON). It runs the engine as the authority: `act` checks the sender is `E.actor` (or owns the martyr), calls `E.applyAction`, saves, and pushes each player `E.viewFor(state, seat)` plus a fresh lobby. Decks from clients go through `cleanDeck` + `validateDeck`. One object for everything is deliberate (simplest code); split games into their own objects only if it ever gets busy.
- `css/style.css`: all styling. Type colors come from `.t-<type>` setting `--tc`.

## Rules as implemented (agreed with the user)

- 50-card decks, **40 starting health**, opening hand 7. Turn = Draw → Summon → Attack → (defender) Block. Drawing from an empty deck costs 5 health (burnout).
- **Summon**: one creature per turn, paid by discarding Embers of its type from hand; Hellfire Embers are wild. Payment is automatic (exact type first, then wild). Lucifer costs one Ember of each type. Moloch also needs a sacrifice.
- **Redraw**: instead of summoning, discard the whole hand and draw the same number; the turn goes straight to Attack.
- **Summoning sickness**: creatures can't attack the turn they're summoned unless they have Charge (Harpy, Shade).
- **Combat is per attacker**: the defender sends each blocker at one attacker, and several blockers can gang up on one attacker, soaking in order. A blocker soaks up to its DEF and is destroyed if it soaks its full DEF. Whatever an attacker has left over hits the wizard, as does the full ATK of unblocked attackers. Attackers take no damage except via abilities (Pillar of Salt). Damage on surviving blockers resets each turn. (This replaced an earlier pooled model at the user's request.)
- **Type wheel**: Brimstone → Phlegethon → Pyre → Fallen → Ash → Brimstone. The +3 only counts within a pairing: an attacker gets +3 ATK if it beats any of *its* blockers, and a blocker gets +3 DEF if it beats the attacker it blocks. Unblocked attackers get no bonus.
- Per-pairing ability wording: Petrify gives −2 to the attacker it blocks; Pillar of Salt destroys the attacker it blocked; Unbowed protects while blocking a cost-1 creature; Hooks triggers if Malacoda's own ATK gets past its blockers; Ethereal attackers can't be assigned blockers.
- **Deck limits**: creatures are unlimited copies. Only Lucifer (Legendary, 1) and Hellfire Ember (2) are capped.
- Card tweaks made for the pooled-combat model: Shade is Ethereal (its ATK always hits the wizard); Locust discards a *random* enemy Ember. Scaled for 40 HP: Minotaur's Frenzy triggers below half health; Lucifer's Frozen Heart costs 10.
- Cost is roughly (ATK+DEF)/4, adjusted for abilities.
- **Economy cards** (one per type, low stats, card/Ember advantage instead): Plutus (Hoard: blocks and survives → random Ember from discard to hand), Usurer (Usury: ATK gets through → draw), Simon Magus (Simony: redraw draws 2 extra), Mammon (Avarice: your creatures cost 1 less, min 1, no stacking, not Lucifer; applied in `paymentFor`), Soothsayer (Foresight: extra draw at turn start). Bonus draws from an empty deck just fail; they never cause burnout.

## UI behaviour worth preserving

- **Online:** login is a name with no password; the server returns a token (localStorage `firecraft.online`) that *is* the login, and "Sign in on another device" shows it so it can be pasted on another device. In an online battle `app.remote = { id, seat }` and `app.game` is the server's view; moves go through `perform(action)` → `send({type:'act'})` and the screen updates when the new view arrives (`updateRemoteGame`). Online games are never saved to localStorage. `PROTOCOL` in `cards.js` is checked on connect; bump it when messages or rules change in a way that matters, and old pages show a Refresh banner.
- **Modes:** "Play against Virgil" (`app.cpu = 1`: the human is player 0, Virgil gets `randomDeck()`, the first player is random, and there are no pass screens) and "Two players, one device" (hot-seat, `app.cpu = null`). `cpu` is stored in the save. Against the computer, the human always sits at the bottom and sees their own hand. `scheduleCpu()` runs after every render and performs one computer action per timeout (about 1s, or 2.6s to linger on a combat result). Clicks are ignored while the computer acts, except info and quit.

- Hot-seat privacy: a pass-the-device screen between turns. The attacker's hand shows as card backs during the block phase. Chronicle log entries can carry a `secret: { player, text }` (e.g. drawn card names), shown only to the player holding the device; everyone else sees the public text.
- The chronicle logs draws, Embers paid for each summon, discards, triggers, and combat results.
- **Autosave**: after every action in battle, the game is saved to localStorage key `firecraft.save` (engine state is JSON apart from `rng`, which is restored as `Math.random`). The title screen shows "Continue battle"; the save is deleted when someone wins. Other keys: `firecraft.names`, `firecraft.deck.0/1`.
- The hand shows creatures as full cards; Embers are grouped as compact stacks on the right. Hovering a summonable creature highlights the Embers it would spend. Ember cards have a flatter frame than creatures.
- The ▾ info arrow on hand cards and field creatures: hover to peek, click to pin (stats, cost, matchups, abilities).
- Hovering any card shows it full size in the sidebar inspector.
- **Don't use `confirm()`/`alert()`.** The Browser pane cancels them instantly (`confirm` returns false). Risky buttons use a second click instead: set `app.confirming = '<action>'` and render a "Yes / Cancel" pair; the action runs when it receives `confirmed`.
- Type advantage is visible on the field. Each creature shows a type chip, plus ▲3/▼3 badges against what it currently faces. During a block, that is the declared attackers or the chosen blockers; otherwise it is the enemy field. Block UI: click your creature (it pulses, "pick an attacker"), then the attacker. With only one blockable attacker the block is assigned at once. While picking, each attacker shows what that block would do ("saves N · dies" or "+N dmg!"); otherwise attackers show "N gets through". Click an assigned blocker to unassign it. The combat preview shows "(no block: N)", because a weak-typed blocker switches on the attackers' +3.

## Working with the user

- The user plays real games in the Browser pane tab while changes are made. **Never reload or navigate their tab mid-game without asking.** Test in a separate tab instead, and stub storage writes first so their save and decks aren't clobbered: `Storage.prototype.setItem = () => {}; Storage.prototype.removeItem = () => {};`. Never read their hand or board during their game.
- After a change, tell them to refresh; the autosave brings the battle back via Continue.
- Claude may be asked to play as the second wizard through the browser tools. Only look at the board on Claude's own turns.

## Ideas / future work

The user asked for these (2026-10-01):

- **Save & share decks.** Keep several named decks per player rather than one `firecraft.deck.N` slot. Share a deck as a compact code or URL (e.g. `?deck=` with the `{cardId: count}` map encoded), so this works without a server. Import validates the deck with `validateDeck`.
- **Play between devices**: built (2026-10-02) as described above. Still to do: real auth (passkeys or email magic links can be added as other ways to get a token), and moving players off GitHub Pages onto the workers.dev URL (a redirect page on Pages). Changing the saved game shape now also needs a migration for games stored on the server.
- Planned: player-vs-Claude battles. The computer opponent (`ai.js`) already exists.
- Balance: in 300 Virgil-vs-Virgil games the first player won about 55%. Skipping the first player's opening draw is the suggested fix (not yet done).
