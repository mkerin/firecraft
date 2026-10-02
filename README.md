# Firecraft

A card game for the browser: play against the computer, two players on one device, or online against other players. Each player is a firecrafting wizard who summons creatures from Dante's Inferno to burn the other wizard down to 0 health.

**Play:** https://mkerin.github.io/firecraft/

- Build a 50-card deck of creatures and the Embers that pay for them, or take a random one.
- Each turn has three steps: draw, summon, attack. The defender sends each blocker at one attacker.
- Five types form a wheel: Brimstone, Phlegethon, Pyre, Fallen, Ash. Each type beats the next one for +3 when they meet in combat.

The game uses plain ES modules, so there is no build step and nothing to install. To run it locally, serve the folder over HTTP, e.g. `python -m http.server 8123`. Tests: `npm test`.

Online play runs on Cloudflare Workers with a Durable Object (`server/worker.js`). `npx wrangler dev` runs it locally, and `npx wrangler deploy` publishes the game and the server together.
