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
          contentHash: "versao-inicial",
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

  it("traz a versão do outro aparelho quando este não mudou desde o último backup", () => {
    expect(
      decideSync({
        remoteId: "celular-com-13-registros",
        remoteHash: "treze-registros",
        localHash: "doze-registros",
        localHasContent: true,
        previous: {
          snapshotId: "backup-com-12-registros",
          contentHash: "doze-registros",
        },
      }),
    ).toBe("restore");
  });
});
