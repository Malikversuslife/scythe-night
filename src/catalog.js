// Data-driven definitions with stable IDs. All tunable prices, rewards and rule values live here.

export const REWARDS = {
  keeper: { soul: 1, seal: 10, win: 30 },
  survivor: { task: 10, win: 30 },
  minCountedRunSeconds: 10,
};

export const XP = { soul: 2, wave: 10, task: 15, win: 30 };

// `skin` maps a rig image key to a recoloured file. `slot` is what the item occupies.
const cos = (name) => `assets/img/v2/cos/${name}.png`;
const pipSkin = (id) => ({
  reaperHead: cos(`${id}-head`), reaperBody: cos(`${id}-body`),
  reaperArmBack: cos(`${id}-arm-back`), reaperArmFront: cos(`${id}-arm-front`),
  reaperSideHead: cos(`${id}-side-head`), reaperSideBody: cos(`${id}-side-body`), reaperSideArm: cos(`${id}-side-arm`),
  reaperBackHead: cos(`${id}-back-head`), reaperBackBody: cos(`${id}-back-body`), reaperBackArm: cos(`${id}-back-arm`), reaperBackArmL: cos(`${id}-back-arm-l`),
});
const maraSkin = (id) => ({
  maraBody: cos(`${id}-body`), maraArmBack: cos(`${id}-arm-back`), maraArmFront: cos(`${id}-arm-front`),
  maraSideBody: cos(`${id}-side-body`), maraSideArm: cos(`${id}-side-arm`), maraSideArmFront: cos(`${id}-side-arm-front`),
  maraBackBody: cos(`${id}-back-body`), maraBackArm: cos(`${id}-back-arm`), maraBackArmL: cos(`${id}-back-arm-l`),
});

export const COSMETICS = [
  { id: 'pip-default', name: 'Night Shift Hood', appliesTo: 'Pip appearance', campaign: 'keeper', slot: 'appearance', cost: 0, skin: {}, desc: 'Pip’s standard black hood.' },
  { id: 'pip-moon', name: 'Moonlit Hood', appliesTo: 'Pip appearance', campaign: 'keeper', slot: 'appearance', cost: 100, skin: pipSkin('pip-moon'), desc: 'A hood dyed moon-blue. Easy to spot in the dark.' },
  { id: 'pip-moss', name: 'Mosskeeper Hood', appliesTo: 'Pip appearance', campaign: 'keeper', slot: 'appearance', cost: 180, skin: pipSkin('pip-moss'), desc: 'Grown over after a very long shift.' },
  { id: 'scythe-default', name: 'Old Reliable', appliesTo: 'Pip weapon appearance', campaign: 'keeper', slot: 'weapon', cost: 0, skin: {}, desc: 'Worn wood and honest steel.' },
  { id: 'scythe-moon', name: 'Moonsteel Scythe', appliesTo: 'Pip weapon appearance', campaign: 'keeper', slot: 'weapon', cost: 120, skin: { reaperScythe: cos('scythe-moon') }, desc: 'Cold pale steel from handle to blade.' },
  { id: 'lantern-default', name: 'Soul Lantern', appliesTo: 'Pip lantern appearance', campaign: 'keeper', slot: 'lantern', cost: 0, skin: {}, desc: 'Iron frame, lime flame.' },
  { id: 'lantern-lime', name: 'Firefly Lantern', appliesTo: 'Pip lantern appearance', campaign: 'keeper', slot: 'lantern', cost: 120, skin: { reaperLantern: cos('lantern-lime') }, glow: '255, 205, 80', desc: 'Polished bronze around a warm gold flame.' },
  { id: 'mara-default', name: 'Courier Jacket', appliesTo: 'Mara appearance', campaign: 'survivor', slot: 'appearance', cost: 0, skin: {}, desc: 'Mara’s worn brown work jacket.' },
  { id: 'mara-amber', name: 'Amber Courier', appliesTo: 'Mara appearance', campaign: 'survivor', slot: 'appearance', cost: 100, skin: maraSkin('mara-amber'), desc: 'A bright amber jacket for late deliveries.' },
  { id: 'mara-violet', name: 'Violet Runner', appliesTo: 'Mara appearance', campaign: 'survivor', slot: 'appearance', cost: 180, skin: maraSkin('mara-violet'), desc: 'Night-violet jacket, built for fast routes.' },
];

// ---------------- Heroes ----------------
// Each story has four heroes. The first is free; the others are bought with Grave Coins. A hero
// is drawn on the story's rig with its own art (`skin`) and plays with its own `perks`.
const hero = (name) => `assets/img/v2/hero/${name}.png`;
const REAPER_PARTS = {
  reaperHead: 'head', reaperBody: 'body', reaperArmBack: 'arm-back', reaperArmFront: 'arm-front',
  reaperScythe: 'scythe', reaperLantern: 'lantern',
  reaperSideHead: 'side-head', reaperSideBody: 'side-body', reaperSideArm: 'side-arm',
  reaperBackHead: 'back-head', reaperBackBody: 'back-body', reaperBackArm: 'back-arm', reaperBackArmL: 'back-arm-l',
};
const MARA_PARTS = {
  maraHead: 'head', maraBody: 'body', maraArmBack: 'arm-back', maraArmFront: 'arm-front', maraLeg: 'leg',
  maraSideHead: 'side-head', maraSideBody: 'side-body', maraSideArm: 'side-arm', maraSideArmFront: 'side-arm-front',
  maraSideThigh: 'side-thigh', maraSideShin: 'side-shin', maraSideFoot: 'side-foot',
  maraSideThighFar: 'side-thigh-far', maraSideShinFar: 'side-shin-far', maraSideFootFar: 'side-foot-far',
  maraBackHead: 'back-head', maraBackBody: 'back-body', maraBackArm: 'back-arm', maraBackLeg: 'back-leg',
  maraLegL: 'leg-l', maraBackArmL: 'back-arm-l', maraBackLegL: 'back-leg-l',
};
const heroSkin = (id, parts) => Object.fromEntries(Object.entries(parts).map(([key, part]) => [key, hero(`${id}-${part}`)]));

export const HEROES = [
  { id: 'pip', campaign: 'keeper', name: 'Pip', title: 'The Night Keeper', cost: 0, skin: {}, perks: {},
    desc: 'The cemetery’s keeper. Three hearts, a trusty scythe and a steady Soul Pulse.' },
  { id: 'pip-white', campaign: 'keeper', name: 'Pip the White', title: 'Keeper of First Light', cost: 400,
    skin: { ...pipSkin('pip-white'), reaperScythe: cos('scythe-white') }, perks: { maxHealth: 4 },
    desc: 'Pip in pale robes and a silver scythe. Four hearts instead of three.' },
  { id: 'monk', campaign: 'keeper', name: 'The Hollow Monk', title: 'Silent Brother', cost: 900,
    rig: 'monk', skin: heroSkin('monk', REAPER_PARTS), perks: { slashArc: 1.35, slashCooldown: 0.75, pulseCooldown: 0.75 },
    desc: 'A swift, wide slash and a Soul Pulse that recovers sooner.' },
  { id: 'bone-king', campaign: 'keeper', name: 'The Bone King', title: 'Lord of the Ossuary', cost: 1800,
    rig: 'boneKing', skin: heroSkin('bone-king', REAPER_PARTS), perks: { slashRange: 1.3, pulseWounds: true },
    desc: 'A long reach, and his Soul Pulse wounds what it throws back.' },
  { id: 'mara', campaign: 'survivor', name: 'Mara', title: 'The Courier', cost: 0, skin: {}, perks: {},
    desc: 'Quick, quiet and armed with a knife.' },
  { id: 'theo', campaign: 'survivor', name: 'Theo', title: 'The Medic', cost: 400,
    rig: 'theo', skin: heroSkin('theo', MARA_PARTS), perks: { secondWind: 1 },
    desc: 'Patches himself up once: the first zombie that catches him only knocks him back.' },
  { id: 'kate', campaign: 'survivor', name: 'Kate Ironside', title: 'The Scavenger', cost: 900,
    rig: 'kate', skin: heroSkin('kate', MARA_PARTS), perks: { blade: 2, rounds: 6, pistolLevel: 1 },
    desc: 'Starts with a sharpened knife and a pistol with six rounds.' },
  { id: 'reyes', campaign: 'survivor', name: 'Sergeant Reyes', title: 'The Soldier', cost: 1800,
    rig: 'reyes', skin: heroSkin('reyes', MARA_PARTS), perks: { rounds: 10, pistolLevel: 2, speed: 1.12 },
    desc: 'A heavy pistol that hits for two, and a faster run.' },
];
export const heroById = (id) => HEROES.find((h) => h.id === id);
export const defaultHero = (campaign) => HEROES.find((h) => h.campaign === campaign && h.cost === 0);

export const SLOTS = { keeper: ['appearance', 'weapon', 'lantern'], survivor: ['appearance'] };
export const SLOT_LABELS = { appearance: 'Appearance', weapon: 'Scythe', lantern: 'Lantern' };

export const cosmeticById = (id) => COSMETICS.find((c) => c.id === id);
export const defaultCosmetic = (campaign, slot) =>
  COSMETICS.find((c) => c.campaign === campaign && c.slot === slot && c.cost === 0);

// `values[level]` is the live value; `costs[level]` buys the next level.
export const UPGRADES = [
  { id: 'pulseRecovery', art: 'pulse-recovery', name: 'Soul Pulse Recovery', campaign: 'keeper', values: [18, 16, 14], costs: [100, 180], format: (v) => `${v} sec cooldown` },
  { id: 'soulReach', art: 'soul-reach', name: 'Soul Reach', campaign: 'keeper', values: [1, 1.15, 1.3], costs: [80, 150], format: (v) => `×${v.toFixed(2)} collection radius` },
  { id: 'distractRecovery', art: 'distract-recovery', name: 'Distraction Recovery', campaign: 'survivor', values: [22, 20, 18], costs: [100, 180], format: (v) => `${v} sec cooldown` },
  { id: 'lastingRattle', art: 'lasting-rattle', name: 'Lasting Rattle', campaign: 'survivor', values: [3, 3.5, 4], costs: [80, 150], format: (v) => `${v} sec distraction` },
  { id: 'blade', art: 'blade', name: "Mara's Blade", campaign: 'survivor', values: [1, 2, 3], costs: [90, 200],
    format: (v) => ['', 'Knife: fells a zombie in one strike, the worse things in three', 'Sharpened knife: the worse things reel longer between strikes', 'Machete: the worse things fall in two strikes'][v] },
  { id: 'pistol', art: 'pistol', name: 'Pistol', campaign: 'survivor', values: [0, 6, 10], costs: [150, 240],
    format: (v) => (v === 0 ? 'Not owned' : v === 6 ? '6 rounds a run; each shot is a strike. Loud!' : 'Heavy pistol: 10 rounds that hit for two. Loud!') },
];
export const upgradeById = (id) => UPGRADES.find((u) => u.id === id);

export const SKILLS = {
  keeper: { name: 'Soul Pulse', radius: 1.5, push: 1.5, pushTime: 0.25 },
  survivor: { name: 'Distraction', range: 2, hearing: 3, minThrow: 0.5 },
};

// `stat` reads a lifetime counter; `both-sides` needs a win in each campaign.
export const ACHIEVEMENTS = [
  { id: 'first-light', name: 'First Light', desc: 'Collect 1 Keeper soul', stat: 'souls', target: 1, reward: 10 },
  { id: 'soul-guide', name: 'Soul Guide', desc: 'Collect 50 Keeper souls in total', stat: 'souls', target: 50, reward: 30 },
  { id: 'night-keeper', name: 'Night Keeper', desc: 'Win Cemetery Keeper once', stat: 'keeperWins', target: 1, reward: 40 },
  { id: 'sealed-tight', name: 'Sealed Tight', desc: 'Win Cemetery Keeper with zero gate breaches', stat: 'flawlessWins', target: 1, reward: 50 },
  { id: 'still-here', name: 'Still Here', desc: 'Win Last Survivor once', stat: 'survivorWins', target: 1, reward: 40 },
  { id: 'city-helper', name: 'City Helper', desc: 'Complete 15 Survivor tasks in total', stat: 'survivorTasks', target: 15, reward: 30 },
  { id: 'both-sides', name: 'Both Sides of Night', desc: 'Win both campaigns', stat: 'campaignsWon', target: 2, reward: 60 },
];

export const MISSIONS = [
  { id: 'free-souls', name: 'Guide them home', desc: 'Free 10 souls across standard Keeper runs', stat: 'souls', target: 10, reward: 20 },
  { id: 'seal-waves', name: 'Hold the line', desc: 'Seal 3 waves across standard Keeper runs', stat: 'seals', target: 3, reward: 20 },
  { id: 'city-tasks', name: 'Keep the lights on', desc: 'Complete 3 tasks across standard Survivor runs', stat: 'tasks', target: 3, reward: 20 },
];

export const DAILY_TRACK = [10, 15, 20, 25, 30, 40, 60];

export const JOURNAL_TIERS = [
  { id: 'tier-1', xp: 50, coins: 20 },
  { id: 'tier-2', xp: 120, coins: 30 },
  { id: 'tier-3', xp: 220, coins: 40 },
  { id: 'tier-4', xp: 350, coins: 60 },
  { id: 'tier-5', xp: 500, coins: 80, badge: 'Journal Keeper' },
];

export const EVENTS = [
  {
    id: 'keepers-trial',
    name: 'Keeper’s Trial',
    campaign: 'keeper',
    desc: 'A shorter, harder night in the same maze. Bring your skill and nothing you bought for it.',
    modifiers: ['Two waves of 6 and 8 undead', 'Purchased upgrades are switched off for this run', 'The usual 3 hits and 3 gate breaches still lose', 'Cosmetics you have equipped still show'],
    firstClearCoins: 50,
    waveCounts: [6, 8],
  },
];
export const eventById = (id) => EVENTS.find((e) => e.id === id);

export const LIMITS = { recentRuns: 20, processedRunIds: 200, ledger: 200 };
