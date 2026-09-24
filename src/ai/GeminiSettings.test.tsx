import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { openDB } from "idb";
import { beforeEach, describe, expect, it } from "vitest";
import { GeminiSettings } from "./GeminiSettings";
import { loadGeminiKey } from "../storage/indexedDb";

beforeEach(async () => {
  const db = await openDB("biorotina", 3);
  await db.clear("geminiKey");
  db.close();
});

describe("configuração da chave Gemini", () => {
  it("salva, oculta e remove a chave localmente", async () => {
    const user = userEvent.setup();
    render(<GeminiSettings />);
    expect(screen.getByText(/Nenhuma chave configurada/)).toBeInTheDocument();
    await user.type(
      screen.getByLabelText("Sua chave Gemini"),
      "chave-para-teste",
    );
    await user.click(screen.getByRole("button", { name: "Salvar chave" }));
    await waitFor(async () =>
      expect(await loadGeminiKey()).toBe("chave-para-teste"),
    );
    expect(screen.getByLabelText("Substituir chave Gemini")).toHaveValue("");
    expect(screen.queryByText("chave-para-teste")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remover chave" }));
    await waitFor(async () => expect(await loadGeminiKey()).toBeNull());
  });
});
