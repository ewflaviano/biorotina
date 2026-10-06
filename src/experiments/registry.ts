export const experimentRegistry = {
  "demo-highlight": {
    assignment: "account",
    description:
      "Destaque visual usado para validar o ciclo completo de gates.",
    owner: "Biorotina",
    issue: 55,
    reviewBy: "2026-10-25",
    removeWhen: "O primeiro experimento de produto estiver disponível.",
  },
  "onboarding-install-prompt": {
    assignment: "browser",
    description:
      "Adia o convite de instalação até a pessoa concluir a decisão sobre registros locais.",
    owner: "Biorotina",
    issue: 60,
    reviewBy: "2026-10-26",
    removeWhen:
      "O convite de instalação tiver a sequência aprovada e não houver regressões no onboarding.",
  },
  "hydration-quick-confirmation": {
    assignment: "browser",
    description:
      "Confirma de forma acessível o registro de água pelos atalhos.",
    owner: "Biorotina",
    issue: 69,
    revision: 2,
    reviewBy: "2026-10-02",
    removeWhen:
      "Promover ou remover após sete dias; interromper se confirmar uma gravação que falhou ou prejudicar a acessibilidade.",
  },
  "hydration-form-confirmation": {
    assignment: "browser",
    description:
      "Confirma de forma acessível a persistência pelo formulário de água.",
    owner: "Biorotina",
    issue: 71,
    revision: 2,
    reviewBy: "2026-10-03",
    removeWhen:
      "Promover ou remover após sete dias; interromper se confirmar uma gravação que falhou ou prejudicar a acessibilidade.",
  },
  "weight-form-confirmation": {
    assignment: "browser",
    description:
      "Confirma de forma acessível a persistência pelo formulário de peso.",
    owner: "Biorotina",
    issue: 75,
    revision: 1,
    reviewBy: "2026-10-04",
    removeWhen:
      "Promover ou remover após sete dias; sem evidência suficiente, desligar. Interromper se confirmar gravação que falhou ou prejudicar a acessibilidade.",
  },
  "activity-form-confirmation": {
    assignment: "browser",
    description:
      "Confirma de forma acessível a persistência pelo formulário de atividades.",
    owner: "Biorotina",
    issue: 77,
    revision: 1,
    reviewBy: "2026-10-05",
    removeWhen:
      "Promover ou remover após sete dias; sem evidência suficiente, desligar. Interromper se confirmar gravação que falhou ou prejudicar a persistência ou a acessibilidade.",
  },
  "habit-form-confirmation": {
    assignment: "browser",
    description:
      "Confirma de forma acessível a persistência pelo formulário de hábitos.",
    owner: "Biorotina",
    issue: 79,
    revision: 1,
    reviewBy: "2026-10-06",
    removeWhen:
      "Promover ou remover após sete dias; sem evidência suficiente, desligar. Interromper por confirmação falsa ou regressão de persistência ou acessibilidade.",
  },
  "medication-form-confirmation": {
    assignment: "browser",
    description:
      "Confirma de forma acessível a persistência pelo formulário de medicamentos.",
    owner: "Biorotina",
    issue: 81,
    revision: 1,
    reviewBy: "2026-10-07",
    removeWhen:
      "Promover ou remover após sete dias; sem evidência suficiente, desligar. Interromper por confirmação falsa ou regressão de persistência ou acessibilidade.",
  },
  "daily-records-last-day-shortcut": {
    assignment: "browser",
    description:
      "Oferece o dia anterior mais recente com registros quando a consulta diária está vazia.",
    owner: "Biorotina",
    issue: 85,
    revision: 1,
    reviewBy: "2026-10-08",
    removeWhen:
      "Promover ou remover após sete dias; sem evidência suficiente, desligar. Interromper por navegação incorreta ou regressão de privacidade ou acessibilidade.",
  },
  "daily-records-next-day-shortcut": {
    assignment: "browser",
    description:
      "Oferece o primeiro dia posterior com registros quando a consulta diária está vazia.",
    owner: "Biorotina",
    issue: 88,
    revision: 1,
    reviewBy: "2026-10-09",
    removeWhen:
      "Promover ou remover após sete dias; interromper por navegação incorreta ou regressão de privacidade ou acessibilidade.",
  },
  "weight-history-edit": {
    assignment: "browser",
    description:
      "Permite corrigir uma medida de peso diretamente no histórico.",
    owner: "Biorotina",
    issue: 92,
    revision: 1,
    reviewBy: "2026-10-10",
    removeWhen:
      "Promover ou remover após sete dias; interromper por perda de dados, falha de persistência ou acessibilidade.",
  },
  "weight-history-last-day-shortcut": {
    assignment: "browser",
    description:
      "Oferece o último dia com medida anterior quando o histórico de peso selecionado está vazio.",
    owner: "Biorotina",
    issue: 96,
    revision: 1,
    reviewBy: "2026-10-11",
    removeWhen:
      "Promover ou remover após sete dias; interromper por navegação incorreta ou regressão de privacidade ou acessibilidade.",
  },
  "hydration-history-last-day-shortcut": {
    assignment: "browser",
    description:
      "Oferece o último dia anterior com água quando o histórico selecionado está vazio.",
    owner: "Biorotina",
    issue: 100,
    revision: 1,
    reviewBy: "2026-10-12",
    removeWhen:
      "Promover ou remover após sete dias; interromper por navegação incorreta ou regressão de privacidade ou acessibilidade.",
  },
  "habit-history-clear-search": {
    assignment: "browser",
    description:
      "Oferece limpar a busca junto ao resultado vazio no histórico de hábitos.",
    owner: "Biorotina",
    issue: 102,
    revision: 1,
    reviewBy: "2026-10-13",
    removeWhen:
      "Promover ou remover após sete dias; interromper por foco incorreto, perda de dados ou envio do texto buscado à telemetria.",
  },
} as const;

export type ExperimentKey = keyof typeof experimentRegistry;
export const experimentKeys = Object.keys(
  experimentRegistry,
) as ExperimentKey[];
