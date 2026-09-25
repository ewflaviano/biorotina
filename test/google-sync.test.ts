import { describe, expect, it, vi } from "vitest";
import { emptyData } from "../src/domain/data";
import { decideSync } from "../src/sync/decision";
import {
  contentHash,
  currentGoogleAccount,
  downloadDriveSnapshot,
  listDriveSnapshots,
  forgetGoogleAccount,
  rememberGoogleAccount,
  uploadDriveSnapshot,
} from "../src/sync/google";

describe("decisão de sincronização", () => {
  const previous = { snapshotId: "old", contentHash: "same" };

  it("não cria backup vazio e envia dados locais quando ainda não há cópia", () => {
    expect(
      decideSync({
        remoteId: null,
        remoteHash: null,
        localHash: "x",
        localHasContent: false,
      }),
    ).toBe("nothing");
    expect(
      decideSync({
        remoteId: null,
        remoteHash: null,
        localHash: "x",
        localHasContent: true,
      }),
    ).toBe("upload");
  });

  it("envia somente mudanças locais desde o último backup", () => {
    expect(
      decideSync({
        remoteId: "old",
        remoteHash: null,
        localHash: "same",
        localHasContent: true,
        previous,
      }),
    ).toBe("synced");
    expect(
      decideSync({
        remoteId: "old",
        remoteHash: null,
        localHash: "changed",
        localHasContent: true,
        previous,
      }),
    ).toBe("upload");
  });

  it("restaura um backup novo quando o navegador não mudou", () => {
    expect(
      decideSync({
        remoteId: "new",
        remoteHash: "new-content",
        localHash: "same",
        localHasContent: true,
        previous,
      }),
    ).toBe("restore");
    expect(
      decideSync({
        remoteId: "new",
        remoteHash: "new-content",
        localHash: "empty",
        localHasContent: false,
      }),
    ).toBe("restore");
  });

  it("atualiza sem perguntar quando só o Drive avançou", () => {
    expect(
      decideSync({
        remoteId: "new",
        remoteHash: "remote-with-new-record",
        localHash: "same",
        localHasContent: true,
        previous,
      }),
    ).toBe("restore");
  });

  it("pede escolha quando há dados diferentes nos dois lados", () => {
    expect(
      decideSync({
        remoteId: "new",
        remoteHash: "remote",
        localHash: "local",
        localHasContent: true,
        previous,
      }),
    ).toBe("conflict");
    expect(
      decideSync({
        remoteId: "new",
        remoteHash: "remote",
        localHash: "local",
        localHasContent: true,
      }),
    ).toBe("conflict");
  });

  it("reconhece dados idênticos mesmo em outro dispositivo", () => {
    expect(
      decideSync({
        remoteId: "new",
        remoteHash: "same",
        localHash: "same",
        localHasContent: true,
      }),
    ).toBe("mark-synced");
  });
});

describe("Google Drive privado", () => {
  it("mantém a conexão no navegador enquanto o token é válido", () => {
    rememberGoogleAccount({
      id: "person",
      email: "person@example.com",
      token: "temporary",
      expiresAt: Date.now() + 120_000,
    });
    expect(currentGoogleAccount()?.id).toBe("person");
    expect(localStorage.getItem("biorotina:google-account")).toContain(
      "person@example.com",
    );
    rememberGoogleAccount({
      id: "person",
      email: "person@example.com",
      token: "expired",
      expiresAt: Date.now() - 1,
    });
    expect(currentGoogleAccount()).toBeNull();
    forgetGoogleAccount();
    expect(localStorage.getItem("biorotina:google-account")).toBeNull();
  });

  it("lista todas as páginas e ordena os backups pelo mais recente", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            nextPageToken: "next",
            files: [
              {
                id: "old",
                name: "biorotina-backup.json",
                createdTime: "2026-01-01T00:00:00Z",
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            files: [
              {
                id: "new",
                name: "biorotina-backup.json",
                createdTime: "2026-02-01T00:00:00Z",
              },
            ],
          }),
          { status: 200 },
        ),
      );
    const files = await listDriveSnapshots("token", fetcher);
    expect(files.map((file) => file.id)).toEqual(["new", "old"]);
    expect(fetcher.mock.calls[0][0]).toContain("spaces=appDataFolder");
    expect(fetcher.mock.calls[1][0]).toContain("pageToken=next");
    expect(
      new Headers(fetcher.mock.calls[0][1].headers).get("Authorization"),
    ).toBe("Bearer token");
  });

  it("envia snapshot novo à pasta privada sem alterar o anterior", async () => {
    const data = emptyData();
    data.profile.displayName = "Ana";
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "saved",
          createdTime: "2026-09-23T22:00:00Z",
        }),
        { status: 200 },
      ),
    );
    const saved = await uploadDriveSnapshot("token", data, fetcher);
    expect(saved.id).toBe("saved");
    expect(fetcher.mock.calls[0][0]).toContain("uploadType=multipart");
    const body = String(fetcher.mock.calls[0][1].body);
    expect(body).toContain('"parents":["appDataFolder"]');
    expect(body).toContain('"displayName":"Ana"');
  });

  it("não cria um backup que o aplicativo não conseguiria restaurar", async () => {
    const data = emptyData();
    const fetcher = vi.fn();
    const encode = vi
      .spyOn(TextEncoder.prototype, "encode")
      .mockReturnValue(new Uint8Array(10_000_001));
    try {
      await expect(uploadDriveSnapshot("token", data, fetcher)).rejects.toThrow(
        "excede 10 MB",
      );
      expect(fetcher).not.toHaveBeenCalled();
    } finally {
      encode.mockRestore();
    }
  });

  it("valida o JSON remoto antes de restaurar", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ wrong: true }), { status: 200 }),
      );
    await expect(
      downloadDriveSnapshot(
        "token",
        { id: "x", createdTime: "2026-09-23T22:00:00Z" },
        fetcher,
      ),
    ).rejects.toThrow();
  });

  it("carrega um backup remoto válido com os dados e horários", async () => {
    const data = emptyData();
    data.profile.displayName = "Ana";
    data.hydrationReminderTimes = ["08:00", "14:30"];
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(data), { status: 200 }));
    const restored = await downloadDriveSnapshot(
      "token",
      { id: "snapshot", createdTime: "2026-09-23T22:00:00Z" },
      fetcher,
    );
    expect(restored.profile.displayName).toBe("Ana");
    expect(restored.hydrationReminderTimes).toEqual(["08:00", "14:30"]);
    expect(fetcher.mock.calls[0][0]).toContain("/files/snapshot?alt=media");
  });

  it("orienta reconectar quando o Google expira o token", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 401 }));
    await expect(listDriveSnapshots("expired", fetcher)).rejects.toThrow(
      "Conecte novamente",
    );
  });

  it("não lê um backup remoto maior que o limite de importação", async () => {
    const fetcher = vi.fn();
    await expect(
      downloadDriveSnapshot(
        "token",
        { id: "x", createdTime: "2026-09-23T22:00:00Z", size: "10000001" },
        fetcher,
      ),
    ).rejects.toThrow("10 MB");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("compara conteúdo sem considerar revisão e horário locais", async () => {
    const a = emptyData();
    const b = { ...a, revision: 14, updatedAt: "2026-09-23T22:00:00.000Z" };
    expect(await contentHash(a)).toBe(await contentHash(b));
  });
});
