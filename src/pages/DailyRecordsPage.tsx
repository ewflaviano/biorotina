import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { DayPicker } from "../components/DayPicker";
import { PageHeader } from "../components/Layout";
import { dailyRecordAreas } from "../components/dailyRecordAreas";
import { todayIsoDate, toLocalDateTime } from "../domain/data";
import {
  formatCalendarDay,
  isSelectableCalendarDay,
  recordsForDay,
} from "../domain/dailyRecords";
import { useAppData } from "../state/AppDataContext";

const PAGE_SIZE = 30;

export function DailyRecordsPage() {
  const { data } = useAppData();
  const location = useLocation();
  const [view, setView] = useState(() => {
    const requestedDay = (location.state as { day?: unknown } | null)?.day;
    return {
      day: isSelectableCalendarDay(requestedDay)
        ? requestedDay
        : todayIsoDate(),
      visible: PAGE_SIZE,
    };
  });
  const records = useMemo(
    () => recordsForDay(data, view.day),
    [data, view.day],
  );

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  function chooseDay(day: string) {
    setView({ day, visible: PAGE_SIZE });
  }

  return (
    <>
      <Link className="text-link diary-back" to="/" state={{ day: view.day }}>
        <ArrowLeft size={17} aria-hidden="true" /> Voltar ao resumo
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
          <DayPicker
            id="diary-date"
            label="Data dos registros"
            value={view.day}
            onChange={chooseDay}
          />
        </section>
        <section
          className="panel diary-results"
          aria-labelledby="diary-results-title"
        >
          <div className="diary-results-heading">
            <h2 id="diary-results-title">
              Registros de {formatCalendarDay(view.day)}
            </h2>
            <p role="status">
              {records.length} registro{records.length === 1 ? "" : "s"}
            </p>
          </div>
          {records.length ? (
            <>
              <ul className="diary-list">
                {records.slice(0, view.visible).map((record) => {
                  const area = dailyRecordAreas[record.kind];
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
