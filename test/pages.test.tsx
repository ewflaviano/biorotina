import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { openDB } from "idb";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyData, type AppData } from "../src/domain/data";
import { ActivityPage } from "../src/pages/ActivityPage";
import { DashboardPage } from "../src/pages/DashboardPage";
import { FoodPage } from "../src/pages/FoodPage";
import { HydrationPage } from "../src/pages/HydrationPage";
import { MedicationPage } from "../src/pages/MedicationPage";
import { SettingsPage } from "../src/pages/SettingsPage";
import { WeightPage } from "../src/pages/WeightPage";
import { AppDataProvider, useAppData } from "../src/state/AppDataContext";
import { PushProvider } from "../src/state/PushContext";
import { loadData, saveData } from "../src/storage/indexedDb";
import { DriveSyncProvider } from "../src/sync/DriveSyncContext";

async function renderPage(page: React.ReactNode, initial?: AppData) {
  if (initial) await saveData(initial);
  const user = userEvent.setup();
  render(
    <AppDataProvider>
      <DriveSyncProvider>
        <PushProvider>
          <ReadyMarker />
          <MemoryRouter>{page}</MemoryRouter>
        </PushProvider>
      </DriveSyncProvider>
    </AppDataProvider>,
  );
  await screen.findByTestId("data-ready");
  return user;
}

function ReadyMarker() {
  const { loading } = useAppData();
  return loading ? null : <span data-testid="data-ready" hidden />;
}

beforeEach(async () => {
  const db = await openDB("biorotina", 2);
  await db.clear("app");
  db.close();
});

afterEach(() => vi.restoreAllMocks());

describe("painel", () => {
  it("resume apenas registros de hoje e identifica calorias como informadas", async () => {
    const data = emptyData();
    const now = new Date().toISOString();
    data.activities.push({
      id: crypto.randomUUID(),
      name: "Caminhada",
      durationMinutes: 35,
      caloriesKcal: 180,
      occurredAt: now,
      createdAt: now,
    });
    data.meals.push({
      id: crypto.randomUUID(),
      name: "Almoço",
      caloriesKcal: 400,
      eatenAt: now,
      createdAt: now,
    });
    data.hydrationEntries.push({
      id: crypto.randomUUID(),
      amountMl: 350,
      drankAt: now,
      createdAt: now,
    });
    await renderPage(<DashboardPage />, data);
    await waitFor(() =>
      expect(
        screen.getByRole("link", { name: /Movimento hoje/ }),
      ).toHaveTextContent("35 min"),
    );
    expect(
      screen.getByRole("link", { name: /Alimentação hoje/ }),
    ).toHaveTextContent("400 kcal informadas");
    expect(
      screen.getByRole("img", {
        name: /Minutos de atividade nos últimos sete dias/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Água hoje/ })).toHaveTextContent(
      "350 ml",
    );
  });
});

describe("hidratação", () => {
  it("orienta o usuário do Firefox no iPhone antes de pedir permissão", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) FxiOS/130.0 Mobile",
    );
    const data = emptyData();
    data.hydrationReminderTimes = ["09:00"];
    await renderPage(<HydrationPage />, data);
    expect(
      screen.getByText(/No iPhone, os avisos só podem ser ativados/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Ativar avisos" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("link", { name: "Ver como adicionar" }),
    ).toHaveAttribute("href", "/instalar");
  });

  it("registra água, soma o dia e guarda vários horários sem ativar notificações", async () => {
    const user = await renderPage(<HydrationPage />);
    await user.click(screen.getByRole("button", { name: /250 ml/ }));
    await waitFor(async () =>
      expect((await loadData()).hydrationEntries).toHaveLength(1),
    );
    await user.type(screen.getByLabelText("Quantidade em ml"), "300");
    await user.click(screen.getByRole("button", { name: "Salvar água" }));
    await waitFor(async () =>
      expect((await loadData()).hydrationEntries).toHaveLength(2),
    );
    expect(
      screen.getByRole("heading", { name: "Água consumida" }).parentElement,
    ).toHaveTextContent("550 ml");
    await user.selectOptions(screen.getByLabelText("Novo horário"), "09:00");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));
    await waitFor(async () =>
      expect((await loadData()).hydrationReminderTimes).toEqual(["09:00"]),
    );
    expect(
      screen.getByText(/Os horários ficam no seu navegador/),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Remover horário 09:00" }),
    );
    await waitFor(async () =>
      expect((await loadData()).hydrationReminderTimes).toEqual([]),
    );
  });

  it("recusa quantidade inválida e horários duplicados", async () => {
    const initial = emptyData();
    initial.hydrationReminderTimes = ["09:00"];
    const user = await renderPage(<HydrationPage />, initial);
    await user.type(screen.getByLabelText("Quantidade em ml"), "0");
    await user.click(screen.getByRole("button", { name: "Salvar água" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "maior que zero",
    );
    expect((await loadData()).hydrationEntries).toHaveLength(0);
    await user.selectOptions(screen.getByLabelText("Novo horário"), "09:00");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));
    expect(
      await screen.findByText("Este horário já está na lista."),
    ).toBeInTheDocument();
    expect((await loadData()).hydrationReminderTimes).toEqual(["09:00"]);
  });

  it("repete um volume anterior com horário atual e permite excluir o registro errado", async () => {
    const initial = emptyData();
    const past = "2026-01-01T12:00:00.000Z";
    initial.hydrationEntries = [
      {
        id: crypto.randomUUID(),
        amountMl: 330,
        drankAt: past,
        createdAt: past,
      },
    ];
    const user = await renderPage(<HydrationPage />, initial);
    await user.click(
      await screen.findByRole("button", { name: "Repetir 330 ml de água" }),
    );
    await waitFor(async () =>
      expect((await loadData()).hydrationEntries).toHaveLength(2),
    );
    const entries = (await loadData()).hydrationEntries;
    expect(entries[0].amountMl).toBe(330);
    expect(entries[0].id).not.toBe(entries[1].id);
    expect(entries[0].drankAt).not.toBe(past);
    await user.click(
      screen.getAllByRole("button", { name: /Excluir água de 330 ml em/ })[1],
    );
    await waitFor(async () =>
      expect((await loadData()).hydrationEntries).toHaveLength(1),
    );
    expect((await loadData()).hydrationEntries[0].id).toBe(entries[0].id);
  });
});

describe("registro de peso", () => {
  it("valida entrada, salva vírgula decimal e mostra IMC contextual quando há altura", async () => {
    const initial = emptyData();
    initial.profile.heightCm = 180;
    const user = await renderPage(<WeightPage />, initial);
    await user.type(screen.getByLabelText("Peso em kg"), "0");
    await user.click(screen.getByRole("button", { name: "Salvar peso" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "maior que zero",
    );
    await user.clear(screen.getByLabelText("Peso em kg"));
    await user.type(screen.getByLabelText("Peso em kg"), "72,4");
    await user.click(screen.getByRole("button", { name: "Salvar peso" }));
    await waitFor(async () =>
      expect((await loadData()).weights).toHaveLength(1),
    );
    expect((await loadData()).weights[0].weightKg).toBe(72.4);
    expect(
      screen.getByText(/IMC é uma estimativa e não descreve sua saúde sozinho/),
    ).toBeInTheDocument();
    expect(screen.getByText("22,35")).toBeInTheDocument();
    expect(screen.getByText(/Peso adequado/)).toBeInTheDocument();
    const info = screen.getByRole("button", {
      name: "De onde vêm as faixas do IMC?",
    });
    expect(info).toHaveAttribute("aria-expanded", "false");
    await user.click(info);
    expect(info).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByText(/40 ou mais: obesidade grau III/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "classificação do Ministério da Saúde",
      }),
    ).toHaveAttribute(
      "href",
      "https://linhasdecuidado.saude.gov.br/portal/obesidade-no-adulto/unidade-de-atencao-primaria/rastreamento-diagnostico/",
    );
  });

  it("recusa peso negativo e acima de 350 kg", async () => {
    const user = await renderPage(<WeightPage />);
    const weight = screen.getByLabelText("Peso em kg");
    await user.type(weight, "-4");
    await user.click(screen.getByRole("button", { name: "Salvar peso" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "maior que zero",
    );
    await user.clear(weight);
    await user.type(weight, "400");
    await user.click(screen.getByRole("button", { name: "Salvar peso" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("350 kg");
    expect((await loadData()).weights).toHaveLength(0);
  });

  it("usa a medida anterior como modelo sem copiar a data antiga", async () => {
    const initial = emptyData();
    const past = "2026-01-01T12:00:00.000Z";
    initial.weights = [
      {
        id: crypto.randomUUID(),
        createdAt: past,
        measuredAt: past,
        weightKg: 72.125,
        note: "Antiga",
      },
    ];
    const user = await renderPage(<WeightPage />, initial);
    await user.click(screen.getByRole("button", { name: /Usar peso de/ }));
    expect(screen.getByLabelText("Peso em kg")).toHaveValue("72,125");
    expect(screen.getByLabelText("Data")).not.toHaveValue("2026-01-01");
    expect(screen.getByLabelText(/Observação/)).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "Salvar peso" }));
    await waitFor(async () =>
      expect((await loadData()).weights).toHaveLength(2),
    );
    expect((await loadData()).weights[0].weightKg).toBe(72.125);
  });
});

describe("atividade e alimentação", () => {
  it("aceita atividade livre sem inventar calorias", async () => {
    const user = await renderPage(<ActivityPage />);
    await user.type(screen.getByLabelText("Atividade"), "Minha atividade");
    await user.type(screen.getByLabelText("Duração em minutos"), "35");
    await user.click(screen.getByRole("button", { name: "Salvar atividade" }));
    await waitFor(async () =>
      expect((await loadData()).activities).toHaveLength(1),
    );
    expect((await loadData()).activities[0].caloriesKcal).toBeNull();
    expect(
      screen.getByRole("button", { name: "Minha atividade" }),
    ).toBeInTheDocument();
  });

  it("sugere calorias pela atividade, duração e peso e mantém ajuste manual", async () => {
    const initial = emptyData();
    initial.weights.push({
      id: crypto.randomUUID(),
      weightKg: 80,
      measuredAt: new Date().toISOString(),
      note: "",
      createdAt: new Date().toISOString(),
    });
    const user = await renderPage(<ActivityPage />, initial);
    await user.click(screen.getByRole("button", { name: "Caminhada" }));
    await user.type(screen.getByLabelText("Duração em minutos"), "30");
    const calories = screen.getByLabelText(/Calorias gastas/);
    expect(calories).toHaveValue("160");
    await user.click(
      screen.getByRole("button", { name: "Como estimamos as calorias?" }),
    );
    expect(screen.getByText(/código 17190/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Ver parâmetro na fonte" }),
    ).toHaveAttribute("href", "https://pacompendium.com/walking/");
    await user.clear(calories);
    await user.type(calories, "145");
    await user.clear(screen.getByLabelText("Duração em minutos"));
    await user.type(screen.getByLabelText("Duração em minutos"), "40");
    expect(calories).toHaveValue("145");
    await user.click(
      screen.getByRole("button", { name: /Usar estimativa de/ }),
    );
    expect(calories).toHaveValue("213");
    await user.click(screen.getByRole("button", { name: "Salvar atividade" }));
    await waitFor(async () =>
      expect((await loadData()).activities).toHaveLength(1),
    );
    expect((await loadData()).activities[0]).toMatchObject({
      caloriesKcal: 213,
      caloriesSource: "estimated",
    });
  });

  it("salva o valor ajustado sem recalcular depois de mudar a duração", async () => {
    const user = await renderPage(<ActivityPage />);
    await user.click(screen.getByRole("button", { name: "Yoga" }));
    await user.type(screen.getByLabelText("Duração em minutos"), "30");
    const calories = screen.getByLabelText(/Calorias gastas/);
    await user.clear(calories);
    await user.type(calories, "42");
    await user.clear(screen.getByLabelText("Duração em minutos"));
    await user.type(screen.getByLabelText("Duração em minutos"), "40");
    expect(calories).toHaveValue("42");
    await user.click(screen.getByRole("button", { name: "Salvar atividade" }));
    await waitFor(async () =>
      expect((await loadData()).activities).toHaveLength(1),
    );
    expect((await loadData()).activities[0]).toMatchObject({
      caloriesKcal: 42,
      caloriesSource: "manual",
    });
  });

  it("aceita calorias informadas na refeição sem torná-las obrigatórias", async () => {
    const user = await renderPage(<FoodPage />);
    await user.type(screen.getByLabelText("Descrição"), "Almoço");
    await user.click(screen.getByRole("button", { name: "Salvar refeição" }));
    await waitFor(async () => expect((await loadData()).meals).toHaveLength(1));
    expect((await loadData()).meals[0].caloriesKcal).toBeNull();
    await user.type(screen.getByLabelText("Descrição"), "Lanche");
    await user.type(screen.getByLabelText(/Calorias consumidas/), "230");
    await user.click(screen.getByRole("button", { name: "Salvar refeição" }));
    await waitFor(async () => expect((await loadData()).meals).toHaveLength(2));
    expect((await loadData()).meals[0].caloriesKcal).toBe(230);
  });

  it("reaproveita atividade anterior como rascunho e permite excluí-la", async () => {
    const initial = emptyData();
    const past = "2026-01-01T12:00:00.000Z";
    initial.activities = [
      {
        id: crypto.randomUUID(),
        name: "Caminhada",
        durationMinutes: 35.5,
        caloriesKcal: 180,
        occurredAt: past,
        createdAt: past,
      },
    ];
    const user = await renderPage(<ActivityPage />, initial);
    await user.click(screen.getByRole("button", { name: /Usar Caminhada/ }));
    expect(screen.getByLabelText("Atividade")).toHaveValue("Caminhada");
    expect(screen.getByLabelText("Duração em minutos")).toHaveValue("35,5");
    expect(screen.getByLabelText(/Calorias gastas/)).toHaveValue("180");
    await user.click(screen.getByRole("button", { name: /Excluir Caminhada/ }));
    await waitFor(async () =>
      expect((await loadData()).activities).toHaveLength(0),
    );
  });

  it("mostra Pilates já praticado nos atalhos e preenche o último registro", async () => {
    const initial = emptyData();
    initial.activities.push({
      id: crypto.randomUUID(),
      name: "Pilates",
      durationMinutes: 25,
      caloriesKcal: 80,
      caloriesSource: "manual",
      occurredAt: "2026-01-01T12:00:00.000Z",
      createdAt: "2026-01-01T12:00:00.000Z",
    });
    const user = await renderPage(<ActivityPage />, initial);
    await user.click(screen.getByRole("button", { name: "Pilates" }));
    expect(screen.getByLabelText("Atividade")).toHaveValue("Pilates");
    expect(screen.getByLabelText("Duração em minutos")).toHaveValue("25");
    expect(screen.getByLabelText(/Calorias gastas/)).toHaveValue("80");
    await user.click(screen.getByRole("button", { name: "Caminhada" }));
    expect(screen.getByLabelText("Atividade")).toHaveValue("Caminhada");
    expect(screen.getByLabelText(/Calorias gastas/)).not.toHaveValue("80");
    await user.click(screen.getByRole("button", { name: "Pilates" }));
    await user.click(screen.getByRole("button", { name: "Salvar atividade" }));
    await waitFor(async () =>
      expect((await loadData()).activities).toHaveLength(2),
    );
    expect(screen.getByRole("button", { name: "Pilates" })).toBeInTheDocument();
  });

  it("reaproveita refeição anterior como rascunho sem arredondar calorias", async () => {
    const initial = emptyData();
    const past = "2026-01-01T12:00:00.000Z";
    initial.meals = [
      {
        id: crypto.randomUUID(),
        name: "Lanche",
        caloriesKcal: 230.125,
        eatenAt: past,
        createdAt: past,
      },
    ];
    const user = await renderPage(<FoodPage />, initial);
    await user.click(screen.getByRole("button", { name: /Usar Lanche/ }));
    expect(screen.getByLabelText("Descrição")).toHaveValue("Lanche");
    expect(screen.getByLabelText(/Calorias consumidas/)).toHaveValue("230,125");
    await user.click(screen.getByRole("button", { name: "Salvar refeição" }));
    await waitFor(async () => expect((await loadData()).meals).toHaveLength(2));
    expect((await loadData()).meals[0].caloriesKcal).toBe(230.125);
  });
});

describe("medicação", () => {
  it("salva vários horários em formato de 24 horas e permite remover um deles", async () => {
    const user = await renderPage(<MedicationPage />);
    await user.type(screen.getByLabelText("Nome"), "Exemplo");
    await user.type(screen.getByLabelText("Dose"), "1");
    const select = screen.getByLabelText(/Horários de lembrete/);
    expect(screen.getByRole("option", { name: "20:30" })).toBeInTheDocument();
    await user.selectOptions(select, "08:00");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));
    await user.selectOptions(select, "13:30");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));
    await user.selectOptions(select, "20:30");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));
    await user.click(
      screen.getByRole("button", { name: "Remover horário 13:30" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Salvar medicamento" }),
    );
    await waitFor(async () =>
      expect((await loadData()).medications[0].reminderTimes).toEqual([
        "08:00",
        "20:30",
      ]),
    );
  });

  it("salva dose e horário e só registra uso após ação da pessoa", async () => {
    const user = await renderPage(<MedicationPage />);
    await user.type(screen.getByLabelText("Nome"), "Medicamento exemplo");
    await user.type(screen.getByLabelText("Dose"), "500");
    await user.selectOptions(
      screen.getByLabelText(/Horários de lembrete/),
      "08:00",
    );
    await user.click(
      screen.getByRole("button", { name: "Salvar medicamento" }),
    );
    await waitFor(async () =>
      expect((await loadData()).medications).toHaveLength(1),
    );
    expect((await loadData()).medicationLogs).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Registrar uso" }));
    await waitFor(async () =>
      expect((await loadData()).medicationLogs).toHaveLength(1),
    );
    const firstLogId = (await loadData()).medicationLogs[0].id;
    await user.click(
      screen.getByRole("button", { name: "Registrar outro uso" }),
    );
    await waitFor(async () =>
      expect((await loadData()).medicationLogs).toHaveLength(2),
    );
    expect((await loadData()).medicationLogs[0].id).not.toBe(firstLogId);
    expect(
      screen.getByRole("button", {
        name: "Remover último registro de Medicamento exemplo",
      }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: "Remover último registro de Medicamento exemplo",
      }),
    );
    await waitFor(async () =>
      expect((await loadData()).medicationLogs).toHaveLength(1),
    );
    expect((await loadData()).medicationLogs[0].id).toBe(firstLogId);
    expect(screen.getByText(/1 registro hoje/)).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: "Remover último registro de Medicamento exemplo",
      }),
    );
    await waitFor(async () =>
      expect((await loadData()).medicationLogs).toHaveLength(0),
    );
    expect(
      screen.getByText(/Você pode escolher vários horários/),
    ).toBeInTheDocument();
  });

  it("edita sem perder histórico e confirma exclusão em cascata", async () => {
    const initial = emptyData();
    const now = new Date().toISOString();
    const med = {
      id: crypto.randomUUID(),
      name: "Exemplo",
      dose: 0.125,
      unit: "mg",
      reminderTimes: ["08:00"],
      createdAt: now,
    };
    initial.medications = [med];
    initial.medicationLogs = [
      {
        id: crypto.randomUUID(),
        medicationId: med.id,
        takenAt: now,
        createdAt: now,
      },
    ];
    const user = await renderPage(<MedicationPage />, initial);
    await user.click(
      await screen.findByRole("button", { name: "Editar Exemplo" }),
    );
    expect(screen.getByLabelText("Dose")).toHaveValue("0,125");
    expect(screen.getByText(/0,125 mg/)).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Nome"));
    await user.type(screen.getByLabelText("Nome"), "Exemplo novo");
    await user.clear(screen.getByLabelText("Unidade"));
    await user.type(screen.getByLabelText("Unidade"), "mcg");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await waitFor(async () =>
      expect((await loadData()).medications[0].name).toBe("Exemplo novo"),
    );
    expect((await loadData()).medicationLogs).toHaveLength(1);
    expect((await loadData()).medications[0].unit).toBe("mcg");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await user.click(
      screen.getByRole("button", { name: "Excluir Exemplo novo" }),
    );
    expect((await loadData()).medications).toHaveLength(1);
    confirm.mockReturnValue(true);
    await user.click(
      screen.getByRole("button", { name: "Excluir Exemplo novo" }),
    );
    await waitFor(async () =>
      expect((await loadData()).medications).toHaveLength(0),
    );
    expect((await loadData()).medicationLogs).toHaveLength(0);
    confirm.mockRestore();
  });
});

describe("configurações e backup", () => {
  it("não salva altura implausível e mostra por que a ação falhou", async () => {
    const user = await renderPage(<SettingsPage />);
    await user.type(screen.getByLabelText(/Altura em cm/), "300");
    await user.click(screen.getByRole("button", { name: "Salvar perfil" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("250 cm");
    expect((await loadData()).profile.heightCm).toBeNull();
  });

  it("recusa importar um backup com peso fora da faixa de entrada", async () => {
    const user = await renderPage(<SettingsPage />);
    const backup = emptyData();
    backup.weights.push({
      id: crypto.randomUUID(),
      weightKg: 400,
      measuredAt: new Date().toISOString(),
      note: "",
      createdAt: new Date().toISOString(),
    });
    await user.upload(
      screen.getByLabelText("Escolher backup"),
      new File([JSON.stringify(backup)], "peso-invalido.json", {
        type: "application/json",
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "peso fora da faixa",
    );
    expect((await loadData()).weights).toHaveLength(0);
  });

  it("salva perfil e rejeita um JSON incompatível sem alterar os dados", async () => {
    const user = await renderPage(<SettingsPage />);
    await user.type(screen.getByLabelText(/Como você quer ser chamado/), "Ana");
    await user.type(screen.getByLabelText(/Altura em cm/), "168");
    await user.click(screen.getByRole("button", { name: "Salvar perfil" }));
    await waitFor(async () =>
      expect((await loadData()).profile.displayName).toBe("Ana"),
    );
    await user.upload(
      screen.getByLabelText("Escolher backup"),
      new File(["{}"], "ruim.json", { type: "application/json" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Arquivo incompatível",
    );
    expect((await loadData()).profile.displayName).toBe("Ana");
  });

  it("rejeita um backup acima do limite antes de ler o conteúdo", async () => {
    const user = await renderPage(<SettingsPage />);
    const file = new File(["{}"], "grande.json", { type: "application/json" });
    Object.defineProperty(file, "size", { value: 10_000_001 });
    await user.upload(screen.getByLabelText("Escolher backup"), file);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "limite de 10 MB",
    );
    expect((await loadData()).profile.displayName).toBe("");
  });

  it("mostra o conteúdo de um backup válido antes da substituição", async () => {
    const user = await renderPage(<SettingsPage />);
    const backup = emptyData();
    backup.profile.displayName = "Bia";
    await user.upload(
      screen.getByLabelText("Escolher backup"),
      new File([JSON.stringify(backup)], "backup.json", {
        type: "application/json",
      }),
    );
    expect(
      await screen.findByText("Arquivo pronto para importar"),
    ).toBeInTheDocument();
    expect(screen.getByText("Água: 0")).toBeInTheDocument();
    expect(
      screen.getByText(/Última alteração no arquivo:/),
    ).toBeInTheDocument();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    await user.click(
      screen.getByRole("button", { name: "Importar este arquivo" }),
    );
    await waitFor(async () =>
      expect((await loadData()).profile.displayName).toBe("Bia"),
    );
    confirm.mockRestore();
  });

  it("preserva os dados existentes quando a pessoa cancela a importação", async () => {
    const initial = emptyData();
    initial.profile.displayName = "Ana";
    const user = await renderPage(<SettingsPage />, initial);
    const backup = emptyData();
    backup.profile.displayName = "Bia";
    await user.upload(
      screen.getByLabelText("Escolher backup"),
      new File([JSON.stringify(backup)], "backup.json", {
        type: "application/json",
      }),
    );
    await screen.findByText("Arquivo pronto para importar");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await user.click(
      screen.getByRole("button", { name: "Importar este arquivo" }),
    );
    expect((await loadData()).profile.displayName).toBe("Ana");
    confirm.mockRestore();
  });
});
