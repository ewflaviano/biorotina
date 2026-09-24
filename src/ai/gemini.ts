import { z } from "zod";

export const GEMINI_MODEL = "gemini-3.8-flash";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const MAX_FILE_BYTES = 15_000_000;
const MAX_IMAGE_SIDE = 768;
const TARGET_IMAGE_BYTES = 350_000;

const analysisSchema = z
  .object({
    description: z.string().trim().min(1).max(120),
    foods: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(100),
            amount: z.string().trim().min(1).max(80),
            caloriesKcal: z.number().finite().nonnegative().max(5_000),
          })
          .strict(),
      )
      .min(1)
      .max(30),
  })
  .strict();

export type MealAnalysis = z.infer<typeof analysisSchema>;

const responseSchema = {
  type: "object",
  properties: {
    description: {
      type: "string",
      description: "Nome curto da refeição em português do Brasil",
    },
    foods: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Alimento visível" },
          amount: {
            type: "string",
            description: "Porção aproximada em gramas ou medida caseira",
          },
          caloriesKcal: {
            type: "number",
            description: "Calorias estimadas da porção",
          },
        },
        required: ["name", "amount", "caloriesKcal"],
      },
    },
  },
  required: ["description", "foods"],
};

const prompt =
  "Analise apenas os alimentos e bebidas visíveis nesta foto de refeição. " +
  "Responda em português do Brasil com JSON. Para cada alimento visível, dê " +
  "um nome simples, uma porção aproximada (gramas ou medida caseira) e as " +
  "calorias aproximadas dessa porção. Não invente ingredientes invisíveis. " +
  "Se a foto não permitir identificar uma refeição, retorne foods vazio. " +
  "Não faça recomendações médicas ou nutricionais. A pessoa vai revisar tudo.";

export interface PreparedImage {
  dataUrl: string;
  base64: string;
}

export async function prepareMealImage(file: File): Promise<PreparedImage> {
  if (file.size > MAX_FILE_BYTES)
    throw new Error("A imagem é grande demais. Escolha uma foto de até 15 MB.");
  if (
    !file.type.startsWith("image/") &&
    !/\.(heic|heif|jpe?g|png|webp)$/i.test(file.name)
  )
    throw new Error("Escolha uma foto da refeição.");

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(new Error("Não foi possível abrir esta foto."));
      image.src = objectUrl;
    });
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!width || !height || width * height > 50_000_000)
      throw new Error("A foto é grande demais para analisar neste aparelho.");
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("Não foi possível preparar a foto neste navegador.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    let dataUrl = canvas.toDataURL("image/jpeg", 0.72);
    for (const quality of [0.6, 0.48, 0.36]) {
      if (dataUrl.length * 0.75 <= TARGET_IMAGE_BYTES) break;
      dataUrl = canvas.toDataURL("image/jpeg", quality);
    }
    for (
      let attempt = 0;
      attempt < 4 && dataUrl.length * 0.75 > TARGET_IMAGE_BYTES;
      attempt++
    ) {
      canvas.width = Math.max(1, Math.round(canvas.width * 0.8));
      canvas.height = Math.max(1, Math.round(canvas.height * 0.8));
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      dataUrl = canvas.toDataURL("image/jpeg", 0.48);
    }
    if (dataUrl.length * 0.75 > TARGET_IMAGE_BYTES)
      throw new Error(
        "Esta foto ficou grande demais para analisar. Escolha outra imagem.",
      );
    if (!dataUrl.startsWith("data:image/jpeg;base64,"))
      throw new Error("Não foi possível preparar a foto neste navegador.");
    return { dataUrl, base64: dataUrl.slice("data:image/jpeg;base64,".length) };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function analyzeMealImage(
  apiKey: string,
  image: PreparedImage,
  fetcher: typeof fetch = fetch,
): Promise<MealAnalysis> {
  if (!apiKey.trim())
    throw new Error("Adicione sua chave Gemini nas Configurações.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  let response: Response;
  try {
    response = await fetcher(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey.trim(),
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inline_data: { mime_type: "image/jpeg", data: image.base64 } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 2_048,
          thinkingConfig: { thinkingLevel: "LOW" },
          responseFormat: {
            text: { mimeType: "APPLICATION_JSON", schema: responseSchema },
          },
        },
      }),
      signal: controller.signal,
    });
  } catch (cause) {
    if (controller.signal.aborted)
      throw new Error("A análise demorou demais. Tente novamente.", { cause });
    throw new Error(
      "Não foi possível falar com o Gemini. Confira sua conexão.",
      { cause },
    );
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 400)
    throw new Error(
      "O Gemini recusou o formato da solicitação. Atualize a Biorotina e tente novamente.",
    );
  if (response.status === 401 || response.status === 403)
    throw new Error(
      "O Gemini não aceitou a chave ou a solicitação. Confira sua chave no Google AI Studio.",
    );
  if (response.status === 429)
    throw new Error(
      "O limite de uso da sua chave Gemini foi atingido. Tente mais tarde.",
    );
  if (!response.ok)
    throw new Error(
      "O Gemini não conseguiu analisar esta foto agora. Tente novamente.",
    );

  const payload: unknown = await response.json().catch(() => null);
  const text = z
    .object({
      candidates: z.array(
        z.object({
          content: z.object({
            parts: z.array(z.object({ text: z.string().optional() })),
          }),
        }),
      ),
    })
    .safeParse(payload)
    .data?.candidates[0]?.content.parts.map((part) => part.text ?? "")
    .join("");
  if (!text)
    throw new Error(
      "O Gemini não identificou alimentos nesta foto. Tente outra imagem.",
    );
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(
      "A sugestão veio incompleta. Tente outra foto ou registre manualmente.",
    );
  }
  const parsed = analysisSchema.safeParse(json);
  if (!parsed.success)
    throw new Error(
      "A sugestão veio incompleta. Tente outra foto ou registre manualmente.",
    );
  return parsed.data;
}
