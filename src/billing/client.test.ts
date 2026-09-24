import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPlanCheckout, getPlanStatus } from "./client";

beforeEach(() => vi.restoreAllMocks());

describe("plano vinculado ao Google", () => {
  it("exige login antes de acessar o serviço", async () => {
    await expect(getPlanStatus("")).rejects.toThrow("Conecte sua conta Google");
  });
  it("usa o token Google e aceita somente endereço de checkout do Asaas", async () => {
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({ url: "https://asaas.com/checkoutSession/show/123" }),
          { status: 200 },
        ),
      );
    expect(await createPlanCheckout("google-token")).toContain("asaas.com");
    expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({
      authorization: "Bearer google-token",
    });
    expect(fetcher.mock.calls[0][1]?.body).toBeUndefined();
  });
  it("rejeita um link de pagamento fora do Asaas", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ url: "https://example.com/pay" }), {
        status: 200,
      }),
    );
    await expect(createPlanCheckout("google-token")).rejects.toThrow(
      "Endereço de pagamento inválido",
    );
  });
  it("mostra o estado informado pelo servidor", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          active: true,
          cancelled: false,
          renewalActive: true,
          paidThrough: "2026-10-24",
          nextCharge: "2026-10-24",
          usedToday: 2,
          dailyLimit: 10,
          checkoutUrl: null,
        }),
        { status: 200 },
      ),
    );
    expect((await getPlanStatus("google-token")).usedToday).toBe(2);
  });
});
