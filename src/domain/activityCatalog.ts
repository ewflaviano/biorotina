// METs do Compêndio de Atividades Físicas para Adultos (2024).
// https://pacompendium.com/adult-compendium/
export const activityCatalog = [
  { name: "Caminhada leve", met: 2.8, code: "17152" },
  { name: "Caminhada", met: 3.8, code: "17190" },
  { name: "Caminhada rápida", met: 4.8, code: "17200" },
  { name: "Caminhada na esteira", met: 3.8, code: "17355" },
  { name: "Trilha", met: 5.3, code: "17082" },
  { name: "Subir escadas", met: 6.8, code: "17131" },
  { name: "Corrida leve", met: 7.5, code: "12020" },
  { name: "Corrida (8 km/h)", met: 8.5, code: "12030" },
  { name: "Corrida (10 km/h)", met: 9.3, code: "12050" },
  { name: "Corrida (12 km/h)", met: 11.8, code: "12080" },
  { name: "Bicicleta leve", met: 4.3, code: "01015" },
  { name: "Bicicleta", met: 7, code: "01016" },
  { name: "Bicicleta intensa", met: 9, code: "01017" },
  { name: "Bicicleta ergométrica", met: 6.8, code: "01200" },
  { name: "Spinning", met: 9, code: "01270" },
  { name: "Natação recreativa", met: 6, code: "18310" },
  { name: "Natação crawl moderada", met: 5.8, code: "18292" },
  { name: "Natação crawl intensa", met: 9.8, code: "18230" },
  { name: "Hidroginástica", met: 5.5, code: "18355" },
  { name: "Remo ergométrico", met: 5, code: "02071" },
  { name: "Yoga", met: 2.3, code: "02175" },
  { name: "Yoga Vinyasa", met: 2.7, code: "02185" },
  { name: "Yoga Power", met: 4, code: "02160" },
  { name: "Pilates", met: 2.8, code: "02105" },
  { name: "Alongamento", met: 2.3, code: "02101" },
  { name: "Musculação", met: 3.5, code: "02054" },
  { name: "Musculação intensa", met: 6, code: "02050" },
  { name: "Treino funcional (circuito)", met: 6, code: "02032" },
  { name: "HIIT moderado", met: 7, code: "02210" },
  { name: "HIIT intenso", met: 11, code: "02214" },
  { name: "Pular corda", met: 11, code: "02068" },
  { name: "Elíptico", met: 5, code: "02048" },
  { name: "Dança contemporânea", met: 3.8, code: "03070" },
  { name: "Zumba", met: 6.5, code: "02310" },
  { name: "Salsa", met: 4.8, code: "03090" },
  { name: "Boxe (saco)", met: 5.8, code: "15110" },
  { name: "Boxe (sparring)", met: 7.8, code: "15120" },
  { name: "Boxe (ringue)", met: 12.3, code: "15100" },
  { name: "Kickboxing", met: 7.3, code: "15457" },
  { name: "Artes marciais", met: 10.3, code: "15430" },
  { name: "Futebol", met: 7, code: "15610" },
  { name: "Futsal", met: 7.8, code: "15195" },
  { name: "Basquete", met: 7.5, code: "15055" },
  { name: "Vôlei recreativo", met: 3, code: "15720" },
  { name: "Vôlei de praia", met: 8, code: "15725" },
  { name: "Tênis", met: 6.8, code: "15675" },
  { name: "Badminton", met: 5.5, code: "15030" },
  { name: "Tênis de mesa", met: 4, code: "15660" },
  { name: "Skate", met: 5, code: "15580" },
  { name: "Patins", met: 7, code: "15590" },
  { name: "Surfe", met: 3, code: "18220" },
  { name: "Stand up paddle", met: 6.5, code: "18224" },
  { name: "Caiaque", met: 5, code: "18100" },
  { name: "Escalada", met: 5.8, code: "15537" },
] as const;

export type CatalogActivity = (typeof activityCatalog)[number];

function normalizeName(name: string): string {
  return name
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

export function findCatalogActivity(name: string): CatalogActivity | null {
  const normalized = normalizeName(name);
  return (
    activityCatalog.find((item) => normalizeName(item.name) === normalized) ??
    null
  );
}

const sourcePages: Record<string, string> = {
  "01": "bicycling",
  "02": "conditioning-exercise",
  "03": "dancing",
  "12": "running",
  "15": "sports",
  "17": "walking",
  "18": "water-activities",
};

export function activitySourceUrl(activity: CatalogActivity): string {
  const page = sourcePages[activity.code.slice(0, 2)];
  return page
    ? "https://pacompendium.com/" + page + "/"
    : "https://pacompendium.com/adult-compendium/";
}

// Fórmula do Compêndio: MET × 3,5 × peso (kg) ÷ 200 = kcal/min.
// https://pacompendium.com/unite-conversions/
export function caloriesPerMinute(met: number, weightKg: number): number {
  return (met * 3.5 * weightKg) / 200;
}

export function estimateActivityCalories(
  activity: CatalogActivity | null,
  durationMinutes: number,
  weightKg: number,
): number | null {
  if (!activity || !Number.isFinite(durationMinutes) || durationMinutes <= 0)
    return null;
  if (!Number.isFinite(weightKg) || weightKg <= 0) return null;
  return Math.round(
    caloriesPerMinute(activity.met, weightKg) * durationMinutes,
  );
}
