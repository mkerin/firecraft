// Card pool, rules constants, and deck helpers. No DOM access — shared by engine and UI.

export const RULES = {
  deckSize: 50,
  startingHealth: 40,
  openingHand: 7,
  advantageBonus: 3,
  burnoutDamage: 5, // taken when you must draw from an empty deck
};

export const TYPES = ['brimstone', 'phlegethon', 'pyre', 'fallen', 'ash'];

export const TYPE_INFO = {
  brimstone: { name: 'Brimstone', color: '#e8c547', blurb: 'Sulfur and stone. Walls and defense.' },
  phlegethon: { name: 'Phlegethon', color: '#e0283b', blurb: 'The river of boiling blood. Aggression.' },
  pyre: { name: 'Pyre', color: '#ff8a1f', blurb: 'Heretics and martyrs. Recursion and sacrifice.' },
  fallen: { name: 'Fallen', color: '#b88cff', blurb: 'Fallen angels. Big, disruptive bosses.' },
  ash: { name: 'Ash', color: '#b9b4ad', blurb: 'Smoke of the pit. Evasion and attrition.' },
  wild: { name: 'Hellfire', color: '#ff4b1f', blurb: 'Wild fire. Counts as any type.' },
};

// Each type beats the next one around the circle.
export const BEATS = {
  brimstone: 'phlegethon',
  phlegethon: 'pyre',
  pyre: 'fallen',
  fallen: 'ash',
  ash: 'brimstone',
};
export const BEAT_VERB = {
  brimstone: 'dams',
  phlegethon: 'drowns',
  pyre: 'purges',
  fallen: 'scatters',
  ash: 'buries',
};

export const ABILITIES = {
  charge: { name: 'Charge', text: 'Can attack the turn it is summoned.' },
  petrify: { name: 'Petrify', text: 'The attacker it blocks gets -2 ATK.' },
  'cannot-attack': { name: 'Immovable', text: 'Cannot attack.' },
  salt: { name: 'Looking Back', text: 'When destroyed while blocking, the attacker it blocks is also destroyed.' },
  gatekeeper: { name: 'Gatekeeper', text: "While on the field, the enemy's cost-1 creatures cannot attack." },
  swarm: { name: 'Swarm', text: 'When summoned, summon another Harpy from your hand for free.' },
  arrow: { name: 'Arrow', text: 'When summoned, deals 2 damage to the enemy wizard.' },
  relentless: { name: 'Relentless', text: 'Must attack every turn it is able to.' },
  frenzy: { name: 'Frenzy', text: '+3 ATK while you are below half health.' },
  heresy: { name: 'Heresy', text: 'When destroyed, return a Pyre Ember from your discard pile to your hand.' },
  martyrdom: { name: 'Martyrdom', text: 'At any time, destroy it to restore 6 health.' },
  rebirth: { name: 'Rebirth', text: 'When destroyed, shuffle it back into your deck.' },
  unbowed: { name: 'Unbowed', text: 'Cannot be destroyed while blocking a cost-1 creature.' },
  hooks: { name: 'Hooks', text: 'If any of its ATK gets past its blockers, the enemy discards a random card.' },
  'burnt-offering': { name: 'Burnt Offering', text: 'To summon it, you must also sacrifice one of your creatures.' },
  legendary: { name: 'Legendary', text: 'Only one copy per deck.' },
  cocytus: { name: 'Wind of Cocytus', text: 'Enemy creatures get -2 ATK.' },
  'frozen-heart': { name: 'Frozen Heart', text: 'If it is destroyed, you lose 10 health.' },
  plague: { name: 'Plague', text: 'When summoned, the enemy discards a random Ember.' },
  ethereal: { name: 'Ethereal', text: 'Its ATK cannot be blocked; it always hits the enemy wizard.' },
  smoke: { name: 'Smoke of the Pit', text: 'When summoned, all enemy creatures permanently get -1 DEF.' },
};

const creature = (id, type, name, cost, atk, def, abilities, flavor, extra = {}) => ({
  id, kind: 'creature', type, name, cost, atk, def, abilities, flavor, ...extra,
});
const ember = (type, name, flavor, extra = {}) => ({
  id: `ember-${type}`, kind: 'ember', type, name, cost: 0, abilities: [], flavor, ...extra,
});

export const CARDS = [
  // Brimstone
  creature('gargoyle', 'brimstone', 'Gargoyle of Dis', 2, 2, 5, ['petrify'],
    'It has watched the iron walls for ten thousand years and has not yet blinked.'),
  creature('pillar', 'brimstone', 'Pillar of Salt', 2, 0, 7, ['cannot-attack', 'salt'],
    'She was told not to look back.'),
  creature('cerberus', 'brimstone', 'Cerberus', 4, 6, 6, ['gatekeeper'],
    'Three throats, one hunger.'),
  // Phlegethon
  creature('harpy', 'phlegethon', 'Harpy of the Suicide Wood', 1, 3, 1, ['charge', 'swarm'],
    'They nest in trees that bleed when you break them.'),
  creature('nessus', 'phlegethon', 'Nessus, Centaur Archer', 2, 4, 2, ['arrow'],
    'He patrols the boiling river and shoots anyone who rises too far out of it.'),
  creature('minotaur', 'phlegethon', 'The Minotaur', 3, 8, 3, ['relentless', 'frenzy'],
    'Rage with horns.'),
  // Pyre
  creature('heretic', 'pyre', 'Heretic in the Burning Tomb', 1, 1, 3, ['heresy'],
    'The lid will close on Judgement Day. Until then, it burns.'),
  creature('martyr', 'pyre', 'Pyre Martyr', 1, 0, 2, ['cannot-attack', 'martyrdom'],
    'Their last breath warms the hands of another.'),
  creature('phoenix', 'pyre', 'Phoenix of the Pyre', 3, 5, 3, ['rebirth'],
    'Every pyre is a nest.'),
  creature('farinata', 'pyre', 'Farinata, the Unbowed', 3, 4, 7, ['unbowed'],
    'He rises from his tomb as if he held Hell in great contempt.'),
  // Fallen
  creature('malacoda', 'fallen', 'Malacoda of the Malebranche', 2, 4, 3, ['hooks'],
    'He and his Evil-Claws drag sinners under the boiling pitch.'),
  creature('moloch', 'fallen', 'Moloch, Devourer', 3, 9, 6, ['burnt-offering'],
    'The furnace in its belly is never empty for long.'),
  creature('lucifer', 'fallen', 'Lucifer, the Frozen King', 5, 10, 10, ['legendary', 'cannot-attack', 'cocytus', 'frozen-heart'],
    'At the very bottom of Hell there is no fire, only ice and the beating of wings.',
    { costEach: true, maxCopies: 1 }),
  // Ash
  creature('locust', 'ash', 'Locust of the Pit', 1, 2, 1, ['plague'],
    'Crowned with gold, with the faces of men and the teeth of lions.'),
  creature('shade', 'ash', 'Shade of the Second Circle', 2, 2, 2, ['charge', 'ethereal'],
    'Carried on a wind that never stops, they cannot be held.'),
  creature('abaddon', 'ash', 'Abaddon, Angel of the Abyss', 4, 7, 5, ['smoke'],
    'He holds the key to the bottomless pit, and the smoke rises with him.'),
  // Embers
  ember('brimstone', 'Ember of Brimstone', 'A sulfur coal that never goes out.'),
  ember('phlegethon', 'Ember of Phlegethon', 'One drop of the river, still boiling.'),
  ember('pyre', 'Ember of the Pyre', 'Taken from the stake while it still smoulders.'),
  ember('fallen', 'Ember of the Fallen', 'A feather from a wing that once touched Heaven.'),
  ember('ash', 'Ember of Ash', 'What is left once everything else has burned.'),
  ember('wild', 'Hellfire Ember', 'Pure damnation. It takes any shape it is given.',
    { id: 'ember-wild', maxCopies: 2 }),
];

export const CARDS_BY_ID = Object.fromEntries(CARDS.map((c) => [c.id, c]));

export const card = (idOrInstance) =>
  CARDS_BY_ID[typeof idOrInstance === 'string' ? idOrInstance : idOrInstance.cardId];

export const hasAbility = (def, key) => def.abilities.includes(key);

// Cards are unlimited unless they set their own cap (Legendary Lucifer, Hellfire Embers).
export function maxCopiesOf(def) {
  return def.maxCopies ?? Infinity;
}

// A deck is a { cardId: count } map. These helpers convert and validate it.

export const deckSize = (counts) => Object.values(counts).reduce((a, b) => a + b, 0);

export function deckToList(counts) {
  return Object.entries(counts).flatMap(([id, n]) => Array(n).fill(id));
}

export function validateDeck(counts) {
  const errors = [];
  const warnings = [];
  const size = deckSize(counts);
  if (size !== RULES.deckSize) errors.push(`Deck has ${size} cards; it needs exactly ${RULES.deckSize}.`);
  for (const [id, n] of Object.entries(counts)) {
    const def = CARDS_BY_ID[id];
    if (!def) errors.push(`Unknown card "${id}".`);
    else if (n > maxCopiesOf(def)) errors.push(`${def.name}: at most ${maxCopiesOf(def)} copies.`);
  }
  const creatures = Object.entries(counts).filter(([id]) => CARDS_BY_ID[id]?.kind === 'creature');
  if (creatures.length === 0) errors.push('A deck needs at least one creature.');
  for (const [id, n] of creatures) {
    if (!n) continue;
    const def = CARDS_BY_ID[id];
    const types = def.costEach ? TYPES : [def.type];
    for (const t of types) {
      if (!counts[`ember-${t}`] && !counts['ember-wild']) {
        warnings.push(`${def.name} needs ${TYPE_INFO[t].name} Embers, but the deck has none.`);
      }
    }
  }
  return { ok: errors.length === 0, errors, warnings: [...new Set(warnings)] };
}

// Ember demand per type: creature cost weighted by copies.
function emberDemand(counts) {
  const demand = Object.fromEntries(TYPES.map((t) => [t, 0]));
  for (const [id, n] of Object.entries(counts)) {
    const def = CARDS_BY_ID[id];
    if (def?.kind !== 'creature' || !n) continue;
    if (def.costEach) TYPES.forEach((t) => (demand[t] += n));
    else demand[def.type] += def.cost * n;
  }
  return demand;
}

// Fill the remaining slots with Embers in proportion to what the creatures cost.
export function fillWithEmbers(counts) {
  const next = { ...counts };
  const free = RULES.deckSize - deckSize(next);
  if (free <= 0) return next;
  const demand = emberDemand(next);
  let total = Object.values(demand).reduce((a, b) => a + b, 0);
  const weights = total ? demand : Object.fromEntries(TYPES.map((t) => [t, 1]));
  total = total || TYPES.length;
  const shares = TYPES.map((t) => ({ t, exact: (free * weights[t]) / total }));
  shares.forEach((s) => (s.n = Math.floor(s.exact)));
  let left = free - shares.reduce((a, s) => a + s.n, 0);
  [...shares].sort((a, b) => (b.exact - b.n) - (a.exact - a.n)).forEach((s) => {
    if (left > 0 && weights[s.t] > 0) { s.n++; left--; }
  });
  for (const s of shares) if (s.n) next[`ember-${s.t}`] = (next[`ember-${s.t}`] || 0) + s.n;
  return next;
}

// A playable random deck: two or three types, ~22 creatures, the rest Embers.
export function randomDeck(rng = Math.random) {
  const types = [...TYPES].sort(() => rng() - 0.5).slice(0, rng() < 0.5 ? 2 : 3);
  const pool = CARDS.filter((c) => c.kind === 'creature' && types.includes(c.type) && !c.costEach);
  const counts = {};
  const target = 20 + Math.floor(rng() * 5);
  let guard = 0;
  while (deckSize(counts) < target && guard++ < 500) {
    const def = pool[Math.floor(rng() * pool.length)];
    // Favor cheap creatures so the curve stays playable.
    if (def.cost >= 3 && rng() < 0.4) continue;
    if ((counts[def.id] || 0) < maxCopiesOf(def)) counts[def.id] = (counts[def.id] || 0) + 1;
  }
  if (rng() < 0.5) counts['ember-wild'] = 2;
  return fillWithEmbers(counts);
}
