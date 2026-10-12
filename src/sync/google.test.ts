import { describe, expect, it, vi } from "vitest";
import {
  contentHash,
  GoogleDriveHttpError,
  GoogleReconnectRequiredError,
  listDriveSnapshots,
} from "./google";

import { emptyData, parseBackup } from "../domain/data";

describe("Google Drive HTTP diagnostics", () => {
  it("keeps only the status for a denied Drive request", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 403 }));
    await expect(
      listDriveSnapshots("private-token", fetcher),
    ).rejects.toMatchObject({
      name: "Error",
      status: 403,
    } satisfies Partial<GoogleDriveHttpError>);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("keeps expired access distinct from other HTTP errors", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 401 }));
    await expect(
      listDriveSnapshots("private-token", fetcher),
    ).rejects.toBeInstanceOf(GoogleReconnectRequiredError);
  });
});

it("preserva o hash do documento v8 ao normalizar e restaurar um backup", async () => {
  const data = emptyData();
  data.hydrationQuickAmounts = [350, 400, 600];
  const restored = parseBackup(JSON.parse(JSON.stringify(data)));
  expect(await contentHash(restored)).toBe(await contentHash(data));
});
