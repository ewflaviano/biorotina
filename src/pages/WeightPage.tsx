import { Ruler, Scale } from "lucide-react";
import { useState, type FormEvent } from "react";
import {
  bmi,
  bmiCategory,
  dateTimePt,
  numberPt,
  parseDecimal,
  toLocalDateTime,
  fromLocalDateTime,
  inputDecimal,
  MAX_HEIGHT_CM,
  MAX_WEIGHT_KG,
  MIN_HEIGHT_CM,
} from "../domain/data";
import { EmptyState, Notice, PageHeader } from "../components/Layout";
import { WeightTrend } from "../components/ProgressCharts";
import { DateTimeField } from "../components/DateTimeField";
import { InfoDisclosure } from "../components/InfoDisclosure";
import { useAppData } from "../state/AppDataContext";
import { removeEntry, restoreEntry } from "../domain/recordActions";
import type { WeightEntry } from "../domain/data";

export function WeightPage() {
  const { data, mutate, removeWithUndo } = useAppData();
  const [value, setValue] = useState("");
  const [height, setHeight] = useState(
    data.profile.heightCm?.toString().replace(".", ",") ?? "",
  );
  const [when, setWhen] = useState(toLocalDateTime(new Date().toISOString()));
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [heightSaving, setHeightSaving] = useState(false);
  const [heightMessage, setHeightMessage] = useState("");
  const [prefilled, setPrefilled] = useState(false);
  const [actionError, setActionError] = useState("");
  const weights = [...data.weights].sort((a, b) =>
    b.measuredAt.localeCompare(a.measuredAt),
  );
  const latest = weights[0];
  const previous = weights[1];
  const currentBmi = latest
    ? bmi(latest.weightKg, data.profile.heightCm)
    : null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const weightKg = parseDecimal(value, "um peso");
      if (weightKg > MAX_WEIGHT_KG)
        throw new Error(
          `Confira o peso: o máximo aceito é ${MAX_WEIGHT_KG} kg.`,
        );
      const measuredAt = fromLocalDateTime(when);
      const createdAt = new Date().toISOString();
      await mutate((current) => ({
        ...current,
        weights: [
          {
            id: crypto.randomUUID(),
            weightKg,
            measuredAt,
            note: note.trim(),
            createdAt,
          },
          ...current.weights,
        ],
      }));
      setValue("");
      setNote("");
      setWhen(toLocalDateTime(new Date().toISOString()));
      setPrefilled(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar o peso.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveHeight(event: FormEvent) {
    event.preventDefault();
    setError("");
    setHeightMessage("");
    setHeightSaving(true);
    try {
      const heightCm = parseDecimal(height, "uma altura");
      if (heightCm < MIN_HEIGHT_CM || heightCm > MAX_HEIGHT_CM)
        throw new Error(
          `Confira a altura: informe entre ${MIN_HEIGHT_CM} e ${MAX_HEIGHT_CM} cm.`,
        );
      await mutate((current) => ({
        ...current,
        profile: { ...current.profile, heightCm },
      }));
      setHeight(inputDecimal(heightCm));
      setHeightMessage("Altura salva. Ela será usada no cálculo de IMC.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar a altura.",
      );
    } finally {
      setHeightSaving(false);
    }
  }

  function repeatWeight(item: WeightEntry) {
    setValue(inputDecimal(item.weightKg));
    setNote("");
    setWhen(toLocalDateTime(new Date().toISOString()));
    setPrefilled(true);
    setError("");
    document.getElementById("weight-value")?.focus();
  }

  async function deleteWeight(item: WeightEntry) {
    setActionError("");
    try {
      await removeWithUndo(
        `Peso de ${inputDecimal(item.weightKg)} kg`,
        (current) => removeEntry(current, "weights", item.id),
        (current) => restoreEntry(current, "weights", item),
      );
    } catch {
      setActionError("Não foi possível excluir o peso. Tente novamente.");
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Corpo"
        title="Medidas"
        description="Registre suas medidas e acompanhe mudanças ao longo do tempo, sem julgamentos."
      />
      <div className="page-grid">
        <div className="main-stack">
          <section
            className="panel measurement-height"
            aria-labelledby="altura"
          >
            <div className="card-title">
              <span className="list-icon">
                <Ruler size={20} aria-hidden="true" />
              </span>
              <div>
                <h2 id="altura">Sua altura</h2>
                <p>Usamos essa medida apenas para calcular o IMC.</p>
              </div>
            </div>
            <form onSubmit={saveHeight} className="measurement-height-form">
              <div className="field">
                <label htmlFor="height-value">Altura</label>
                <div className="measurement-value-input">
                  <input
                    id="height-value"
                    inputMode="decimal"
                    placeholder="Ex.: 168"
                    value={height}
                    onChange={(event) => setHeight(event.target.value)}
                    required
                  />
                  <span aria-hidden="true">cm</span>
                </div>
              </div>
              <button className="button secondary" disabled={heightSaving}>
                {heightSaving ? "Salvando…" : "Salvar altura"}
              </button>
            </form>
            {heightMessage && (
              <p className="template-note" role="status">
                {heightMessage}
              </p>
            )}
          </section>
          <section className="panel" aria-labelledby="novo-peso">
            <h2 id="novo-peso">Registrar peso</h2>
            <p className="muted">Cada registro entra no seu histórico.</p>
            {prefilled && (
              <p className="template-note" role="status">
                Medida anterior preenchida. Confira o valor e salve como novo
                registro.
              </p>
            )}
            <form onSubmit={submit} className="form-grid">
              <div className="field">
                <label htmlFor="weight-value">Peso em kg</label>
                <div className="measurement-value-input">
                  <input
                    id="weight-value"
                    inputMode="decimal"
                    placeholder="Ex.: 72,4"
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    required
                  />
                  <span aria-hidden="true">kg</span>
                </div>
              </div>
              <DateTimeField id="weight-date" value={when} onChange={setWhen} />
              <div className="field full">
                <label htmlFor="weight-note">
                  Observação <span className="optional">opcional</span>
                </label>
                <input
                  id="weight-note"
                  maxLength={500}
                  placeholder="Como foi feita a medida?"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </div>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <button className="button primary" disabled={saving}>
                {saving ? "Salvando…" : "Salvar medida"}
              </button>
            </form>
          </section>
          <section className="panel" aria-labelledby="historico-peso">
            <h2 id="historico-peso">Histórico</h2>
            {actionError && (
              <p className="form-error" role="alert">
                {actionError}
              </p>
            )}
            <WeightTrend entries={weights} />
            {weights.length ? (
              <ul className="entry-list">
                {weights.map((item) => (
                  <li key={item.id}>
                    <div>
                      <strong>{inputDecimal(item.weightKg)} kg</strong>
                      <small>
                        {dateTimePt(item.measuredAt)}
                        {item.note ? ` · ${item.note}` : ""}
                      </small>
                    </div>
                    <div className="entry-actions">
                      <button
                        type="button"
                        className="entry-action"
                        aria-label={`Repetir peso de ${dateTimePt(item.measuredAt)}`}
                        onClick={() => repeatWeight(item)}
                      >
                        Repetir
                      </button>
                      <button
                        type="button"
                        className="entry-action danger"
                        aria-label={`Excluir peso de ${dateTimePt(item.measuredAt)}`}
                        onClick={() => deleteWeight(item)}
                      >
                        Excluir
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={Scale}
                title="Sua primeira medida"
                description="Registre um peso quando quiser começar a acompanhar sua evolução."
              />
            )}
          </section>
        </div>
        <aside className="side-stack">
          <div className="panel highlight">
            <span className="eyebrow">Última medida</span>
            <strong className="large-value">
              {latest ? inputDecimal(latest.weightKg) : "—"}{" "}
              <small>{latest ? "kg" : ""}</small>
            </strong>
            <p className="muted">
              {latest ? dateTimePt(latest.measuredAt) : "Ainda não há medidas"}
            </p>
            {latest && previous && (
              <p className="trend-copy">
                {numberPt(latest.weightKg - previous.weightKg, 1)} kg desde a
                medida anterior
              </p>
            )}
          </div>
          <div className="panel">
            <h2>IMC</h2>
            <strong className="medium-value">
              {currentBmi ? numberPt(currentBmi, 2) : "—"}
            </strong>
            {currentBmi && (
              <p className="bmi-category">
                {bmiCategory(currentBmi)}{" "}
                <small>· referência para adultos de 18 a 59 anos</small>
              </p>
            )}
            <p className="muted">
              {currentBmi
                ? `Calculado com a altura de ${numberPt(data.profile.heightCm!, 1)} cm informada no perfil.`
                : !latest
                  ? "Registre um peso para calcular."
                  : data.profile.heightCm === null
                    ? "Adicione sua altura em Medidas para calcular."
                    : "Confira o peso e a altura cadastrados para calcular."}
            </p>
            <InfoDisclosure label="De onde vêm as faixas do IMC?">
              <p>
                IMC = peso em kg ÷ altura em metros ao quadrado. Para adultos de
                18 a 59 anos, seguimos a{" "}
                <a
                  href="https://linhasdecuidado.saude.gov.br/portal/obesidade-no-adulto/unidade-de-atencao-primaria/rastreamento-diagnostico/"
                  target="_blank"
                  rel="noreferrer"
                >
                  classificação do Ministério da Saúde
                </a>
                :
              </p>
              <ul>
                <li>Abaixo de 18,5: abaixo do peso</li>
                <li>18,5 a menos de 25: peso adequado</li>
                <li>25 a menos de 30: sobrepeso</li>
                <li>30 a menos de 35: obesidade grau I</li>
                <li>35 a menos de 40: obesidade grau II</li>
                <li>40 ou mais: obesidade grau III</li>
              </ul>
              <p>
                Os limites de entrada de 50–250 cm e até 350 kg apenas ajudam a
                detectar erros de digitação. Não são limites médicos.
              </p>
            </InfoDisclosure>
            <Notice>
              IMC é uma estimativa e não descreve sua saúde sozinho. As faixas
              exibidas são para adultos de 18 a 59 anos; outras idades exigem
              critérios diferentes.
            </Notice>
          </div>
        </aside>
      </div>
    </>
  );
}
