import {
  Activity,
  Apple,
  ArrowRight,
  CalendarDays,
  Droplets,
  Pill,
  Scale,
  ShieldCheck,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  datePt,
  inputDecimal,
  isToday,
  numberPt,
  totalRecords,
} from "../domain/data";
import { useAppData } from "../state/AppDataContext";
import { PageHeader } from "../components/Layout";
import { ActivityWeekChart } from "../components/ProgressCharts";

export function DashboardPage() {
  const { data } = useAppData();
  const shortcuts = [
    { to: "/hidratacao", label: "Água", icon: Droplets },
    { to: "/peso", label: "Peso", icon: Scale },
    { to: "/atividades", label: "Atividade", icon: Activity },
    { to: "/alimentacao", label: "Refeição", icon: Apple },
    { to: "/medicamentos", label: "Medicação", icon: Pill },
  ];
  const latestWeight = [...data.weights].sort((a, b) =>
    b.measuredAt.localeCompare(a.measuredAt),
  )[0];
  const todayActivities = data.activities.filter((item) =>
    isToday(item.occurredAt),
  );
  const todayMeals = data.meals.filter((item) => isToday(item.eatenAt));
  const todayLogs = data.medicationLogs.filter((item) => isToday(item.takenAt));
  const waterToday = data.hydrationEntries
    .filter((item) => isToday(item.drankAt))
    .reduce((sum, item) => sum + item.amountMl, 0);
  const consumed = todayMeals.reduce(
    (sum, item) => sum + (item.caloriesKcal ?? 0),
    0,
  );
  const burned = todayActivities.reduce(
    (sum, item) => sum + (item.caloriesKcal ?? 0),
    0,
  );
  const hasActivityCalories = todayActivities.some(
    (item) => item.caloriesKcal !== null,
  );
  const hasEstimatedCalories = todayActivities.some(
    (item) => item.caloriesSource === "estimated",
  );
  const recent = [
    ...data.weights.map((item) => ({
      id: item.id,
      name: `Peso · ${inputDecimal(item.weightKg)} kg`,
      at: item.measuredAt,
      icon: Scale,
      to: "/peso",
    })),
    ...data.activities.map((item) => ({
      id: item.id,
      name: `${item.name} · ${inputDecimal(item.durationMinutes)} min`,
      at: item.occurredAt,
      icon: Activity,
      to: "/atividades",
    })),
    ...data.meals.map((item) => ({
      id: item.id,
      name: item.name,
      at: item.eatenAt,
      icon: Apple,
      to: "/alimentacao",
    })),
    ...data.hydrationEntries.map((item) => ({
      id: item.id,
      name: `Água · ${inputDecimal(item.amountMl)} ml`,
      at: item.drankAt,
      icon: Droplets,
      to: "/hidratacao",
    })),
    ...data.medicationLogs.map((item) => ({
      id: item.id,
      name: `${data.medications.find((medication) => medication.id === item.medicationId)?.name ?? "Medicamento"} · uso registrado`,
      at: item.takenAt,
      icon: Pill,
      to: "/medicamentos",
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 4);

  return (
    <>
      <PageHeader
        eyebrow="Visão geral"
        title="Seu dia, do seu jeito."
        description="Escolha uma área para registrar e acompanhar sua rotina. Seus dados ficam neste navegador."
      />
      <nav className="dashboard-shortcuts" aria-label="Registrar novo dado">
        {shortcuts.map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to} className="dashboard-shortcut">
            <Icon size={19} aria-hidden="true" />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
      <section aria-labelledby="resumo-title" className="section-block">
        <div className="section-heading">
          <h2 id="resumo-title">Resumo de hoje</h2>
          <span>{datePt(new Date().toISOString())}</span>
        </div>
        <div className="metric-grid">
          <Link to="/peso" className="metric-card">
            <div className="metric-top">
              <span>Peso mais recente</span>
              <Scale size={19} />
            </div>
            <strong>
              {latestWeight ? inputDecimal(latestWeight.weightKg) : "—"}{" "}
              <small>{latestWeight ? "kg" : ""}</small>
            </strong>
            <p>
              {latestWeight
                ? `Medido em ${datePt(latestWeight.measuredAt)}`
                : "Nenhuma medida registrada"}
            </p>
          </Link>
          <Link to="/atividades" className="metric-card">
            <div className="metric-top">
              <span>Movimento hoje</span>
              <Activity size={19} />
            </div>
            <strong>
              {numberPt(
                todayActivities.reduce(
                  (sum, item) => sum + item.durationMinutes,
                  0,
                ),
                3,
              )}{" "}
              <small>min</small>
            </strong>
            <p>
              {todayActivities.length} atividade
              {todayActivities.length === 1 ? "" : "s"} registrada
              {todayActivities.length === 1 ? "" : "s"}
            </p>
          </Link>
          <Link to="/alimentacao" className="metric-card">
            <div className="metric-top">
              <span>Alimentação hoje</span>
              <Apple size={19} />
            </div>
            <strong>
              {todayMeals.length}{" "}
              <small>refeiç{todayMeals.length === 1 ? "ão" : "ões"}</small>
            </strong>
            <p>
              {consumed
                ? `${numberPt(consumed, 3)} kcal informadas`
                : "Calorias opcionais"}
            </p>
          </Link>
          <Link to="/medicamentos" className="metric-card">
            <div className="metric-top">
              <span>Medicação hoje</span>
              <Pill size={19} />
            </div>
            <strong>
              {todayLogs.length}{" "}
              <small>registro{todayLogs.length === 1 ? "" : "s"} de uso</small>
            </strong>
            <p>
              {data.medications.length} medicamento
              {data.medications.length === 1 ? "" : "s"} cadastrado
              {data.medications.length === 1 ? "" : "s"}
            </p>
          </Link>
          <Link to="/hidratacao" className="metric-card hydration-metric">
            <div className="metric-top">
              <span>Água hoje</span>
              <Droplets size={19} />
            </div>
            <strong>
              {numberPt(waterToday, 3)} <small>ml</small>
            </strong>
            <p>
              {data.hydrationReminderTimes.length
                ? `${data.hydrationReminderTimes.length} horários salvos`
                : "Registre água no seu ritmo"}
            </p>
          </Link>
        </div>
      </section>
      <section
        className="panel dashboard-progress"
        aria-labelledby="progresso-title"
      >
        <div className="section-heading">
          <h2 id="progresso-title">Movimento nos últimos 7 dias</h2>
          <span>minutos registrados</span>
        </div>
        <ActivityWeekChart entries={data.activities} />
      </section>
      <div className="dashboard-lower">
        <section className="panel" aria-labelledby="recentes-title">
          <div className="section-heading">
            <h2 id="recentes-title">Registros recentes</h2>
            <CalendarDays size={20} aria-hidden="true" />
          </div>
          {recent.length ? (
            <ul className="recent-list">
              {recent.map(({ id, name, at, icon: Icon, to }) => (
                <li key={id}>
                  <Link to={to}>
                    <span className="list-icon">
                      <Icon size={19} aria-hidden="true" />
                    </span>
                    <span>{name}</span>
                    <small>{datePt(at)}</small>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">
              Ainda não há registros. Escolha uma área acima para começar.
            </p>
          )}
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
            salvo{totalRecords(data) === 1 ? "" : "s"} ·{" "}
            {hasActivityCalories
              ? `${numberPt(burned, 3)} kcal de atividade hoje${hasEstimatedCalories ? " · inclui estimativas" : " · informadas por você"}`
              : "Sem calorias de atividade registradas hoje"}
          </p>
          <Link className="text-link" to="/configuracoes">
            Ver backup e configurações <ArrowRight size={16} />
          </Link>
        </section>
      </div>
    </>
  );
}
