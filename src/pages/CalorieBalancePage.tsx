import { useState } from "react";
import { Link } from "react-router-dom";
import { DayPicker } from "../components/DayPicker";
import { InfoDisclosure } from "../components/InfoDisclosure";
import { Notice, PageHeader } from "../components/Layout";
import { calorieBalanceForDay } from "../domain/calorieBalance";
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
  useExperimentExposure("calorie-balance-daily", true);
  const result = calorieBalanceForDay(
    data,
    day,
    data.profile.ageYears,
    data.profile.formulaParameter,
  );
  const missingMeals = result.mealCount - result.mealsWithCalories;
  const missingActivities =
    result.activityCount - result.activitiesWithEstimate;
  const missingProfile = result.restingCalories === null;

  return (
    <>
      <PageHeader
        eyebrow="Experimento"
        title="Balanço calórico"
        description="Diferença parcial dos registros por dia."
      />
      <section
        className="panel calorie-balance-layout"
        aria-labelledby="balance-title"
      >
        <div className="balance-heading">
          <h2 id="balance-title">{formatCalendarDay(day)}</h2>
          <DayPicker
            id="balance-day"
            label="Dia do balanço calórico"
            value={day}
            onChange={(next) => {
              setDay(next);
              experiment.recordUse("calorie-balance-daily");
            }}
          />
        </div>

        {result.differenceCalories === null ? (
          <Notice kind="info">
            {missingProfile ? (
              <>
                Complete peso, altura, idade e parâmetro da fórmula em{" "}
                <Link to="/peso">Medidas</Link>.
              </>
            ) : (
              <>
                Adicione calorias a pelo menos uma refeição deste dia em{" "}
                <Link to="/alimentacao">Refeições</Link>.
              </>
            )}
          </Notice>
        ) : (
          <p className="balance-value" role="status">
            {result.differenceCalories > 0 ? "+" : ""}
            {numberPt(result.differenceCalories, 0)} <small>kcal</small>
          </p>
        )}
        <dl className="balance-breakdown">
          <div>
            <dt>Consumidas</dt>
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
            <dt>Atividade adicional</dt>
            <dd>
              {result.activitiesWithEstimate
                ? `${numberPt(result.extraActivityCalories, 0)} kcal`
                : "—"}
            </dd>
          </div>
        </dl>
        {(missingMeals > 0 || missingActivities > 0) && (
          <p className="balance-incomplete" role="status">
            Há registros sem calorias comparáveis neste dia.
          </p>
        )}
        <InfoDisclosure label="Entenda este cálculo">
          <p>
            A diferença é calorias informadas nas refeições menos o gasto em
            repouso estimado e a parte adicional das atividades estimadas. É uma
            conta parcial, não o déficit real do dia, uma meta ou uma
            recomendação alimentar.
          </p>
          <p>
            A estimativa de repouso usa a equação de Mifflin–St Jeor com idade e
            parâmetro da fórmula salvos no perfil, altura e a última medida de
            peso até este dia. Idade informada é aplicada aos dias consultados;
            atualize-a quando necessário.
          </p>
          <p>
            Peso:{" "}
            {result.weightKg === null
              ? "ausente"
              : `${numberPt(result.weightKg, 1)} kg (medido em ${formatCalendarDay(result.weightDay!)})`}
            . Altura:{" "}
            {result.heightCm === null
              ? "ausente"
              : `${numberPt(result.heightCm, 1)} cm`}
            . Refeições sem calorias: {missingMeals}. Atividades sem estimativa
            comparável: {missingActivities}. Atividades com valor manual ficam
            fora da soma porque não sabemos se incluem o repouso. Movimento fora
            dos registros, digestão e outros fatores também não entram.
          </p>
        </InfoDisclosure>
        <Link className="text-link" to="/peso">
          Editar dados em Medidas
        </Link>
      </section>
    </>
  );
}
