import {
  numberPt,
  toLocalDateTime,
  type AppData,
  type WeightEntry,
} from "../domain/data";

export function WeightTrend({ entries }: { entries: WeightEntry[] }) {
  const points = [...entries]
    .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt))
    .slice(-8);
  if (points.length < 2) return null;
  const values = points.map((entry) => entry.weightKg);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const padding = Math.max(0.5, (high - low) * 0.25);
  const lower = low - padding;
  const upper = high + padding;
  const coordinate = (value: number, index: number) =>
    `${48 + index * (262 / (points.length - 1))},${98 - ((value - lower) / (upper - lower)) * 78}`;
  const path = points
    .map((entry, index) => coordinate(entry.weightKg, index))
    .join(" ");
  return (
    <figure className="weight-figure">
      <svg
        viewBox="0 0 320 120"
        role="img"
        aria-label={`Evolução das últimas ${points.length} medidas, de ${numberPt(points[0].weightKg, 1)} a ${numberPt(points.at(-1)!.weightKg, 1)} quilogramas`}
      >
        <line x1="48" y1="20" x2="310" y2="20" className="chart-gridline" />
        <line x1="48" y1="98" x2="310" y2="98" className="chart-gridline" />
        <text x="2" y="24" className="chart-label">
          {numberPt(upper, 1)}
        </text>
        <text x="2" y="102" className="chart-label">
          {numberPt(lower, 1)}
        </text>
        <polyline points={path} className="weight-line" />
        {points.map((entry, index) => {
          const [cx, cy] = coordinate(entry.weightKg, index).split(",");
          return (
            <circle
              key={entry.id}
              cx={cx}
              cy={cy}
              r="3.5"
              className="weight-dot"
            />
          );
        })}
      </svg>
      <figcaption>
        Últimas {points.length} medidas · escala visível em kg. Os valores
        exatos estão no histórico.
      </figcaption>
    </figure>
  );
}

const overviewAreas = [
  { key: "habits", label: "Hábitos" },
  { key: "meals", label: "Alimentação" },
  { key: "medications", label: "Medicação" },
  { key: "activities", label: "Atividades" },
  { key: "hydration", label: "Hidratação" },
] as const;

export function WeeklyOverviewChart({ data }: { data: AppData }) {
  const dates = {
    habits: new Set(
      data.habitLogs.map((item) =>
        toLocalDateTime(item.completedAt).slice(0, 10),
      ),
    ),
    meals: new Set(
      data.meals.map((item) => toLocalDateTime(item.eatenAt).slice(0, 10)),
    ),
    medications: new Set(
      data.medicationLogs.map((item) =>
        toLocalDateTime(item.takenAt).slice(0, 10),
      ),
    ),
    activities: new Set(
      data.activities.map((item) =>
        toLocalDateTime(item.occurredAt).slice(0, 10),
      ),
    ),
    hydration: new Set(
      data.hydrationEntries.map((item) =>
        toLocalDateTime(item.drankAt).slice(0, 10),
      ),
    ),
  };
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    const key = toLocalDateTime(date.toISOString()).slice(0, 10);
    return {
      key,
      areas: overviewAreas.filter((area) => dates[area.key].has(key)),
      label: new Intl.DateTimeFormat("pt-BR", { weekday: "short" })
        .format(date)
        .replace(".", ""),
    };
  });
  return (
    <figure className="week-figure overview-figure">
      <div
        className="week-bars"
        role="img"
        aria-label={`Áreas com registros nos últimos sete dias: ${days.map((day) => `${day.label}: ${day.areas.length ? day.areas.map((area) => area.label).join(", ") : "nenhuma"}`).join("; ")}`}
      >
        {days.map((day) => (
          <div className="week-day" key={day.key}>
            <strong>{day.areas.length ? `${day.areas.length}/5` : ""}</strong>
            <div className="bar-track overview-track">
              {day.areas.map((area) => (
                <span
                  key={area.key}
                  className={`overview-segment overview-${area.key}`}
                />
              ))}
            </div>
            <small>{day.label}</small>
          </div>
        ))}
      </div>
      <div className="overview-legend" aria-hidden="true">
        {overviewAreas.map((area) => (
          <span key={area.key}>
            <i className={`overview-${area.key}`} />
            {area.label}
          </span>
        ))}
      </div>
    </figure>
  );
}
