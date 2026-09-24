import { describe, expect, it } from "vitest";
import { decideSync } from "./decision";

describe("decisão de sincronização", () => {
  it("não substitui registros após uploads concorrentes derivados do mesmo backup", () => {
    expect(
      decideSync({
        remoteId: "outro-aparelho",
        remoteHash: "outra-versao",
        localHash: "minha-versao",
        localHasContent: true,
        previous: {
          snapshotId: "meu-upload",
          contentHash: "minha-versao",
        },
      }),
    ).toBe("conflict");
  });

  it("restaura automaticamente apenas um aparelho novo e vazio", () => {
    expect(
      decideSync({
        remoteId: "backup",
        remoteHash: "dados",
        localHash: "vazio",
        localHasContent: false,
      }),
    ).toBe("restore");
  });
});
