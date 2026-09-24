import { Apple, Camera, ImagePlus, Sparkles, Trash2, X } from "lucide-react";
import {
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
  type MouseEvent,
} from "react";
import { Link } from "react-router-dom";
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
import { mealFoodSchema, type MealEntry } from "../domain/data";
import {
  analyzeMealImage,
  prepareMealImage,
  type PreparedImage,
} from "../ai/gemini";
import { loadGeminiKey } from "../storage/indexedDb";
import {
  analyzeWithPlan,
  getPlanStatus,
  getTrialConfig,
  type PlanStatus,
} from "../billing/client";
import { useDriveSync } from "../sync/DriveSyncContext";
import { reportClientError } from "../observability/client";

type FoodDraft = { id: string; name: string; amount: string; calories: string };

function totalFromFoods(foods: FoodDraft[]): string {
  const values = foods.map((food) => Number(food.calories.replace(",", ".")));
  return values.every((value) => Number.isFinite(value) && value >= 0)
    ? inputDecimal(values.reduce((sum, value) => sum + value, 0))
    : "";
}

export function FoodPage() {
  const { data, mutate, removeWithUndo } = useAppData();
  const drive = useDriveSync();
  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");
  const [when, setWhen] = useState(toLocalDateTime(new Date().toISOString()));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [prefilled, setPrefilled] = useState(false);
  const [actionError, setActionError] = useState("");
  const [foods, setFoods] = useState<FoodDraft[]>([]);
  const [photo, setPhoto] = useState<PreparedImage | null>(null);
  const [photoExpanded, setPhotoExpanded] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [photoMode, setPhotoMode] = useState<"trial" | "plan" | "key">("trial");
  const [trialEnabled, setTrialEnabled] = useState(false);
  const [hasGeminiKey, setHasGeminiKey] = useState<boolean | null>(null);
  const [accountPlanStatus, setAccountPlanStatus] = useState<{
    accountId: string;
    value: PlanStatus;
  } | null>(null);
  const [photoOffer, setPhotoOffer] = useState<"exhausted" | "access" | null>(
    null,
  );
  const [photoAssisted, setPhotoAssisted] = useState(false);
  const [totalEdited, setTotalEdited] = useState(false);
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
  const planStatus =
    accountPlanStatus &&
    drive.account &&
    accountPlanStatus.accountId === drive.account.id
      ? accountPlanStatus.value
      : null;
  const selectedPhotoMode =
    photoMode === "trial" &&
    (planStatus?.active || !trialEnabled || !drive.account)
      ? planStatus?.active
        ? "plan"
        : "key"
      : photoMode;

  useEffect(() => {
    let active = true;
    loadGeminiKey()
      .then((key) => {
        if (active) setHasGeminiKey(Boolean(key));
      })
      .catch(() => {
        reportClientError("storage", "local_storage_failed");
        if (active) setHasGeminiKey(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!drive.account?.id) return;
    let active = true;
    getTrialConfig()
      .then((enabled) => {
        if (active) setTrialEnabled(enabled);
      })
      .catch(() => {
        if (active) setTrialEnabled(false);
      });
    return () => {
      active = false;
    };
  }, [drive.account?.id]);

  useEffect(() => {
    if (!drive.account?.token) return;
    let active = true;
    const accountId = drive.account.id;
    getPlanStatus(drive.account.token)
      .then((status) => {
        if (active) setAccountPlanStatus({ accountId, value: status });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [drive.account?.id, drive.account?.token]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      if (!name.trim()) throw new Error("Descreva a refeição.");
      const caloriesKcal = parseOptionalCalories(calories);
      const parsedFoods = foods.map((food) => {
        const parsed = mealFoodSchema.safeParse({
          name: food.name.trim(),
          amount: food.amount.trim(),
          caloriesKcal: parseOptionalCalories(food.calories) ?? -1,
        });
        if (!parsed.success)
          throw new Error(
            "Confira o nome, a quantidade e as calorias de cada alimento.",
          );
        return parsed.data;
      });
      const eatenAt = fromLocalDateTime(when);
      await mutate((current) => ({
        ...current,
        meals: [
          {
            id: crypto.randomUUID(),
            name: name.trim(),
            caloriesKcal,
            foods: parsedFoods,
            photoAssisted,
            eatenAt,
            createdAt: new Date().toISOString(),
          },
          ...current.meals,
        ],
      }));
      setName("");
      setCalories("");
      setFoods([]);
      setPhoto(null);
      setPhotoAssisted(false);
      setTotalEdited(false);
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
    setFoods(
      item.foods.map((food) => ({
        id: crypto.randomUUID(),
        name: food.name,
        amount: food.amount,
        calories: inputDecimal(food.caloriesKcal),
      })),
    );
    setPhoto(null);
    setPhotoAssisted(false);
    setTotalEdited(true);
    setPrefilled(true);
    setError("");
    document.getElementById("meal-name")?.focus();
  }

  async function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    try {
      setPhoto(await prepareMealImage(file));
    } catch (cause) {
      setPhoto(null);
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível abrir a foto.",
      );
    }
  }

  function guardPhotoPicker(event: MouseEvent<HTMLLabelElement>) {
    const accountCanAnalyze = Boolean(
      drive.account?.token &&
      (!planStatus ||
        planStatus.active ||
        (trialEnabled && planStatus.trialUsed < planStatus.trialLimit)),
    );
    if (!accountCanAnalyze && !hasGeminiKey) {
      event.preventDefault();
      setPhotoOffer(
        drive.account &&
          trialEnabled &&
          planStatus &&
          planStatus.trialUsed >= planStatus.trialLimit
          ? "exhausted"
          : "access",
      );
    } else if (!accountCanAnalyze && hasGeminiKey) {
      setPhotoMode("key");
    }
  }

  async function analyzePhoto() {
    if (!photo) return;
    setError("");
    setAnalyzing(true);
    try {
      let suggestion;
      if (selectedPhotoMode === "trial" || selectedPhotoMode === "plan") {
        const token = drive.account?.token;
        if (!token)
          throw new Error(
            "Entre com Google para testar as fotos ou usar o plano.",
          );
        const plan = await getPlanStatus(token);
        setAccountPlanStatus({ accountId: drive.account!.id, value: plan });
        if (selectedPhotoMode === "trial" && !plan.active) {
          if (!plan.trialEnabled) {
            setTrialEnabled(false);
            throw new Error("O teste grátis não está disponível agora.");
          }
          if (plan.trialUsed >= plan.trialLimit) {
            setPhotoOffer("exhausted");
            return;
          }
        }
        if (selectedPhotoMode === "plan" && !plan.active)
          throw new Error(
            "Seu plano ainda não está ativo. Confira a assinatura.",
          );
        suggestion = await analyzeWithPlan(token, photo);
        void getPlanStatus(token)
          .then((status) =>
            setAccountPlanStatus({
              accountId: drive.account!.id,
              value: status,
            }),
          )
          .catch(() => undefined);
      } else {
        const key = await loadGeminiKey().catch((cause: unknown) => {
          reportClientError("storage", "local_storage_failed");
          throw cause;
        });
        if (!key)
          throw new Error(
            "Adicione sua chave Gemini nas Configurações para analisar fotos.",
          );
        suggestion = await analyzeMealImage(key, photo);
      }
      setName(suggestion.description);
      setFoods(
        suggestion.foods.map((food) => ({
          id: crypto.randomUUID(),
          name: food.name,
          amount: food.amount,
          calories: inputDecimal(food.caloriesKcal),
        })),
      );
      setCalories(
        inputDecimal(
          suggestion.foods.reduce((sum, food) => sum + food.caloriesKcal, 0),
        ),
      );
      setPhotoAssisted(true);
      setTotalEdited(false);
      setPrefilled(false);
    } catch (cause) {
      if (
        selectedPhotoMode === "trial" &&
        cause instanceof Error &&
        /teste grátis não está disponível/.test(cause.message)
      ) {
        setTrialEnabled(false);
        setError(cause.message);
      } else if (
        selectedPhotoMode === "trial" &&
        cause instanceof Error &&
        /análises grátis/.test(cause.message)
      ) {
        setPhotoOffer("exhausted");
      } else {
        setError(
          cause instanceof Error
            ? cause.message
            : "Não foi possível analisar a foto.",
        );
      }
    } finally {
      setAnalyzing(false);
    }
  }

  function updateFood(
    id: string,
    field: "name" | "amount" | "calories",
    value: string,
  ) {
    setFoods((current) => {
      const updated = current.map((food) =>
        food.id === id ? { ...food, [field]: value } : food,
      );
      if (field === "calories" && !totalEdited)
        setCalories(totalFromFoods(updated));
      return updated;
    });
  }

  function removeFood(id: string) {
    setFoods((current) => {
      const updated = current.filter((food) => food.id !== id);
      if (!totalEdited)
        setCalories(updated.length ? totalFromFoods(updated) : "");
      return updated;
    });
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
            <div
              className={`meal-photo-box${photoExpanded ? "" : " collapsed"}`}
            >
              <button
                className="meal-photo-heading"
                type="button"
                aria-expanded={photoExpanded}
                aria-controls="meal-photo-options"
                onClick={() => setPhotoExpanded((expanded) => !expanded)}
              >
                <Sparkles size={21} aria-hidden="true" />
                <span>
                  <strong>Preencher com uma foto</strong>
                  {photoExpanded && (
                    <p>
                      Receba uma sugestão de alimentos e calorias para revisar.
                    </p>
                  )}
                </span>
              </button>
              {photoExpanded && (
                <div id="meal-photo-options">
                  <div className="meal-photo-actions">
                    <label
                      className="button primary"
                      htmlFor="meal-camera"
                      onClick={guardPhotoPicker}
                    >
                      <Camera size={18} aria-hidden="true" /> Tirar foto
                    </label>
                    <input
                      id="meal-camera"
                      className="visually-hidden"
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={choosePhoto}
                    />
                    <label
                      className="button secondary"
                      htmlFor="meal-gallery"
                      onClick={guardPhotoPicker}
                    >
                      <ImagePlus size={18} aria-hidden="true" /> Escolher imagem
                    </label>
                    <input
                      id="meal-gallery"
                      className="visually-hidden"
                      type="file"
                      accept="image/*"
                      onChange={choosePhoto}
                    />
                  </div>
                  <div
                    className="meal-ai-modes"
                    role="group"
                    aria-label="Como analisar a foto"
                  >
                    {trialEnabled && drive.account && !planStatus?.active && (
                      <button
                        type="button"
                        aria-pressed={selectedPhotoMode === "trial"}
                        onClick={() => setPhotoMode("trial")}
                      >
                        Testar grátis
                      </button>
                    )}
                    <button
                      type="button"
                      aria-pressed={selectedPhotoMode === "plan"}
                      onClick={() => setPhotoMode("plan")}
                    >
                      Meu plano
                    </button>
                    <button
                      type="button"
                      aria-pressed={selectedPhotoMode === "key"}
                      onClick={() => setPhotoMode("key")}
                    >
                      Minha chave Gemini
                    </button>
                  </div>
                  {planStatus?.active ? (
                    <p className="muted small">
                      {selectedPhotoMode === "plan"
                        ? "Seu plano está ativo: até 10 análises por dia."
                        : "Esta análise usará sua chave Gemini. Seu plano também está ativo."}
                    </p>
                  ) : trialEnabled &&
                    drive.account &&
                    selectedPhotoMode === "trial" ? (
                    <p className="muted small">
                      {`Teste até 5 fotos grátis com sua conta Google${planStatus ? ` · ${Math.max(0, planStatus.trialLimit - planStatus.trialUsed)} restantes` : ""}.`}
                    </p>
                  ) : (
                    <p className="muted small">
                      <Link to="/assinatura">
                        Conhecer o plano por R$ 8,99/mês
                      </Link>{" "}
                      · Até 10 análises por dia.
                    </p>
                  )}
                  {photo && (
                    <div className="meal-photo-preview">
                      <img
                        src={photo.dataUrl}
                        alt="Foto selecionada da refeição"
                      />
                      <button
                        className="button primary"
                        type="button"
                        disabled={analyzing}
                        onClick={analyzePhoto}
                      >
                        {analyzing ? "Analisando foto…" : "Analisar foto"}
                      </button>
                      <button
                        className="entry-action"
                        type="button"
                        onClick={() => setPhoto(null)}
                      >
                        Remover foto
                      </button>
                    </div>
                  )}
                  <p className="muted small">
                    A foto é enviada{" "}
                    {selectedPhotoMode === "key"
                      ? "ao Google"
                      : "à Biorotina e ao Google"}{" "}
                    somente quando você toca em “Analisar foto”. Ela não é
                    guardada no servidor, no diário ou no backup.{" "}
                    {selectedPhotoMode === "trial" ? (
                      <span>
                        O teste grátis exige uma conta Google para contar as
                        cinco análises.
                      </span>
                    ) : selectedPhotoMode === "plan" ? (
                      !planStatus?.active && (
                        <Link to="/assinatura">Ver plano de R$ 8,99/mês</Link>
                      )
                    ) : (
                      <Link to="/configuracoes">
                        Configurar minha chave Gemini
                      </Link>
                    )}
                  </p>
                </div>
              )}
            </div>
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
                  maxLength={500}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </div>
              {foods.length > 0 && (
                <div className="meal-foods full">
                  <div className="meal-foods-title">
                    <strong>Alimentos sugeridos</strong>
                    <span>Confira as porções e as calorias</span>
                  </div>
                  {foods.map((food, index) => (
                    <div className="meal-food-row" key={food.id}>
                      <div className="field">
                        <label htmlFor={`meal-food-name-${food.id}`}>
                          Alimento {index + 1}
                        </label>
                        <input
                          id={`meal-food-name-${food.id}`}
                          maxLength={100}
                          value={food.name}
                          onChange={(event) =>
                            updateFood(food.id, "name", event.target.value)
                          }
                          required
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`meal-food-amount-${food.id}`}>
                          Quantidade
                        </label>
                        <input
                          id={`meal-food-amount-${food.id}`}
                          maxLength={80}
                          value={food.amount}
                          onChange={(event) =>
                            updateFood(food.id, "amount", event.target.value)
                          }
                          required
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`meal-food-calories-${food.id}`}>
                          kcal
                        </label>
                        <input
                          id={`meal-food-calories-${food.id}`}
                          inputMode="decimal"
                          value={food.calories}
                          onChange={(event) =>
                            updateFood(food.id, "calories", event.target.value)
                          }
                          required
                        />
                      </div>
                      <button
                        type="button"
                        className="entry-action danger"
                        aria-label={`Remover alimento ${index + 1}`}
                        onClick={() => removeFood(food.id)}
                      >
                        <Trash2 size={17} aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                  <button
                    className="entry-action"
                    type="button"
                    disabled={foods.length >= 30}
                    onClick={() =>
                      setFoods((current) => [
                        ...current,
                        {
                          id: crypto.randomUUID(),
                          name: "",
                          amount: "",
                          calories: "",
                        },
                      ])
                    }
                  >
                    Adicionar alimento
                  </button>
                </div>
              )}
              <div className="field">
                <label htmlFor="meal-calories">
                  Calorias consumidas <span className="optional">opcional</span>
                </label>
                <input
                  id="meal-calories"
                  inputMode="decimal"
                  placeholder="Ex.: 320"
                  value={calories}
                  onChange={(event) => {
                    setCalories(event.target.value);
                    setTotalEdited(true);
                  }}
                />
                {foods.length > 0 && (
                  <small>Total sugerido pela foto. Você pode ajustar.</small>
                )}
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
                      {item.foods.length > 0 && (
                        <small>
                          {item.foods
                            .map((food) => `${food.name} (${food.amount})`)
                            .join(" · ")}
                        </small>
                      )}
                    </div>
                    <div className="entry-actions">
                      <button
                        type="button"
                        className="entry-action"
                        aria-label={`Usar ${item.name} de ${dateTimePt(item.eatenAt)} como modelo`}
                        onClick={() => repeatMeal(item)}
                      >
                        Repetir
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
            As calorias sugeridas por foto são estimativas. Revise os alimentos,
            as porções e o total antes de salvar.
          </Notice>
        </aside>
      </div>
      {photoOffer && (
        <div className="push-prompt-backdrop" role="presentation">
          <section
            className="push-prompt photo-offer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="trial-offer-title"
          >
            <button
              className="push-prompt-close"
              type="button"
              aria-label="Fechar"
              onClick={() => setPhotoOffer(null)}
            >
              <X size={20} aria-hidden="true" />
            </button>
            <Sparkles size={28} className="reminder-icon" aria-hidden="true" />
            <h2 id="trial-offer-title">
              {photoOffer === "exhausted"
                ? "Suas fotos grátis acabaram"
                : "Análise de fotos"}
            </h2>
            <p>
              {photoOffer === "exhausted"
                ? "As cinco análises grátis acabaram. Você ainda pode registrar refeições sem foto. Para analisar mais fotos, escolha o plano ou use sua chave Gemini."
                : "A foto é opcional: você pode registrar sua refeição sem ela. Para receber sugestões pela foto, escolha o plano ou use sua chave Gemini."}
            </p>
            <div className="push-actions photo-offer-actions">
              <Link className="button primary" to="/assinatura">
                Ver plano
              </Link>
              <Link className="button primary" to="/configuracoes">
                Usar minha chave
              </Link>
              <button
                className="button secondary photo-offer-manual"
                type="button"
                onClick={() => {
                  setPhotoOffer(null);
                  setPhoto(null);
                  setPhotoExpanded(false);
                  document.getElementById("meal-name")?.focus();
                }}
              >
                Continuar sem foto
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
