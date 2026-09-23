import {
  numberPt,
  toLocalDateTime,
  type ActivityEntry,
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

export function ActivityWeekChart({ entries }: { entries: ActivityEntry[] }) {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    const key = toLocalDateTime(date.toISOString()).slice(0, 10);
    const minutes = entries
      .filter((entry) => toLocalDateTime(entry.occurredAt).slice(0, 10) === key)
      .reduce((sum, entry) => sum + entry.durationMinutes, 0);
    return {
      key,
      minutes,
      label: new Intl.DateTimeFormat("pt-BR", { weekday: "short" })
        .format(date)
        .replace(".", ""),
    };
  });
  const max = Math.max(30, ...days.map((day) => day.minutes));
  return (
    <figure className="week-figure">
      <div
        className="week-bars"
        role="img"
        aria-label={`Minutos de atividade nos últimos sete dias: ${days.map((day) => `${day.label} ${numberPt(day.minutes)} minutos`).join(", ")}`}
      >
        {days.map((day) => (
          <div className="week-day" key={day.key}>
            <strong>{day.minutes ? numberPt(day.minutes) : ""}</strong>
            <div className="bar-track">
              <span
                style={{
                  height: `${day.minutes ? Math.max(4, (day.minutes / max) * 100) : 0}%`,
                }}
              />
            </div>
            <small>{day.label}</small>
          </div>
        ))}
      </div>
      <figcaption>
        Minutos de atividade registrados por dia. Dias vazios indicam apenas
        ausência de registro.
      </figcaption>
    </figure>
  );
}
