import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyData, todayIsoDate, type AppData } from "../domain/data";
import { shiftCalendarDay } from "../domain/dailyRecords";
import { DailyRecordsPage } from "./DailyRecordsPage";

const state = vi.hoisted(() => ({ data: null as AppData | null }));
vi.mock("../state/AppDataContext", () => ({
  useAppData: () => ({ data: state.data }),
}));

beforeEach(() => {
  state.data = emptyData();
  vi.stubGlobal("scrollTo", vi.fn());
});

afterEach(() => vi.unstubAllGlobals());

describe("Registros por dia", () => {
  it("abre em hoje, consulta outro dia e preserva os dados", async () => {
    const user = userEvent.setup();
    const yesterday = shiftCalendarDay(todayIsoDate(), -1);
    const at = new Date(`${yesterday}T12:15:00`).toISOString();
    state.data!.hydrationEntries.push({
      id: crypto.randomUUID(),
      createdAt: at,
      drankAt: at,
      amountMl: 250,
    });
    const before = JSON.stringify(state.data);

    render(
      <MemoryRouter>
        <DailyRecordsPage />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("heading", { name: "Registros por dia" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Data dos registros")).toHaveValue(
      todayIsoDate(),
    );
    expect(screen.getByRole("button", { name: "Dia seguinte" })).toBeDisabled();
    expect(screen.getByText("Nenhum registro neste dia.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Dia anterior" }));
    expect(screen.getByLabelText("Data dos registros")).toHaveValue(yesterday);
    expect(screen.getByRole("link", { name: /Água · 250 ml/ })).toHaveAttribute(
      "href",
      "/hidratacao",
    );
    expect(screen.getByText("12:15")).toBeInTheDocument();
    expect(JSON.stringify(state.data)).toBe(before);

    await user.click(screen.getByRole("button", { name: "Ir para hoje" }));
    expect(screen.getByText("Nenhum registro neste dia.")).toBeInTheDocument();
  });

  it("permite escolher uma data e não aceita data futura", () => {
    render(
      <MemoryRouter>
        <DailyRecordsPage />
      </MemoryRouter>,
    );
    const input = screen.getByLabelText("Data dos registros");
    const yesterday = shiftCalendarDay(todayIsoDate(), -1);
    fireEvent.change(input, { target: { value: yesterday } });
    expect(input).toHaveValue(yesterday);
    fireEvent.change(input, {
      target: { value: shiftCalendarDay(todayIsoDate(), 1) },
    });
    expect(input).toHaveValue(yesterday);
  });

  it("mostra dias extensos em lotes sem ocultar registros", async () => {
    const user = userEvent.setup();
    const at = new Date(`${todayIsoDate()}T12:15:00`).toISOString();
    state.data!.hydrationEntries = Array.from({ length: 31 }, () => ({
      id: crypto.randomUUID(),
      createdAt: at,
      drankAt: at,
      amountMl: 200,
    }));

    render(
      <MemoryRouter>
        <DailyRecordsPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("31 registros");
    expect(screen.getAllByRole("link", { name: /Água · 200 ml/ })).toHaveLength(
      30,
    );
    await user.click(
      screen.getByRole("button", { name: "Mostrar mais registros" }),
    );
    expect(screen.getAllByRole("link", { name: /Água · 200 ml/ })).toHaveLength(
      31,
    );
  });
});
