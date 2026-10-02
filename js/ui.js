// Browser UI: title -> deck building -> battle, either hot-seat (two people, one device), against the
// computer (ai.js), or online (net.js: login -> lobby -> battle, with the server running the engine).
// All game rules live in engine.js.

import {
  CARDS, CARDS_BY_ID, TYPES, TYPE_INFO, BEATS, BEAT_VERB, ABILITIES, RULES,
  card, hasAbility, maxCopiesOf, deckSize, deckToList, validateDeck, fillWithEmbers, randomDeck,
} from './cards.js';
import * as E from './engine.js';
import * as AI from './ai.js';
import * as Net from './net.js';
import { ART_DEFS, cardArt } from './art.js';

const store = {
  get(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
  },
};

const SAVE_KEY = 'firecraft.save';
const NET_KEY = 'firecraft.online'; // { token } for online play
const CPU_NAME = 'Virgil';
const CPU_INDEX = 1; // against the computer, the human is always player 0

// blocks: [{ blocker, attacker }] in the order chosen; picking: a blocker waiting for its attacker to be clicked.
const freshSelection = () => ({ attackers: [], blocks: [], picking: null, moloch: null });

const app = {
  screen: 'title', // title | build | pass | battle
  names: store.get('firecraft.names') || ['Ignatius', 'Morgana'],
  decks: [null, null],
  build: null, // { pi, counts, filter }
  pass: null, // { title, sub, btn, next }
  game: null,
  sel: freshSelection(),
  toast: null,
  flash: [false, false],
  drawnUid: null,
  knownUids: new Set(),
  openInfo: new Set(), // uids whose info drawer is pinned open
  confirming: null, // action awaiting its confirming second click
  cpu: null, // index of the computer player, or null for hot-seat
  net: null, // online session: { token, conn, lobby, status: connecting | open | offline | outdated }
  remote: null, // the online game on screen: { id, seat }. app.game is then the server's view of it.
  loginError: null,
  showCode: false,
};

// The seat this device plays, or null in hot-seat, where the device follows the turn.
const mySeat = () => (app.remote ? app.remote.seat : app.cpu !== null ? 1 - app.cpu : null);

// True while the other side (the computer or an online opponent) has to act.
const waitingOnOther = () => {
  const g = app.game;
  const seat = mySeat();
  return seat !== null && g && g.winner === null && E.actor(g).index !== seat;
};

const cpuActing = () => app.cpu !== null && waitingOnOther();

const root = document.getElementById('app');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- shared pieces ----------

const gem = (type) => `<span class="gem" style="--c:${TYPE_INFO[type].color}"></span>`;

function costGems(def) {
  if (def.kind === 'ember') return '';
  let out = def.costEach ? TYPES.map(gem).join('') : Array(def.cost).fill(gem(def.type)).join('');
  if (hasAbility(def, 'burnt-offering')) out += '<span class="gem skull" title="Also sacrifice a creature">☠</span>';
  return out;
}

function abilityHtml(def) {
  if (def.kind === 'ember') {
    return def.type === 'wild'
      ? '<p><b>Wild.</b> Discard to pay 1 cost of any type.</p>'
      : `<p>Discard to pay 1 <b>${TYPE_INFO[def.type].name}</b> cost.</p>`;
  }
  return def.abilities
    .filter((a) => a !== 'legendary')
    .map((a) => `<p><b>${ABILITIES[a].name}.</b> ${ABILITIES[a].text}</p>`)
    .join('');
}

// The ▾ arrow on cards in play: hover it to peek at what the card does, click to pin it open.
function infoButton(uid) {
  const open = app.openInfo.has(uid);
  return `<button class="info-btn ${open ? 'open' : ''}" data-action="info" data-uid="${uid}" title="What does this do?" aria-expanded="${open}">▾</button>`;
}

function infoPop(def, inst) {
  const g = app.game;
  const weakTo = TYPES.find((t) => BEATS[t] === def.type);
  const rows = [];
  if (def.kind === 'creature') {
    const cost = def.costEach ? '1 Ember of each type' : `${def.cost} ${TYPE_INFO[def.type].name} Ember${def.cost > 1 ? 's' : ''}`;
    const curDef = inst.defMod ? `${E.currentDef(inst)} <small>(${inst.defMod} from smoke)</small>` : def.def;
    rows.push(`<div class="ip-stats"><span class="stat atk">${def.atk}</span><span class="stat def">${curDef}</span><span class="ip-cost">Cost: ${cost}${hasAbility(def, 'burnt-offering') ? ' + a sacrifice' : ''}</span></div>`);
    rows.push(`<p class="ip-matchup"><span class="good">+${RULES.advantageBonus} vs ${TYPE_INFO[BEATS[def.type]].name}</span> · <span class="bad">${TYPE_INFO[weakTo].name} gets +${RULES.advantageBonus} vs it</span></p>`);
  }
  rows.push(abilityHtml(def) || '<p class="muted">No special abilities.</p>');
  if (g && inst.summonedTurn === g.turn && def.kind === 'creature' && !hasAbility(def, 'charge') && !hasAbility(def, 'cannot-attack')) {
    rows.push('<p class="muted">Just summoned: it can attack next turn.</p>');
  }
  return `<div class="info-pop t-${def.type}"><div class="ip-head">${esc(def.name)}</div>${rows.join('')}</div>`;
}

function renderCard(def, { cls = '', inst = null } = {}) {
  const beats = def.kind === 'creature'
    ? `<span class="beats" title="+${RULES.advantageBonus} in combat against ${TYPE_INFO[BEATS[def.type]].name}">▲ ${TYPE_INFO[BEATS[def.type]].name}</span>`
    : '';
  const kind = def.kind === 'creature' ? 'Creature' : 'Ember';
  const info = inst ? `${infoButton(inst.uid)}${infoPop(def, inst)}` : '';
  const open = inst && app.openInfo.has(inst.uid) ? 'info-open' : '';
  return `<article class="card t-${def.type} ${def.kind} ${cls} ${open}" data-card="${def.id}">
    ${info}
    <header><span class="name">${esc(def.name)}</span><span class="cost">${costGems(def)}</span></header>
    <div class="art">${cardArt(def.id)}</div>
    <div class="typeline"><span>${TYPE_INFO[def.type].name} ${kind}${hasAbility(def, 'legendary') ? ' · Legendary' : ''}</span>${beats}</div>
    <div class="text">${abilityHtml(def)}<p class="flavor">${esc(def.flavor)}</p></div>
    ${def.kind === 'creature' ? `<footer><span class="stat atk" title="Attack">${def.atk}</span><span class="stat def" title="Defense">${def.def}</span></footer>` : ''}
  </article>`;
}

const cardBack = () => `<div class="card-back"><svg viewBox="0 0 40 56"><path d="M20,44 C10,38 8,26 16,14 C16,22 20,24 20,16 C26,24 32,34 20,44 Z" fill="url(#flame)"/></svg></div>`;

function typeWheel() {
  const parts = TYPES.map((t) => `<span class="chip t-${t}">${TYPE_INFO[t].name}</span><span class="verb">${BEAT_VERB[t]}</span>`);
  return `<div class="wheel">${parts.join('')}<span class="chip t-brimstone">Brimstone</span></div>`;
}

// ---------- title ----------

function timeAgo(ms) {
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

function savedBattleHtml() {
  const save = store.get(SAVE_KEY);
  if (!save?.game) return '';
  const [a, b] = save.game.players;
  return `<div class="saved-battle">
    <div class="eyebrow">Battle in progress · saved ${timeAgo(save.savedAt)}</div>
    <div class="sb-score">${esc(a.name)} <b>${Math.max(0, a.health)}</b> <span>vs</span> <b>${Math.max(0, b.health)}</b> ${esc(b.name)} <span>· turn ${save.game.turn}</span></div>
    <div class="actions"><button class="btn primary big" data-action="resume">Continue battle</button>
    ${app.confirming === 'discard-save'
      ? '<button class="btn small danger" data-action="discard-save">Really discard?</button><button class="btn ghost small" data-action="cancel-confirm">Keep it</button>'
      : '<button class="btn ghost small" data-action="discard-save">Discard</button>'}</div>
  </div>`;
}

function renderTitle() {
  return `<div class="title-screen">
    <div class="rising-embers">${Array.from({ length: 28 }, (_, i) => `<i style="--x:${(i * 37) % 100}%;--d:${4 + (i % 5)}s;--delay:${(i * 0.7) % 6}s"></i>`).join('')}</div>
    <h1 class="logo">Firecraft</h1>
    <p class="tagline">Two firecrafting wizards. Fifty cards each. One walks out of the inferno.</p>
    <div class="names">
      <label>First wizard<input data-name="0" value="${esc(app.names[0])}" maxlength="20"></label>
      <label>Second wizard <small>(hot-seat)</small><input data-name="1" value="${esc(app.names[1])}" maxlength="20"></label>
    </div>
    ${savedBattleHtml()}
    <div class="modes">
      <button class="btn ${store.get(SAVE_KEY) ? '' : 'primary'} big" data-action="start-cpu" title="You build a deck; ${CPU_NAME} brings a random one">Play against ${CPU_NAME}</button>
      <button class="btn big" data-action="start-build" title="Two players taking turns on this device">Two players, one device</button>
      <button class="btn big" data-action="online" title="Challenge other players on their own devices">Play online</button>
    </div>
    <section class="rules">
      <h3>How a turn works</h3>
      <ol>
        <li><b>Draw</b> a card.</li>
        <li><b>Summon</b> one creature by discarding Embers of its type from your hand.</li>
        <li><b>Attack</b> with any rested creatures. The defender sends each blocker at one attacker (several can gang up on one). A blocker soaks up to its DEF and is destroyed if it soaks its full DEF. Whatever gets past burns the wizard.</li>
      </ol>
      <p>Everyone starts with ${RULES.startingHealth} health and ${RULES.openingHand} cards. Newly summoned creatures can't attack until your next turn unless they have <b>Charge</b>. A creature gets <b>+${RULES.advantageBonus}</b> against a type it beats:</p>
      ${typeWheel()}
    </section>
  </div>`;
}

// ---------- deck builder ----------

function builderEyebrow(b) {
  if (b.online) return b.online.type === 'challenge' ? `Challenging ${esc(b.online.name)}` : `Answering ${esc(b.online.name)}'s challenge`;
  return app.cpu !== null ? `${CPU_NAME} brings a random deck` : `Deck ${b.pi + 1} of 2`;
}

function renderBuild() {
  const b = app.build;
  const counts = b.counts;
  const size = deckSize(counts);
  const v = validateDeck(counts);
  const pool = CARDS.filter((c) => b.filter === 'all' || (b.filter === 'ember' ? c.kind === 'ember' : c.type === b.filter));
  const filters = ['all', ...TYPES, 'ember'];
  const filterLabel = (f) => (f === 'all' ? 'All' : f === 'ember' ? 'Embers' : TYPE_INFO[f].name);
  const creatures = Object.entries(counts).filter(([id]) => card(id).kind === 'creature');
  const nCreatures = creatures.reduce((s, [, n]) => s + n, 0);
  const avgCost = nCreatures ? (creatures.reduce((s, [id, n]) => s + card(id).cost * n, 0) / nCreatures).toFixed(1) : '–';
  const typeRows = TYPES.map((t) => {
    const cr = creatures.filter(([id]) => card(id).type === t).reduce((s, [, n]) => s + n, 0);
    const em = counts[`ember-${t}`] || 0;
    if (!cr && !em) return '';
    return `<div class="type-row t-${t}"><span class="chip t-${t}">${TYPE_INFO[t].name}</span><span>${cr} creatures</span><span>${em} embers</span></div>`;
  }).join('');
  const list = Object.entries(counts)
    .sort(([a], [b2]) => (card(a).kind === card(b2).kind ? card(a).cost - card(b2).cost : card(a).kind === 'creature' ? -1 : 1))
    .map(([id, n]) => `<li class="t-${card(id).type}" data-card="${id}"><span class="dot"></span>${esc(card(id).name)}<span class="n">×${n}</span><button class="x" data-action="dec" data-id="${id}" title="Remove one">−</button></li>`)
    .join('');
  const saved = store.get(`firecraft.deck.${b.pi}`);

  return `<div class="builder">
    <div class="builder-main">
      <header class="topbar">
        <div><div class="eyebrow">${builderEyebrow(b)}</div><h2>${esc(b.online ? app.net.lobby.me.name : app.names[b.pi])}, forge your deck</h2></div>
        <div class="filters">${filters.map((f) => `<button class="pill ${f === b.filter ? 'on' : ''} ${TYPES.includes(f) ? `t-${f}` : ''}" data-action="filter" data-filter="${f}">${filterLabel(f)}</button>`).join('')}</div>
      </header>
      <p class="hint">Click a card to add it, right-click (or −) to remove. Take as many copies as you like, except Lucifer (1) and Hellfire Embers (2).</p>
      <div class="pool">${pool.map((def) => {
        const n = counts[def.id] || 0;
        const max = maxCopiesOf(def);
        return `<div class="pool-item ${n ? 'in-deck' : ''}" data-pool-id="${def.id}">
          <div data-action="inc" data-id="${def.id}">${renderCard(def)}</div>
          <div class="ctrl">
            <button data-action="dec" data-id="${def.id}" ${n ? '' : 'disabled'}>−</button>
            <span>${n}${max === Infinity ? '' : ` / ${max}`}</span>
            <button data-action="inc" data-id="${def.id}" ${n >= max || size >= RULES.deckSize ? 'disabled' : ''}>+</button>
          </div>
        </div>`;
      }).join('')}</div>
    </div>
    <aside class="deck-panel">
      <div class="count ${size === RULES.deckSize ? 'full' : ''}"><b>${size}</b> / ${RULES.deckSize}</div>
      <div class="bar"><div style="width:${Math.min(100, (size / RULES.deckSize) * 100)}%"></div></div>
      <div class="stats"><span>${nCreatures} creatures</span><span>${size - nCreatures} embers</span><span>avg cost ${avgCost}</span></div>
      ${typeRows}
      <div class="tools">
        <button class="btn" data-action="fill" ${size >= RULES.deckSize ? 'disabled' : ''} title="Fill empty slots with Embers in proportion to your creatures' costs">Fill with Embers</button>
        <button class="btn" data-action="random">Random deck</button>
        ${saved ? '<button class="btn" data-action="load">Load last deck</button>' : ''}
        <button class="btn ghost" data-action="clear">Clear</button>
        ${b.online ? '<button class="btn ghost" data-action="lobby">Back to lobby</button>' : ''}
      </div>
      ${v.errors.filter((e) => !e.startsWith('Deck has')).map((e) => `<p class="msg error">${esc(e)}</p>`).join('')}
      ${v.warnings.map((w) => `<p class="msg warn">${esc(w)}</p>`).join('')}
      <ul class="decklist">${list || '<li class="empty">Your deck is empty.</li>'}</ul>
      <button class="btn primary big" data-action="confirm-deck" ${v.ok ? '' : 'disabled'}>${v.ok ? 'Seal this deck' : `Add ${RULES.deckSize - size > 0 ? RULES.deckSize - size : 'or remove'} cards`}</button>
    </aside>
  </div>`;
}

// ---------- pass screen ----------

function renderPass() {
  const p = app.pass;
  return `<div class="pass-screen"><div class="pass-card">
    <svg class="sigil" viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="none" stroke="#ff6a1a" stroke-width="1.5" opacity=".6"/>
      <path d="M50,84 C26,72 22,48 38,22 C38,38 48,42 48,26 C64,42 76,66 50,84 Z" fill="url(#flame)" filter="url(#glow)"/></svg>
    <h2>${esc(p.title)}</h2><p>${esc(p.sub)}</p>
    <button class="btn primary big" data-action="pass-continue">${esc(p.btn)}</button>
  </div></div>`;
}

// ---------- battle ----------

function playerBar(p, side) {
  const g = app.game;
  const pct = Math.max(0, Math.min(100, (p.health / RULES.startingHealth) * 100));
  let role = '';
  if (g.phase === 'block') role = p.index === g.active ? '<span class="role atk">Attacking</span>' : '<span class="role def">Defending</span>';
  else if (p.index === g.active && g.winner === null) role = '<span class="role turn">Your turn</span>';
  return `<div class="pbar ${side}">
    <div class="pname">${esc(p.name)} ${role}</div>
    <div class="health ${app.flash[p.index] ? 'hit' : ''} ${pct < 30 ? 'low' : ''}">
      <div class="fill" style="width:${pct}%"></div><span>${Math.max(0, p.health)} / ${RULES.startingHealth}</span>
    </div>
    <div class="piles">
      <span title="Cards left in deck">Deck ${p.deck.length}</span>
      <span title="Cards in hand">Hand ${p.hand.length}</span>
      <span title="Discard pile">Discard ${p.discard.length}</span>
    </div>
  </div>`;
}

// The creatures this unit would fight right now: the declared attack or chosen blocks during a block,
// otherwise everything on the other side of the field.
function opponentsOf(p, inst) {
  const g = app.game;
  const other = g.players[1 - p.index];
  if (g.phase === 'block') {
    const blocks = app.sel.blocks;
    let uids;
    if (p.index === g.active) uids = blocks.filter((b) => b.attacker === inst.uid).map((b) => b.blocker);
    else {
      const mine = blocks.find((b) => b.blocker === inst.uid);
      uids = mine ? [mine.attacker] : blockableAttackers();
    }
    return uids.map((uid) => other.field.find((c) => c.uid === uid)).filter(Boolean);
  }
  return other.field;
}

function blockableAttackers() {
  const g = app.game;
  const att = E.activePlayer(g);
  return g.attack.attackers.filter((uid) => !hasAbility(card(att.field.find((c) => c.uid === uid)), 'ethereal'));
}

// ▲ this creature beats something it faces (+3 for it), ▼ something it faces beats it (+3 for them).
function matchupHtml(p, inst, def) {
  const opp = [...new Set(opponentsOf(p, inst).map((c) => card(c).type))];
  const bonus = RULES.advantageBonus;
  const me = TYPE_INFO[def.type].name;
  const marks = [];
  const prey = opp.find((t) => BEATS[def.type] === t);
  const threat = opp.find((t) => BEATS[t] === def.type);
  if (prey) marks.push(`<span class="mu up" title="${me} ${BEAT_VERB[def.type]} ${TYPE_INFO[prey].name}: +${bonus} when they meet in combat">▲${bonus}</span>`);
  if (threat) marks.push(`<span class="mu down" title="${TYPE_INFO[threat].name} ${BEAT_VERB[threat]} ${me}: they get +${bonus} when they meet in combat">▼${bonus}</span>`);
  return marks.length ? `<div class="mus">${marks.join('')}</div>` : '';
}

function unitHtml(p, inst) {
  const g = app.game;
  const def = card(inst);
  const isActive = p.index === g.active;
  const cls = ['unit', `t-${def.type}`];
  let title = '';
  let badge = '';
  let hint = '';
  if (g.phase === 'attack' && isActive) {
    const check = E.canAttack(g, inst.uid);
    if (app.sel.attackers.includes(inst.uid)) cls.push('selected', 'attacking');
    else if (check.ok) cls.push('can-act');
    else { cls.push('dim'); title = check.reason; }
  }
  if (g.phase === 'block') {
    const blocks = app.sel.blocks;
    const nameOf = (owner, uid) => esc(card(owner.field.find((c) => c.uid === uid)).name.split(',')[0]);
    if (isActive && g.attack.attackers.includes(inst.uid)) {
      cls.push('attacking');
      const row = E.previewCombat(g, blocks).attackRows.find((r) => r.uid === inst.uid);
      if (hasAbility(def, 'ethereal')) hint = '<div class="bhint bad" title="Ethereal: cannot be blocked">unblockable</div>';
      else if (app.sel.picking) {
        // What sending the chosen blocker at this attacker would do, so a type disadvantage isn't a surprise.
        cls.push('can-act', 'target');
        const now = E.previewCombat(g, blocks).damage;
        const r = E.previewCombat(g, [...blocks, { blocker: app.sel.picking, attacker: inst.uid }]);
        const lost = r.blockRows.find((b) => b.uid === app.sel.picking).destroyed;
        const diff = r.damage - now;
        hint = `<div class="bhint ${diff >= 0 ? 'bad' : ''}" title="Block this: you take ${r.damage} instead of ${now}${lost ? ', and your blocker is destroyed' : ''}">
          ${diff < 0 ? `saves ${-diff}` : diff > 0 ? `+${diff} dmg!` : 'saves 0'}${lost ? ' · dies' : ''}</div>`;
      } else {
        hint = `<div class="bhint ${row.through ? 'bad' : ''}" title="ATK getting past its blockers">${row.through} gets through</div>`;
      }
    }
    if (!isActive) {
      const i = blocks.findIndex((b) => b.blocker === inst.uid);
      if (i >= 0) {
        cls.push('selected', 'blocking');
        badge = `<span class="order">${i + 1}</span>`;
        hint = `<div class="bhint neutral">blocks ${nameOf(E.activePlayer(g), blocks[i].attacker)}</div>`;
      } else if (app.sel.picking === inst.uid) {
        cls.push('selected', 'picking');
        hint = '<div class="bhint neutral">pick an attacker ↓</div>';
      } else cls.push('can-act');
    }
  }
  if (g.phase === 'summon' && app.sel.moloch && isActive) cls.push('can-act', 'sacrifice');
  if (!app.knownUids.has(inst.uid)) { cls.push('fresh'); app.knownUids.add(inst.uid); }
  if (app.openInfo.has(inst.uid)) cls.push('info-open');
  const sick = isActive && inst.summonedTurn === g.turn && !hasAbility(def, 'charge') && !hasAbility(def, 'cannot-attack');
  const def2 = E.currentDef(inst);
  const martyrBtn = E.canMartyr(g, p.index, inst.uid).ok && (mySeat() === null || p.index === mySeat())
    ? `<button class="mini-btn" data-action="martyr" data-owner="${p.index}" data-uid="${inst.uid}" title="Destroy it to restore 6 health">Martyr +6</button>`
    : '';
  return `<div class="${cls.join(' ')}" data-action="unit" data-uid="${inst.uid}" data-owner="${p.index}" data-card="${def.id}" title="${esc(title)}">
    <div class="art">${cardArt(def.id)}<span class="utype">${TYPE_INFO[def.type].name}</span>${matchupHtml(p, inst, def)}</div>
    <div class="uname">${esc(def.name.split(',')[0])}</div>
    <div class="ustats"><span class="stat atk">${def.atk}</span><span class="stat def ${inst.defMod < 0 ? 'debuff' : ''}">${def2}</span></div>
    ${hint}${badge}${sick ? '<span class="zz" title="Summoning sickness: attacks next turn">z<sup>z</sup></span>' : ''}${martyrBtn}
    ${infoButton(inst.uid)}${infoPop(def, inst)}
  </div>`;
}

function fieldHtml(p) {
  if (!p.field.length) return '<div class="empty">No creatures on the field</div>';
  return p.field.map((inst) => unitHtml(p, inst)).join('');
}

function handCard(inst) {
  const g = app.game;
  const def = card(inst);
  const cls = [];
  let title = '';
  if (def.kind === 'creature' && g.phase === 'summon' && !app.sel.moloch && !waitingOnOther()) {
    const check = E.canSummon(g, inst.uid);
    cls.push(check.ok ? 'playable' : 'unplayable');
    title = check.ok ? 'Click to summon' : check.reason;
  }
  if (inst.uid === app.drawnUid) cls.push('drawn');
  if (app.sel.moloch === inst.uid) cls.push('selected');
  return `<div class="hand-slot" data-action="hand" data-uid="${inst.uid}" title="${esc(title)}">${renderCard(def, { cls: cls.join(' '), inst })}</div>`;
}

// Embers are a resource, not something you play, so the hand shows them as compact stacks per type.
function emberStack(cardId, list) {
  const def = card(cardId);
  const n = list.length;
  const cls = [`ember-stack`, `t-${def.type}`, n > 1 ? 'multi' : '', n > 2 ? 'multi3' : '', list.some((c) => c.uid === app.drawnUid) ? 'drawn' : ''];
  return `<div class="${cls.join(' ')}" data-card="${cardId}" data-ember="${cardId}" title="${n}× ${esc(def.name)}">
    <div class="art">${cardArt(cardId)}</div>
    <div class="es-name">${TYPE_INFO[def.type].name}</div>
    <span class="es-count">×${n}</span><span class="es-pay"></span>
  </div>`;
}

function handHtml(p) {
  const creatures = p.hand.filter((c) => card(c).kind === 'creature');
  const groups = new Map();
  for (const c of p.hand) if (card(c).kind === 'ember') groups.set(c.cardId, [...(groups.get(c.cardId) || []), c]);
  const order = [...TYPES.map((t) => `ember-${t}`), 'ember-wild'].filter((id) => groups.has(id));
  const nEmbers = p.hand.length - creatures.length;
  return `${creatures.map(handCard).join('') || '<div class="hand-empty">No creatures in hand</div>'}
    ${nEmbers ? `<div class="hand-embers"><div class="he-label">Embers <b>${nEmbers}</b></div>
      <div class="stacks">${order.map((id) => emberStack(id, groups.get(id))).join('')}</div></div>` : ''}`;
}

// While hovering a summonable creature, light up the Ember stacks it would spend.
function showPayment(slot) {
  document.querySelectorAll('.ember-stack.paying').forEach((el) => el.classList.remove('paying'));
  const g = app.game;
  if (!slot || !g || g.phase !== 'summon') return;
  const check = E.canSummon(g, Number(slot.dataset.uid));
  if (!check.ok) return;
  const hand = E.activePlayer(g).hand;
  const counts = {};
  for (const uid of check.payment) {
    const id = hand.find((c) => c.uid === uid).cardId;
    counts[id] = (counts[id] || 0) + 1;
  }
  for (const [id, n] of Object.entries(counts)) {
    const el = document.querySelector(`.ember-stack[data-ember="${id}"]`);
    if (!el) continue;
    el.classList.add('paying');
    el.querySelector('.es-pay').textContent = `−${n}`;
  }
}

function combatHtml(r, baseline = null) {
  const g = app.game;
  const dfn = g.players[r.defender];
  const name = (id) => esc(card(id).name.split(',')[0]);
  const atkRows = r.attackRows.map((a) => `<li class="t-${card(a.cardId).type}">${name(a.cardId)} <b>${a.atk}</b>
      ${a.mods.length ? `<small>${esc(a.mods.join(', '))}</small>` : ''}${a.ethereal ? ' <small class="tag">unblockable</small>' : ''}
      ${a.blockers?.length ? ` <small>· ${a.through} gets through</small>` : ''}
      ${r.slainAttackers.includes(a.uid) ? ' <small class="tag bad">turned to salt</small>' : ''}</li>`).join('');
  const target = (b) => {
    const a = r.attackRows.find((x) => x.uid === b.attacker);
    return a ? ` blocks ${name(a.cardId)},` : '';
  };
  const blkRows = r.blockRows.map((b, i) => `<li class="t-${card(b.cardId).type}">${i + 1}. ${name(b.cardId)}${target(b)} soaks <b>${b.absorbed}</b>/${b.def}
      ${b.mods.length ? `<small>${esc(b.mods.join(', '))}</small>` : ''}
      ${b.destroyed ? ' <small class="tag bad">destroyed</small>' : ' <small class="tag good">survives</small>'}</li>`).join('');
  return `<div class="combat">
    <div><h4>Attack</h4><ul>${atkRows}</ul></div>
    <div><h4>Blocks</h4><ul>${blkRows || '<li class="muted">No blockers</li>'}</ul></div>
    <div class="verdict">${r.totalAttack} ATK → ${esc(dfn.name)} takes <b class="dmg">${r.damage}</b>
      ${baseline !== null && r.blockRows.length ? `<small class="${baseline <= r.damage ? 'tag bad' : ''}">(no block: ${baseline})</small>` : ''}
      ${r.hooks ? '<small class="tag bad">Hooks: discards a card</small>' : ''}</div>
  </div>`;
}

function phaseBar() {
  const g = app.game;
  const me = E.activePlayer(g);
  const foe = E.defendingPlayer(g);
  const order = ['draw', 'summon', 'attack', 'block', 'end'];
  const at = order.indexOf(g.phase);
  const steps = ['Draw', 'Summon', 'Attack', 'Block']
    .map((s, i) => `<span class="step ${i < at ? 'done' : ''} ${i === at ? 'now' : ''}">${s}</span>`).join('<span class="arrow">›</span>');
  let prompt = '';
  let buttons = '';
  let extra = '';

  if (waitingOnOther()) {
    const doing = { summon: 'is summoning', attack: 'is choosing attackers', block: 'is choosing blockers', end: 'surveys the field' };
    prompt = `<span class="thinking">${esc(E.actor(g).name)} ${doing[g.phase] || 'is thinking'}…</span>`;
    if (g.phase === 'block') extra = combatHtml(E.previewCombat(g, []));
    if (g.phase === 'end' && g.lastCombat) extra = combatHtml(g.lastCombat);
  } else if (g.phase === 'summon') {
    if (app.sel.moloch) {
      prompt = 'Choose one of your creatures to sacrifice to Moloch.';
      buttons = '<button class="btn ghost" data-action="cancel-moloch">Cancel</button>';
    } else if (g.summonedThisTurn) {
      prompt = 'Your creature answers the call.';
      buttons = '<button class="btn primary" data-action="to-attack">To battle ›</button>';
    } else if (app.confirming === 'redraw') {
      prompt = `Discard all ${me.hand.length} cards in your hand and draw ${me.hand.length} new ones? You won't summon this turn.`;
      buttons = `<button class="btn primary danger" data-action="redraw">Yes, redraw</button>
        <button class="btn ghost" data-action="cancel-confirm">Cancel</button>`;
    } else {
      prompt = 'Summon one creature: click a glowing card in your hand (Embers are paid automatically), or redraw your hand instead.';
      buttons = `<button class="btn ghost" data-action="redraw" title="Discard your whole hand, draw the same number of cards, and skip summoning this turn">Discard &amp; redraw ${me.hand.length}</button>
        <button class="btn" data-action="to-attack">Skip to attack ›</button>`;
    }
  } else if (g.phase === 'attack') {
    const forced = E.forcedAttackers(g);
    const total = app.sel.attackers.reduce((s, uid) => s + card(me.field.find((c) => c.uid === uid)).atk, 0);
    prompt = `Choose attackers. ${app.sel.attackers.length ? `${app.sel.attackers.length} selected, ${total} base ATK.` : ''}${forced.length ? ' Relentless creatures must attack.' : ''}`;
    buttons = `<button class="btn primary" data-action="attack" ${app.sel.attackers.length ? '' : 'disabled'}>Attack</button>
      ${forced.length ? '' : '<button class="btn" data-action="skip-attack">Don\'t attack</button>'}`;
  } else if (g.phase === 'block') {
    const picking = app.sel.picking && foe.field.find((c) => c.uid === app.sel.picking);
    prompt = picking
      ? `Now click the attacker ${esc(card(picking).name.split(',')[0])} should block.`
      : `${esc(foe.name)}, defend! Click one of your creatures, then the attacker it should block.`;
    extra = combatHtml(E.previewCombat(g, app.sel.blocks), E.previewCombat(g, []).damage);
    const any = app.sel.blocks.length || app.sel.picking;
    buttons = `<button class="btn primary" data-action="block">${app.sel.blocks.length ? 'Confirm blocks' : 'Take the hit'}</button>
      ${any ? '<button class="btn ghost" data-action="clear-blocks">Reset</button>' : ''}`;
  } else if (g.phase === 'end') {
    prompt = g.lastCombat ? 'The smoke clears.' : 'No attack this turn.';
    if (g.lastCombat) extra = combatHtml(g.lastCombat);
    buttons = '<button class="btn primary" data-action="end-turn">End turn ›</button>';
  }

  return `<div class="phasebar">
    <div class="steps">${steps}</div>
    <div class="prompt">${prompt}</div>
    ${extra}
    ${app.toast ? `<div class="toast">${esc(app.toast)}</div>` : ''}
    <div class="actions">${buttons}</div>
  </div>`;
}

function inspectorDefault() {
  return `<div class="inspector-empty"><p>Hover over any card to inspect it.</p>${typeWheel()}<p class="small">A creature gets +${RULES.advantageBonus} ATK or DEF against a type it beats.</p></div>`;
}

function renderBattle() {
  const g = app.game;
  // Hot-seat: the active player sits at the bottom, and their hand is hidden while the defender holds the device.
  // Against the computer, the human always sits at the bottom and always sees their own hand.
  // Online, each player sits at the bottom of their own screen in the same way.
  const seat = mySeat();
  const me = seat !== null ? g.players[seat] : E.activePlayer(g);
  const foe = g.players[1 - me.index];
  const hideHand = seat === null && g.phase === 'block';
  // Whoever holds the device sees their own secret entries (e.g. the names of cards they drew).
  const viewer = hideHand ? foe.index : me.index;
  const log = g.log.slice(-120).reverse().map((e) => {
    const text = e.secret?.player === viewer ? e.secret.text : e.text;
    return `<li class="log-${e.kind}"><span class="lt">${e.turn}</span>${esc(text)}</li>`;
  }).join('');
  const winner = g.winner !== null ? g.players[g.winner] : null;
  return `<div class="battle">
    <main class="board">
      ${playerBar(foe, 'foe')}
      <div class="foe-hand">${foe.hand.map(() => cardBack()).join('')}</div>
      <div class="field foe-field">${fieldHtml(foe)}</div>
      ${phaseBar()}
      <div class="field my-field">${fieldHtml(me)}</div>
      <div class="hand ${hideHand ? 'hidden-hand' : ''}">${hideHand ? me.hand.map(() => cardBack()).join('') : handHtml(me)}</div>
      ${playerBar(me, 'me')}
    </main>
    <aside class="sidebar">
      ${netBanner()}
      <div id="inspector" class="inspector">${inspectorDefault()}</div>
      <h4>Chronicle</h4>
      <ul class="log">${log}</ul>
      ${app.remote ? onlineBattleButtons() : '<button class="btn ghost small" data-action="quit" title="The battle is saved after every move">Save &amp; quit to title</button>'}
    </aside>
    ${winner ? `<div class="overlay"><div class="victory">
      <div class="eyebrow">Turn ${g.turn}</div>
      <h1>${esc(winner.name)} triumphs</h1>
      <p>${esc(g.players[1 - g.winner].name)} is consumed by the flames.</p>
      <div class="actions">${app.remote ? '<button class="btn primary big" data-action="lobby">Back to the lobby</button>' : `<button class="btn primary big" data-action="rematch">Rematch</button>
      <button class="btn big" data-action="new-decks">Forge new decks</button>`}</div>
    </div></div>` : ''}
  </div>`;
}

// ---------- flow ----------

function startGame(firstPlayer = 0) {
  const names = app.cpu !== null ? [app.names[0], CPU_NAME] : [...app.names];
  app.game = E.createGame({ decks: app.decks.map(deckToList), names, firstPlayer });
  app.knownUids = new Set();
  app.openInfo = new Set();
  showTurnPass('The battle begins.');
}

// The whole engine state is plain data apart from its rng, so it round-trips through JSON.
function saveGame() {
  const g = app.game;
  if (!g || app.remote) return; // online games live on the server
  if (g.winner !== null) { store.remove(SAVE_KEY); return; }
  store.set(SAVE_KEY, { game: { ...g, rng: undefined }, decks: app.decks, names: app.names, cpu: app.cpu, savedAt: Date.now() });
}

function resumeGame() {
  const save = store.get(SAVE_KEY);
  if (!save?.game) return;
  app.game = { ...save.game, rng: Math.random };
  app.decks = save.decks;
  app.cpu = save.cpu ?? null;
  if (app.cpu === null) app.names = save.names;
  app.sel = freshSelection();
  app.drawnUid = null;
  app.openInfo = new Set();
  app.knownUids = new Set(app.game.players.flatMap((p) => p.field.map((c) => c.uid)));
  // Whoever has to act next takes the device: the defender mid-block, otherwise the active player.
  const g = app.game;
  if (app.cpu !== null) { app.screen = 'battle'; return; }
  const actor = g.phase === 'block' ? E.defendingPlayer(g) : E.activePlayer(g);
  app.pass = {
    title: g.phase === 'block' ? `${actor.name} is under attack` : `Welcome back. ${actor.name}'s turn`,
    sub: `Turn ${g.turn}. Pass the device to ${actor.name}.`,
    btn: `I am ${actor.name}`,
    next: () => { app.screen = 'battle'; },
  };
  app.screen = 'pass';
}

function showTurnPass(prefix = '') {
  const g = app.game;
  app.sel = freshSelection();
  if (g.winner !== null) { app.screen = 'battle'; return; }
  const p = E.activePlayer(g);
  app.drawnUid = p.index === app.cpu ? null : p.hand.at(-1)?.uid ?? null;
  // No device to pass against the computer.
  if (app.cpu !== null) { app.screen = 'battle'; return; }
  app.pass = {
    title: `${prefix ? `${prefix} ` : ''}${p.name}'s turn`,
    sub: 'Pass the device. Your hand will be revealed.',
    btn: `I am ${p.name}`,
    next: () => { app.screen = 'battle'; },
  };
  app.screen = 'pass';
}

// online: { type: 'challenge', to, name } or { type: 'accept', id, name } when building a deck for an online game.
function startBuild(pi, online = null) {
  const last = online ? store.get('firecraft.deck.0') : app.decks[pi];
  app.build = { pi, counts: last ? { ...last } : {}, filter: 'all', online };
  app.screen = 'build';
}

// Run an engine action; surface its reason as a toast if it was refused.
function run(result) {
  if (result && !result.ok) app.toast = result.reason;
  return result?.ok;
}

// Play a move given as data: locally through the engine, or online by sending it to the server, which
// answers with the new view (or an error toast). Online it returns true as soon as the move is sent.
function perform(action) {
  if (!app.remote) return run(E.applyAction(app.game, action));
  if (send({ type: 'act', game: app.remote.id, action })) return true;
  return false;
}

const actions = {
  'start-build': () => { app.cpu = null; app.decks = [null, null]; startBuild(0); },
  'start-cpu': () => { app.cpu = CPU_INDEX; app.decks = [null, null]; startBuild(0); },
  filter: (d) => { app.build.filter = d.filter; },
  inc: (d) => {
    const c = app.build.counts;
    if ((c[d.id] || 0) < maxCopiesOf(card(d.id)) && deckSize(c) < RULES.deckSize) c[d.id] = (c[d.id] || 0) + 1;
  },
  dec: (d) => {
    const c = app.build.counts;
    if (c[d.id]) c[d.id]--;
    if (!c[d.id]) delete c[d.id];
  },
  fill: () => { app.build.counts = fillWithEmbers(app.build.counts); },
  random: () => { app.build.counts = randomDeck(); },
  load: () => { app.build.counts = store.get(`firecraft.deck.${app.build.pi}`) || {}; },
  clear: () => { app.build.counts = {}; },
  'confirm-deck': () => {
    const pi = app.build.pi;
    app.decks[pi] = { ...app.build.counts };
    store.set(`firecraft.deck.${pi}`, app.decks[pi]);
    const online = app.build.online;
    if (online) {
      const deck = app.decks[pi];
      if (send(online.type === 'challenge' ? { type: 'challenge', to: online.to, deck } : { type: 'accept', id: online.id, deck })) app.screen = 'lobby';
      return;
    }
    if (app.cpu !== null) {
      app.decks[app.cpu] = randomDeck();
      return startGame(Math.random() < 0.5 ? 0 : 1);
    }
    if (pi === 1) return startGame(0);
    app.pass = {
      title: `Pass to ${app.names[1]}`,
      sub: 'Time to forge the second deck. No peeking.',
      btn: `I am ${app.names[1]}`,
      next: () => startBuild(1),
    };
    app.screen = 'pass';
  },
  'pass-continue': () => { const next = app.pass.next; app.pass = null; next(); },

  hand: (d) => {
    const g = app.game;
    const uid = Number(d.uid);
    if (g.phase !== 'summon' || app.sel.moloch) return;
    const check = E.canSummon(g, uid);
    if (!check.ok) { if (card(E.activePlayer(g).hand.find((c) => c.uid === uid)).kind === 'creature') app.toast = check.reason; return; }
    if (check.needsSacrifice) app.sel.moloch = uid;
    else perform({ type: 'summon', uid });
  },
  'cancel-moloch': () => { app.sel.moloch = null; },
  unit: (d) => {
    const g = app.game;
    const uid = Number(d.uid);
    const owner = Number(d.owner);
    if (g.phase === 'summon' && app.sel.moloch && owner === g.active) {
      perform({ type: 'summon', uid: app.sel.moloch, sacrificeUid: uid });
      app.sel.moloch = null;
    } else if (g.phase === 'attack' && owner === g.active) {
      const list = app.sel.attackers;
      if (list.includes(uid)) {
        if (E.forcedAttackers(g).includes(uid)) app.toast = 'Relentless: this creature must attack.';
        else list.splice(list.indexOf(uid), 1);
      } else if (run(E.canAttack(g, uid))) list.push(uid);
    } else if (g.phase === 'block' && owner !== g.active) {
      const sel = app.sel;
      const i = sel.blocks.findIndex((b) => b.blocker === uid);
      if (i >= 0) sel.blocks.splice(i, 1);
      else if (sel.picking === uid) sel.picking = null;
      else {
        const targets = blockableAttackers();
        if (!targets.length) app.toast = 'None of the attackers can be blocked.';
        else if (targets.length === 1) sel.blocks.push({ blocker: uid, attacker: targets[0] });
        else sel.picking = uid;
      }
    } else if (g.phase === 'block' && owner === g.active) {
      const sel = app.sel;
      if (!sel.picking) { app.toast = 'Click one of your creatures first, then the attacker it should block.'; return; }
      const block = { blocker: sel.picking, attacker: uid };
      const problem = E.blockProblem(g, [...sel.blocks, block]);
      if (problem) app.toast = problem;
      else { sel.blocks.push(block); sel.picking = null; }
    }
  },
  martyr: (d) => {
    const uid = Number(d.uid);
    app.sel.blocks = app.sel.blocks.filter((b) => b.blocker !== uid);
    if (app.sel.picking === uid) app.sel.picking = null;
    perform({ type: 'martyr', owner: Number(d.owner), uid });
  },
  // Native confirm() is suppressed in some embedded browsers, so risky buttons ask for a second click instead.
  redraw: (d, confirmed) => {
    if (!confirmed) { app.confirming = 'redraw'; return; }
    if (perform({ type: 'redraw' })) {
      app.sel.attackers = E.forcedAttackers(app.game);
      app.drawnUid = null;
    }
  },
  'to-attack': () => {
    if (perform({ type: 'to-attack' })) app.sel.attackers = E.forcedAttackers(app.game);
  },
  attack: () => { if (perform({ type: 'attack', uids: app.sel.attackers })) app.sel = freshSelection(); },
  'skip-attack': () => { perform({ type: 'attack', uids: [] }); },
  'clear-blocks': () => { app.sel.blocks = []; app.sel.picking = null; },
  block: () => { if (perform({ type: 'block', blocks: app.sel.blocks })) app.sel = freshSelection(); },
  'end-turn': () => { if (perform({ type: 'end-turn' }) && !app.remote) showTurnPass(); },
  info: (d) => {
    const uid = Number(d.uid);
    if (app.openInfo.has(uid)) app.openInfo.delete(uid);
    else app.openInfo.add(uid);
  },
  rematch: () => startGame(1 - app.game.winner),
  'new-decks': () => startBuild(0),
  resume: () => resumeGame(),
  'discard-save': (d, confirmed) => {
    if (confirmed) store.remove(SAVE_KEY);
    else app.confirming = 'discard-save';
  },
  'cancel-confirm': () => {},
  quit: () => { app.screen = 'title'; },

  // ---------- online ----------
  online: () => {
    const saved = store.get(NET_KEY);
    if (saved?.token) goOnline(saved.token);
    else app.screen = 'login';
  },
  login: async () => {
    const name = root.querySelector('[name=login-name]')?.value ?? '';
    const code = root.querySelector('[name=login-code]')?.value.trim();
    app.loginError = null;
    const res = await Net.login(code ? { token: code } : { name });
    if (res.error) app.loginError = res.error;
    else { store.set(NET_KEY, { token: res.token }); goOnline(res.token); }
    render();
  },
  title: () => { leaveOnline(); app.screen = 'title'; },
  lobby: () => { app.remote = null; app.game = null; app.screen = 'lobby'; },
  'device-code': () => { app.showCode = !app.showCode; },
  reload: () => location.reload(),
  challenge: (d) => startBuild(0, { type: 'challenge', to: Number(d.id), name: d.name }),
  accept: (d) => startBuild(0, { type: 'accept', id: Number(d.id), name: d.name }),
  decline: (d) => { send({ type: 'decline', id: Number(d.id) }); },
  'cancel-challenge': (d) => { send({ type: 'cancel', id: Number(d.id) }); },
  'open-game': (d) => { send({ type: 'open', game: Number(d.id) }); },
  concede: (d, confirmed) => {
    if (confirmed) send({ type: 'concede', game: app.remote.id });
    else app.confirming = 'concede';
  },
};

// ---------- online ----------

function send(msg) {
  if (app.net?.conn.send(msg)) return true;
  app.toast = 'Not connected to the server. Reconnecting…';
  return false;
}

function goOnline(token) {
  leaveOnline();
  const net = { token, lobby: null, status: 'connecting' };
  net.conn = Net.connect(token, {
    onMessage: onNetMessage,
    onStatus: (status) => {
      net.status = status;
      // After a reconnect, ask for the game on screen again in case moves were missed.
      if (status === 'open' && app.remote) net.conn.send({ type: 'open', game: app.remote.id });
      render();
    },
  });
  app.net = net;
  app.screen = 'lobby';
}

function leaveOnline() {
  app.net?.conn.close();
  app.net = null;
  app.remote = null;
}

function onNetMessage(msg) {
  if (msg.type === 'lobby') {
    app.net.lobby = msg;
    if (app.screen !== 'lobby') return;
  } else if (msg.type === 'game') {
    if (app.remote?.id === msg.id && app.screen === 'battle') updateRemoteGame(msg.view);
    else if (msg.open) enterRemoteGame(msg);
    else return;
  } else if (msg.type === 'error') {
    app.toast = msg.reason;
  } else if (msg.type === 'auth-failed') {
    store.remove(NET_KEY);
    leaveOnline();
    app.loginError = 'Your sign-in was not recognised. Please sign in again.';
    app.screen = 'login';
  } else if (msg.type === 'outdated') {
    app.net.status = 'outdated';
  }
  render();
}

function enterRemoteGame({ id, seat, view }) {
  app.remote = { id, seat };
  app.cpu = null;
  app.game = view;
  app.sel = freshSelection();
  app.drawnUid = null;
  app.openInfo = new Set();
  app.knownUids = new Set(view.players.flatMap((p) => p.field.map((c) => c.uid)));
  app.screen = 'battle';
}

// A new view from the server: flash damage, and start a fresh selection when the phase moves on.
function updateRemoteGame(view) {
  const old = app.game;
  const seat = app.remote.seat;
  app.game = view;
  app.flash = view.players.map((p, i) => p.health < old.players[i].health);
  if (view.turn !== old.turn || view.phase !== old.phase) {
    app.sel = freshSelection();
    if (view.phase === 'attack' && view.active === seat) app.sel.attackers = E.forcedAttackers(view);
  }
  if (view.turn !== old.turn) app.drawnUid = view.active === seat ? view.players[seat].hand.at(-1)?.uid ?? null : null;
}

function netBanner() {
  const status = app.net?.status;
  if (status === 'outdated') return '<div class="net-banner">A new version of Firecraft is out. <button class="btn small primary" data-action="reload">Refresh</button></div>';
  if (status === 'offline') return '<div class="net-banner">Connection lost. Reconnecting…</div>';
  return '';
}

function onlineBattleButtons() {
  const concede = app.confirming === 'concede'
    ? '<button class="btn small danger" data-action="concede">Really concede?</button><button class="btn ghost small" data-action="cancel-confirm">No</button>'
    : `<button class="btn ghost small" data-action="concede" ${app.game.winner !== null ? 'disabled' : ''}>Concede</button>`;
  return `<div class="actions">${concede}<button class="btn ghost small" data-action="lobby" title="The battle carries on; come back any time">Back to lobby</button></div>`;
}

function renderLogin() {
  return `<div class="lobby login">
    <h1 class="logo">Firecraft</h1>
    <form class="login-form" data-submit="login">
      <label>Your wizard name<input name="login-name" maxlength="20" autocomplete="off" value="${esc(app.names[0])}"></label>
      <details><summary>Signed in on another device?</summary>
        <label>Paste the sign-in code it shows<input name="login-code" autocomplete="off"></label>
      </details>
      ${app.loginError ? `<p class="msg error">${esc(app.loginError)}</p>` : ''}
      <div class="actions"><button class="btn primary big" type="submit">Enter</button>
      <button class="btn ghost" type="button" data-action="title">Back</button></div>
      <p class="hint">No password for now: the name is yours on this device. Use the sign-in code to add another device.</p>
    </form>
  </div>`;
}

function renderLobby() {
  const net = app.net;
  const l = net.lobby;
  if (!l) return `<div class="lobby">${netBanner()}<p class="muted">Connecting to the inferno…</p><button class="btn ghost" data-action="title">Back</button></div>`;
  const row = (inner, cls = '') => `<li class="lrow ${cls}">${inner}</li>`;
  const active = l.games.filter((g) => !g.finished);
  const finished = l.games.filter((g) => g.finished).slice(0, 5);
  const incoming = l.challenges.filter((c) => c.toId === l.me.id);
  const outgoing = l.challenges.filter((c) => c.fromId === l.me.id);
  const gameRow = (g) => row(`<span class="who">vs ${esc(g.opponent.name)}</span>
    <span class="state">${g.finished ? (g.won ? 'You won' : 'You lost') : g.yourMove ? '<b>Your move</b>' : 'Their move'} · turn ${g.turn} · ${timeAgo(g.updated)}</span>
    <button class="btn small ${g.yourMove ? 'primary' : ''}" data-action="open-game" data-id="${g.id}">${g.finished ? 'View' : 'Continue'}</button>`, g.yourMove ? 'hot' : '');
  return `<div class="lobby">
    ${netBanner()}
    <header class="topbar">
      <div><div class="eyebrow">Online</div><h2>Welcome, ${esc(l.me.name)}</h2></div>
      <div class="actions"><button class="btn ghost small" data-action="device-code">Sign in on another device</button>
      <button class="btn ghost small" data-action="title">Back to title</button></div>
    </header>
    ${app.showCode ? `<p class="msg">Your sign-in code is <code>${esc(net.token)}</code>. On the other device, choose Play online and paste it under "Signed in on another device?". Keep it private: anyone with it can play as you.</p>` : ''}
    ${app.toast ? `<div class="toast">${esc(app.toast)}</div>` : ''}
    <section><h3>Your battles</h3>
      <ul class="lrows">${active.map(gameRow).join('') || '<li class="muted">No battles yet. Challenge someone below.</li>'}</ul>
      ${finished.length ? `<h4>Finished</h4><ul class="lrows">${finished.map(gameRow).join('')}</ul>` : ''}
    </section>
    <section><h3>Challenges</h3><ul class="lrows">
      ${incoming.map((c) => row(`<span class="who">${esc(c.fromName)}</span><span class="state">challenges you</span>
        <button class="btn small primary" data-action="accept" data-id="${c.id}" data-name="${esc(c.fromName)}">Accept</button>
        <button class="btn small ghost" data-action="decline" data-id="${c.id}">Decline</button>`, 'hot')).join('')}
      ${outgoing.map((c) => row(`<span class="who">${esc(c.toName)}</span><span class="state">waiting for them to accept</span>
        <button class="btn small ghost" data-action="cancel-challenge" data-id="${c.id}">Cancel</button>`)).join('')}
      ${incoming.length || outgoing.length ? '' : '<li class="muted">No open challenges.</li>'}
    </ul></section>
    <section><h3>Wizards</h3><ul class="lrows">
      ${l.players.map((p) => row(`<span class="who"><span class="online-dot ${p.online ? 'on' : ''}" title="${p.online ? 'Online now' : 'Offline'}"></span>${esc(p.name)}</span>
        <button class="btn small" data-action="challenge" data-id="${p.id}" data-name="${esc(p.name)}" ${outgoing.some((c) => c.toId === p.id) ? 'disabled' : ''}>Challenge</button>`)).join('')
        || '<li class="muted">No one else is here yet. Send a friend the link.</li>'}
    </ul></section>
  </div>`;
}

// ---------- rendering & events ----------

function render() {
  const screens = { title: renderTitle, build: renderBuild, pass: renderPass, battle: renderBattle, login: renderLogin, lobby: renderLobby };
  root.innerHTML = screens[app.screen]();
  app.toast = null;
  app.flash = [false, false];
  scheduleCpu();
}

// ---------- the computer's turn ----------

let cpuTimer = null;

// One computer action at a time, with pauses so the human can follow what happened.
function scheduleCpu() {
  if (cpuTimer || app.screen !== 'battle' || !cpuActing()) return;
  const g = app.game;
  const action = AI.chooseAction(g);
  if (!action) return;
  // Linger on a combat result the human was part of before the computer ends its turn.
  const delay = action.type === 'end-turn' && g.lastCombat ? 2600 : action.type === 'to-attack' ? 500 : 1000;
  cpuTimer = setTimeout(() => {
    cpuTimer = null;
    if (app.game !== g || app.screen !== 'battle' || !cpuActing()) return;
    const before = g.players.map((p) => p.health);
    const result = AI.applyAction(g, action);
    if (!result.ok) { console.error('Computer action refused', action, result.reason); return; }
    app.flash = g.players.map((p, i) => p.health < before[i]);
    if (action.type === 'end-turn') showTurnPass();
    saveGame();
    render();
  }, delay);
}

// While the other side is acting, the board is read-only apart from these.
const WHILE_WAITING = ['info', 'quit', 'lobby', 'concede', 'cancel-confirm', 'reload'];

root.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  if (app.screen === 'battle' && waitingOnOther() && !WHILE_WAITING.includes(el.dataset.action)) return;
  const before = app.game?.players.map((p) => p.health);
  // A confirmation only lasts one click: clicking anything else cancels it.
  const confirmed = app.confirming === el.dataset.action;
  app.confirming = null;
  actions[el.dataset.action]?.(el.dataset, confirmed);
  if (before && app.game) app.flash = app.game.players.map((p, i) => p.health < before[i]);
  if (app.screen === 'battle' || app.screen === 'pass') saveGame();
  render();
});

// Forms (the online sign-in) submit with Enter as well as their button.
root.addEventListener('submit', (e) => {
  e.preventDefault();
  actions[e.target.dataset.submit]?.();
});

root.addEventListener('contextmenu', (e) => {
  const item = e.target.closest('[data-pool-id]');
  if (!item) return;
  e.preventDefault();
  actions.dec({ id: item.dataset.poolId });
  render();
});

root.addEventListener('input', (e) => {
  const i = e.target.dataset?.name;
  if (i === undefined) return;
  app.names[Number(i)] = e.target.value.trim() || `Wizard ${Number(i) + 1}`;
  store.set('firecraft.names', app.names);
});

let hoverSlot = null;

root.addEventListener('mouseover', (e) => {
  const slot = e.target.closest('.hand-slot');
  if (slot !== hoverSlot || (slot && !slot.isConnected)) { hoverSlot = slot; showPayment(slot); }
  const inspector = document.getElementById('inspector');
  const el = e.target.closest('[data-card]');
  if (!inspector || !el || inspector.dataset.showing === el.dataset.card) return;
  inspector.dataset.showing = el.dataset.card;
  inspector.innerHTML = renderCard(CARDS_BY_ID[el.dataset.card], { cls: 'big' });
});

document.body.insertAdjacentHTML('afterbegin', ART_DEFS);
render();
