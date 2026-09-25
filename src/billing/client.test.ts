import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  analyzeWithPlan,
  createPlanCheckout,
  getPlanStatus,
  getTrialConfig,
} from "./client";
import { mealSchema } from "../domain/data";

beforeEach(() => vi.restoreAllMocks());

function mockAuthenticatedApi(payload: unknown, status = 200) {
  const fetcher = vi.spyOn(globalThis, "fetch");
  fetcher
    .mockResolvedValueOnce(
      Response.json({ accessToken: "fresh-session-token" }),
    )
    .mockResolvedValueOnce(new Response(JSON.stringify(payload), { status }));
  return fetcher;
}

describe("plano vinculado ao Google", () => {
  it("aceita e permite salvar uma análise paga com descrição longa", async () => {
    const description =
      "Prato feito tradicional com arroz branco, feijão, coxa e sobrecoxa de frango assada e batatas fritas, acompanhado por tigelas extras de batata frita e feijão.";
    mockAuthenticatedApi({
      description,
      foods: [
        { name: "Arroz branco cozido", amount: "200 g", caloriesKcal: 260 },
      ],
    });
    const analysis = await analyzeWithPlan("google-token", {
      dataUrl: "",
      base64: "Zm9v",
    });
    expect(analysis.description).toBe(description);
    expect(
      mealSchema.safeParse({
        id: "194823b7-f285-459d-b7f6-c6384ad3852e",
        createdAt: "2026-09-24T12:00:00.000Z",
        eatenAt: "2026-09-24T12:00:00.000Z",
        name: analysis.description,
        caloriesKcal: 260,
        foods: analysis.foods,
        photoAssisted: true,
      }).success,
    ).toBe(true);
  });

  it("exige login antes de acessar o serviço", async () => {
    await expect(getPlanStatus("")).rejects.toThrow("Conecte sua conta Google");
  });
  it("usa o token Google e aceita somente endereço de checkout do Asaas", async () => {
    const fetcher = mockAuthenticatedApi({
      url: "https://asaas.com/checkoutSession/show/123",
    });
    expect(await createPlanCheckout("google-token")).toContain("asaas.com");
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      credentials: "include",
      cache: "no-store",
    });
    expect(fetcher.mock.calls[1][1]?.headers).toMatchObject({
      authorization: "Bearer fresh-session-token",
    });
    expect(fetcher.mock.calls[0][1]?.body).toBeUndefined();
  });
  it("rejeita um link de pagamento fora do Asaas", async () => {
    mockAuthenticatedApi({ url: "https://example.com/pay" });
    await expect(createPlanCheckout("google-token")).rejects.toThrow(
      "Endereço de pagamento inválido",
    );
  });
  it("mostra o estado informado pelo servidor", async () => {
    mockAuthenticatedApi({
      active: true,
      cancelled: false,
      renewalActive: true,
      paidThrough: "2026-10-24",
      nextCharge: "2026-10-24",
      usedToday: 2,
      dailyLimit: 10,
      checkoutUrl: null,
    });
    expect((await getPlanStatus("google-token")).usedToday).toBe(2);
  });
  it("lê o controle público do teste grátis", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ trialEnabled: false }), { status: 200 }),
    );
    expect(await getTrialConfig()).toBe(false);
  });
  it("traduz serviço ainda não publicado sem sugerir assinatura ativa", async () => {
    mockAuthenticatedApi({ message: "Not Found" }, 404);
    await expect(getPlanStatus("google-token")).rejects.toThrow(
      "O plano de IA ainda não está disponível",
    );
  });
  it("traduz falha de conexão sem exibir erro técnico", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new TypeError("Failed to fetch"),
    );
    await expect(getPlanStatus("google-token")).rejects.toThrow(
      "Não foi possível conectar ao serviço do plano",
    );
  });
});
