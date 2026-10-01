import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, randomDeck, deckToList } from '../js/cards.js';
import * as E from '../js/engine.js';
import * as AI from '../js/ai.js';

function seeded(seed = 42) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

let nextUid = 5000;
const inst = (cardId) => ({ uid: nextUid++, cardId, summonedTurn: -10, defMod: 0 });

// Player 0 attacks with everything on their field; returns the state in the block phase.
function blockSetup({ field0, field1, health1 = RULES.startingHealth }) {
  const deck = Array(50).fill('ember-ash');
  const s = E.createGame({ decks: [deck, deck], rng: seeded() });
  s.players[0].field = field0.map(inst);
  s.players[1].field = field1.map(inst);
  s.players[1].health = health1;
  E.goToAttack(s);
  E.declareAttack(s, s.players[0].field.map((c) => c.uid));
  return s;
}

const blockedPairs = (s, blocks) => blocks.map((b) => [
  s.players[1].field.find((c) => c.uid === b.blocker).cardId,
  s.players[0].field.find((c) => c.uid === b.attacker).cardId,
]);

test('AI does not throw away a creature to save 1 damage', () => {
  // Farinata blocking Nessus would save 1 and die (Phlegethon beats Pyre).
  const s = blockSetup({ field0: ['nessus'], field1: ['farinata'] });
  assert.deepEqual(AI.chooseBlocks(s), []);
});

test('AI blocks when its blocker survives', () => {
  const s = blockSetup({ field0: ['harpy', 'nessus'], field1: ['pillar'] });
  // Pillar (Brimstone beats Phlegethon) soaks either attacker and survives; it should take the bigger one.
  assert.deepEqual(blockedPairs(s, AI.chooseBlocks(s)), [['pillar', 'nessus']]);
});

test('AI chump-blocks to avoid dying', () => {
  // Minotaur's 8 is lethal at 8 health. Shade soaks only 2 and dies, which isn't worth it unless it saves the game.
  const s = blockSetup({ field0: ['minotaur'], field1: ['shade'], health1: 8 });
  assert.deepEqual(blockedPairs(s, AI.chooseBlocks(s)), [['shade', 'minotaur']]);
  const calm = blockSetup({ field0: ['minotaur'], field1: ['shade'], health1: 30 });
  assert.deepEqual(AI.chooseBlocks(calm), []);
});

test('AI summons the strongest creature it can afford and attacks with everything', () => {
  const deck = Array(50).fill('ember-ash');
  const s = E.createGame({ decks: [deck, deck], rng: seeded() });
  const p = s.players[0];
  p.hand = ['locust', 'abaddon', 'ember-ash', 'ember-ash', 'ember-ash', 'ember-ash'].map(inst);
  p.field = [inst('shade')];
  const a = AI.chooseAction(s);
  assert.equal(a.type, 'summon');
  assert.equal(p.hand.find((c) => c.uid === a.uid).cardId, 'abaddon');
  assert.ok(AI.applyAction(s, a).ok);
  assert.equal(AI.chooseAction(s).type, 'to-attack');
  AI.applyAction(s, AI.chooseAction(s));
  const attack = AI.chooseAction(s);
  assert.deepEqual(attack, { type: 'attack', uids: [p.field[0].uid] }, 'only the rested Shade can attack');
});

test('AI vs AI games run to completion with only legal actions', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const rng = seeded(seed);
    const s = E.createGame({ decks: [deckToList(randomDeck(rng)), deckToList(randomDeck(rng))], rng });
    let steps = 0;
    while (s.winner === null && steps++ < 5000) {
      const action = AI.chooseAction(s);
      assert.ok(action, `seed ${seed}: no action in phase ${s.phase}`);
      const result = AI.applyAction(s, action);
      assert.ok(result.ok, `seed ${seed}: ${action.type} refused: ${result.reason}`);
    }
    assert.notEqual(s.winner, null, `seed ${seed} never finished`);
  }
});
