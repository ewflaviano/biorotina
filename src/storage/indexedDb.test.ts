import { openDB } from "idb";
import { beforeEach, describe, expect, it } from "vitest";
import { emptyData } from "../domain/data";
import { loadData, saveData } from "./indexedDb";

describe("persistência local", () => {
  beforeEach(async () => {
    const db = await openDB("biorotina", 1);
    await db.clear("app");
    db.close();
  });

  it("inicia vazia e salva dados que podem ser lidos novamente", async () => {
    expect((await loadData()).weights).toHaveLength(0);
    const data = emptyData();
    data.profile.displayName = "Ana";
    await saveData(data);
    expect((await loadData()).profile.displayName).toBe("Ana");
  });

  it("recusa um documento inválido persistido em vez de apagar silenciosamente os dados", async () => {
    const db = await openDB("biorotina", 1);
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
    const db = await openDB("biorotina", 1);
    await db.put("app", { ...oldData, schemaVersion: 1 }, "main");
    db.close();
    const loaded = await loadData();
    expect(loaded.schemaVersion).toBe(3);
    expect(loaded.profile.displayName).toBe("Bia");
    expect(
      await (await openDB("biorotina", 1)).get("app", "main"),
    ).toMatchObject({
      schemaVersion: 3,
    });
  });
});
