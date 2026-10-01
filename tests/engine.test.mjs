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

const blk = (blocker, attacker) => ({ blocker: blocker.uid, attacker: attacker.uid });

test('each blocker blocks one attacker; advantage only counts within a pairing', () => {
  const s = setup({ field0: ['minotaur', 'nessus'], field1: ['gargoyle', 'heretic'] });
  E.goToAttack(s);
  assert.ok(E.declareAttack(s, s.players[0].field.map((c) => c.uid)).ok);
  const [mino, nessus] = s.players[0].field;
  const [garg, her] = s.players[1].field;
  const blocks = [blk(garg, mino), blk(her, nessus)];
  const r = E.previewCombat(s, blocks);
  // Minotaur 8 - Petrify 2 = 6 (no bonus: it doesn't beat Brimstone) vs Gargoyle 5 + 3 (Brimstone beats Phlegethon).
  // Nessus 4 + 3 (Phlegethon beats Pyre) = 7 vs Heretic 3 -> 4 through.
  assert.deepEqual(r.attackRows.map((a) => [a.atk, a.through]), [[6, 0], [7, 4]]);
  assert.deepEqual(r.blockRows.map((b) => [b.def, b.absorbed, b.destroyed]), [[8, 6, false], [3, 3, true]]);
  assert.equal(r.damage, 4);
  assert.ok(E.declareBlock(s, blocks).ok);
  assert.equal(s.players[1].health, RULES.startingHealth - 4);
  assert.deepEqual(s.players[1].field.map((c) => c.cardId), ['gargoyle']);
  assert.equal(s.phase, 'end');
});

test('several blockers can gang up on one attacker and soak in order', () => {
  const s = setup({ field0: ['minotaur', 'locust'], field1: ['heretic', 'martyr'] });
  E.goToAttack(s);
  E.declareAttack(s, s.players[0].field.map((c) => c.uid));
  const [mino] = s.players[0].field;
  const [her, mar] = s.players[1].field;
  const r = E.previewCombat(s, [blk(her, mino), blk(mar, mino)]);
  // Minotaur 8 + 3 vs Pyre = 11; Heretic soaks 3, Martyr 2 -> 6 through, plus the unblocked Locust's 2.
  assert.equal(r.damage, 8);
  assert.ok(r.blockRows.every((b) => b.destroyed));
});

test('blocks are validated', () => {
  const s = setup({ field0: ['minotaur'], field1: ['heretic'] });
  E.goToAttack(s);
  E.declareAttack(s, []);
  const [mino] = s.players[0].field;
  const [her] = s.players[1].field;
  assert.equal(E.declareBlock(s, [blk(her, mino), blk(her, mino)]).ok, false);
  assert.equal(E.declareBlock(s, [blk(mino, her)]).ok, false);
  assert.equal(s.phase, 'block');
});

test('partial absorption leaves the blocker alive', () => {
  const s = setup({ field0: ['locust'], field1: ['farinata'] });
  E.goToAttack(s);
  E.declareAttack(s, [s.players[0].field[0].uid]);
  E.declareBlock(s, [blk(s.players[1].field[0], s.players[0].field[0])]);
  assert.equal(s.players[1].field.length, 1);
  assert.equal(s.players[1].health, RULES.startingHealth);
});

test('Farinata is Unbowed while blocking a cost-1 creature', () => {
  const s = setup({ field0: ['harpy'], field1: ['farinata'] });
  s.players[1].field[0].defMod = -2;
  E.goToAttack(s);
  E.declareAttack(s, [s.players[0].field[0].uid]);
  const r = E.previewCombat(s, [blk(s.players[1].field[0], s.players[0].field[0])]);
  // Harpy 3 + 3 (Phlegethon beats Pyre) = 6 vs Farinata 7 - 2 smoke = 5 -> 1 through, but Farinata survives.
  assert.equal(r.damage, 1);
  assert.equal(r.blockRows[0].destroyed, false);
});

test('Pillar of Salt takes the attacker it blocks with it', () => {
  const s = setup({ field0: ['moloch', 'locust'], field1: ['pillar'] });
  E.goToAttack(s);
  E.declareAttack(s, s.players[0].field.map((c) => c.uid));
  E.declareBlock(s, [blk(s.players[1].field[0], s.players[0].field[0])]);
  assert.deepEqual(s.players[0].field.map((c) => c.cardId), ['locust']);
  // Moloch 9 vs Pillar 7 -> 2 through, plus the unblocked Locust's 2.
  assert.equal(s.players[1].health, RULES.startingHealth - 4);
});

test('Shade is Ethereal and Cerberus stops cost-1 attackers', () => {
  const s = setup({ field0: ['shade', 'locust'], field1: ['cerberus'] });
  E.goToAttack(s);
  const [shade, locust] = s.players[0].field.map((c) => c.uid);
  assert.equal(E.canAttack(s, locust).ok, false);
  E.declareAttack(s, [shade]);
  assert.equal(E.declareBlock(s, [{ blocker: s.players[1].field[0].uid, attacker: shade }]).ok, false);
  assert.equal(E.previewCombat(s, []).damage, 2);
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
  E.declareBlock(s, [blk(s.players[1].field[0], s.players[0].field[0])]);
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
  E.declareBlock(s, [blk(s.players[1].field[0], s.players[0].field[0])]);
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
        const target = s.attack.attackers.find((uid) => E.blockProblem(s, [{ blocker: d.field[0]?.uid, attacker: uid }]) === null);
        E.declareBlock(s, d.field.length && target ? [{ blocker: d.field[0].uid, attacker: target }] : []);
      }
      if (s.winner === null) E.endTurn(s);
    }
    assert.notEqual(s.winner, null, `seed ${seed} never finished`);
  }
});
