import {
  hydrationQuickAmountsSchema,
  type AppData,
  type HydrationQuickAmounts,
} from "./data";

export const DEFAULT_HYDRATION_QUICK_AMOUNTS: HydrationQuickAmounts = [
  200, 250, 500,
];

export function validateHydrationQuickAmounts(values: string[]) {
  const numbers = values.map((value) =>
    /^\d+$/.test(value.trim()) ? Number(value) : NaN,
  );
  const result = hydrationQuickAmountsSchema.safeParse(numbers);
  const errors = values.map((_, index) => {
    if (Number.isNaN(numbers[index])) return "Informe um volume inteiro em ml.";
    return result.success
      ? ""
      : (result.error.issues.find((issue) => issue.path[0] === index)
          ?.message ?? "");
  });
  return { amounts: result.success ? result.data : null, errors };
}

export function updateHydrationQuickAmounts(
  current: AppData,
  expected: HydrationQuickAmounts | null,
  amounts: HydrationQuickAmounts,
): AppData {
  if (
    JSON.stringify(current.hydrationQuickAmounts) !== JSON.stringify(expected)
  ) {
    throw new Error(
      "Os atalhos mudaram em outra aba ou na sincronização. Cancele e abra a edição novamente.",
    );
  }
  const parsed = hydrationQuickAmountsSchema.parse(amounts);
  if (JSON.stringify(current.hydrationQuickAmounts) === JSON.stringify(parsed))
    return current;
  return { ...current, hydrationQuickAmounts: parsed };
}
