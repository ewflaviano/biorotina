import { Activity } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { useLocation } from "react-router-dom";
import {
  dateTimePt,
  fromLocalDateTime,
  inputDecimal,
  MAX_WEIGHT_KG,
  numberPt,
  parseDecimal,
  parseOptionalCalories,
  toLocalDateTime,
  todayIsoDate,
} from "../domain/data";
import { DayPicker } from "../components/DayPicker";
import {
  formatCalendarDay,
  isSelectableCalendarDay,
} from "../domain/dailyRecords";
import { EmptyState, Notice, PageHeader } from "../components/Layout";
import { useAppData } from "../state/AppDataContext";
import { DateTimeField } from "../components/DateTimeField";
import { InfoDisclosure } from "../components/InfoDisclosure";
import { removeEntry, restoreEntry } from "../domain/recordActions";
import type { ActivityEntry } from "../domain/data";
import {
  activityCatalog,
  activitySourceUrl,
  caloriesPerMinute,
  estimateActivityCalories,
  findCatalogActivity,
} from "../domain/activityCatalog";
import { activityShortcuts } from "../domain/activityShortcuts";
import {
  useExperiment,
  useExperimentExposure,
} from "../experiments/ExperimentContext";

const referenceWeightKg = 70;

function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

export function ActivityPage() {
  const { data, mutate, removeWithUndo } = useAppData();
  const location = useLocation();
  const [selectedDay, setSelectedDay] = useState(() => {
    const requestedDay = (location.state as { day?: unknown } | null)?.day;
    return isSelectableCalendarDay(requestedDay)
      ? requestedDay
      : todayIsoDate();
  });
  const [historySearch, setHistorySearch] = useState("");
  const { enabled, startAttempt } = useExperiment();
  useExperimentExposure("activity-form-confirmation");
  const confirmActivity = enabled("activity-form-confirmation");
  const [activityConfirmed, setActivityConfirmed] = useState(false);
  const [name, setName] = useState("");
  const [duration, setDuration] = useState("");
  const [manualCalories, setManualCalories] = useState("");
  const [caloriesMode, setCaloriesMode] = useState<"estimated" | "manual">(
    "estimated",
  );
  const [when, setWhen] = useState(toLocalDateTime(new Date().toISOString()));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [prefilled, setPrefilled] = useState(false);
  const [actionError, setActionError] = useState("");
  const activitiesForDay = useMemo(
    () =>
      data.activities
        .filter(
          (item) =>
            toLocalDateTime(item.occurredAt).slice(0, 10) === selectedDay,
        )
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
    [data.activities, selectedDay],
  );
  const searchTerm = normalizeName(historySearch.trim());
  const visibleActivities = activitiesForDay.filter((item) =>
    normalizeName(item.name).includes(searchTerm),
  );
  const visibleMinutes = visibleActivities.reduce(
    (sum, item) => sum + item.durationMinutes,
    0,
  );
  const dailyMinutes = activitiesForDay.reduce(
    (sum, item) => sum + item.durationMinutes,
    0,
  );
  const shortcuts = activityShortcuts(data.activities);
  const latestWeight = [...data.weights].sort((a, b) =>
    b.measuredAt.localeCompare(a.measuredAt),
  )[0];
  const usableWeight =
    latestWeight && latestWeight.weightKg <= MAX_WEIGHT_KG
      ? latestWeight
      : null;
  const weightForEstimate = usableWeight?.weightKg ?? referenceWeightKg;
  const catalogActivity = findCatalogActivity(name);
  const estimatedCalories = estimateActivityCalories(
    catalogActivity,
    Number(duration.trim().replace(",", ".")),
    weightForEstimate,
  );
  const calories =
    caloriesMode === "estimated"
      ? estimatedCalories === null
        ? ""
        : String(estimatedCalories)
      : manualCalories;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    const finish = startAttempt("activity-form-confirmation");
    setActivityConfirmed(false);
    setError("");
    setSaving(true);
    try {
      if (!name.trim()) throw new Error("Dê um nome à atividade.");
      const durationMinutes = parseDecimal(duration, "uma duração");
      if (durationMinutes > 1440)
        throw new Error("Confira a duração informada.");
      const caloriesKcal = parseOptionalCalories(calories);
      const occurredAt = fromLocalDateTime(when);
      await mutate((current) => ({
        ...current,
        activities: [
          {
            id: crypto.randomUUID(),
            name: name.trim(),
            durationMinutes,
            caloriesKcal,
            ...(caloriesKcal === null ? {} : { caloriesSource: caloriesMode }),
            occurredAt,
            createdAt: new Date().toISOString(),
          },
          ...current.activities,
        ],
      }));
      setName("");
      setDuration("");
      setManualCalories("");
      setCaloriesMode("estimated");
      setWhen(toLocalDateTime(new Date().toISOString()));
      setPrefilled(false);
      setSelectedDay(toLocalDateTime(occurredAt).slice(0, 10));
      setHistorySearch("");
      if (confirmActivity) setActivityConfirmed(true);
      finish("success");
    } catch (cause) {
      finish("error");
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar a atividade.",
      );
    } finally {
      setSaving(false);
    }
  }

  function repeatActivity(item: ActivityEntry, focusName = true) {
    setActivityConfirmed(false);
    setName(item.name);
    setDuration(inputDecimal(item.durationMinutes));
    setManualCalories(
      item.caloriesKcal === null ? "" : inputDecimal(item.caloriesKcal),
    );
    setCaloriesMode(
      item.caloriesSource === "estimated" ? "estimated" : "manual",
    );
    setWhen(toLocalDateTime(new Date().toISOString()));
    setPrefilled(true);
    setError("");
    if (focusName) document.getElementById("activity-name")?.focus();
  }

  function chooseSuggestedActivity(activityName: string) {
    setActivityConfirmed(false);
    setName(activityName);
    setCaloriesMode("estimated");
    setManualCalories("");
    setPrefilled(false);
    setError("");
  }

  async function deleteActivity(item: ActivityEntry) {
    setActivityConfirmed(false);
    setActionError("");
    try {
      await removeWithUndo(
        item.name,
        (current) => removeEntry(current, "activities", item.id),
        (current) => restoreEntry(current, "activities", item),
      );
    } catch {
      setActionError("Não foi possível excluir a atividade. Tente novamente.");
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Movimento"
        title="Atividades físicas"
        description="Registre o movimento que faz sentido para você e acompanhe tempo e frequência."
      />
      <div className="page-grid">
        <div className="main-stack">
          <section className="panel">
            <h2>Nova atividade</h2>
            <p className="muted">
              Escolha uma atividade ou escreva a sua. A estimativa de calorias é
              opcional e pode ser ajustada.
            </p>
            {prefilled && (
              <p className="template-note" role="status">
                Atividade anterior preenchida. Confira os detalhes e salve como
                novo registro.
              </p>
            )}
            <form onSubmit={submit} className="form-grid">
              <div className="field full">
                <label htmlFor="activity-name">Atividade</label>
                <input
                  id="activity-name"
                  placeholder="Ex.: Caminhada"
                  maxLength={100}
                  list="activity-options"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    setActivityConfirmed(false);
                  }}
                  required
                />
                <datalist id="activity-options">
                  {activityCatalog.map((item) => (
                    <option key={item.code} value={item.name} />
                  ))}
                </datalist>
                <div
                  className="activity-picks"
                  aria-label="Atalhos de atividades"
                >
                  {shortcuts.map((shortcut) => (
                    <button
                      key={shortcut.name}
                      type="button"
                      className={
                        name === shortcut.name
                          ? "activity-pick active"
                          : "activity-pick"
                      }
                      onClick={() =>
                        shortcut.previous
                          ? repeatActivity(shortcut.previous, false)
                          : chooseSuggestedActivity(shortcut.name)
                      }
                    >
                      {shortcut.name}
                    </button>
                  ))}
                </div>
                {data.activities.length > 0 && (
                  <small>Suas atividades recentes aparecem primeiro.</small>
                )}
              </div>
              <div className="field">
                <label htmlFor="activity-duration">Duração em minutos</label>
                <input
                  id="activity-duration"
                  inputMode="decimal"
                  placeholder="Ex.: 35"
                  value={duration}
                  onChange={(event) => {
                    setDuration(event.target.value);
                    setActivityConfirmed(false);
                  }}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="activity-calories">
                  Calorias gastas <span className="optional">opcional</span>
                </label>
                <input
                  id="activity-calories"
                  inputMode="decimal"
                  placeholder="Opcional"
                  value={calories}
                  onChange={(event) => {
                    setManualCalories(event.target.value);
                    setCaloriesMode("manual");
                    setActivityConfirmed(false);
                  }}
                />
                {catalogActivity && (
                  <small>
                    Estimativa:{" "}
                    {numberPt(
                      caloriesPerMinute(catalogActivity.met, weightForEstimate),
                      1,
                    )}{" "}
                    kcal/min
                    {usableWeight
                      ? ` com seu último peso (${inputDecimal(weightForEstimate)} kg)`
                      : ` para uma pessoa de referência de ${referenceWeightKg} kg`}
                    . O gasto real pode variar.
                  </small>
                )}
                <InfoDisclosure label="Como estimamos as calorias?">
                  <p>
                    Usamos os valores MET do Compêndio de Atividades Físicas
                    para Adultos de 2024. A fórmula publicada é MET × 3,5 × peso
                    (kg) ÷ 200 = kcal por minuto; multiplicamos pela duração.
                  </p>
                  {catalogActivity && (
                    <p>
                      Para <strong>{catalogActivity.name}</strong>, usamos{" "}
                      {numberPt(catalogActivity.met, 1)} MET (código{" "}
                      {catalogActivity.code}).{" "}
                      <a
                        href={activitySourceUrl(catalogActivity)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Ver parâmetro na fonte
                      </a>
                      .
                    </p>
                  )}
                  <p>
                    O peso é o último registrado. Sem ele, usamos uma referência
                    de 70 kg. O resultado é uma estimativa de gasto total,
                    inclusive repouso, e pode ser ajustado ou apagado.
                  </p>
                </InfoDisclosure>
                {caloriesMode === "manual" && estimatedCalories !== null && (
                  <button
                    type="button"
                    className="estimate-reset"
                    onClick={() => {
                      setCaloriesMode("estimated");
                      setActivityConfirmed(false);
                    }}
                  >
                    Usar estimativa de {estimatedCalories} kcal
                  </button>
                )}
              </div>
              <DateTimeField
                id="activity-date"
                value={when}
                onChange={(value) => {
                  setWhen(value);
                  setActivityConfirmed(false);
                }}
                className="full"
              />
              {confirmActivity && (
                <p
                  role="status"
                  aria-atomic="true"
                  className="small muted full"
                >
                  {activityConfirmed ? "Atividade salva no histórico." : ""}
                </p>
              )}
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <button
                className="button primary"
                disabled={!confirmActivity && saving}
                aria-disabled={confirmActivity && saving ? true : undefined}
              >
                {saving ? "Salvando…" : "Salvar atividade"}
              </button>
            </form>
          </section>
          <section className="panel" aria-labelledby="activity-history-title">
            <div className="activity-history-heading">
              <h2 id="activity-history-title">
                Histórico de {formatCalendarDay(selectedDay)}
              </h2>
              <DayPicker
                id="activity-history-date"
                label="Data do histórico de atividades"
                value={selectedDay}
                onChange={setSelectedDay}
              />
            </div>
            {data.activities.length > 0 && (
              <div className="field activity-history-search">
                <label htmlFor="activity-history-search">
                  Buscar atividade neste dia
                </label>
                <input
                  id="activity-history-search"
                  type="search"
                  placeholder="Ex.: Caminhada"
                  value={historySearch}
                  onChange={(event) => setHistorySearch(event.target.value)}
                />
                {historySearch && (
                  <button
                    className="text-link activity-clear-search"
                    type="button"
                    onClick={() => setHistorySearch("")}
                  >
                    Limpar busca
                  </button>
                )}
              </div>
            )}
            {actionError && (
              <p className="form-error" role="alert">
                {actionError}
              </p>
            )}
            {data.activities.length > 0 && (
              <p className="activity-history-summary" role="status">
                {visibleActivities.length} atividade
                {visibleActivities.length === 1 ? "" : "s"} ·{" "}
                {numberPt(visibleMinutes, 3)} min exibidos
              </p>
            )}
            {visibleActivities.length ? (
              <ul className="entry-list">
                {visibleActivities.map((item) => (
                  <li key={item.id}>
                    <div>
                      <strong>{item.name}</strong>
                      <small>
                        {dateTimePt(item.occurredAt)} ·{" "}
                        {inputDecimal(item.durationMinutes)} min
                        {item.caloriesKcal !== null
                          ? ` · ${inputDecimal(item.caloriesKcal)} kcal ${item.caloriesSource === "estimated" ? "estimadas" : "informadas"}`
                          : ""}
                      </small>
                    </div>
                    <div className="entry-actions">
                      <button
                        type="button"
                        className="entry-action"
                        aria-label={`Repetir ${item.name} de ${dateTimePt(item.occurredAt)}`}
                        onClick={() => repeatActivity(item)}
                      >
                        Repetir
                      </button>
                      <button
                        type="button"
                        className="entry-action danger"
                        aria-label={`Excluir ${item.name} de ${dateTimePt(item.occurredAt)}`}
                        onClick={() => deleteActivity(item)}
                      >
                        Excluir
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : data.activities.length === 0 ? (
              <EmptyState
                icon={Activity}
                title="Movimento no seu ritmo"
                description="Registre uma caminhada, treino ou qualquer outra atividade quando quiser."
              />
            ) : (
              <p className="activity-history-empty">
                {activitiesForDay.length === 0
                  ? "Nenhuma atividade registrada neste dia. Escolha outra data para consultar o histórico."
                  : "Nenhuma atividade corresponde à busca neste dia. Limpe a busca para ver todos os registros."}
              </p>
            )}
          </section>
        </div>
        <aside className="side-stack">
          <div className="panel highlight">
            <span className="eyebrow">Total do dia</span>
            <strong className="large-value">
              {numberPt(dailyMinutes, 3)} <small>min</small>
            </strong>
            <p className="muted">
              {activitiesForDay.length} atividade
              {activitiesForDay.length === 1 ? "" : "s"} registrada
              {activitiesForDay.length === 1 ? "" : "s"} em{" "}
              {formatCalendarDay(selectedDay)}.
            </p>
          </div>
          <Notice>
            Calorias estimadas são aproximações. Você pode ajustar ou apagar o
            valor antes de salvar.
          </Notice>
        </aside>
      </div>
    </>
  );
}
