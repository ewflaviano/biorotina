import { Activity } from "lucide-react";
import { useState, type FormEvent } from "react";
import {
  dateTimePt,
  fromLocalDateTime,
  inputDecimal,
  MAX_WEIGHT_KG,
  numberPt,
  parseDecimal,
  parseOptionalCalories,
  toLocalDateTime,
} from "../domain/data";
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

const referenceWeightKg = 70;

export function ActivityPage() {
  const { data, mutate, removeWithUndo } = useAppData();
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
  const activities = [...data.activities].sort((a, b) =>
    b.occurredAt.localeCompare(a.occurredAt),
  );
  const totalMinutes = activities.reduce(
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
    } catch (cause) {
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
    setName(activityName);
    setCaloriesMode("estimated");
    setManualCalories("");
    setPrefilled(false);
    setError("");
  }

  async function deleteActivity(item: ActivityEntry) {
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
                  onChange={(event) => setName(event.target.value)}
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
                  onChange={(event) => setDuration(event.target.value)}
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
                    onClick={() => setCaloriesMode("estimated")}
                  >
                    Usar estimativa de {estimatedCalories} kcal
                  </button>
                )}
              </div>
              <DateTimeField
                id="activity-date"
                value={when}
                onChange={setWhen}
                className="full"
              />
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <button className="button primary" disabled={saving}>
                {saving ? "Salvando…" : "Salvar atividade"}
              </button>
            </form>
          </section>
          <section className="panel">
            <h2>Histórico</h2>
            {actionError && (
              <p className="form-error" role="alert">
                {actionError}
              </p>
            )}
            {activities.length ? (
              <ul className="entry-list">
                {activities.map((item) => (
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
                        aria-label={`Usar ${item.name} de ${dateTimePt(item.occurredAt)} como modelo`}
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
            ) : (
              <EmptyState
                icon={Activity}
                title="Movimento no seu ritmo"
                description="Registre uma caminhada, treino ou qualquer outra atividade quando quiser."
              />
            )}
          </section>
        </div>
        <aside className="side-stack">
          <div className="panel highlight">
            <span className="eyebrow">Total registrado</span>
            <strong className="large-value">
              {numberPt(totalMinutes, 3)} <small>min</small>
            </strong>
            <p className="muted">
              Em {activities.length} atividade
              {activities.length === 1 ? "" : "s"}.
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
