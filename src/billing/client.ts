import { z } from "zod";
import type { MealAnalysis, PreparedImage } from "../ai/gemini";

const API = (import.meta.env.VITE_PUSH_API_URL || "").replace(/\/$/, "");
const statusSchema = z.object({
  active: z.boolean(),
  cancelled: z.boolean(),
  renewalActive: z.boolean(),
  paidThrough: z.string().nullable(),
  nextCharge: z.string().nullable(),
  usedToday: z.number().int().min(0),
  dailyLimit: z.number().int().positive(),
  checkoutUrl: z.string().nullable().optional(),
});
export type PlanStatus = z.infer<typeof statusSchema>;
const analysisSchema = z.object({
  description: z.string().min(1).max(120),
  foods: z
    .array(
      z.object({
        name: z.string().min(1).max(100),
        amount: z.string().min(1).max(80),
        caloriesKcal: z.number().min(0).max(5000),
      }),
    )
    .min(1)
    .max(30),
});

async function request(
  path: string,
  googleToken: string,
  init: RequestInit = {},
): Promise<unknown> {
  if (!googleToken)
    throw new Error("Conecte sua conta Google para usar o plano.");
  let response: Response;
  try {
    response = await fetch(API + path, {
      ...init,
      headers: {
        authorization: `Bearer ${googleToken}`,
        "content-type": "application/json",
        ...init.headers,
      },
      cache: "no-store",
    });
  } catch {
    throw new Error(
      "Não foi possível conectar ao serviço do plano. Tente novamente mais tarde.",
    );
  }
  if (response.status === 404)
    throw new Error("O plano de IA ainda não está disponível. Volte em breve.");
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = z.object({ error: z.string() }).safeParse(payload)
      .data?.error;
    throw new Error(message || "Não foi possível acessar o plano agora.");
  }
  return payload;
}

export async function getPlanStatus(googleToken: string): Promise<PlanStatus> {
  return statusSchema.parse(await request("/api/billing/status", googleToken));
}
export async function createPlanCheckout(googleToken: string): Promise<string> {
  const value = z
    .object({ url: z.string().url() })
    .parse(
      await request("/api/billing/checkout", googleToken, { method: "POST" }),
    );
  const url = new URL(value.url);
  if (!(
    ["asaas.com", "sandbox.asaas.com"].includes(url.hostname) &&
    url.protocol === "https:"
  ))
    throw new Error("Endereço de pagamento inválido.");
  return value.url;
}
export async function analyzeWithPlan(
  googleToken: string,
  image: PreparedImage,
): Promise<MealAnalysis> {
  return analysisSchema.parse(
    await request("/api/ai/meal", googleToken, {
      method: "POST",
      body: JSON.stringify({ image: image.base64 }),
    }),
  );
}
export async function cancelPlan(googleToken: string): Promise<PlanStatus> {
  return statusSchema.parse(
    await request("/api/billing/cancel", googleToken, { method: "POST" }),
  );
}
