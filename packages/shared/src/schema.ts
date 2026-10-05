import { z } from 'zod';

// The engine never hardcodes any game numbers or content: everything comes from a data pack validated here.

const id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'ids are lowercase letters, digits and hyphens');
const points = z.number().int().min(0);
const fraction = z.number().min(0).max(1);

export const statsSchema = z.object({
  move: z.number().min(0),
  fight: z.number().int().min(0),
  /** The "n+" target to hit when shooting; null for models that cannot shoot. */
  shoot: z.number().int().min(2).max(6).nullable().default(null),
  strength: z.number().int().min(0),
  defence: z.number().int().min(0),
  attacks: z.number().int().min(0),
  wounds: z.number().int().min(1),
  courage: z.number().int().min(0),
  might: z.number().int().min(0).default(0),
  will: z.number().int().min(0).default(0),
  fate: z.number().int().min(0).default(0),
});

export const unitOptionSchema = z.object({
  id,
  name: z.string().min(1),
  cost: points,
  /** Wargear this option gives the model, if any (matters for bow/throwing limits). */
  wargear: id.optional(),
  /** At most one option per group may be taken on a model (e.g. "mount", "shield"). */
  group: z.string().min(1).optional(),
});

export const unitSchema = z.object({
  id,
  name: z.string().min(1),
  kind: z.enum(['hero', 'warrior']),
  /** Free-form label shown to the user, e.g. a hero class. The engine attaches no meaning to it. */
  tier: z.string().min(1).optional(),
  cost: points,
  /** A unique model may appear at most once in a list. */
  unique: z.boolean().default(false),
  stats: statsSchema,
  wargear: z.array(id).default([]),
  rules: z.array(id).default([]),
  keywords: z.array(z.string().min(1)).default([]),
  options: z.array(unitOptionSchema).default([]),
  /** Heroes only: override the warband size and/or restrict which warriors can join. */
  warband: z
    .object({ size: z.number().int().min(0).optional(), allowed: z.array(id).optional() })
    .optional(),
  notes: z.string().optional(),
});

export const wargearSchema = z.object({
  id,
  name: z.string().min(1),
  /** The engine understands the tags "bow" and "throwing" (they count toward the bow limit). */
  tags: z.array(z.string().min(1)).default([]),
  description: z.string().optional(),
});

export const specialRuleSchema = z.object({
  id,
  name: z.string().min(1),
  category: z.string().min(1).optional(),
  text: z.string(),
});

export const armySchema = z.object({
  id,
  name: z.string().min(1),
  side: z.string().min(1),
  description: z.string().optional(),
  bonus: z.object({ name: z.string().min(1), text: z.string() }).optional(),
  units: z.array(z.object({ unit: id, max: z.number().int().min(1).optional() })).min(1),
  /** Armies that may join this one, with a pack-defined relationship level (see ruleset.allyLimits). */
  allies: z.array(z.object({ army: id, level: z.string().min(1) })).default([]),
});

/**
 * How a fight is resolved. Optional: a pack without it simply has no fight calculator.
 *
 * One round of a fight between two models:
 *   1. Duel: each rolls one die and adds its Fight (plus any bonus); the higher total wins.
 *   2. The winner gets Attacks strikes, plus `supportBonus` per supporting friendly model.
 *   3. Each strike rolls the die against the wound target for its Strength versus the target's Defence.
 *   4. Each wound may be cancelled by spending a Fate point and rolling `fate.target` or better.
 */
export const combatSchema = z.object({
  die: z.number().int().min(2).max(20).default(6),
  /** What happens on a tied duel: the higher Fight wins (and equal Fight is rolled again), always roll again, or a coin toss. */
  tie: z.enum(['higher-fight', 'reroll', 'coin']).default('higher-fight'),
  /** Extra strikes the duel winner gets for each friendly model supporting it. */
  supportBonus: z.number().int().min(0).default(0),
  /**
   * The roll needed to wound. Either a formula, target = clamp(base + perPoint x (Defence - Strength), min, max),
   * or a table indexed [Strength - 1][Defence - 1] (out-of-range values use the last row/column).
   * A target above the die size, or null in a table, means the wound is impossible.
   */
  wound: z.union([
    z.object({ base: z.number().int(), perPoint: z.number().int().min(0), min: z.number().int(), max: z.number().int() }),
    z.object({ table: z.array(z.array(z.number().int().nullable()).min(1)).min(1) }),
  ]),
  fate: z.object({ target: z.number().int().min(1) }).optional(),
  might: z.object({ duelBonus: z.number().int().min(0) }).optional(),
});

export const scenarioSchema = z.object({
  id,
  name: z.string().min(1),
  /** One line for the list view. */
  summary: z.string().optional(),
  /** Number of players, e.g. "2" or "2-4". */
  players: z.string().optional(),
  /** Suggested army size range, in points. */
  points: z.object({ min: z.number().int().min(0).optional(), max: z.number().int().min(0).optional() }).optional(),
  setup: z.string().default(''),
  objectives: z.string().default(''),
  /** How victory points are scored and who wins. */
  victory: z.string().default(''),
  /** Anything special for this scenario (terrain, reinforcements, a turn limit). */
  special: z.string().optional(),
  tags: z.array(z.string().min(1)).default([]),
});

/**
 * How a company of models grows over a campaign. Optional: without it campaigns still track a roster, experience, status and notes,
 * just with no levels, automatic awards or lists to pick advancements and injuries from.
 */
export const campaignRulesSchema = z.object({
  /** Experience thresholds: a model is at the highest level whose `at` it has reached. */
  levels: z.array(z.object({ at: z.number().int().min(0), name: z.string().min(1) })).default([]),
  /** Experience awarded automatically for a game: for taking part, plus extra for the outcome. */
  xp: z.object({ play: z.number().int().min(0).default(0), win: z.number().int().min(0).default(0), draw: z.number().int().min(0).default(0) }).default({ play: 0, win: 0, draw: 0 }),
  advancements: z.array(z.object({ id, name: z.string().min(1), text: z.string().default(''), minLevel: z.number().int().min(0).default(0) })).default([]),
  injuries: z.array(z.object({ id, name: z.string().min(1), text: z.string().default('') })).default([]),
});

export const rulesetSchema = z.object({
  /** Default maximum number of warriors led by one hero. */
  warbandSize: z.number().int().min(0),
  /** The force is broken once it has lost this fraction of its starting models. */
  break: fraction,
  /** Models carrying bows or throwing weapons may not exceed this fraction of the force. */
  bowLimit: fraction,
  /** Per ally level: maximum percentage of the points limit allowed in allies, or null for no cap. */
  allyLimits: z.record(z.string(), z.number().min(0).max(100).nullable()).default({}),
  combat: combatSchema.optional(),
  campaign: campaignRulesSchema.optional(),
});

export const packSchema = z.object({
  schema: z.literal(1),
  id,
  name: z.string().min(1),
  version: z.string().min(1),
  author: z.string().optional(),
  description: z.string().optional(),
  license: z.string().optional(),
  ruleset: rulesetSchema,
  units: z.array(unitSchema),
  wargear: z.array(wargearSchema).default([]),
  rules: z.array(specialRuleSchema).default([]),
  armies: z.array(armySchema).min(1),
  scenarios: z.array(scenarioSchema).default([]),
});

export type Stats = z.infer<typeof statsSchema>;
export type UnitOption = z.infer<typeof unitOptionSchema>;
export type Unit = z.infer<typeof unitSchema>;
export type Wargear = z.infer<typeof wargearSchema>;
export type SpecialRule = z.infer<typeof specialRuleSchema>;
export type Army = z.infer<typeof armySchema>;
export type Scenario = z.infer<typeof scenarioSchema>;
export type Ruleset = z.infer<typeof rulesetSchema>;
export type Combat = z.infer<typeof combatSchema>;
export type CampaignRules = z.infer<typeof campaignRulesSchema>;
export type Pack = z.infer<typeof packSchema>;
