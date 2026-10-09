import type { AppData } from "./data";

export const backupCategories = [
  { key: "weights", label: "Peso" },
  { key: "activities", label: "Atividades" },
  { key: "meals", label: "Refeições" },
  { key: "hydrationEntries", label: "Água" },
  { key: "medications", label: "Medicamentos" },
  { key: "medicationLogs", label: "Registros de uso" },
  { key: "habits", label: "Hábitos" },
  { key: "habitLogs", label: "Registros de hábitos" },
] as const;

type CategoryKey = (typeof backupCategories)[number]["key"];

export interface BackupCategoryComparison {
  key: CategoryKey;
  label: string;
  local: number;
  incoming: number;
  onlyLocal: number;
  onlyIncoming: number;
  changed: number;
}

function canonical(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map((item) => canonical(item)).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function compareCategory(
  key: CategoryKey,
  label: string,
  localData: AppData,
  incomingData: AppData,
): BackupCategoryComparison {
  const local = localData[key];
  const incoming = incomingData[key];
  const group = (entries: typeof local) => {
    const byId = new Map<string, Map<string, number>>();
    for (const entry of entries) {
      const byContent = byId.get(entry.id) ?? new Map<string, number>();
      const content = canonical(entry);
      byContent.set(content, (byContent.get(content) ?? 0) + 1);
      byId.set(entry.id, byContent);
    }
    return byId;
  };
  const localById = group(local);
  const incomingById = group(incoming);
  let onlyLocal = 0;
  let onlyIncoming = 0;
  let changed = 0;

  for (const id of new Set([...localById.keys(), ...incomingById.keys()])) {
    const localContent = localById.get(id) ?? new Map<string, number>();
    const incomingContent = incomingById.get(id) ?? new Map<string, number>();
    let localRemaining = 0;
    let incomingRemaining = 0;
    for (const [content, count] of localContent) {
      localRemaining += Math.max(
        0,
        count - (incomingContent.get(content) ?? 0),
      );
    }
    for (const [content, count] of incomingContent) {
      incomingRemaining += Math.max(
        0,
        count - (localContent.get(content) ?? 0),
      );
    }
    const changedForId = Math.min(localRemaining, incomingRemaining);
    changed += changedForId;
    onlyLocal += localRemaining - changedForId;
    onlyIncoming += incomingRemaining - changedForId;
  }

  return {
    key,
    label,
    local: local.length,
    incoming: incoming.length,
    onlyLocal,
    onlyIncoming,
    changed,
  };
}

export function compareBackup(local: AppData, incoming: AppData) {
  const categories = backupCategories.map(({ key, label }) =>
    compareCategory(key, label, local, incoming),
  );
  return {
    categories,
    localTotal: categories.reduce((sum, category) => sum + category.local, 0),
    incomingTotal: categories.reduce(
      (sum, category) => sum + category.incoming,
      0,
    ),
    onlyLocal: categories.reduce(
      (sum, category) => sum + category.onlyLocal,
      0,
    ),
    onlyIncoming: categories.reduce(
      (sum, category) => sum + category.onlyIncoming,
      0,
    ),
    changed: categories.reduce((sum, category) => sum + category.changed, 0),
    profileChanged: canonical(local.profile) !== canonical(incoming.profile),
    hydrationRemindersChanged:
      canonical(local.hydrationReminderTimes) !==
      canonical(incoming.hydrationReminderTimes),
  };
}
