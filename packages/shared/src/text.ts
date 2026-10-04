import { entryCost, newList, newWarband, warbandEntries, listCost, type ArmyList, type ListEntry, type Warband } from './list.js';
import type { PackIndex } from './pack.js';
import { validateList } from './validate.js';

// Plain-text list format, readable at the table and easy to paste into chats:
//
//   # Raiders of the Marsh
//   Army: Hollow Horde
//   Points: 500
//
//   ## Warband 1
//   Gorrath Skullmaker (Warbeast) [140]
//   8 Raider (Shield) [64]
//
//   ## Warband 2 (Free Marches)
//   ...

const norm = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');

function entryLine(index: PackIndex, e: ListEntry): string {
  const unit = index.units.get(e.unit);
  const name = unit?.name ?? e.unit;
  const opts = e.options.map((o) => unit?.options.find((x) => x.id === o)?.name ?? o);
  const qty = e.count > 1 ? `${e.count} ` : '';
  return `${qty}${name}${opts.length ? ` (${opts.join(', ')})` : ''} [${entryCost(index, e)}]`;
}

export function exportText(index: PackIndex, list: ArmyList): string {
  const { summary } = validateList(index, list);
  const lines = [
    `# ${list.name}`,
    `Army: ${index.armies.get(list.army)?.name ?? list.army}`,
    `Points: ${list.limit}`,
    '',
  ];
  list.warbands.forEach((w, i) => {
    const ally = w.army !== list.army ? ` (${index.armies.get(w.army)?.name ?? w.army})` : '';
    lines.push(`## Warband ${i + 1}${ally}`);
    for (const e of warbandEntries(w)) lines.push(entryLine(index, e));
    lines.push('');
  });
  lines.push(`Total: ${listCost(index, list)}/${list.limit} points, ${summary.models} models, broken at ${summary.breakAt}`);
  return lines.join('\n') + '\n';
}

export interface ImportResult {
  list: ArmyList;
  /** Lines that could not be understood; the rest of the list is still imported. */
  problems: string[];
}

export function importText(index: PackIndex, text: string): ImportResult {
  const problems: string[] = [];
  const armiesByName = new Map([...index.armies.values()].map((a) => [norm(a.name), a]));
  const unitsByName = new Map([...index.units.values()].map((u) => [norm(u.name), u]));

  let name = 'Imported list';
  let limit = 500;
  let armyId = index.pack.armies[0]!.id;
  let current: Warband | null = null;
  const warbands: Warband[] = [];

  for (const [n, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line) continue;
    const lineNo = n + 1;

    let m: RegExpMatchArray | null;
    if ((m = line.match(/^##\s*(.*)$/))) {
      const allyName = m[1]!.match(/\(([^)]+)\)\s*$/)?.[1];
      const ally = allyName ? armiesByName.get(norm(allyName)) : undefined;
      if (allyName && !ally) problems.push(`Line ${lineNo}: unknown army "${allyName}".`);
      current = newWarband(ally?.id ?? armyId);
      warbands.push(current);
      continue;
    }
    if ((m = line.match(/^#\s*(.+)$/))) {
      name = m[1]!.trim();
      continue;
    }
    if ((m = line.match(/^army\s*:\s*(.+)$/i))) {
      const army = armiesByName.get(norm(m[1]!));
      if (army) armyId = army.id;
      else problems.push(`Line ${lineNo}: unknown army "${m[1]!.trim()}".`);
      continue;
    }
    if ((m = line.match(/^points\s*:\s*(\d+)/i))) {
      limit = Number(m[1]);
      continue;
    }
    if (/^total\s*:/i.test(line)) continue;

    // Entry line: [bullet] [qty] Name [(options)] [[cost]]
    const body = line.replace(/^[-*•]\s*/, '').replace(/\s*\[[^\]]*\]\s*$/, '');
    const parsed = body.match(/^(?:(\d+)\s*x?\s+)?([^()]+?)\s*(?:\(([^)]*)\))?\s*$/i);
    if (!parsed) {
      problems.push(`Line ${lineNo}: could not read "${line}".`);
      continue;
    }
    const count = parsed[1] ? Number(parsed[1]) : 1;
    const unit = unitsByName.get(norm(parsed[2]!));
    if (!unit) {
      problems.push(`Line ${lineNo}: unknown unit "${parsed[2]!.trim()}".`);
      continue;
    }
    const options: string[] = [];
    for (const o of (parsed[3] ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
      const opt = unit.options.find((x) => norm(x.name) === norm(o));
      if (opt) options.push(opt.id);
      else problems.push(`Line ${lineNo}: ${unit.name} has no option "${o}".`);
    }

    if (!current) {
      current = newWarband(armyId);
      warbands.push(current);
    }
    const entry: ListEntry = { unit: unit.id, options, count: unit.kind === 'hero' ? 1 : count };
    if (unit.kind === 'hero') {
      if (current.leader) {
        problems.push(`Line ${lineNo}: ${unit.name} starts a new warband because the current one already has a leader.`);
        current = newWarband(current.army);
        warbands.push(current);
      }
      current.leader = entry;
    } else {
      current.members.push(entry);
    }
  }

  const list = { ...newList(index, armyId, limit, name), warbands };
  return { list, problems };
}
