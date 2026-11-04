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
  reaperBackHead: cos(`${id}-back-head`), reaperBackBody: cos(`${id}-back-body`), reaperBackArm: cos(`${id}-back-arm`),
});
const maraSkin = (id) => ({
  maraBody: cos(`${id}-body`), maraArmBack: cos(`${id}-arm-back`), maraArmFront: cos(`${id}-arm-front`),
  maraSideBody: cos(`${id}-side-body`), maraSideArm: cos(`${id}-side-arm`), maraSideArmFront: cos(`${id}-side-arm-front`),
  maraBackBody: cos(`${id}-back-body`), maraBackArm: cos(`${id}-back-arm`),
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

export const SLOTS = { keeper: ['appearance', 'weapon', 'lantern'], survivor: ['appearance'] };
export const SLOT_LABELS = { appearance: 'Appearance', weapon: 'Scythe', lantern: 'Lantern' };

export const cosmeticById = (id) => COSMETICS.find((c) => c.id === id);
export const defaultCosmetic = (campaign, slot) =>
  COSMETICS.find((c) => c.campaign === campaign && c.slot === slot && c.cost === 0);

// `values[level]` is the live value; `costs[level]` buys the next level.
export const UPGRADES = [
  { id: 'pulseRecovery', name: 'Soul Pulse Recovery', campaign: 'keeper', values: [18, 16, 14], costs: [100, 180], format: (v) => `${v} sec cooldown` },
  { id: 'soulReach', name: 'Soul Reach', campaign: 'keeper', values: [1, 1.15, 1.3], costs: [80, 150], format: (v) => `×${v.toFixed(2)} collection radius` },
  { id: 'distractRecovery', name: 'Distraction Recovery', campaign: 'survivor', values: [22, 20, 18], costs: [100, 180], format: (v) => `${v} sec cooldown` },
  { id: 'lastingRattle', name: 'Lasting Rattle', campaign: 'survivor', values: [3, 3.5, 4], costs: [80, 150], format: (v) => `${v} sec distraction` },
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
