import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { openDB } from "idb";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import {
  emptyData,
  parseBackup,
  toLocalDateTime,
  todayIsoDate,
} from "../domain/data";
import { summaryForDay } from "../domain/dailyRecords";
import { AppDataProvider } from "../state/AppDataContext";
import { loadData, saveData } from "../storage/indexedDb";
import { HydrationPage } from "./HydrationPage";

vi.mock("../components/PushActivationPrompt", () => ({
  PushActivationPrompt: () => null,
}));

beforeEach(async () => {
  const db = await openDB("biorotina", 3);
  await db.clear("app");
  db.close();
});

it("persiste a edição local e move a entrada entre os totais dos dias", async () => {
  const today = todayIsoDate();
  const previous = new Date(`${today}T12:00`);
  previous.setDate(previous.getDate() - 1);
  const yesterday = toLocalDateTime(previous.toISOString()).slice(0, 10);
  const original = {
    id: "00000000-0000-4000-8000-000000000001",
    amountMl: 250,
    drankAt: new Date(`${today}T10:00`).toISOString(),
    createdAt: new Date(`${today}T10:00`).toISOString(),
  };
  const data = emptyData();
  data.hydrationEntries = [
    original,
    {
      id: "00000000-0000-4000-8000-000000000002",
      amountMl: 200,
      drankAt: new Date(`${today}T09:00`).toISOString(),
      createdAt: new Date(`${today}T09:00`).toISOString(),
    },
  ];
  await saveData(data);

  const user = userEvent.setup();
  render(
    <AppDataProvider>
      <MemoryRouter>
        <HydrationPage />
      </MemoryRouter>
    </AppDataProvider>,
  );
  expect(
    await screen.findByText("450", { selector: ".large-value" }),
  ).toBeInTheDocument();
  await user.click(
    screen.getByRole("button", { name: /Editar água de 250 ml/ }),
  );
  const form = screen.getByRole("form", { name: "Editar registro de água" });
  const date = within(form).getByLabelText("Data");
  fireEvent.change(date, {
    target: { value: yesterday.split("-").reverse().join("/") },
  });
  await user.click(
    within(form).getByRole("button", { name: "Salvar alteração" }),
  );

  await waitFor(async () => {
    const saved = await loadData();
    expect(saved.hydrationEntries).toHaveLength(2);
    expect(saved.hydrationEntries[0]).toMatchObject({
      id: original.id,
      createdAt: original.createdAt,
      amountMl: 250,
    });
    expect(
      toLocalDateTime(saved.hydrationEntries[0].drankAt).slice(0, 10),
    ).toBe(yesterday);
  });
  expect(
    await screen.findByText("200", { selector: ".large-value" }),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("Data do histórico de água")).toHaveValue(
    yesterday,
  );
  expect(screen.getByLabelText("Data do histórico de água")).toHaveFocus();
  const saved = await loadData();
  expect(summaryForDay(saved, today).hydrationEntries).toHaveLength(1);
  expect(summaryForDay(saved, yesterday).hydrationEntries).toHaveLength(1);
  expect(parseBackup(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
});
