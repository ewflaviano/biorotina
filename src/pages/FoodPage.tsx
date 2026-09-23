import { Apple } from "lucide-react";
import { useState, type FormEvent } from "react";
import {
  dateTimePt,
  fromLocalDateTime,
  inputDecimal,
  numberPt,
  parseOptionalCalories,
  toLocalDateTime,
} from "../domain/data";
import { EmptyState, Notice, PageHeader } from "../components/Layout";
import { useAppData } from "../state/AppDataContext";
import { DateTimeField } from "../components/DateTimeField";
import { removeEntry, restoreEntry } from "../domain/recordActions";
import type { MealEntry } from "../domain/data";

export function FoodPage() {
  const { data, mutate, removeWithUndo } = useAppData();
  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");
  const [when, setWhen] = useState(toLocalDateTime(new Date().toISOString()));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [prefilled, setPrefilled] = useState(false);
  const [actionError, setActionError] = useState("");
  const meals = [...data.meals].sort((a, b) =>
    b.eatenAt.localeCompare(a.eatenAt),
  );
  const totalCalories = meals.reduce(
    (sum, item) => sum + (item.caloriesKcal ?? 0),
    0,
  );
  const measuredMeals = meals.filter(
    (item) => item.caloriesKcal !== null,
  ).length;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      if (!name.trim()) throw new Error("Descreva a refeição.");
      const caloriesKcal = parseOptionalCalories(calories);
      const eatenAt = fromLocalDateTime(when);
      await mutate((current) => ({
        ...current,
        meals: [
          {
            id: crypto.randomUUID(),
            name: name.trim(),
            caloriesKcal,
            eatenAt,
            createdAt: new Date().toISOString(),
          },
          ...current.meals,
        ],
      }));
      setName("");
      setCalories("");
      setWhen(toLocalDateTime(new Date().toISOString()));
      setPrefilled(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar a refeição.",
      );
    } finally {
      setSaving(false);
    }
  }

  function repeatMeal(item: MealEntry) {
    setName(item.name);
    setCalories(
      item.caloriesKcal === null ? "" : inputDecimal(item.caloriesKcal),
    );
    setWhen(toLocalDateTime(new Date().toISOString()));
    setPrefilled(true);
    setError("");
    document.getElementById("meal-name")?.focus();
  }

  async function deleteMeal(item: MealEntry) {
    setActionError("");
    try {
      await removeWithUndo(
        item.name,
        (current) => removeEntry(current, "meals", item.id),
        (current) => restoreEntry(current, "meals", item),
      );
    } catch {
      setActionError("Não foi possível excluir a refeição. Tente novamente.");
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Alimentação"
        title="Refeições"
        description="Um diário simples para registrar o que você comeu. Contar calorias é opcional."
      />
      <div className="page-grid">
        <div className="main-stack">
          <section className="panel">
            <h2>Nova refeição</h2>
            {prefilled && (
              <p className="template-note" role="status">
                Refeição anterior preenchida. Confira os detalhes e salve como
                novo registro.
              </p>
            )}
            <form onSubmit={submit} className="form-grid">
              <div className="field full">
                <label htmlFor="meal-name">Descrição</label>
                <input
                  id="meal-name"
                  placeholder="Ex.: Café da manhã"
                  maxLength={120}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="meal-calories">
                  Calorias consumidas <span className="optional">opcional</span>
                </label>
                <input
                  id="meal-calories"
                  inputMode="decimal"
                  placeholder="Ex.: 320"
                  value={calories}
                  onChange={(event) => setCalories(event.target.value)}
                />
              </div>
              <DateTimeField id="meal-date" value={when} onChange={setWhen} />
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <button className="button primary" disabled={saving}>
                {saving ? "Salvando…" : "Salvar refeição"}
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
            {meals.length ? (
              <ul className="entry-list">
                {meals.map((item) => (
                  <li key={item.id}>
                    <div>
                      <strong>{item.name}</strong>
                      <small>
                        {dateTimePt(item.eatenAt)}
                        {item.caloriesKcal !== null
                          ? ` · ${inputDecimal(item.caloriesKcal)} kcal informadas`
                          : ""}
                      </small>
                    </div>
                    <div className="entry-actions">
                      <button
                        type="button"
                        className="entry-action"
                        aria-label={`Usar ${item.name} de ${dateTimePt(item.eatenAt)} como modelo`}
                        onClick={() => repeatMeal(item)}
                      >
                        Usar como modelo
                      </button>
                      <button
                        type="button"
                        className="entry-action danger"
                        aria-label={`Excluir ${item.name} de ${dateTimePt(item.eatenAt)}`}
                        onClick={() => deleteMeal(item)}
                      >
                        Excluir
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={Apple}
                title="Seu diário de alimentação"
                description="Adicione uma refeição quando quiser começar. As calorias não são obrigatórias."
              />
            )}
          </section>
        </div>
        <aside className="side-stack">
          <div className="panel highlight">
            <span className="eyebrow">Refeições registradas</span>
            <strong className="large-value">{meals.length}</strong>
            <p className="muted">
              {measuredMeals
                ? `${numberPt(totalCalories, 3)} kcal informadas em ${measuredMeals} refeições.`
                : "Sem valores de calorias informados."}
            </p>
          </div>
          <Notice>
            O Biorotina não calcula calorias a partir do nome da refeição.
            Qualquer análise por IA será opcional e identificada como
            estimativa.
          </Notice>
        </aside>
      </div>
    </>
  );
}
