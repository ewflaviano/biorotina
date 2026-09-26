export const experimentRegistry = {
  "demo-highlight": {
    description:
      "Destaque visual usado para validar o ciclo completo de gates.",
    owner: "Biorotina",
    issue: 55,
    reviewBy: "2026-10-25",
    removeWhen: "O primeiro experimento de produto estiver disponível.",
  },
  "onboarding-install-prompt": {
    description:
      "Adia o convite de instalação até a pessoa concluir a decisão sobre registros locais.",
    owner: "Biorotina",
    issue: 60,
    reviewBy: "2026-10-26",
    removeWhen:
      "O convite de instalação tiver a sequência aprovada e não houver regressões no onboarding.",
  },
} as const;

export type ExperimentKey = keyof typeof experimentRegistry;
export const experimentKeys = Object.keys(
  experimentRegistry,
) as ExperimentKey[];
