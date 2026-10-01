import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, validateDeck, randomDeck, fillWithEmbers, deckSize, deckToList } from '../js/cards.js';
import * as E from '../js/engine.js';

// Deterministic RNG so shuffles and random discards are repeatable.
function seeded(seed = 42) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

// Build a game, then overwrite hands/fields so each test controls the board exactly.
let nextUid = 1000;
const inst = (cardId, extra = {}) => ({ uid: nextUid++, cardId, summonedTurn: -10, defMod: 0, ...extra });

function setup({ hand0 = [], hand1 = [], field0 = [], field1 = [], health = [RULES.startingHealth, RULES.startingHealth] } = {}) {
  const deck = Array(50).fill('ember-ash');
  const s = E.createGame({ decks: [deck, deck], names: ['Ann', 'Bob'], rng: seeded() });
  s.players[0].hand = hand0.map((id) => inst(id));
  s.players[1].hand = hand1.map((id) => inst(id));
  s.players[0].field = field0.map((id) => inst(id));
  s.players[1].field = field1.map((id) => inst(id));
  s.players[0].health = health[0];
  s.players[1].health = health[1];
  return s;
}

const uidsOf = (list, cardId) => list.filter((c) => c.cardId === cardId).map((c) => c.uid);

test('game starts with opening hands, one draw, and the summon phase', () => {
  const deck = Array(50).fill('ember-ash');
  const s = E.createGame({ decks: [deck, deck], rng: seeded() });
  assert.equal(s.players[0].hand.length, RULES.openingHand + 1);
  assert.equal(s.players[1].hand.length, RULES.openingHand);
  assert.equal(s.phase, 'summon');
  assert.equal(s.players[0].health, RULES.startingHealth);
});

test('summoning spends matching embers, then Hellfire', () => {
  const s = setup({ hand0: ['cerberus', 'ember-brimstone', 'ember-brimstone', 'ember-wild', 'ember-wild', 'ember-ash'] });
  const p = s.players[0];
  assert.ok(E.summon(s, uidsOf(p.hand, 'cerberus')[0]).ok);
  assert.deepEqual(p.hand.map((c) => c.cardId), ['ember-ash']);
  assert.equal(p.field[0].cardId, 'cerberus');
  assert.equal(p.discard.length, 4);
});

test('cannot summon without enough embers, or twice in a turn', () => {
  const s = setup({ hand0: ['cerberus', 'ember-brimstone', 'harpy', 'nessus', 'ember-phlegethon', 'ember-phlegethon'] });
  const p = s.players[0];
  assert.equal(E.summon(s, uidsOf(p.hand, 'cerberus')[0]).ok, false);
  assert.ok(E.summon(s, uidsOf(p.hand, 'nessus')[0]).ok);
  assert.equal(s.players[1].health, RULES.startingHealth - 2, 'Nessus arrow');
  assert.equal(E.canSummon(s, uidsOf(p.hand, 'harpy')[0]).reason, 'You have already summoned this turn.');
});

test('Lucifer needs one ember of each type', () => {
  const s = setup({ hand0: ['lucifer', 'ember-brimstone', 'ember-phlegethon', 'ember-pyre', 'ember-fallen', 'ember-wild'] });
  assert.ok(E.canSummon(s, uidsOf(s.players[0].hand, 'lucifer')[0]).ok);
  s.players[0].hand = s.players[0].hand.filter((c) => c.cardId !== 'ember-wild');
  assert.equal(E.canSummon(s, uidsOf(s.players[0].hand, 'lucifer')[0]).ok, false);
});

test('Moloch requires a sacrifice', () => {
  const s = setup({ hand0: ['moloch', 'ember-fallen', 'ember-fallen', 'ember-fallen'], field0: ['phoenix'] });
  const p = s.players[0];
  const moloch = uidsOf(p.hand, 'moloch')[0];
  assert.equal(E.summon(s, moloch).ok, false);
  assert.ok(E.summon(s, moloch, { sacrificeUid: p.field[0].uid }).ok);
  assert.deepEqual(p.field.map((c) => c.cardId), ['moloch']);
  assert.ok(p.deck.some((c) => c.cardId === 'phoenix'), 'Phoenix is reborn into the deck');
});

test('summoning sickness applies unless the creature has Charge', () => {
  const s = setup({ hand0: ['harpy', 'harpy', 'ember-phlegethon'], field0: [] });
  const p = s.players[0];
  assert.ok(E.summon(s, uidsOf(p.hand, 'harpy')[0]).ok);
  assert.equal(p.field.length, 2, 'Swarm summons the second Harpy for free');
  E.goToAttack(s);
  assert.ok(E.canAttack(s, p.field[0].uid).ok);

  const s2 = setup({ hand0: ['nessus', 'ember-phlegethon', 'ember-phlegethon'] });
  E.summon(s2, uidsOf(s2.players[0].hand, 'nessus')[0]);
  E.goToAttack(s2);
  assert.equal(E.canAttack(s2, s2.players[0].field[0].uid).ok, false);
});

test('pooled attack: blockers soak in order, overflow hits health', () => {
  // Minotaur 8 + Nessus 4 = 12 attack vs Gargoyle (5, Petrify -2) then Heretic (3).
  // Gargoyle is Brimstone, which beats Phlegethon: Gargoyle DEF 5+3 = 8.
  const s = setup({ field0: ['minotaur', 'nessus'], field1: ['gargoyle', 'heretic'] });
  E.goToAttack(s);
  assert.ok(E.declareAttack(s, s.players[0].field.map((c) => c.uid)).ok);
  const [garg, her] = s.players[1].field.map((c) => c.uid);
  const r = E.previewCombat(s, [garg, her]);
  // Phlegethon beats Pyre (Heretic): both attackers +3 -> 11 + 7 = 18, minus Petrify 2 = 16.
  assert.equal(r.totalAttack, 18);
  assert.equal(r.petrify, 2);
  assert.deepEqual(r.blockRows.map((b) => [b.def, b.absorbed, b.destroyed]), [[8, 8, true], [3, 3, true]]);
  assert.equal(r.damage, 5);
  E.declareBlock(s, [garg, her]);
  assert.equal(s.players[1].health, RULES.startingHealth - 5);
  assert.equal(s.players[1].field.length, 0);
  assert.equal(s.phase, 'end');
});

test('partial absorption leaves the blocker alive', () => {
  const s = setup({ field0: ['locust'], field1: ['farinata'] });
  E.goToAttack(s);
  E.declareAttack(s, [s.players[0].field[0].uid]);
  E.declareBlock(s, [s.players[1].field[0].uid]);
  assert.equal(s.players[1].field.length, 1);
  assert.equal(s.players[1].health, RULES.startingHealth);
});

test('Farinata is Unbowed against a cost-1-only attack', () => {
  const s = setup({ field0: ['harpy', 'harpy', 'locust'], field1: ['farinata'] });
  E.goToAttack(s);
  E.declareAttack(s, s.players[0].field.map((c) => c.uid));
  const r = E.previewCombat(s, [s.players[1].field[0].uid]);
  // Harpies (Phlegethon) beat Pyre: 6 + 6 + 2 = 14 vs DEF 7 -> 7 through, but Farinata survives.
  assert.equal(r.damage, 7);
  assert.equal(r.blockRows[0].destroyed, false);
});

test('Pillar of Salt takes the strongest attacker with it', () => {
  const s = setup({ field0: ['minotaur', 'locust'], field1: ['pillar'] });
  E.goToAttack(s);
  E.declareAttack(s, s.players[0].field.map((c) => c.uid));
  E.declareBlock(s, [s.players[1].field[0].uid]);
  assert.deepEqual(s.players[0].field.map((c) => c.cardId), ['locust']);
  // Minotaur 8 + Locust 2 (+3 Ash beats Brimstone) = 13 vs Pillar 7 (Brimstone beats Phlegethon: +3 = 10) -> 3 through.
  assert.equal(s.players[1].health, RULES.startingHealth - 3);
});

test('Shade is Ethereal and Cerberus stops cost-1 attackers', () => {
  const s = setup({ field0: ['shade', 'locust'], field1: ['cerberus'] });
  E.goToAttack(s);
  const [shade, locust] = s.players[0].field.map((c) => c.uid);
  assert.equal(E.canAttack(s, locust).ok, false);
  E.declareAttack(s, [shade]);
  const r = E.previewCombat(s, [s.players[1].field[0].uid]);
  assert.equal(r.damage, 5, 'Shade 2 + Advantage 3 over Brimstone goes straight through');
});

test('Minotaur is Relentless and gets Frenzy below half health', () => {
  const s = setup({ field0: ['minotaur'], health: [RULES.startingHealth / 2 - 1, RULES.startingHealth] });
  E.goToAttack(s);
  E.declareAttack(s, []);
  assert.equal(s.phase, 'block');
  const r = E.previewCombat(s, []);
  assert.equal(r.damage, 11);
});

test('Lucifer: Wind of Cocytus and Frozen Heart', () => {
  const s = setup({ field0: ['moloch'], field1: ['lucifer'] });
  E.goToAttack(s);
  E.declareAttack(s, [s.players[0].field[0].uid]);
  assert.equal(E.previewCombat(s, []).damage, 7);
  // Lucifer (Fallen) has no advantage over Moloch (Fallen); 7 attack against 10 DEF: Lucifer survives.
  E.declareBlock(s, [s.players[1].field[0].uid]);
  assert.equal(s.players[1].field.length, 1);
});

test('Abaddon smoke destroys creatures reduced to 0 DEF; Heretic returns a Pyre Ember', () => {
  const s = setup({ hand0: ['abaddon', 'ember-ash', 'ember-ash', 'ember-ash', 'ember-ash'], field1: ['locust', 'heretic', 'martyr'] });
  s.players[1].discard.push(inst('ember-pyre'));
  E.summon(s, uidsOf(s.players[0].hand, 'abaddon')[0]);
  assert.deepEqual(s.players[1].field.map((c) => [c.cardId, E.currentDef(c)]), [['heretic', 2], ['martyr', 1]]);
  // Destroy the heretic through combat to check Heresy.
  s.phase = 'block';
  s.attack = { attackers: [s.players[0].field[0].uid] };
  E.declareBlock(s, [s.players[1].field[0].uid]);
  assert.ok(s.players[1].hand.some((c) => c.cardId === 'ember-pyre'));
});

test('Martyrdom heals the defender during the block phase', () => {
  const s = setup({ field0: ['nessus'], field1: ['martyr'], health: [RULES.startingHealth, RULES.startingHealth - 10] });
  E.goToAttack(s);
  E.declareAttack(s, [s.players[0].field[0].uid]);
  assert.equal(E.martyr(s, 0, s.players[0].field[0]?.uid).ok, false);
  assert.ok(E.martyr(s, 1, s.players[1].field[0].uid).ok);
  assert.equal(s.players[1].health, RULES.startingHealth - 4);
});

test('Malacoda hooks a card when the attack gets through', () => {
  const s = setup({ field0: ['malacoda'], hand1: ['ember-ash', 'ember-pyre'] });
  E.goToAttack(s);
  E.declareAttack(s, [s.players[0].field[0].uid]);
  E.declareBlock(s, []);
  assert.equal(s.players[1].hand.length, 1);
});

test('reducing health to 0 ends the game', () => {
  const s = setup({ field0: ['minotaur'], health: [RULES.startingHealth, 5] });
  E.goToAttack(s);
  E.declareAttack(s, []);
  E.declareBlock(s, []);
  assert.equal(s.winner, 0);
  assert.equal(s.phase, 'gameover');
});

test('redrawing discards the hand, draws the same number, and skips summoning', () => {
  const s = setup({ hand0: ['cerberus', 'ember-ash', 'ember-ash'] });
  const p = s.players[0];
  const deckBefore = p.deck.length;
  assert.ok(E.redrawHand(s).ok);
  assert.equal(p.hand.length, 3);
  assert.equal(p.deck.length, deckBefore - 3);
  assert.deepEqual(p.discard.map((c) => c.cardId), ['cerberus', 'ember-ash', 'ember-ash']);
  assert.equal(s.phase, 'attack');
  assert.equal(E.redrawHand(s).ok, false, 'only during the summon phase');

  const s2 = setup({ hand0: ['harpy', 'ember-phlegethon', 'ember-ash'] });
  E.summon(s2, uidsOf(s2.players[0].hand, 'harpy')[0]);
  assert.equal(E.canRedraw(s2).ok, false, 'not after summoning');

  const s3 = setup({ hand0: ['ember-ash', 'ember-ash', 'ember-ash'] });
  s3.players[0].deck = s3.players[0].deck.slice(0, 1);
  E.redrawHand(s3);
  assert.equal(s3.players[0].hand.length, 1, 'draws only what the deck has');
});

test('turns alternate and drawing from an empty deck burns', () => {
  const s = setup();
  s.players[1].deck = [];
  E.goToAttack(s);
  E.declareAttack(s, []);
  assert.ok(E.endTurn(s).ok);
  assert.equal(s.active, 1);
  assert.equal(s.players[1].health, RULES.startingHealth - RULES.burnoutDamage);
});

test('random decks and ember fill produce valid 50-card decks', () => {
  for (let seed = 1; seed < 30; seed++) {
    const counts = randomDeck(seeded(seed));
    assert.equal(deckSize(counts), 50);
    assert.ok(validateDeck(counts).ok, JSON.stringify(validateDeck(counts)));
  }
  const filled = fillWithEmbers({ cerberus: 3, harpy: 3 });
  assert.equal(deckSize(filled), 50);
  assert.ok(filled['ember-brimstone'] > filled['ember-phlegethon']);
  assert.equal(deckToList(filled).length, 50);
});

test('full random games run to completion', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const rng = seeded(seed);
    const s = E.createGame({ decks: [deckToList(randomDeck(rng)), deckToList(randomDeck(rng))], rng });
    let steps = 0;
    while (s.winner === null && steps++ < 2000) {
      const p = E.activePlayer(s);
      for (const c of [...p.hand]) {
        const chk = E.canSummon(s, c.uid);
        if (chk.ok) { E.summon(s, c.uid, { sacrificeUid: p.field[0]?.uid }); break; }
      }
      if (s.winner !== null) break;
      E.goToAttack(s);
      E.declareAttack(s, p.field.filter((c) => E.canAttack(s, c.uid).ok).map((c) => c.uid));
      if (s.phase === 'block') {
        const d = E.defendingPlayer(s);
        E.declareBlock(s, d.field.slice(0, 1).map((c) => c.uid));
      }
      if (s.winner === null) E.endTurn(s);
    }
    assert.notEqual(s.winner, null, `seed ${seed} never finished`);
  }
});
