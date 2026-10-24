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
  "hydration-custom-shortcuts": {
    issue: 134,
    assignment: "browser",
    description: "Permite escolher os três volumes dos atalhos de água.",
    owner: "Biorotina",
    revision: 1,
    reviewBy: "2026-10-19",
    removeWhen:
      "Promover ou remover após sete dias de avaliação; interromper por perda de preferências, falha de registro, migração ou acessibilidade.",
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
  "weight-history-next-day-shortcut": {
    assignment: "browser",
    description:
      "Oferece o primeiro dia posterior com medida quando o histórico de peso selecionado está vazio.",
    owner: "Biorotina",
    issue: 130,
    revision: 1,
    reviewBy: "2026-10-18",
    removeWhen:
      "Promover ou remover após sete dias; interromper por navegação incorreta, foco inadequado ou envio de dados à telemetria.",
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
  "hydration-history-next-day-shortcut": {
    assignment: "browser",
    description:
      "Oferece o primeiro dia posterior com água quando o histórico selecionado está vazio.",
    owner: "Biorotina",
    issue: 128,
    revision: 1,
    reviewBy: "2026-10-17",
    removeWhen:
      "Promover ou remover após sete dias; interromper por navegação incorreta, foco inadequado ou envio de dados à telemetria.",
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
  "medication-history-clear-search": {
    assignment: "browser",
    description:
      "Oferece limpar a busca junto ao resultado vazio no histórico de medicamentos.",
    owner: "Biorotina",
    issue: 109,
    revision: 1,
    reviewBy: "2026-10-14",
    removeWhen:
      "Promover ou remover após sete dias; interromper por foco incorreto, perda de dados ou envio da busca à telemetria.",
  },
  "medication-history-last-day-shortcut": {
    assignment: "browser",
    description:
      "Oferece o último dia anterior com uso quando o histórico de medicamentos selecionado está vazio.",
    owner: "Biorotina",
    issue: 139,
    revision: 1,
    reviewBy: "2026-10-27",
    removeWhen:
      "Promover ou remover após sete dias; interromper por navegação incorreta, foco inadequado ou envio de dados sensíveis.",
  },
  "medication-history-next-day-shortcut": {
    assignment: "browser",
    description:
      "Oferece o primeiro dia posterior com uso quando o histórico de medicamentos selecionado está vazio.",
    owner: "Biorotina",
    issue: 141,
    revision: 1,
    reviewBy: "2026-10-28",
    removeWhen:
      "Promover ou remover após sete dias; interromper por navegação incorreta, foco inadequado ou envio de dados sensíveis.",
  },
  "activity-history-clear-search": {
    assignment: "browser",
    description:
      "Oferece limpar a busca junto ao resultado vazio no histórico de atividades.",
    owner: "Biorotina",
    issue: 122,
    revision: 1,
    reviewBy: "2026-10-15",
    removeWhen:
      "Promover ou remover após sete dias; interromper por foco incorreto, perda da lista ou envio da busca à telemetria.",
  },
  "activity-history-last-day-shortcut": {
    assignment: "browser",
    description:
      "Oferece o dia anterior mais recente com atividade quando o histórico selecionado está vazio.",
    owner: "Biorotina",
    issue: 133,
    revision: 1,
    reviewBy: "2026-10-23",
    removeWhen:
      "Promover ou remover após sete dias; interromper por navegação incorreta, foco inadequado ou envio de dados à telemetria.",
  },
  "activity-history-next-day-shortcut": {
    assignment: "browser",
    description:
      "Oferece o primeiro dia posterior com atividade quando o histórico selecionado está vazio.",
    owner: "Biorotina",
    issue: 137,
    revision: 1,
    reviewBy: "2026-10-24",
    removeWhen:
      "Promover ou remover após sete dias; interromper por navegação incorreta, foco inadequado ou envio de dados à telemetria.",
  },
  "food-history-clear-search": {
    assignment: "browser",
    description:
      "Oferece limpar a busca junto ao resultado vazio no histórico de refeições.",
    owner: "Biorotina",
    issue: 124,
    revision: 1,
    reviewBy: "2026-10-16",
    removeWhen:
      "Promover ou remover após sete dias; interromper por foco incorreto, perda da lista ou envio da busca à telemetria.",
  },
  "food-history-last-day-shortcut": {
    assignment: "browser",
    description:
      "Oferece o último dia anterior com refeição quando o histórico selecionado está vazio.",
    owner: "Biorotina",
    issue: 143,
    revision: 1,
    reviewBy: "2026-10-31",
    removeWhen:
      "Promover ou remover após sete dias; interromper por navegação incorreta, foco inadequado ou envio de dados sensíveis.",
  },
  "food-daily-calories": {
    assignment: "browser",
    description:
      "Mostra as calorias informadas no dia selecionado no histórico de refeições.",
    owner: "Biorotina",
    issue: 104,
    revision: 1,
    reviewBy: "2026-10-13",
    removeWhen:
      "Promover ou remover após sete dias; interromper por soma incorreta, leitura ambígua ou regressão de acessibilidade.",
  },
  "mobile-nav-meal-priority": {
    assignment: "browser",
    description:
      "Testa Refeição na barra inferior do celular e Medidas em Mais.",
    owner: "Biorotina",
    issue: 112,
    revision: 1,
    reviewBy: "2026-10-14",
    removeWhen:
      "Promover ou remover após sete dias; interromper por navegação incorreta, perda de acesso a Medidas ou regressão de acessibilidade.",
  },
  "calorie-balance-daily": {
    assignment: "browser",
    description:
      "Mostra a diferença parcial diária entre refeições e gastos estimados, com parâmetros salvos no perfil local.",
    owner: "Biorotina",
    issue: 117,
    revision: 2,
    reviewBy: "2026-10-15",
    removeWhen:
      "Revisar após sete dias; interromper se o cálculo induzir interpretação clínica, contar repouso duas vezes ou expuser dados pessoais.",
  },
  "initial-sync-before-entry": {
    assignment: "browser",
    description:
      "Aguarda a primeira decisão do Drive antes de cadastrar água ou refeição.",
    owner: "Biorotina",
    revision: 1,
    reviewBy: "2026-10-25",
    removeWhen:
      "Promover ou remover após avaliar conciliações, espera e acesso offline; interromper se impedir registros locais.",
  },
} as const;

export type ExperimentKey = keyof typeof experimentRegistry;
export const experimentKeys = Object.keys(
  experimentRegistry,
) as ExperimentKey[];
