// Firecraft rules engine. Pure game logic with no DOM, so it can drive the UI, tests, or AI players.
//
// Turn flow: draw -> summon -> attack -> block (defender) -> end -> next player's draw.
// Every action validates the phase and returns { ok, reason } instead of throwing on illegal moves.

import { RULES, TYPES, BEATS, card, hasAbility } from './cards.js';

export function shuffle(list, rng = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function createGame({ decks, names = ['Player 1', 'Player 2'], rng = Math.random, firstPlayer = 0 }) {
  let uid = 1;
  const players = decks.map((list, index) => ({
    index,
    name: names[index],
    health: RULES.startingHealth,
    deck: shuffle(list.map((cardId) => ({ uid: uid++, cardId })), rng),
    hand: [],
    field: [],
    discard: [],
  }));
  const state = {
    players,
    active: firstPlayer,
    turn: 0,
    phase: 'setup',
    summonedThisTurn: false,
    attack: null, // { attackers: [uid] } while the defender is choosing blocks
    lastCombat: null,
    winner: null,
    log: [],
    rng,
  };
  for (const p of players) {
    for (let i = 0; i < RULES.openingHand; i++) drawCard(state, p.index);
    log(state, `${p.name} draws an opening hand of ${RULES.openingHand} cards.`, 'draw',
      { player: p.index, text: `${p.name} draws an opening hand: ${describeCards(p.hand.map((c) => c.cardId))}.` });
  }
  log(state, `${players[firstPlayer].name} goes first.`);
  beginTurn(state);
  return state;
}

// ---------- helpers ----------

const fail = (reason) => ({ ok: false, reason });
const OK = { ok: true };

export const activePlayer = (s) => s.players[s.active];
export const defendingPlayer = (s) => s.players[1 - s.active];

// `secret` is an optional { player, text } shown only to that player (e.g. which card they drew).
function log(state, text, kind = 'info', secret = null) {
  state.log.push({ turn: state.turn, text, kind, ...(secret && { secret }) });
}

// "2× Ember of Brimstone, Hellfire Ember"
function describeCards(cardIds) {
  const counts = new Map();
  for (const id of cardIds) counts.set(id, (counts.get(id) || 0) + 1);
  return [...counts].map(([id, n]) => `${n > 1 ? `${n}× ` : ''}${card(id).name}`).join(', ');
}

export function currentDef(inst) {
  return card(inst).def + (inst.defMod || 0);
}

function removeFrom(list, uid) {
  const i = list.findIndex((x) => x.uid === uid);
  return i === -1 ? null : list.splice(i, 1)[0];
}

function drawCard(state, pi) {
  const p = state.players[pi];
  const inst = p.deck.shift();
  if (inst) p.hand.push(inst);
  return inst || null;
}

function damage(state, pi, amount, source) {
  if (amount <= 0) return;
  const p = state.players[pi];
  p.health -= amount;
  log(state, `${p.name} takes ${amount} damage from ${source}.`, 'damage');
}

function heal(state, pi, amount, source) {
  const p = state.players[pi];
  const before = p.health;
  p.health = Math.min(RULES.startingHealth, p.health + amount);
  log(state, `${p.name} restores ${p.health - before} health from ${source}.`, 'heal');
}

function checkWinner(state) {
  if (state.winner !== null) return;
  const [a, b] = state.players;
  if (a.health > 0 && b.health > 0) return;
  if (a.health <= 0 && b.health <= 0) state.winner = a.health === b.health ? state.active : a.health > b.health ? 0 : 1;
  else state.winner = a.health <= 0 ? 1 : 0;
  state.phase = 'gameover';
  log(state, `${state.players[state.winner].name} is victorious!`, 'win');
}

// Remove a creature from the field and fire its death triggers.
function destroyCreature(state, pi, uid, reason) {
  const p = state.players[pi];
  const inst = removeFrom(p.field, uid);
  if (!inst) return;
  const def = card(inst);
  inst.defMod = 0;
  log(state, `${def.name} is ${reason}.`, 'destroy');
  if (hasAbility(def, 'rebirth')) {
    const at = Math.floor(state.rng() * (p.deck.length + 1));
    p.deck.splice(at, 0, inst);
    log(state, `${def.name} is reborn into ${p.name}'s deck.`);
  } else {
    p.discard.push(inst);
  }
  if (hasAbility(def, 'heresy')) {
    const ember = p.discard.find((c) => c.cardId === 'ember-pyre');
    if (ember) {
      removeFrom(p.discard, ember.uid);
      p.hand.push(ember);
      log(state, `${def.name} returns an Ember of the Pyre to ${p.name}'s hand.`);
    }
  }
  if (hasAbility(def, 'frozen-heart')) damage(state, pi, 10, `${def.name}'s Frozen Heart`);
}

// ---------- turn structure ----------

function beginTurn(state) {
  state.turn++;
  state.phase = 'draw';
  state.summonedThisTurn = false;
  state.attack = null;
  state.lastCombat = null;
  const p = activePlayer(state);
  log(state, `Turn ${state.turn}: ${p.name}.`, 'turn');
  const drawn = drawCard(state, p.index);
  if (drawn) {
    log(state, `${p.name} draws a card (${p.deck.length} left in deck).`, 'draw',
      { player: p.index, text: `${p.name} draws ${card(drawn).name} (${p.deck.length} left in deck).` });
  } else {
    damage(state, p.index, RULES.burnoutDamage, 'burnout (empty deck)');
    checkWinner(state);
    if (state.winner !== null) return;
  }
  state.phase = 'summon';
}

export function endTurn(state) {
  if (state.phase !== 'end') return fail('You can only end the turn after the attack phase.');
  state.active = 1 - state.active;
  beginTurn(state);
  return OK;
}

// ---------- summoning ----------

// Pick Embers from hand to pay for a creature: exact types first, then Hellfire.
export function paymentFor(player, def) {
  const embers = player.hand.filter((c) => card(c).kind === 'ember');
  const used = new Set();
  const pay = [];
  const take = (type) => {
    const m = embers.find((c) => !used.has(c.uid) && card(c).type === type);
    if (!m) return false;
    used.add(m.uid);
    pay.push(m.uid);
    return true;
  };
  const needs = def.costEach ? [...TYPES] : Array(def.cost).fill(def.type);
  const missing = needs.filter((t) => !take(t));
  for (let i = 0; i < missing.length; i++) if (!take('wild')) return null;
  return pay;
}

export function canSummon(state, handUid) {
  if (state.phase !== 'summon') return fail('Not the summon phase.');
  if (state.summonedThisTurn) return fail('You have already summoned this turn.');
  const p = activePlayer(state);
  const inst = p.hand.find((c) => c.uid === handUid);
  if (!inst) return fail('That card is not in your hand.');
  const def = card(inst);
  if (def.kind !== 'creature') return fail('Embers are spent, not summoned.');
  const payment = paymentFor(p, def);
  if (!payment) return fail(`Not enough ${def.costEach ? 'Embers of each type' : `${def.type} Embers`}.`);
  const needsSacrifice = hasAbility(def, 'burnt-offering');
  if (needsSacrifice && p.field.length === 0) return fail('Needs a creature on your field to sacrifice.');
  return { ok: true, payment, needsSacrifice };
}

export function summon(state, handUid, { sacrificeUid } = {}) {
  const check = canSummon(state, handUid);
  if (!check.ok) return check;
  const p = activePlayer(state);
  if (check.needsSacrifice && !p.field.some((c) => c.uid === sacrificeUid)) {
    return fail('Choose one of your creatures to sacrifice.');
  }
  const paid = check.payment.map((uid) => removeFrom(p.hand, uid));
  p.discard.push(...paid);
  const inst = removeFrom(p.hand, handUid);
  if (check.needsSacrifice) destroyCreature(state, p.index, sacrificeUid, `sacrificed to ${card(inst).name}`);
  state.summonedThisTurn = true;
  placeOnField(state, p.index, inst, `${p.name} summons ${card(inst).name}, paying ${describeCards(paid.map((c) => c.cardId))}.`);
  checkWinner(state);
  return OK;
}

function placeOnField(state, pi, inst, message) {
  inst.summonedTurn = state.turn;
  inst.defMod = 0;
  state.players[pi].field.push(inst);
  log(state, message, 'summon');
  onSummon(state, pi, inst);
}

function onSummon(state, pi, inst) {
  const def = card(inst);
  const me = state.players[pi];
  const foe = state.players[1 - pi];
  if (hasAbility(def, 'swarm')) {
    const another = me.hand.find((c) => c.cardId === def.id);
    if (another) {
      removeFrom(me.hand, another.uid);
      placeOnField(state, pi, another, `The swarm calls another ${def.name} for free.`);
    }
  }
  if (hasAbility(def, 'arrow')) damage(state, 1 - pi, 2, `${def.name}'s arrow`);
  if (hasAbility(def, 'plague')) {
    const embers = foe.hand.filter((c) => card(c).kind === 'ember');
    if (embers.length) {
      const victim = embers[Math.floor(state.rng() * embers.length)];
      foe.discard.push(removeFrom(foe.hand, victim.uid));
      log(state, `The plague devours ${foe.name}'s ${card(victim).name}.`);
    }
  }
  if (hasAbility(def, 'smoke')) {
    for (const c of foe.field) c.defMod = (c.defMod || 0) - 1;
    log(state, `Smoke of the Pit weakens ${foe.name}'s creatures (-1 DEF).`);
    for (const c of [...foe.field]) if (currentDef(c) <= 0) destroyCreature(state, foe.index, c.uid, 'choked by smoke');
  }
}

// ---------- redraw (replaces the summon step) ----------

export function canRedraw(state) {
  if (state.phase !== 'summon') return fail('You can only redraw during the summon phase.');
  if (state.summonedThisTurn) return fail('You have already summoned this turn.');
  if (!activePlayer(state).hand.length) return fail('Your hand is empty.');
  return OK;
}

// Discard the whole hand and draw the same number of cards (as many as the deck allows).
// This uses up the summon step: the turn moves straight to the attack phase.
export function redrawHand(state) {
  const check = canRedraw(state);
  if (!check.ok) return check;
  const p = activePlayer(state);
  const discarded = p.hand.splice(0);
  p.discard.push(...discarded);
  const drawn = [];
  for (let i = 0; i < discarded.length; i++) {
    const c = drawCard(state, p.index);
    if (!c) break;
    drawn.push(c);
  }
  log(state, `${p.name} discards their hand (${describeCards(discarded.map((c) => c.cardId))}) and skips summoning.`, 'draw');
  const short = drawn.length < discarded.length ? ` The deck ran out after ${drawn.length}.` : '';
  log(state, `${p.name} draws ${drawn.length} new cards.${short}`, 'draw',
    { player: p.index, text: `${p.name} draws ${describeCards(drawn.map((c) => c.cardId))}.${short}` });
  state.phase = 'attack';
  return OK;
}

// ---------- martyrdom (usable outside the normal phase order) ----------

export function canMartyr(state, pi, uid) {
  if (state.winner !== null) return fail('The game is over.');
  const ownTurn = pi === state.active && (state.phase === 'summon' || state.phase === 'attack');
  const defending = pi !== state.active && state.phase === 'block';
  if (!ownTurn && !defending) return fail('Martyrdom can be used on your turn or while defending.');
  const inst = state.players[pi].field.find((c) => c.uid === uid);
  if (!inst || !hasAbility(card(inst), 'martyrdom')) return fail('No martyr there.');
  return OK;
}

export function martyr(state, pi, uid) {
  const check = canMartyr(state, pi, uid);
  if (!check.ok) return check;
  const name = card(state.players[pi].field.find((c) => c.uid === uid)).name;
  destroyCreature(state, pi, uid, 'given to the flames');
  heal(state, pi, 6, name);
  checkWinner(state);
  return OK;
}

// ---------- attacking ----------

export function goToAttack(state) {
  if (state.phase !== 'summon') return fail('Not the summon phase.');
  state.phase = 'attack';
  return OK;
}

export function canAttack(state, uid) {
  const p = activePlayer(state);
  const inst = p.field.find((c) => c.uid === uid);
  if (!inst) return fail('Not your creature.');
  const def = card(inst);
  if (hasAbility(def, 'cannot-attack')) return fail(`${def.name} cannot attack.`);
  if (inst.summonedTurn === state.turn && !hasAbility(def, 'charge')) return fail('Summoning sickness: it attacks next turn.');
  if (def.cost === 1 && defendingPlayer(state).field.some((c) => hasAbility(card(c), 'gatekeeper'))) {
    return fail('Cerberus guards the gate against cost-1 creatures.');
  }
  return OK;
}

// Creatures that must attack (Relentless) whenever they are able to.
export function forcedAttackers(state) {
  return activePlayer(state).field
    .filter((c) => hasAbility(card(c), 'relentless') && canAttack(state, c.uid).ok)
    .map((c) => c.uid);
}

export function declareAttack(state, uids) {
  if (state.phase !== 'attack') return fail('Not the attack phase.');
  const chosen = [...new Set([...uids, ...forcedAttackers(state)])];
  for (const uid of chosen) {
    const check = canAttack(state, uid);
    if (!check.ok) return check;
  }
  if (chosen.length === 0) {
    log(state, `${activePlayer(state).name} does not attack.`);
    state.phase = 'end';
    return OK;
  }
  state.attack = { attackers: chosen };
  state.phase = 'block';
  const names = chosen.map((uid) => card(activePlayer(state).field.find((c) => c.uid === uid)).name);
  log(state, `${activePlayer(state).name} attacks with ${names.join(', ')}.`, 'attack');
  return OK;
}

// ---------- combat ----------

// Work out the full result of a block without changing anything. Used for the UI preview and for resolution.
//
// Attack is pooled: the attackers' ATK adds up, and the blockers soak it up in the order the defender chose
// them. A blocker that soaks its whole DEF is destroyed. Whatever is left over hits the defending wizard.
// A creature whose type beats the type of any creature on the other side gets +3 (ATK for attackers, DEF for blockers).
export function previewCombat(state, blockerUids) {
  const att = activePlayer(state);
  const dfn = defendingPlayer(state);
  const attackers = state.attack.attackers.map((uid) => att.field.find((c) => c.uid === uid)).filter(Boolean);
  const blockers = blockerUids.map((uid) => dfn.field.find((c) => c.uid === uid)).filter(Boolean);
  const blockerTypes = blockers.map((b) => card(b).type);
  const attackerTypes = attackers.map((a) => card(a).type);
  const cocytus = dfn.field.filter((c) => hasAbility(card(c), 'cocytus')).length;

  const attackRows = attackers.map((a) => {
    const def = card(a);
    let atk = def.atk;
    const mods = [];
    if (hasAbility(def, 'frenzy') && att.health < RULES.startingHealth / 2) { atk += 3; mods.push('Frenzy +3'); }
    if (cocytus) { atk -= 2 * cocytus; mods.push(`Cocytus -${2 * cocytus}`); }
    const victim = blockerTypes.find((t) => BEATS[def.type] === t);
    if (victim) { atk += RULES.advantageBonus; mods.push(`Advantage +${RULES.advantageBonus}`); }
    return { uid: a.uid, cardId: a.cardId, atk: Math.max(0, atk), mods, ethereal: hasAbility(def, 'ethereal') };
  });

  const rawBlockable = attackRows.filter((r) => !r.ethereal).reduce((s, r) => s + r.atk, 0);
  const direct = attackRows.filter((r) => r.ethereal).reduce((s, r) => s + r.atk, 0);
  const petrify = 2 * blockers.filter((b) => hasAbility(card(b), 'petrify')).length;
  const blockable = Math.max(0, rawBlockable - petrify);
  const onlyCostOne = attackers.every((a) => card(a).cost === 1);

  let remaining = blockable;
  const blockRows = blockers.map((b) => {
    const def = card(b);
    let defense = currentDef(b);
    const mods = [];
    if (b.defMod) mods.push(`Smoke ${b.defMod}`);
    if (attackerTypes.some((t) => BEATS[def.type] === t)) { defense += RULES.advantageBonus; mods.push(`Advantage +${RULES.advantageBonus}`); }
    const absorbed = Math.min(remaining, defense);
    remaining -= absorbed;
    let destroyed = defense > 0 && absorbed >= defense;
    if (destroyed && hasAbility(def, 'unbowed') && onlyCostOne) { destroyed = false; mods.push('Unbowed'); }
    return { uid: b.uid, cardId: b.cardId, def: defense, absorbed, destroyed, mods };
  });

  const damageTaken = remaining + direct;
  const saltCount = blockRows.filter((r) => r.destroyed && hasAbility(card(r.cardId), 'salt')).length;
  const slainAttackers = [...attackRows].sort((x, y) => y.atk - x.atk).slice(0, saltCount).map((r) => r.uid);
  const hooks = damageTaken > 0 && attackers.some((a) => hasAbility(card(a), 'hooks'));

  return {
    attacker: att.index,
    defender: dfn.index,
    attackRows,
    blockRows,
    totalAttack: rawBlockable + direct,
    petrify: Math.min(petrify, rawBlockable),
    direct,
    damage: damageTaken,
    slainAttackers,
    hooks,
  };
}

export function declareBlock(state, blockerUids) {
  if (state.phase !== 'block') return fail('Not the block phase.');
  const dfn = defendingPlayer(state);
  if (new Set(blockerUids).size !== blockerUids.length) return fail('Each creature can only block once.');
  if (!blockerUids.every((uid) => dfn.field.some((c) => c.uid === uid))) return fail('Blockers must be your own creatures.');

  const result = previewCombat(state, blockerUids);
  const att = activePlayer(state);
  if (blockerUids.length) {
    const names = blockerUids.map((uid) => card(dfn.field.find((c) => c.uid === uid)).name);
    log(state, `${dfn.name} blocks with ${names.join(', ')}.`, 'block');
  } else {
    log(state, `${dfn.name} does not block.`, 'block');
  }
  damage(state, dfn.index, result.damage, 'the attack');
  for (const r of result.blockRows) if (r.destroyed) destroyCreature(state, dfn.index, r.uid, 'destroyed while blocking');
  for (const uid of result.slainAttackers) destroyCreature(state, att.index, uid, 'turned to salt');
  if (result.hooks && dfn.hand.length) {
    const victim = dfn.hand[Math.floor(state.rng() * dfn.hand.length)];
    dfn.discard.push(removeFrom(dfn.hand, victim.uid));
    log(state, `Malacoda's hooks tear ${card(victim).name} from ${dfn.name}'s hand.`);
  }
  state.lastCombat = result;
  state.attack = null;
  state.phase = 'end';
  checkWinner(state);
  return OK;
}
