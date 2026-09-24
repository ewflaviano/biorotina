import { openDB } from "idb";
import { beforeEach, describe, expect, it } from "vitest";
import { emptyData } from "../domain/data";
import {
  loadData,
  loadGeminiKey,
  removeGeminiKey,
  saveData,
  saveGeminiKey,
} from "./indexedDb";

describe("persistência local", () => {
  beforeEach(async () => {
    const db = await openDB("biorotina", 3);
    await db.clear("app");
    await db.clear("geminiKey");
    db.close();
  });

  it("guarda a chave fora dos registros e do backup JSON", async () => {
    await saveGeminiKey("  chave-pessoal  ");
    await saveData(emptyData());
    expect(await loadGeminiKey()).toBe("chave-pessoal");
    expect(JSON.stringify(await loadData())).not.toContain("chave-pessoal");
    await removeGeminiKey();
    expect(await loadGeminiKey()).toBeNull();
  });

  it("inicia vazia e salva dados que podem ser lidos novamente", async () => {
    expect((await loadData()).weights).toHaveLength(0);
    const data = emptyData();
    data.profile.displayName = "Ana";
    await saveData(data);
    expect((await loadData()).profile.displayName).toBe("Ana");
  });

  it("recusa um documento inválido persistido em vez de apagar silenciosamente os dados", async () => {
    const db = await openDB("biorotina", 3);
    await db.put("app", { schemaVersion: 999 }, "main");
    db.close();
    await expect(loadData()).rejects.toThrow();
  });

  it("migra automaticamente o documento local antigo", async () => {
    const current = emptyData();
    current.profile.displayName = "Bia";
    const oldData = Object.fromEntries(
      Object.entries(current).filter(([key]) => !key.startsWith("hydration")),
    );
    const db = await openDB("biorotina", 3);
    await db.put("app", { ...oldData, schemaVersion: 1 }, "main");
    db.close();
    const loaded = await loadData();
    expect(loaded.schemaVersion).toBe(4);
    expect(loaded.profile.displayName).toBe("Bia");
    expect(
      await (await openDB("biorotina", 3)).get("app", "main"),
    ).toMatchObject({
      schemaVersion: 4,
    });
  });
});
