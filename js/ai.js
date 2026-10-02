// A simple rule-based computer opponent. It uses only the engine's public functions, so it plays by
// exactly the same rules as a human. No DOM access.
//
// chooseAction(state) returns the next thing the acting player should do; applyAction(state, action) does it.
// The acting player is the defender during a block and the active player otherwise.

import { card, hasAbility, RULES } from './cards.js';
import * as E from './engine.js';

// The engine owns these so the server can use them too; re-exported for existing callers.
export const { actor, applyAction } = E;

// Rough worth of a creature on the field, in "health points".
function worth(inst) {
  const def = card(inst);
  let v = (def.atk + E.currentDef(inst)) / 2 + def.cost;
  if (hasAbility(def, 'frozen-heart')) v += 10; // losing Lucifer also costs 10 health
  return v;
}

// --- summoning ---

function summonScore(def) {
  return def.cost * 10 + def.atk + def.def;
}

function chooseSummon(state) {
  const p = E.activePlayer(state);
  let best = null;
  for (const inst of p.hand) {
    const check = E.canSummon(state, inst.uid);
    if (!check.ok) continue;
    let sacrificeUid;
    let score = summonScore(card(inst));
    if (check.needsSacrifice) {
      // Feed Moloch the least valuable creature, and only if that is a clear upgrade.
      const fodder = p.field
        .filter((c) => !hasAbility(card(c), 'frozen-heart'))
        .sort((a, b) => worth(a) - worth(b))[0];
      if (!fodder || worth(fodder) >= worth(inst) - 2) continue;
      sacrificeUid = fodder.uid;
      score -= worth(fodder) * 2;
    }
    if (!best || score > best.score) best = { score, uid: inst.uid, sacrificeUid };
  }
  return best && { type: 'summon', uid: best.uid, sacrificeUid: best.sacrificeUid };
}

// --- martyrdom: heal when health is getting low ---

function chooseMartyr(state, p) {
  if (p.health > RULES.startingHealth * 0.3) return null;
  const martyr = p.field.find((c) => E.canMartyr(state, p.index, c.uid).ok);
  return martyr && { type: 'martyr', owner: p.index, uid: martyr.uid };
}

// --- blocking ---

// How good a block is for the defender: higher is better.
function blockScore(state, blocks) {
  const dfn = E.defendingPlayer(state);
  const att = E.activePlayer(state);
  const r = E.previewCombat(state, blocks);
  const healthAfter = dfn.health - r.damage;
  // Every point of damage hurts more as health runs low; dying is the worst outcome of all.
  const damageWeight = dfn.health <= RULES.startingHealth / 3 ? 2 : 1;
  let score = -r.damage * damageWeight;
  if (healthAfter <= 0) score -= 1000;
  for (const b of r.blockRows) {
    if (!b.destroyed) continue;
    const inst = dfn.field.find((c) => c.uid === b.uid);
    score -= worth(inst);
    if (hasAbility(card(inst), 'frozen-heart') && dfn.health - r.damage - 10 <= 0) score -= 1000;
  }
  for (const uid of r.slainAttackers) score += worth(att.field.find((c) => c.uid === uid));
  if (r.hooks) score -= 2;
  return score;
}

// Greedy: keep adding whichever single block improves the outcome most, until none does.
export function chooseBlocks(state) {
  const dfn = E.defendingPlayer(state);
  const blocks = [];
  let current = blockScore(state, blocks);
  for (;;) {
    let best = null;
    for (const blocker of dfn.field) {
      if (blocks.some((b) => b.blocker === blocker.uid)) continue;
      for (const attacker of state.attack.attackers) {
        const trial = [...blocks, { blocker: blocker.uid, attacker }];
        if (E.blockProblem(state, trial)) continue;
        const score = blockScore(state, trial);
        if (score > current + 0.01 && (!best || score > best.score)) best = { score, block: trial[trial.length - 1] };
      }
    }
    if (!best) break;
    blocks.push(best.block);
    current = best.score;
  }
  return blocks;
}

// --- the turn ---

export function chooseAction(state) {
  if (state.winner !== null) return null;
  const me = actor(state);
  const heal = chooseMartyr(state, me);
  if (heal) return heal;
  switch (state.phase) {
    case 'summon':
      return (!state.summonedThisTurn && chooseSummon(state)) || { type: 'to-attack' };
    case 'attack': {
      // Attackers never take damage except from Pillar of Salt, so attack with everything that can.
      const uids = me.field.filter((c) => E.canAttack(state, c.uid).ok).map((c) => c.uid);
      return { type: 'attack', uids };
    }
    case 'block':
      return { type: 'block', blocks: chooseBlocks(state) };
    case 'end':
      return { type: 'end-turn' };
    default:
      return null;
  }
}
