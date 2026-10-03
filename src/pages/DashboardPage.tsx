import {
  Activity,
  Apple,
  ArrowRight,
  Droplets,
  Pill,
  Scale,
  ShieldCheck,
  Sprout,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useMemo, useState } from "react";
import { DayPicker } from "../components/DayPicker";
import { dailyRecordAreas } from "../components/dailyRecordAreas";
import {
  inputDecimal,
  numberPt,
  todayIsoDate,
  toLocalDateTime,
  totalRecords,
} from "../domain/data";
import {
  formatCalendarDay,
  isSelectableCalendarDay,
  recordsForDay,
  summaryForDay,
} from "../domain/dailyRecords";
import { useAppData } from "../state/AppDataContext";
import { PageHeader } from "../components/Layout";
import { WeeklyOverviewChart } from "../components/ProgressCharts";
import {
  useExperiment,
  useExperimentExposure,
} from "../experiments/ExperimentContext";

export function DashboardPage() {
  const { data } = useAppData();
  const location = useLocation();
  const [selectedDay, setSelectedDay] = useState(() => {
    const requestedDay = (location.state as { day?: unknown } | null)?.day;
    return isSelectableCalendarDay(requestedDay)
      ? requestedDay
      : todayIsoDate();
  });
  const today = todayIsoDate();
  const viewingToday = selectedDay === today;
  const day = useMemo(
    () => summaryForDay(data, selectedDay),
    [data, selectedDay],
  );
  const recent = useMemo(
    () => recordsForDay(data, selectedDay).slice(0, 4),
    [data, selectedDay],
  );
  const experiment = useExperiment();
  useExperimentExposure("demo-highlight");
  const [demoConfirmed, setDemoConfirmed] = useState(false);
  const [demoError, setDemoError] = useState("");
  const demoEnabled = experiment.enabled("demo-highlight");
  const shortcuts = [
    { to: "/hidratacao", label: "Água", icon: Droplets },
    { to: "/peso", label: "Medidas", icon: Scale },
    { to: "/atividades", label: "Atividade", icon: Activity },
    { to: "/alimentacao", label: "Refeição", icon: Apple },
    { to: "/medicamentos", label: "Medicação", icon: Pill },
    { to: "/habitos", label: "Hábito", icon: Sprout },
  ];
  const latestWeight = day.weight;
  const waterForDay = day.hydrationEntries.reduce(
    (sum, item) => sum + item.amountMl,
    0,
  );
  const consumed = day.meals.reduce(
    (sum, item) => sum + (item.caloriesKcal ?? 0),
    0,
  );
  const hasMealCalories = day.meals.some((item) => item.caloriesKcal !== null);
  const burned = day.activities.reduce(
    (sum, item) => sum + (item.caloriesKcal ?? 0),
    0,
  );
  const hasActivityCalories = day.activities.some(
    (item) => item.caloriesKcal !== null,
  );
  const hasEstimatedCalories = day.activities.some(
    (item) => item.caloriesSource === "estimated",
  );
  const medicationsUsed = new Set(
    day.medicationLogs.map((log) => log.medicationId),
  ).size;

  return (
    <>
      <PageHeader
        eyebrow="Visão geral"
        title={
          demoEnabled ? "Seu dia, com um toque novo." : "Seu dia, do seu jeito."
        }
        description="Escolha uma área para registrar e acompanhar sua rotina. Seus dados ficam neste navegador."
      />
      {demoEnabled && (
        <section
          className="panel experiment-demo"
          aria-labelledby="experiment-demo-title"
        >
          <p className="eyebrow">Experimento ativo</p>
          <h2 id="experiment-demo-title">Resumo com novo destaque visual</h2>
          <p className="muted">
            Este texto e esta cor só aparecem para a coorte autorizada.
          </p>
          <button
            className="button secondary"
            type="button"
            onClick={() =>
              void experiment.confirmDemo().then(
                () => {
                  setDemoConfirmed(true);
                  setDemoError("");
                },
                (cause: unknown) =>
                  setDemoError(
                    cause instanceof Error
                      ? cause.message
                      : "Não foi possível confirmar o experimento.",
                  ),
              )
            }
          >
            Confirmar teste
          </button>
          {demoConfirmed && (
            <p className="form-success">
              A API confirmou que este experimento está ativo.
            </p>
          )}
          {demoError && (
            <p className="form-error" role="alert">
              {demoError}
            </p>
          )}
        </section>
      )}
      <nav className="dashboard-shortcuts" aria-label="Registrar novo dado">
        {shortcuts.map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to} className="dashboard-shortcut">
            <Icon size={19} aria-hidden="true" />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
      <section
        className="panel dashboard-progress"
        aria-labelledby="progresso-title"
      >
        <div className="section-heading">
          <h2 id="progresso-title">Sua rotina nos últimos 7 dias</h2>
          <span>áreas registradas por dia</span>
        </div>
        <WeeklyOverviewChart data={data} />
      </section>
      <section aria-labelledby="resumo-title" className="section-block">
        <div className="dashboard-summary-heading">
          <h2 id="resumo-title">
            {viewingToday
              ? "Resumo de hoje"
              : `Resumo de ${formatCalendarDay(selectedDay)}`}
          </h2>
          <DayPicker
            id="dashboard-date"
            label="Data do resumo"
            value={selectedDay}
            onChange={setSelectedDay}
          />
        </div>
        <div className="metric-grid">
          <Link to="/peso" state={{ day: selectedDay }} className="metric-card">
            <div className="metric-top">
              <span>Peso no dia</span>
              <Scale size={19} />
            </div>
            <strong>
              {latestWeight ? inputDecimal(latestWeight.weightKg) : "—"}{" "}
              <small>{latestWeight ? "kg" : ""}</small>
            </strong>
            <p>
              {latestWeight
                ? `Medido às ${toLocalDateTime(latestWeight.measuredAt).slice(11, 16)}`
                : "Nenhuma medida neste dia"}
            </p>
          </Link>
          <Link
            to="/atividades"
            state={{ day: selectedDay }}
            className="metric-card"
          >
            <div className="metric-top">
              <span>
                {viewingToday ? "Movimento hoje" : "Movimento no dia"}
              </span>
              <Activity size={19} />
            </div>
            <strong>
              {numberPt(
                day.activities.reduce(
                  (sum, item) => sum + item.durationMinutes,
                  0,
                ),
                3,
              )}{" "}
              <small>min</small>
            </strong>
            <p>
              {day.activities.length} atividade
              {day.activities.length === 1 ? "" : "s"} registrada
              {day.activities.length === 1 ? "" : "s"}
            </p>
          </Link>
          <Link
            to="/alimentacao"
            state={{ day: selectedDay }}
            className="metric-card"
          >
            <div className="metric-top">
              <span>
                {viewingToday ? "Alimentação hoje" : "Alimentação no dia"}
              </span>
              <Apple size={19} />
            </div>
            <strong>
              {day.meals.length}{" "}
              <small>refeiç{day.meals.length === 1 ? "ão" : "ões"}</small>
            </strong>
            <p>
              {hasMealCalories
                ? `${numberPt(consumed, 3)} kcal informadas`
                : "Calorias opcionais"}
            </p>
          </Link>
          <Link
            to="/medicamentos"
            state={{ day: selectedDay }}
            className="metric-card"
          >
            <div className="metric-top">
              <span>
                {viewingToday ? "Medicação hoje" : "Medicação no dia"}
              </span>
              <Pill size={19} />
            </div>
            <strong>
              {day.medicationLogs.length}{" "}
              <small>uso{day.medicationLogs.length === 1 ? "" : "s"}</small>
            </strong>
            <p>
              {day.medicationLogs.length
                ? `${medicationsUsed} medicamento${medicationsUsed === 1 ? "" : "s"} com uso informado`
                : "Nenhum uso informado neste dia"}
            </p>
          </Link>
          <Link
            to="/hidratacao"
            state={{ day: selectedDay }}
            className="metric-card"
          >
            <div className="metric-top">
              <span>{viewingToday ? "Água hoje" : "Água no dia"}</span>
              <Droplets size={19} />
            </div>
            <strong>
              {numberPt(waterForDay, 3)} <small>ml</small>
            </strong>
            <p>
              {day.hydrationEntries.length} registro
              {day.hydrationEntries.length === 1 ? "" : "s"} de água
            </p>
          </Link>
          <Link
            to="/habitos"
            state={{ day: selectedDay }}
            className="metric-card"
          >
            <div className="metric-top">
              <span>{viewingToday ? "Hábitos hoje" : "Hábitos no dia"}</span>
              <Sprout size={19} />
            </div>
            <strong>
              {new Set(day.habitLogs.map((log) => log.habitId)).size}{" "}
              <small>praticados</small>
            </strong>
            <p>
              {day.habitLogs.length} registro
              {day.habitLogs.length === 1 ? "" : "s"} de hábito
            </p>
          </Link>
        </div>
      </section>
      <div className="dashboard-lower">
        <section className="panel" aria-labelledby="recentes-title">
          <div className="section-heading">
            <h2 id="recentes-title">Registros do dia</h2>
            <span>{formatCalendarDay(selectedDay)}</span>
          </div>
          {recent.length ? (
            <ul className="recent-list">
              {recent.map((record) => {
                const area = dailyRecordAreas[record.kind];
                const Icon = area.icon;
                return (
                  <li key={`${record.kind}:${record.id}`}>
                    <Link to={area.to}>
                      <span className="list-icon">
                        <Icon size={19} aria-hidden="true" />
                      </span>
                      <span>{record.title}</span>
                      <small>
                        <time dateTime={record.at}>
                          {toLocalDateTime(record.at).slice(11, 16)}
                        </time>
                      </small>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="muted">Nenhum registro neste dia.</p>
          )}
          <Link
            className="text-link dashboard-diary-link"
            to="/diario"
            state={{ day: selectedDay }}
          >
            Ver todos os registros deste dia{" "}
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </section>
        <section className="panel data-card" aria-labelledby="dados-title">
          <span className="list-icon">
            <ShieldCheck size={20} aria-hidden="true" />
          </span>
          <h2 id="dados-title">Seus dados</h2>
          <p>
            Seus registros estão neste navegador. Baixe uma cópia quando quiser.
          </p>
          <p className="mini-stat">
            {totalRecords(data)} registro{totalRecords(data) === 1 ? "" : "s"}{" "}
            salvo{totalRecords(data) === 1 ? "" : "s"} no total ·{" "}
            {hasActivityCalories
              ? `${numberPt(burned, 3)} kcal de atividade ${viewingToday ? "hoje" : "no dia"}${hasEstimatedCalories ? " · inclui estimativas" : " · informadas por você"}`
              : `Sem calorias de atividade registradas ${viewingToday ? "hoje" : "no dia"}`}
          </p>
          <Link className="text-link" to="/configuracoes">
            Ver backup e configurações <ArrowRight size={16} />
          </Link>
        </section>
      </div>
    </>
  );
}
