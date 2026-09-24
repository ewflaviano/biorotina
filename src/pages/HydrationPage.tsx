import { Bell, Droplets, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { EmptyState, PageHeader } from "../components/Layout";
import {
  dateTimePt,
  fromLocalDateTime,
  inputDecimal,
  numberPt,
  isToday,
  parseDecimal,
  reminderTimeSchema,
  toLocalDateTime,
} from "../domain/data";
import { useAppData } from "../state/AppDataContext";
import { DateTimeField } from "../components/DateTimeField";
import { TimeSelect } from "../components/TimeSelect";
import { PushActivationPrompt } from "../components/PushActivationPrompt";
import { InfoDisclosure } from "../components/InfoDisclosure";
import { removeEntry, restoreEntry } from "../domain/recordActions";
import type { HydrationEntry } from "../domain/data";

export function HydrationPage() {
  const { data, mutate, removeWithUndo } = useAppData();
  const [amount, setAmount] = useState("");
  const [when, setWhen] = useState(toLocalDateTime(new Date().toISOString()));
  const [reminderTime, setReminderTime] = useState("");
  const [waterError, setWaterError] = useState("");
  const [reminderError, setReminderError] = useState("");
  const [quickError, setQuickError] = useState("");
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showPushPrompt, setShowPushPrompt] = useState(false);
  const entries = [...data.hydrationEntries].sort((a, b) =>
    b.drankAt.localeCompare(a.drankAt),
  );
  const todayEntries = entries.filter((entry) => isToday(entry.drankAt));
  const totalToday = todayEntries.reduce(
    (sum, entry) => sum + entry.amountMl,
    0,
  );

  async function addWater(amountMl: number, drankAt: string) {
    if (amountMl > 10_000) throw new Error("Confira a quantidade informada.");
    const createdAt = new Date().toISOString();
    await mutate((current) => ({
      ...current,
      hydrationEntries: [
        { id: crypto.randomUUID(), amountMl, drankAt, createdAt },
        ...current.hydrationEntries,
      ],
    }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setWaterError("");
    setSaving(true);
    try {
      await addWater(
        parseDecimal(amount, "um volume de água"),
        fromLocalDateTime(when),
      );
      setAmount("");
      setWhen(toLocalDateTime(new Date().toISOString()));
    } catch (cause) {
      setWaterError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar o registro.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function quickAdd(
    amountMl: number,
    source: "hero" | "history" = "hero",
  ) {
    if (source === "hero") setQuickError("");
    else setActionError("");
    setSaving(true);
    try {
      await addWater(amountMl, new Date().toISOString());
    } catch {
      const message = "Não foi possível salvar o registro.";
      if (source === "hero") setQuickError(message);
      else setActionError(message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteWater(item: HydrationEntry) {
    setActionError("");
    try {
      await removeWithUndo(
        `Água de ${inputDecimal(item.amountMl)} ml`,
        (current) => removeEntry(current, "hydrationEntries", item.id),
        (current) => restoreEntry(current, "hydrationEntries", item),
      );
    } catch {
      setActionError("Não foi possível excluir o registro de água.");
    }
  }

  async function addReminder(event: FormEvent) {
    event.preventDefault();
    setReminderError("");
    try {
      const parsed = reminderTimeSchema.safeParse(reminderTime);
      if (!parsed.success) throw new Error("Informe um horário válido.");
      const time = parsed.data;
      if (data.hydrationReminderTimes.includes(time))
        throw new Error("Este horário já está na lista.");
      if (data.hydrationReminderTimes.length >= 24)
        throw new Error("O limite é de 24 horários.");
      await mutate((current) => {
        if (current.hydrationReminderTimes.includes(time))
          throw new Error("Este horário já está na lista.");
        return {
          ...current,
          hydrationReminderTimes: [
            ...current.hydrationReminderTimes,
            time,
          ].sort(),
        };
      });
      setReminderTime("");
      setShowPushPrompt(true);
    } catch (cause) {
      setReminderError(
        cause instanceof Error ? cause.message : "Informe um horário válido.",
      );
    }
  }

  async function removeReminder(time: string) {
    setReminderError("");
    try {
      await mutate((current) => ({
        ...current,
        hydrationReminderTimes: current.hydrationReminderTimes.filter(
          (item) => item !== time,
        ),
      }));
    } catch {
      setReminderError("Não foi possível remover o horário.");
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Bem-estar"
        title="Hidratação"
        description="Anote a água que você bebe e acompanhe seu dia no seu ritmo."
      />
      <div className="page-grid">
        <div className="main-stack">
          <section className="panel hydration-hero" aria-labelledby="agua-hoje">
            <span className="eyebrow">Seu registro de hoje</span>
            <h2 id="agua-hoje">Água consumida</h2>
            <strong className="large-value">
              {numberPt(totalToday, 3)} <small>ml</small>
            </strong>
            <p className="muted">
              {todayEntries.length} registro
              {todayEntries.length === 1 ? "" : "s"} hoje
            </p>
            <div
              className="quick-actions"
              aria-label="Adicionar água rapidamente"
            >
              {[200, 250, 500].map((value) => (
                <button
                  key={value}
                  className="button secondary compact"
                  type="button"
                  disabled={saving}
                  onClick={() => quickAdd(value)}
                >
                  <Plus size={15} aria-hidden="true" /> {value} ml
                </button>
              ))}
            </div>
            {quickError && (
              <p className="form-error" role="alert">
                {quickError}
              </p>
            )}
          </section>
          <section className="panel" aria-labelledby="registrar-agua">
            <h2 id="registrar-agua">Registrar água</h2>
            <form onSubmit={submit} className="form-grid">
              <div className="field">
                <label htmlFor="water-amount">Quantidade em ml</label>
                <input
                  id="water-amount"
                  inputMode="decimal"
                  placeholder="Ex.: 300"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  required
                />
              </div>
              <DateTimeField id="water-date" value={when} onChange={setWhen} />
              {waterError && (
                <p className="form-error" role="alert">
                  {waterError}
                </p>
              )}
              <button className="button primary" disabled={saving}>
                {saving ? "Salvando…" : "Salvar água"}
              </button>
            </form>
          </section>
          <section className="panel" aria-labelledby="historico-agua">
            <h2 id="historico-agua">Histórico</h2>
            {actionError && (
              <p className="form-error" role="alert">
                {actionError}
              </p>
            )}
            {entries.length ? (
              <ul className="entry-list">
                {entries.map((entry) => (
                  <li key={entry.id}>
                    <div>
                      <strong>{inputDecimal(entry.amountMl)} ml</strong>
                      <small>{dateTimePt(entry.drankAt)}</small>
                    </div>
                    <div className="entry-actions">
                      <button
                        type="button"
                        className="entry-action"
                        aria-label={`Repetir ${inputDecimal(entry.amountMl)} ml de água`}
                        disabled={saving}
                        onClick={() => quickAdd(entry.amountMl, "history")}
                      >
                        Repetir
                      </button>
                      <button
                        type="button"
                        className="entry-action danger"
                        aria-label={`Excluir água de ${inputDecimal(entry.amountMl)} ml em ${dateTimePt(entry.drankAt)}`}
                        onClick={() => deleteWater(entry)}
                      >
                        Excluir
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={Droplets}
                title="Comece quando quiser"
                description="Seu primeiro copo de água aparecerá aqui."
              />
            )}
          </section>
        </div>
        <aside className="side-stack">
          <section className="panel" aria-labelledby="horarios-agua">
            <Bell size={22} className="reminder-icon" aria-hidden="true" />
            <h2 id="horarios-agua">Horários de lembrete</h2>
            <p className="muted">
              Escolha quantas vezes por dia gostaria de receber um lembrete.
            </p>
            <form onSubmit={addReminder} className="reminder-form">
              <div className="field">
                <label htmlFor="water-reminder-time">Novo horário</label>
                <TimeSelect
                  id="water-reminder-time"
                  value={reminderTime}
                  onChange={setReminderTime}
                  required
                />
              </div>
              <button className="button secondary" type="submit">
                Adicionar
              </button>
            </form>
            {reminderError && (
              <p className="form-error" role="alert">
                {reminderError}
              </p>
            )}
            {data.hydrationReminderTimes.length ? (
              <ul className="reminder-times">
                {data.hydrationReminderTimes.map((time) => (
                  <li key={time}>
                    <span>{time}</span>
                    <button
                      type="button"
                      aria-label={`Remover horário ${time}`}
                      onClick={() => removeReminder(time)}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted reminder-empty">Nenhum horário escolhido.</p>
            )}
            <InfoDisclosure label="Como funcionam os avisos?">
              <p>
                Ao ativar avisos, compartilhamos apenas os horários necessários
                para enviá-los. A quantidade de água que você bebe não é
                enviada.
              </p>
            </InfoDisclosure>
          </section>
        </aside>
      </div>
      <PushActivationPrompt
        open={showPushPrompt}
        onClose={() => setShowPushPrompt(false)}
      />
    </>
  );
}
