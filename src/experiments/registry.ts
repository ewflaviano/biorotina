export const experimentRegistry = {
  "demo-highlight": {
    description:
      "Destaque visual usado para validar o ciclo completo de gates.",
    owner: "Biorotina",
    issue: 55,
    reviewBy: "2026-10-25",
    removeWhen: "O primeiro experimento de produto estiver disponível.",
  },
} as const;

export type ExperimentKey = keyof typeof experimentRegistry;
export const experimentKeys = Object.keys(
  experimentRegistry,
) as ExperimentKey[];
