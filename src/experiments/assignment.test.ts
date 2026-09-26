import { deleteDB, openDB } from "idb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { browserBucket, resolveAssignments } from "./assignment";
const key = "hydration-form-confirmation";
const config = {
  enabled: true,
  killSwitch: false,
  rolloutPercent: 5,
  revision: 2,
};
beforeEach(async () => {
  await deleteDB("biorotina-experiment-buckets-v1");
});
describe("sorteio persistente por navegador", () => {
  it("serializa abas concorrentes e preserva o número em nova conexão", async () => {
    const values = await Promise.all(
      Array.from({ length: 12 }, () => browserBucket(key)),
    );
    expect(new Set(values).size).toBe(1);
    expect(values[0]).toBeGreaterThanOrEqual(0);
    expect(values[0]).toBeLessThan(100);
    expect(await browserBucket(key)).toBe(values[0]);
  });
  it("não repara silenciosamente um número inválido com outro sorteio", async () => {
    const db = await openDB("biorotina-experiment-buckets-v1", 1, {
      upgrade(db) {
        db.createObjectStore("buckets");
      },
    });
    await db.put("buckets", 100, key);
    db.close();
    expect(await browserBucket(key)).toBeNull();
  });
  it("aumenta a coorte pelo limite, mantém login/logout e permite redução", async () => {
    const bucket = vi.fn(async () => 7);
    const assign = (percent: number, authenticated = false) =>
      resolveAssignments(
        { browser: { [key]: { ...config, rolloutPercent: percent } } },
        authenticated,
        bucket,
      );
    expect((await assign(5))[key]?.arm).toBe("control");
    expect((await assign(10))[key]?.arm).toBe("experiment");
    expect((await assign(10, true))[key]?.arm).toBe("experiment");
    expect((await assign(10))[key]?.arm).toBe("experiment");
    expect((await assign(5))[key]?.arm).toBe("control");
    expect((await assign(0))[key]?.arm).toBe("control");
    expect((await assign(100))[key]?.arm).toBe("experiment");
  });
  it("desliga em ausência, configuração inválida, kill switch ou falha de armazenamento", async () => {
    for (const value of [
      null,
      {},
      { ...config, enabled: false },
      { ...config, killSwitch: true },
      { ...config, revision: 0 },
      { ...config, revision: 2 ** 31 },
      { ...config, rolloutPercent: 101 },
      { ...config, rolloutPercent: -1 },
    ])
      expect(
        await resolveAssignments(
          { browser: { [key]: value } },
          false,
          async () => 0,
        ),
      ).toEqual({});
    expect(
      await resolveAssignments(
        { browser: { [key]: config } },
        false,
        async () => null,
      ),
    ).toEqual({});
  });
  it("header só vale com autenticação, perde para kill switch e não autoriza demo anônimo", async () => {
    const payload = {
      forced: [key, "demo-highlight"],
      browser: { [key]: { ...config, enabled: false } },
      enabled: ["demo-highlight"],
      revisions: { "demo-highlight": 2 },
    };
    expect(await resolveAssignments(payload, false)).toEqual({});
    expect((await resolveAssignments(payload, true))[key]).toEqual({
      arm: "experiment",
      revision: 2,
      forced: true,
    });
    payload.browser[key].killSwitch = true;
    expect((await resolveAssignments(payload, true))[key]).toBeUndefined();
  });
  it("retorna controle exatamente no limite e ignora chaves desconhecidas", async () => {
    expect(
      await resolveAssignments(
        { browser: { [key]: config, unknown: config } },
        false,
        async () => 5,
      ),
    ).toEqual({ [key]: { arm: "control", revision: 2, forced: false } });
  });
});

it("armazenamento bloqueado deixa desligado sem novo identificador ou rejeição", async () => {
  const open = vi.spyOn(indexedDB, "open").mockImplementation(() => {
    throw new DOMException("blocked", "SecurityError");
  });
  try {
    expect(await browserBucket(key)).toBeNull();
  } finally {
    open.mockRestore();
  }
});
