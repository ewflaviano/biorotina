import { describe, expect, it, vi } from "vitest";
import {
  GoogleDriveHttpError,
  GoogleReconnectRequiredError,
  listDriveSnapshots,
} from "./google";

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
