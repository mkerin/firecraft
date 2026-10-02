// End-to-end check against a running server: two new users, a challenge, and a full game played by the
// computer player through the socket. Run `npx wrangler dev` first, then `node server/smoke.mjs [url]`.

import { PROTOCOL, randomDeck } from '../js/cards.js';
import * as AI from '../js/ai.js';

const base = process.argv[2] || 'http://localhost:8787';
const assert = (ok, what) => { if (!ok) { console.error('FAIL:', what); process.exit(1); } console.log('ok  ', what); };

async function login(body) {
  const res = await fetch(`${base}/api/login`, { method: 'POST', body: JSON.stringify(body) });
  return { status: res.status, ...(await res.json()) };
}

// A socket that remembers the latest lobby and game view and lets us wait for a message.
function client(token) {
  const ws = new WebSocket(`${base.replace(/^http/, 'ws')}/ws`);
  const c = { ws, lobby: null, game: null, errors: [], waiters: [] };
  ws.onopen = () => ws.send(JSON.stringify({ type: 'hello', token, v: PROTOCOL }));
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'lobby') c.lobby = msg;
    if (msg.type === 'game') c.game = msg;
    if (msg.type === 'error') c.errors.push(msg.reason);
    c.waiters = c.waiters.filter((w) => !w(msg));
  };
  c.next = (pred) => new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timed out')), 5000);
    c.waiters.push((msg) => (pred(msg) ? (clearTimeout(t), resolve(msg), true) : false));
  });
  c.send = (msg) => ws.send(JSON.stringify(msg));
  return c;
}

const tag = Date.now().toString(36).slice(-5);
const ann = await login({ name: `Ann ${tag}` });
const bob = await login({ name: `Bob ${tag}` });
assert(ann.token && bob.token, 'two users can sign up');
assert((await login({ name: `ann ${tag}` })).status === 409, 'names are unique, ignoring case');
assert((await login({ token: ann.token })).name === `Ann ${tag}`, 'a token signs back in');

const a = client(ann.token);
const b = client(bob.token);
await Promise.all([a.next((m) => m.type === 'lobby'), b.next((m) => m.type === 'lobby')]);
assert(a.lobby.players.some((p) => p.id === bob.id), 'the lobby lists other players');

a.send({ type: 'challenge', to: bob.id, deck: { 'ember-ash': 50 } });
await a.next((m) => m.type === 'error');
assert(a.errors.at(-1).includes('not legal'), 'illegal decks are refused');

a.send({ type: 'challenge', to: bob.id, deck: randomDeck() });
const lobbyB = await b.next((m) => m.type === 'lobby' && m.challenges.some((ch) => ch.fromId === ann.id));
const challenge = lobbyB.challenges.find((ch) => ch.fromId === ann.id);
assert(challenge, 'the challenged player sees the challenge');

b.send({ type: 'accept', id: challenge.id, deck: randomDeck() });
const opened = await b.next((m) => m.type === 'game' && m.open);
assert(opened.seat === 1, 'accepting opens the game in seat 1');
assert(opened.view.players[0].hand.every((x) => x.hidden), 'the other hand is hidden');
assert(opened.view.players[1].hand.every((x) => x.cardId), 'your own hand is visible');
a.send({ type: 'open', game: opened.id });
await a.next((m) => m.type === 'game' && m.open);

// Play to the end: whoever must act chooses with the AI on their own view and sends the action.
const players = [a, b];
let moves = 0;
while (players[0].game.view.winner === null && moves < 2000) {
  const view = players[0].game.view;
  const seat = AI.actor(view).index;
  const me = players[seat];
  const other = players[1 - seat];
  if (moves === 0) {
    other.send({ type: 'act', game: opened.id, action: { type: 'end-turn' } });
    await other.next((m) => m.type === 'error');
    assert(other.errors.at(-1) === 'It is not your move.', 'players cannot act out of turn');
  }
  const action = AI.chooseAction({ ...me.game.view, rng: Math.random });
  me.send({ type: 'act', game: opened.id, action });
  await Promise.all(players.map((p) => p.next((m) => m.type === 'game' || m.type === 'error')));
  if (me.errors.length > 1) { console.error(action, me.errors); process.exit(1); }
  moves++;
}
const final = players[0].game.view;
assert(final.winner !== null, `a full game finishes (${moves} moves, ${final.players[final.winner].name} won)`);
assert(a.lobby.games.find((g) => g.id === opened.id).finished, 'the lobby marks it finished');

a.ws.close();
b.ws.close();
