import {
  Activity,
  Apple,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Droplets,
  Pill,
  Scale,
  Sprout,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/Layout";
import { todayIsoDate, toLocalDateTime } from "../domain/data";
import {
  recordsForDay,
  shiftCalendarDay,
  type DailyRecordKind,
} from "../domain/dailyRecords";
import { useAppData } from "../state/AppDataContext";

const PAGE_SIZE = 30;

const recordAreas: Record<
  DailyRecordKind,
  { label: string; to: string; icon: LucideIcon }
> = {
  weight: { label: "Medidas", to: "/peso", icon: Scale },
  activity: { label: "Atividade", to: "/atividades", icon: Activity },
  meal: { label: "Alimentação", to: "/alimentacao", icon: Apple },
  hydration: { label: "Hidratação", to: "/hidratacao", icon: Droplets },
  medication: { label: "Medicação", to: "/medicamentos", icon: Pill },
  habit: { label: "Hábitos", to: "/habitos", icon: Sprout },
};

function formatDay(day: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${day}T12:00:00`));
}

export function DailyRecordsPage() {
  const { data } = useAppData();
  const [view, setView] = useState({ day: todayIsoDate(), visible: PAGE_SIZE });
  const today = todayIsoDate();
  const records = useMemo(
    () => recordsForDay(data, view.day),
    [data, view.day],
  );

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  function chooseDay(day: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > today) return;
    setView({ day, visible: PAGE_SIZE });
  }

  return (
    <>
      <Link className="text-link diary-back" to="/">
        <ArrowLeft size={17} aria-hidden="true" /> Voltar para Hoje
      </Link>
      <PageHeader
        eyebrow="Visão geral"
        title="Registros por dia"
        description="Consulte o que você registrou em uma data. Seus dados continuam neste navegador."
      />
      <div className="diary-layout">
        <section
          className="panel diary-picker"
          aria-labelledby="diary-picker-title"
        >
          <h2 id="diary-picker-title">Escolha um dia</h2>
          <div className="diary-date-controls">
            <button
              className="diary-step"
              type="button"
              onClick={() => chooseDay(shiftCalendarDay(view.day, -1))}
              aria-label="Dia anterior"
            >
              <ChevronLeft size={22} aria-hidden="true" />
            </button>
            <label className="diary-date-field" htmlFor="diary-date">
              <CalendarDays size={19} aria-hidden="true" />
              <input
                id="diary-date"
                aria-label="Data dos registros"
                type="date"
                value={view.day}
                max={today}
                onChange={(event) => chooseDay(event.target.value)}
              />
            </label>
            <button
              className="diary-step"
              type="button"
              onClick={() => chooseDay(shiftCalendarDay(view.day, 1))}
              disabled={view.day >= today}
              aria-label="Dia seguinte"
            >
              <ChevronRight size={22} aria-hidden="true" />
            </button>
          </div>
          <button
            className="diary-today"
            type="button"
            onClick={() => chooseDay(today)}
            disabled={view.day === today}
          >
            Ir para hoje
          </button>
        </section>
        <section
          className="panel diary-results"
          aria-labelledby="diary-results-title"
        >
          <div className="diary-results-heading">
            <h2 id="diary-results-title">Registros de {formatDay(view.day)}</h2>
            <p role="status">
              {records.length} registro{records.length === 1 ? "" : "s"}
            </p>
          </div>
          {records.length ? (
            <>
              <ul className="diary-list">
                {records.slice(0, view.visible).map((record) => {
                  const area = recordAreas[record.kind];
                  const Icon = area.icon;
                  return (
                    <li key={`${record.kind}:${record.id}`}>
                      <Link to={area.to}>
                        <span className="list-icon" aria-hidden="true">
                          <Icon size={19} />
                        </span>
                        <span className="diary-entry-copy">
                          <strong>{record.title}</strong>
                          <small>{area.label}</small>
                        </span>
                        <time dateTime={record.at}>
                          {toLocalDateTime(record.at).slice(11, 16)}
                        </time>
                        <ArrowRight
                          className="diary-entry-arrow"
                          size={16}
                          aria-hidden="true"
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>
              {records.length > view.visible && (
                <button
                  className="button secondary diary-more"
                  type="button"
                  onClick={() =>
                    setView((current) => ({
                      ...current,
                      visible: current.visible + PAGE_SIZE,
                    }))
                  }
                >
                  Mostrar mais registros
                </button>
              )}
            </>
          ) : (
            <p className="diary-empty">Nenhum registro neste dia.</p>
          )}
        </section>
      </div>
    </>
  );
}
