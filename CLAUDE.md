# Firecraft

Two-player hot-seat card game in the browser. Each player is a "firecrafting wizard" who summons hellfire creatures (Dante's Inferno / biblical theme) to reduce the other wizard's health to 0. Plain ES modules, no build step, no dependencies.

## Run & test

- Serve: `.venv/bin/python -m http.server 8123` (also the `firecraft` config in `.claude/launch.json`), open http://localhost:8123. ES modules need HTTP; `file://` won't work.
- Tests: `npm test` (Node's built-in `node:test`, `tests/engine.test.mjs`). Keep them green; add a test for every new rule.
- Python lives in the project `.venv` (made with `uv`); it is only used to serve files.

## Layout

- `js/cards.js`: card pool, `RULES` constants, type wheel (`BEATS`), ability text (`ABILITIES`), deck helpers (`validateDeck`, `fillWithEmbers`, `randomDeck`). No DOM access.
- `js/engine.js`: all game rules. Pure and DOM-free so the UI, tests and a future AI player share it. Actions mutate the state and return `{ ok, reason }` instead of throwing. Blocks are `[{ blocker, attacker }]` uids in the defender's order. `previewCombat(state, blocks)` computes the result without mutating; `declareBlock` validates it (`blockProblem`) and applies it.
- `js/art.js`: a hand-built SVG scene (200×140) per card. Shared gradients/filters are in `ART_DEFS`, injected into the page once.
- `js/ui.js`: screens (title → deck builder P1 → pass → builder P2 → pass → battle). Re-renders `#app` via `innerHTML`, with event delegation on `data-action`.
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

## UI behaviour worth preserving

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

- Planned: AI-vs-AI or player-vs-Claude battles driven by `engine.js`.
- Balance: random-game simulations favour the first player. Skipping the first player's opening draw is the suggested fix (not yet done).
