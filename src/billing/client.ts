import { z } from "zod";
import {
  analysisSchema,
  type MealAnalysis,
  type PreparedImage,
} from "../ai/gemini";
import {
  reportClientError,
  type ErrorOperation,
} from "../observability/client";

const API = (import.meta.env.VITE_PUSH_API_URL || "").replace(/\/$/, "");
const LOCAL_MODE = import.meta.env.VITE_BIOROTINA_LOCAL_MODE === "true";
async function sessionAccessToken(): Promise<string> {
  const response = await fetch(API + "/api/auth/access-token", {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error("Conecte sua conta Google para usar o plano.");
  const payload: unknown = await response.json();
  const parsed = z
    .object({ accessToken: z.string().min(1) })
    .safeParse(payload);
  if (!parsed.success)
    throw new Error("Não foi possível renovar a sessão Google.");
  return parsed.data.accessToken;
}
const statusSchema = z.object({
  active: z.boolean(),
  cancelled: z.boolean(),
  renewalActive: z.boolean(),
  paidThrough: z.string().nullable(),
  nextCharge: z.string().nullable(),
  usedToday: z.number().int().min(0),
  dailyLimit: z.number().int().positive(),
  checkoutUrl: z.string().nullable().optional(),
  trialEnabled: z.boolean().default(false),
  trialUsed: z.number().int().min(0).default(0),
  trialLimit: z.number().int().positive().default(5),
});
export type PlanStatus = z.infer<typeof statusSchema>;
async function request(
  path: string,
  googleToken: string,
  operation: ErrorOperation,
  init: RequestInit = {},
): Promise<unknown> {
  if (!googleToken)
    throw new Error("Conecte sua conta Google para usar o plano.");
  let response: Response;
  let sessionToken: string;
  const source = operation === "photo_analyze" ? "photo" : "billing";
  try {
    sessionToken = await sessionAccessToken();
  } catch (cause) {
    if (cause instanceof Error && cause.message.startsWith("Conecte"))
      throw cause;
    reportClientError(source, "network_failed", operation);
    throw new Error(
      "Não foi possível conectar ao serviço do plano. Tente novamente mais tarde.",
      { cause },
    );
  }
  try {
    response = await fetch(API + path, {
      ...init,
      credentials: "include",
      headers: {
        authorization: `Bearer ${sessionToken}`,
        "content-type": "application/json",
        ...init.headers,
      },
      cache: "no-store",
    });
  } catch {
    reportClientError(source, "network_failed", operation);
    throw new Error(
      "Não foi possível conectar ao serviço do plano. Tente novamente mais tarde.",
    );
  }
  if (response.status === 404)
    throw new Error("O plano de IA ainda não está disponível. Volte em breve.");
  const payload: unknown = await response.json().catch(() => {
    reportClientError(source, "response_invalid", operation, response.status);
    return {};
  });
  if (!response.ok) {
    if (response.status >= 500)
      reportClientError(
        source,
        operation === "photo_analyze"
          ? "photo_analysis_failed"
          : "billing_failed",
        operation,
        response.status,
      );
    const message = z.object({ error: z.string() }).safeParse(payload)
      .data?.error;
    throw new Error(message || "Não foi possível acessar o plano agora.");
  }
  return payload;
}

export async function getPlanStatus(googleToken: string): Promise<PlanStatus> {
  const parsed = statusSchema.safeParse(
    await request("/api/billing/status", googleToken, "billing_status"),
  );
  if (!parsed.success) {
    reportClientError("billing", "response_invalid", "billing_status", 200);
    throw parsed.error;
  }
  return parsed.data;
}

export async function getTrialConfig(): Promise<boolean> {
  const response = await fetch(API + "/api/ai/trial-config", {
    cache: "no-store",
  }).catch((cause: unknown) => {
    reportClientError("billing", "network_failed", "billing_trial_config");
    throw cause;
  });
  if (!response.ok) {
    if (response.status >= 500)
      reportClientError(
        "billing",
        "billing_failed",
        "billing_trial_config",
        response.status,
      );
    throw new Error("Teste grátis indisponível.");
  }
  const payload: unknown = await response.json().catch(() => null);
  const parsed = z.object({ trialEnabled: z.boolean() }).safeParse(payload);
  if (!parsed.success) {
    reportClientError(
      "billing",
      "response_invalid",
      "billing_trial_config",
      response.status,
    );
    throw parsed.error;
  }
  return parsed.data.trialEnabled;
}
export async function createPlanCheckout(googleToken: string): Promise<string> {
  const parsed = z.object({ url: z.string().url() }).safeParse(
    await request("/api/billing/checkout", googleToken, "billing_checkout", {
      method: "POST",
    }),
  );
  if (!parsed.success) {
    reportClientError("billing", "response_invalid", "billing_checkout", 200);
    throw parsed.error;
  }
  const value = parsed.data;
  const url = new URL(value.url);
  const isAsaasCheckout =
    ["asaas.com", "sandbox.asaas.com"].includes(url.hostname) &&
    url.protocol === "https:";
  const isLocalCheckout = LOCAL_MODE && url.origin === API;
  if (!isAsaasCheckout && !isLocalCheckout) {
    reportClientError("billing", "response_invalid", "billing_checkout", 200);
    throw new Error("Endereço de pagamento inválido.");
  }
  return value.url;
}
export async function analyzeWithPlan(
  googleToken: string,
  image: PreparedImage,
): Promise<MealAnalysis> {
  const parsed = analysisSchema.safeParse(
    await request("/api/ai/meal", googleToken, "photo_analyze", {
      method: "POST",
      body: JSON.stringify({ image: image.base64 }),
    }),
  );
  if (!parsed.success) {
    reportClientError("photo", "response_invalid", "photo_parse", 200);
    throw parsed.error;
  }
  return parsed.data;
}
export async function cancelPlan(googleToken: string): Promise<PlanStatus> {
  const result = statusSchema.safeParse(
    await request("/api/billing/cancel", googleToken, "billing_cancel", {
      method: "POST",
    }),
  );
  if (!result.success) {
    reportClientError("billing", "response_invalid", "billing_cancel", 200);
    throw result.error;
  }
  return result.data;
}
