# Data pack format (schema 1)

A pack is one JSON file describing a game: its list-building constants, wargear, special rules, units and armies. Muster validates it on load and refuses packs with dangling references, with readable errors.

Check a pack from the command line:

```
npm run validate-pack -- path/to/pack.json
```

In the app, open the pack button in the top bar and choose **Load pack file…**. Packs are stored only on your device. Lists belong to the pack they were built with.

## Top level

| Field | Notes |
|---|---|
| `schema` | Always `1`. |
| `id`, `name`, `version` | `id` is lowercase letters, digits and hyphens. Lists are tied to `id`, so keep it stable across versions. |
| `author`, `description`, `license` | Optional, shown in the pack dialog. |
| `ruleset` | List-building constants, below. |
| `wargear`, `rules`, `units`, `armies` | The content. `armies` needs at least one. |

All ids (units, wargear, rules, armies, options) use the same `[a-z0-9-]` form and must be unique within their collection.

## `ruleset`

| Field | Meaning |
|---|---|
| `warbandSize` | Default maximum number of warriors one hero can lead. |
| `break` | Fraction (0 to 1) of starting models that must be lost for the force to be broken. Muster shows `ceil(models × break)`. |
| `bowLimit` | Fraction of the force's models that may carry bow or throwing wargear. Allowed = `floor(models × bowLimit)`. |
| `allyLimits` | Map of ally level name to the maximum percentage of the points limit that may be spent on allies of that level, or `null` for no cap. |

## `ruleset.combat` (optional)

Enables the fight calculator. Without it the Fight tab says the pack defines no combat rules. One round of a fight between two models is:

1. **Duel.** Each rolls one die and adds its Fight (plus bonuses); the higher total wins.
2. **Strikes.** The winner gets its Attacks as strikes, plus `supportBonus` for each friendly model supporting it.
3. **Wounding.** Each strike rolls the die against the wound target for its Strength versus the other model's Defence.
4. **Fate.** Each wound can be cancelled by spending a Fate point and rolling `fate.target` or better.

| Field | Meaning |
|---|---|
| `die` | Sides on the die (2 to 20). Default 6. |
| `tie` | A tied duel: `higher-fight` (the higher Fight wins; equal Fight is rolled again), `reroll`, or `coin`. Default `higher-fight`. |
| `supportBonus` | Extra strikes the winner gets per supporting model. Default 0. |
| `wound` | Either a formula `{ "base": 4, "perPoint": 1, "min": 2, "max": 6 }` giving target = clamp(base + perPoint × (Defence − Strength), min, max), or a table `{ "table": [[4, 5, null], …] }` indexed `[Strength − 1][Defence − 1]` (values past the end use the last row/column). A target above the die size, or `null`, means the wound is impossible. |
| `fate` | `{ "target": 4 }`. Omit if the game has no such save; Fate points are then ignored. |
| `might` | `{ "duelBonus": 1 }`: each Might point spent adds this to a duel total. Omit to disable. |

The calculator is deliberately a simplified model (no positioning, no special actions), so it is a guide and not a referee.

## `scenarios` (optional)

A list of scenarios to browse and attach to a game. Without it the Scenarios tab says the pack has none.

```json
{
  "id": "seize-the-beacon", "name": "Seize the Beacon", "summary": "Race to hold a signal fire.",
  "players": "2", "points": { "min": 200, "max": 800 },
  "setup": "…", "objectives": "…", "victory": "…", "special": "…", "tags": ["objective"]
}
```

`id` and `name` are required; everything else is optional free text (`players` is text, e.g. `"2-4"`). Starting a game with a scenario copies its text into the game, so a later pack update does not change a game under way.

## `units`

```json
{
  "id": "vale-spearman", "name": "Vale Spearman", "kind": "warrior", "cost": 8,
  "stats": { "move": 6, "fight": 3, "shoot": null, "strength": 3, "defence": 4, "attacks": 1, "wounds": 1, "courage": 3 },
  "wargear": ["spear"], "rules": ["hold-the-line"], "keywords": ["Infantry"],
  "options": [{ "id": "shield", "name": "Shield", "cost": 1, "wargear": "shield", "group": "shield" }]
}
```

- `kind` is `hero` or `warrior`. Every warband needs one hero as its leader; warriors fill the rest. Heroes can only lead.
- `tier` is a free label shown beside heroes. The engine attaches no meaning to it.
- `unique: true` limits the unit to one per list.
- `stats.shoot` is the "n+" target, or `null` for no shooting. `might`, `will` and `fate` default to 0 and are shown for heroes.
- `options` are paid extras. Options sharing a `group` are mutually exclusive on one model. An option's `wargear` is added to the model (relevant to the bow limit).
- Heroes may set `warband: { "size": 15, "allowed": ["unit-id", …] }` to override the warband size and/or restrict which warriors they can lead.

## `wargear`

`tags` may include `bow` or `throwing`; models carrying either count toward `ruleset.bowLimit`. Other tags are free-form.

## `armies`

```json
{
  "id": "vale-realm", "name": "Realm of the Vale", "side": "Light",
  "bonus": { "name": "Shield of the Realm", "text": "…" },
  "units": [{ "unit": "aldric-the-bold" }, { "unit": "vale-knight", "max": 6 }],
  "allies": [{ "army": "free-marches", "level": "historical" }]
}
```

- `units` lists what the army may take. `max` caps that unit across the whole list. Every army needs at least one hero.
- `allies` names other armies that can join it, with a `level` that must exist in `ruleset.allyLimits`. An allied warband is drawn entirely from the ally's units.
- `bonus` is shown for reference only; the engine does not apply it.

## What the engine checks

Unknown units/options/armies; units not in the chosen army; warbands without a hero leader or with heroes as followers; warband size (default and per-hero); hero warrior restrictions; option groups and duplicates; per-army `max`; `unique` models; the points limit; the bow limit; allies being permitted and within their percentage cap.
