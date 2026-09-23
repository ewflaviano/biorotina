import type { ActivityEntry } from "./data";

export interface ActivityShortcut {
  name: string;
  previous: ActivityEntry | null;
}

const defaults = [
  "Caminhada",
  "Corrida leve",
  "Musculação",
  "Yoga",
  "Bicicleta",
  "Boxe (saco)",
] as const;

function nameKey(name: string): string {
  return name
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

export function activityShortcuts(
  entries: ActivityEntry[],
  limit = 6,
): ActivityShortcut[] {
  if (limit <= 0) return [];
  const result: ActivityShortcut[] = [];
  const seen = new Set<string>();
  const recent = [...entries].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );

  for (const entry of recent) {
    const key = nameKey(entry.name);
    if (seen.has(key)) continue;
    result.push({ name: entry.name, previous: entry });
    seen.add(key);
    if (result.length === limit) return result;
  }
  for (const name of defaults) {
    const key = nameKey(name);
    if (seen.has(key)) continue;
    result.push({ name, previous: null });
    seen.add(key);
    if (result.length === limit) break;
  }
  return result;
}
