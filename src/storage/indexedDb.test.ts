import { openDB } from "idb";
import { beforeEach, describe, expect, it } from "vitest";
import { emptyData } from "../domain/data";
import {
  clearLocalData,
  clearAccountData,
  loadData,
  loadDataState,
  loadGeminiKey,
  loadLegacyData,
  prepareAccountScopes,
  removeGeminiKey,
  saveData,
  saveDataIfRevision,
  saveDriveSync,
  saveGeminiKey,
  SessionInvalidatedError,
  StaleRevisionError,
} from "./indexedDb";

describe("persistência local", () => {
  beforeEach(async () => {
    const db = await openDB("biorotina", 3);
    await db.clear("app");
    await db.clear("driveSync");
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

  it("separa registros sem conta e de cada conta Google", async () => {
    const guest = emptyData();
    guest.profile.displayName = "Sem conta";
    const first = emptyData();
    first.profile.displayName = "Ana";
    await saveData(guest);
    await saveData(first, "google-1");
    await saveData(first, "google-3");
    expect((await loadData()).profile.displayName).toBe("Sem conta");
    expect((await loadData("google-1")).profile.displayName).toBe("Ana");
    expect((await loadData("google-2")).profile.displayName).toBe("");
  });

  it("preserva outras contas e dados sem conta ao sair", async () => {
    const one = emptyData();
    one.profile.displayName = "Ana";
    const two = emptyData();
    two.profile.displayName = "Bia";
    await saveData(one, "google-1");
    await saveData(two, "google-2");
    await saveData(two);
    await clearAccountData("google-1");
    expect((await loadData("google-1")).profile.displayName).toBe("");
    expect((await loadData("google-2")).profile.displayName).toBe("Bia");
    expect((await loadData()).profile.displayName).toBe("Bia");
  });

  it("não sobrescreve edições de outra aba nem ressuscita uma conta apagada", async () => {
    const initial = await loadDataState("google-1");
    const first = { ...initial.data, revision: 1 };
    await saveDataIfRevision(first, 0, initial.epoch, "google-1");
    await expect(
      saveDataIfRevision(first, 0, initial.epoch, "google-1"),
    ).rejects.toBeInstanceOf(StaleRevisionError);
    await clearAccountData("google-1");
    await expect(
      saveDataIfRevision(first, 0, initial.epoch, "google-1"),
    ).rejects.toBeInstanceOf(SessionInvalidatedError);
    expect((await loadData("google-1")).revision).toBe(0);
  });

  it("preserva registros antigos sem atribuí-los automaticamente a outra conta", async () => {
    const old = emptyData();
    old.profile.displayName = "Registro antigo";
    await saveData(old);
    await saveDriveSync("google-1", { snapshotId: "old", contentHash: "hash" });
    await prepareAccountScopes(false);
    expect((await loadData()).profile.displayName).toBe("");
    expect((await loadLegacyData())?.profile.displayName).toBe(
      "Registro antigo",
    );
    expect((await loadData("google-2")).profile.displayName).toBe("");
  });

  it("apaga registros, chave pessoal e metadados locais ao sair", async () => {
    const data = emptyData();
    data.profile.displayName = "Ana";
    await saveData(data, "google-1");
    await saveData(data);
    await saveDriveSync("google-1", {
      snapshotId: "backup",
      contentHash: "hash",
    });
    await saveGeminiKey("chave-pessoal");
    await clearLocalData();
    expect((await loadData("google-1")).profile.displayName).toBe("");
    expect((await loadData()).profile.displayName).toBe("");
    expect(await loadGeminiKey()).toBeNull();
    const db = await openDB("biorotina", 3);
    expect(await db.getAllKeys("driveSync")).toHaveLength(0);
    db.close();
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
      Object.entries(current).filter(
        ([key]) => !key.startsWith("hydration") && !key.startsWith("habit"),
      ),
    );
    const db = await openDB("biorotina", 3);
    await db.put("app", { ...oldData, schemaVersion: 1 }, "main");
    db.close();
    const loaded = await loadData();
    expect(loaded.schemaVersion).toBe(6);
    expect(loaded.profile.displayName).toBe("Bia");
    expect(
      await (await openDB("biorotina", 3)).get("app", "main"),
    ).toMatchObject({
      schemaVersion: 6,
    });
  });
});
