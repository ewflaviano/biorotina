import { describe, expect, it } from "vitest";
import { emptyData } from "../domain/data";
import { mergeAppData } from "./merge";

describe("mergeAppData", () => {
  it("junta registros diferentes sem duplicar os que já existem", () => {
    const local = emptyData();
    local.hydrationEntries.push({
      id: "local",
      createdAt: "2026-09-24T10:00:00.000Z",
      drankAt: "2026-09-24T10:00:00.000Z",
      amountMl: 200,
    });
    const remote = emptyData();
    remote.hydrationEntries.push(local.hydrationEntries[0], {
      id: "remote",
      createdAt: "2026-09-23T10:00:00.000Z",
      drankAt: "2026-09-23T10:00:00.000Z",
      amountMl: 300,
    });

    const result = mergeAppData(local, remote);
    expect(result.added).toBe(1);
    expect(result.differing).toBe(0);
    expect(result.data.hydrationEntries.map(({ id }) => id)).toEqual([
      "local",
      "remote",
    ]);
    expect(mergeAppData(result.data, remote).changed).toBe(false);
  });

  it("preserva a versão preferida quando o mesmo ID diverge", () => {
    const local = emptyData();
    local.hydrationEntries.push({
      id: "same",
      createdAt: "2026-09-24T10:00:00.000Z",
      drankAt: "2026-09-24T10:00:00.000Z",
      amountMl: 200,
    });
    const remote = emptyData();
    remote.hydrationEntries.push({
      ...local.hydrationEntries[0],
      amountMl: 500,
    });

    const result = mergeAppData(local, remote);
    expect(result.added).toBe(0);
    expect(result.differing).toBe(1);
    expect(result.changed).toBe(false);
    expect(result.data.hydrationEntries[0].amountMl).toBe(200);
    expect(remote.hydrationEntries[0].amountMl).toBe(500);
  });

  it("preenche perfil vazio sem sobrescrever preferências da conta", () => {
    const local = emptyData();
    local.profile.heightCm = 170;
    local.hydrationReminderTimes = ["09:00"];
    const remote = emptyData();
    remote.profile = { displayName: "Ana", heightCm: 160 };
    remote.hydrationReminderTimes = ["09:00", "14:00"];

    const result = mergeAppData(local, remote);
    expect(result.data.profile).toEqual({ displayName: "Ana", heightCm: 170 });
    expect(result.data.hydrationReminderTimes).toEqual(["09:00"]);
  });
});
