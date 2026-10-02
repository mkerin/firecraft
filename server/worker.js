// Online play server: a Cloudflare Worker that serves the game files, plus one Durable Object ("World")
// that holds every user, challenge and game in its SQLite storage and runs engine.js as the authority.
//
// HTTP:  POST /api/login {name} or {token} -> {id, name, token}
// WS:    /ws. The first message must be {type:'hello', token, v}. After that the client sends
//        challenge / cancel / decline / accept / open / act / concede, and the server pushes
//        {type:'lobby'} snapshots and {type:'game', id, seat, view} updates. Each player only ever
//        receives E.viewFor(state, seat), so the other hand and both decks stay hidden.

import { DurableObject } from 'cloudflare:workers';
import * as E from '../js/engine.js';
import { PROTOCOL, CARDS_BY_ID, validateDeck, deckToList } from '../js/cards.js';

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/login' || pathname === '/ws') return env.WORLD.getByName('world').fetch(request);
    return new Response('Not found', { status: 404 });
  },
};

const json = (body, status = 200) => Response.json(body, { status });

// Decks arrive from the client, so keep only real card ids with positive whole counts.
function cleanDeck(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const deck = {};
  for (const [id, n] of Object.entries(raw)) {
    if (!Object.hasOwn(CARDS_BY_ID, id) || !Number.isInteger(n) || n < 1) return null;
    deck[id] = n;
  }
  return validateDeck(deck).ok ? deck : null;
}

export class World extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, token TEXT NOT NULL UNIQUE, created INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS challenges (
      id INTEGER PRIMARY KEY, from_user INTEGER NOT NULL, to_user INTEGER NOT NULL, deck TEXT NOT NULL, created INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY, p0 INTEGER NOT NULL, p1 INTEGER NOT NULL, state TEXT NOT NULL,
      actor INTEGER, winner INTEGER, turn INTEGER, updated INTEGER)`);
    this.states = new Map(); // game id -> live engine state (rebuilt from SQL after the object sleeps)
  }

  rows(query, ...args) { return this.sql.exec(query, ...args).toArray(); }
  row(query, ...args) { return this.rows(query, ...args)[0] ?? null; }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/api/login' && request.method === 'POST') return this.login(await request.json().catch(() => ({})));
    if (url.pathname === '/ws' && request.headers.get('Upgrade') === 'websocket') {
      const [client, server] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response('Bad request', { status: 400 });
  }

  // No passwords yet: a name is claimed by whoever takes it first, and the token is the login.
  // The token can be entered on another device to sign in there.
  login({ name, token }) {
    if (token) {
      const user = this.row('SELECT id, name, token FROM users WHERE token = ?', String(token));
      return user ? json(user) : json({ error: 'That code is not recognised.' }, 401);
    }
    const clean = String(name ?? '').trim().replace(/\s+/g, ' ');
    if (!clean || clean.length > 20) return json({ error: 'Choose a name of 1 to 20 characters.' }, 400);
    if (this.row('SELECT 1 FROM users WHERE name = ?', clean)) {
      return json({ error: 'That name is taken. If it is yours, sign in with the code from your other device.' }, 409);
    }
    const user = { name: clean, token: crypto.randomUUID() };
    user.id = this.row('INSERT INTO users (name, token, created) VALUES (?, ?, ?) RETURNING id', clean, user.token, Date.now()).id;
    return json(user);
  }

  // ---------- sockets ----------

  userOf(ws) { return ws.deserializeAttachment()?.userId ?? null; }

  socketsOf(userId) { return this.ctx.getWebSockets().filter((ws) => this.userOf(ws) === userId); }

  send(ws, msg) {
    try { ws.send(JSON.stringify(msg)); } catch { /* socket already closed */ }
  }

  async webSocketMessage(ws, raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const userId = this.userOf(ws);
    if (msg.type === 'hello') return this.hello(ws, msg);
    if (userId === null) return this.send(ws, { type: 'auth-failed' });
    try {
      const handler = this.handlers[msg.type];
      const error = handler ? handler.call(this, ws, userId, msg) : `Unknown message ${msg.type}.`;
      if (error) this.send(ws, { type: 'error', reason: error });
    } catch (err) {
      // An engine action may have half-applied before throwing: drop the cached state so it reloads from SQL.
      if (msg.game) this.states.delete(msg.game);
      console.error(err);
      this.send(ws, { type: 'error', reason: 'Something went wrong on the server.' });
    }
  }

  webSocketClose(ws) {
    const userId = this.userOf(ws);
    ws.serializeAttachment(null);
    if (userId !== null) this.pushLobbyAll();
  }

  webSocketError(ws) { this.webSocketClose(ws); }

  hello(ws, { token, v }) {
    if (v !== PROTOCOL) { this.send(ws, { type: 'outdated' }); return ws.close(4000, 'outdated'); }
    const user = token && this.row('SELECT id FROM users WHERE token = ?', String(token));
    if (!user) { this.send(ws, { type: 'auth-failed' }); return ws.close(4001, 'auth failed'); }
    ws.serializeAttachment({ userId: user.id });
    this.pushLobbyAll(); // everyone's "online" dots change
  }

  // ---------- lobby ----------

  lobbyFor(userId) {
    const online = new Set(this.ctx.getWebSockets().map((ws) => this.userOf(ws)));
    const me = this.row('SELECT id, name FROM users WHERE id = ?', userId);
    const players = this.rows('SELECT id, name FROM users WHERE id != ? ORDER BY name', userId)
      .map((u) => ({ ...u, online: online.has(u.id) }));
    const challenges = this.rows(`SELECT c.id, c.from_user AS fromId, f.name AS fromName, c.to_user AS toId, t.name AS toName, c.created
      FROM challenges c JOIN users f ON f.id = c.from_user JOIN users t ON t.id = c.to_user
      WHERE c.from_user = ?1 OR c.to_user = ?1 ORDER BY c.created DESC`, userId);
    const games = this.rows(`SELECT g.id, g.p0, g.p1, a.name AS name0, b.name AS name1, g.actor, g.winner, g.turn, g.updated
      FROM games g JOIN users a ON a.id = g.p0 JOIN users b ON b.id = g.p1
      WHERE g.p0 = ?1 OR g.p1 = ?1 ORDER BY g.updated DESC LIMIT 50`, userId)
      .map((g) => {
        const seat = g.p0 === userId ? 0 : 1;
        return {
          id: g.id, turn: g.turn, updated: g.updated,
          opponent: { id: seat ? g.p0 : g.p1, name: seat ? g.name0 : g.name1 },
          finished: g.winner !== null,
          won: g.winner === seat,
          yourMove: g.winner === null && g.actor === seat,
        };
      });
    return { type: 'lobby', me, players, challenges, games };
  }

  pushLobby(...userIds) {
    for (const id of new Set(userIds)) {
      const sockets = this.socketsOf(id);
      if (sockets.length) { const lobby = this.lobbyFor(id); sockets.forEach((ws) => this.send(ws, lobby)); }
    }
  }

  pushLobbyAll() {
    this.pushLobby(...this.ctx.getWebSockets().map((ws) => this.userOf(ws)).filter((id) => id !== null));
  }

  // ---------- games ----------

  gameRow(id, userId) {
    const g = this.row('SELECT id, p0, p1, state FROM games WHERE id = ?', Number(id));
    if (!g || (g.p0 !== userId && g.p1 !== userId)) return null;
    return { ...g, seat: g.p0 === userId ? 0 : 1 };
  }

  loadState(g) {
    if (!this.states.has(g.id)) this.states.set(g.id, { ...JSON.parse(g.state), rng: Math.random });
    return this.states.get(g.id);
  }

  saveState(id, state) {
    this.sql.exec('UPDATE games SET state = ?, actor = ?, winner = ?, turn = ?, updated = ? WHERE id = ?',
      JSON.stringify({ ...state, rng: undefined }), E.actor(state).index, state.winner, state.turn, Date.now(), id);
  }

  sendGame(ws, g, state, open = false) {
    this.send(ws, { type: 'game', id: g.id, seat: g.seat, view: E.viewFor(state, g.seat), open });
  }

  // After a change, both players get their own view on every socket they have open, plus a fresh lobby.
  pushGame(g, state) {
    const players = [g.p0, g.p1];
    players.forEach((userId, seat) => {
      for (const ws of this.socketsOf(userId)) this.sendGame(ws, { ...g, seat }, state);
    });
    this.pushLobby(...players);
  }

  handlers = {
    challenge(ws, me, { to, deck }) {
      const clean = cleanDeck(deck);
      if (!clean) return 'That deck is not legal.';
      if (to === me || !this.row('SELECT 1 FROM users WHERE id = ?', to)) return 'No such player.';
      if (this.row('SELECT 1 FROM challenges WHERE from_user = ? AND to_user = ?', me, to)) return 'You have already challenged them.';
      this.sql.exec('INSERT INTO challenges (from_user, to_user, deck, created) VALUES (?, ?, ?, ?)', me, to, JSON.stringify(clean), Date.now());
      this.pushLobby(me, to);
    },

    cancel(ws, me, { id }) {
      const c = this.row('SELECT to_user FROM challenges WHERE id = ? AND from_user = ?', id, me);
      if (!c) return 'That challenge is gone.';
      this.sql.exec('DELETE FROM challenges WHERE id = ?', id);
      this.pushLobby(me, c.to_user);
    },

    decline(ws, me, { id }) {
      const c = this.row('SELECT from_user FROM challenges WHERE id = ? AND to_user = ?', id, me);
      if (!c) return 'That challenge is gone.';
      this.sql.exec('DELETE FROM challenges WHERE id = ?', id);
      this.pushLobby(me, c.from_user);
    },

    // The challenger sits in seat 0 and the accepter in seat 1; who goes first is random.
    accept(ws, me, { id, deck }) {
      const c = this.row('SELECT from_user, deck FROM challenges WHERE id = ? AND to_user = ?', id, me);
      if (!c) return 'That challenge is gone.';
      const clean = cleanDeck(deck);
      if (!clean) return 'That deck is not legal.';
      const names = [c.from_user, me].map((uid) => this.row('SELECT name FROM users WHERE id = ?', uid).name);
      const state = E.createGame({
        decks: [deckToList(JSON.parse(c.deck)), deckToList(clean)],
        names,
        firstPlayer: Math.random() < 0.5 ? 0 : 1,
      });
      this.sql.exec('DELETE FROM challenges WHERE id = ?', id);
      const gameId = this.row(`INSERT INTO games (p0, p1, state, actor, winner, turn, updated)
        VALUES (?, ?, '{}', 0, NULL, 0, ?) RETURNING id`, c.from_user, me, Date.now()).id;
      this.saveState(gameId, state);
      this.states.set(gameId, state);
      const g = { id: gameId, p0: c.from_user, p1: me };
      this.pushGame(g, state);
      this.sendGame(ws, { ...g, seat: 1 }, state, true);
    },

    open(ws, me, { game }) {
      const g = this.gameRow(game, me);
      if (!g) return 'No such game.';
      this.sendGame(ws, g, this.loadState(g), true);
    },

    act(ws, me, { game, action }) {
      const g = this.gameRow(game, me);
      if (!g) return 'No such game.';
      const state = this.loadState(g);
      if (state.winner !== null) return 'The game is over.';
      const mine = action?.type === 'martyr' ? action.owner === g.seat : E.actor(state).index === g.seat;
      if (!mine) return 'It is not your move.';
      const result = E.applyAction(state, action);
      if (!result.ok) return result.reason;
      this.saveState(g.id, state);
      this.pushGame(g, state);
    },

    concede(ws, me, { game }) {
      const g = this.gameRow(game, me);
      if (!g) return 'No such game.';
      const state = this.loadState(g);
      const result = E.concede(state, g.seat);
      if (!result.ok) return result.reason;
      this.saveState(g.id, state);
      this.pushGame(g, state);
    },
  };
}
