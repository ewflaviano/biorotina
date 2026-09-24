import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { openDB } from "idb";
import { useState } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { loadData } from "../storage/indexedDb";
import { AppDataProvider, useAppData } from "./AppDataContext";

function Probe() {
  const { data, loading, error, mutate, replaceIfRevision } = useAppData();
  const [restoreResult, setRestoreResult] = useState("");
  return (
    <>
      <span>
        {loading ? "carregando" : error || data.profile.displayName || "pronto"}
      </span>
      <span>{restoreResult}</span>
      <button
        onClick={() => {
          void mutate((current) => ({
            ...current,
            profile: {
              ...current.profile,
              displayName: `${current.profile.displayName}A`,
            },
          }));
          void mutate((current) => ({
            ...current,
            profile: {
              ...current.profile,
              displayName: `${current.profile.displayName}B`,
            },
          }));
        }}
      >
        Atualizar duas vezes
      </button>
      <button
        onClick={() => {
          void replaceIfRevision(0, {
            ...data,
            profile: { ...data.profile, displayName: "Sobrescrito" },
          })
            .then(() => setRestoreResult("restaurado"))
            .catch(() => setRestoreResult("recusado"));
        }}
      >
        Restaurar versão antiga
      </button>
    </>
  );
}

beforeEach(async () => {
  const db = await openDB("biorotina", 3);
  await db.clear("app");
  db.close();
});

describe("estado do aplicativo", () => {
  it("serializa duas mudanças rápidas para não perder a primeira gravação", async () => {
    const user = userEvent.setup();
    render(
      <AppDataProvider>
        <Probe />
      </AppDataProvider>,
    );
    await screen.findByText("pronto");
    await user.click(
      screen.getByRole("button", { name: "Atualizar duas vezes" }),
    );
    await screen.findByText("AB");
    const stored = await loadData();
    expect(stored.profile.displayName).toBe("AB");
    expect(stored.revision).toBe(2);
  });

  it("recusa restauração com revisão antiga e preserva a mudança recente", async () => {
    const user = userEvent.setup();
    render(
      <AppDataProvider>
        <Probe />
      </AppDataProvider>,
    );
    await screen.findByText("pronto");
    await user.click(
      screen.getByRole("button", { name: "Atualizar duas vezes" }),
    );
    await screen.findByText("AB");
    await user.click(
      screen.getByRole("button", { name: "Restaurar versão antiga" }),
    );
    await screen.findByText("recusado");
    expect((await loadData()).profile.displayName).toBe("AB");
  });

  it("mostra falha de abertura sem substituir dados inválidos", async () => {
    const db = await openDB("biorotina", 3);
    await db.put("app", { schemaVersion: 500 }, "main");
    db.close();
    render(
      <AppDataProvider>
        <Probe />
      </AppDataProvider>,
    );
    await waitFor(() =>
      expect(
        screen.getByText(/Não foi possível abrir os dados/),
      ).toBeInTheDocument(),
    );
  });
});
