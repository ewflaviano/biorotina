import { Link } from "react-router-dom";
import { useState } from "react";
import { DayPicker } from "../components/DayPicker";
import { Notice, PageHeader } from "../components/Layout";
import {
  calorieBalanceForDay,
  type FormulaParameter,
} from "../domain/calorieBalance";
import { formatCalendarDay } from "../domain/dailyRecords";
import { numberPt, todayIsoDate } from "../domain/data";
import {
  useExperiment,
  useExperimentExposure,
} from "../experiments/ExperimentContext";
import { useAppData } from "../state/AppDataContext";

export function CalorieBalancePage() {
  const { data } = useAppData();
  const experiment = useExperiment();
  const [day, setDay] = useState(todayIsoDate);
  const [ageInput, setAgeInput] = useState("");
  const [parameter, setParameter] = useState<FormulaParameter | "">("");
  useExperimentExposure("calorie-balance-daily", true);
  const age = Number(ageInput);
  const validAge = Number.isInteger(age) && age >= 18 && age <= 100;
  const result = calorieBalanceForDay(
    data,
    day,
    validAge ? age : null,
    parameter || null,
  );
  const missingMeals = result.mealCount - result.mealsWithCalories;
  const missingActivities =
    result.activityCount - result.activitiesWithEstimate;

  return (
    <>
      <PageHeader
        eyebrow="Experimento"
        title="Balanço calórico"
        description="Veja, dia a dia, a diferença parcial entre calorias registradas e gastos estimados."
      />
      <div className="calorie-balance-layout">
        <section className="panel" aria-labelledby="balance-day-title">
          <h2 id="balance-day-title">Escolha um dia</h2>
          <DayPicker
            id="balance-day"
            label="Dia do balanço calórico"
            value={day}
            onChange={(next) => {
              setDay(next);
              experiment.recordUse("calorie-balance-daily");
            }}
          />
          <p className="balance-context">{formatCalendarDay(day)}</p>
        </section>

        <section className="panel" aria-labelledby="balance-parameters-title">
          <h2 id="balance-parameters-title">Dados para a estimativa</h2>
          <p>
            A fórmula de Mifflin–St Jeor usa peso, altura, idade e um dos dois
            parâmetros biológicos publicados. Os dados preenchidos aqui ficam só
            nesta tela até você sair; não são salvos nem enviados. Se nenhum
            parâmetro representar você, deixe a seleção vazia.
          </p>
          <div className="form-grid balance-inputs">
            <div className="field">
              <label htmlFor="balance-age">
                Idade nesse dia, em anos (18 a 100)
              </label>
              <input
                id="balance-age"
                type="number"
                inputMode="numeric"
                min="18"
                max="100"
                step="1"
                value={ageInput}
                onChange={(event) => setAgeInput(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="balance-parameter">Parâmetro da fórmula</label>
              <select
                id="balance-parameter"
                value={parameter}
                onChange={(event) =>
                  setParameter(event.target.value as FormulaParameter | "")
                }
              >
                <option value="">Selecione se quiser calcular</option>
                <option value="female">Feminino</option>
                <option value="male">Masculino</option>
              </select>
            </div>
          </div>
          <p className="balance-context">
            Peso:{" "}
            {result.weightKg === null
              ? "sem medida até este dia"
              : `${numberPt(result.weightKg, 1)} kg (medida de ${formatCalendarDay(result.weightDay!)})`}
            . Altura:{" "}
            {result.heightCm === null
              ? "não informada"
              : `${numberPt(result.heightCm, 1)} cm`}
            .
            {result.weightKg === null || result.heightCm === null ? (
              <>
                {" "}
                <Link to="/peso">Completar em Medidas</Link>.
              </>
            ) : null}
          </p>
        </section>

        <section className="panel" aria-labelledby="balance-result-title">
          <h2 id="balance-result-title">Diferença dos valores disponíveis</h2>
          {result.differenceCalories === null ? (
            <Notice kind="info">
              Para calcular, informe os dados acima e registre ao menos uma
              refeição com calorias neste dia.
            </Notice>
          ) : (
            <>
              <p className="balance-value" role="status">
                {result.differenceCalories > 0 ? "+" : ""}
                {numberPt(result.differenceCalories, 0)} <small>kcal</small>
              </p>
              <p className="balance-context">
                Calorias informadas nas refeições menos gasto de repouso
                estimado e gasto adicional estimado nas atividades.
              </p>
            </>
          )}
          <dl className="balance-breakdown">
            <div>
              <dt>Refeições com calorias</dt>
              <dd>
                {result.mealsWithCalories
                  ? `${numberPt(result.consumedCalories, 0)} kcal`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt>Repouso estimado</dt>
              <dd>
                {result.restingCalories === null
                  ? "—"
                  : `${numberPt(result.restingCalories, 0)} kcal`}
              </dd>
            </div>
            <div>
              <dt>Atividade além do repouso</dt>
              <dd>
                {result.activitiesWithEstimate
                  ? `${numberPt(result.extraActivityCalories, 0)} kcal`
                  : "—"}
              </dd>
            </div>
          </dl>
          {(missingMeals > 0 || missingActivities > 0) && (
            <Notice kind="warning">
              Cálculo incompleto: {missingMeals} refeição(ões) sem calorias e{" "}
              {missingActivities} atividade(s) sem estimativa comparável ficaram
              fora da soma.
            </Notice>
          )}
          <p className="balance-context">
            Esta diferença não é o déficit real do dia: não inclui movimentos
            fora dos registros, digestão nem todos os fatores individuais. Uma
            refeição ausente pode mudar bastante o número. Não é uma meta nem
            uma recomendação de alimentação.
          </p>
          <p className="balance-context">
            <Link to="/alimentacao">Ver refeições</Link> ·{" "}
            <Link to="/atividades">Ver atividades</Link>
          </p>
        </section>
      </div>
    </>
  );
}
