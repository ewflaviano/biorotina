import {
  MAX_HEIGHT_CM,
  MAX_WEIGHT_KG,
  MIN_HEIGHT_CM,
  toLocalDateTime,
  type AppData,
} from "./data";
import { findCatalogActivity } from "./activityCatalog";

export type FormulaParameter = "female" | "male";

export function restingCalories(
  weightKg: number,
  heightCm: number,
  ageYears: number,
  parameter: FormulaParameter,
): number | null {
  if (
    !Number.isFinite(weightKg) ||
    weightKg <= 0 ||
    weightKg > MAX_WEIGHT_KG ||
    !Number.isFinite(heightCm) ||
    heightCm < MIN_HEIGHT_CM ||
    heightCm > MAX_HEIGHT_CM ||
    !Number.isInteger(ageYears) ||
    ageYears < 18 ||
    ageYears > 100
  )
    return null;
  // Mifflin–St Jeor estimates resting expenditure, not total daily expenditure.
  // https://pubmed.ncbi.nlm.nih.gov/2305711/
  const estimated = Math.round(
    10 * weightKg +
      6.25 * heightCm -
      5 * ageYears +
      (parameter === "male" ? 5 : -161),
  );
  return estimated > 0 ? estimated : null;
}

export function calorieBalanceForDay(
  data: AppData,
  day: string,
  ageYears: number | null,
  parameter: FormulaParameter | null,
) {
  const onDay = (at: string) => toLocalDateTime(at).slice(0, 10) === day;
  const meals = data.meals.filter((entry) => onDay(entry.eatenAt));
  const activities = data.activities.filter((entry) => onDay(entry.occurredAt));
  const latestWeight = data.weights
    .filter((entry) => toLocalDateTime(entry.measuredAt).slice(0, 10) <= day)
    .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))[0];
  const mealCaloriesKnown = meals.filter(
    (entry) => entry.caloriesKcal !== null,
  );
  const consumedCalories = mealCaloriesKnown.reduce(
    (sum, entry) => sum + (entry.caloriesKcal ?? 0),
    0,
  );
  const estimatedActivities = activities
    .map((entry) => ({ entry, catalog: findCatalogActivity(entry.name) }))
    .filter(
      ({ entry, catalog }) =>
        entry.caloriesSource === "estimated" &&
        entry.caloriesKcal !== null &&
        catalog !== null,
    );
  // Saved MET calories include the resting 1 MET. Count only the additional
  // portion so the resting estimate above is not counted twice.
  const extraActivityCalories = Math.round(
    estimatedActivities.reduce(
      (sum, { entry, catalog }) =>
        sum + (entry.caloriesKcal ?? 0) * ((catalog!.met - 1) / catalog!.met),
      0,
    ),
  );
  const resting =
    latestWeight && data.profile.heightCm !== null && ageYears && parameter
      ? restingCalories(
          latestWeight.weightKg,
          data.profile.heightCm,
          ageYears,
          parameter,
        )
      : null;
  return {
    weightKg: latestWeight?.weightKg ?? null,
    weightDay: latestWeight
      ? toLocalDateTime(latestWeight.measuredAt).slice(0, 10)
      : null,
    heightCm: data.profile.heightCm,
    consumedCalories,
    mealCount: meals.length,
    mealsWithCalories: mealCaloriesKnown.length,
    extraActivityCalories,
    activityCount: activities.length,
    activitiesWithEstimate: estimatedActivities.length,
    restingCalories: resting,
    // A difference is meaningful only when at least one meal has a kcal value.
    differenceCalories:
      resting !== null && mealCaloriesKnown.length > 0
        ? consumedCalories - resting - extraActivityCalories
        : null,
  };
}
