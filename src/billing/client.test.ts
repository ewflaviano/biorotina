import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  analyzeWithPlan,
  createPlanCheckout,
  getPlanStatus,
  getTrialConfig,
} from "./client";
import { mealSchema } from "../domain/data";

beforeEach(() => vi.restoreAllMocks());

describe("plano vinculado ao Google", () => {
  it("aceita e permite salvar uma análise paga com descrição longa", async () => {
    const description =
      "Prato feito tradicional com arroz branco, feijão, coxa e sobrecoxa de frango assada e batatas fritas, acompanhado por tigelas extras de batata frita e feijão.";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          description,
          foods: [
            { name: "Arroz branco cozido", amount: "200 g", caloriesKcal: 260 },
          ],
        }),
        { status: 200 },
      ),
    );
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
  it("lê o controle público do teste grátis", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ trialEnabled: false }), { status: 200 }),
    );
    expect(await getTrialConfig()).toBe(false);
  });
  it("traduz serviço ainda não publicado sem sugerir assinatura ativa", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "Not Found" }), { status: 404 }),
    );
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
