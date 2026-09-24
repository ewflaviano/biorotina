import { describe, expect, it, vi } from "vitest";
import { analyzeMealImage, prepareMealImage } from "./gemini";

const image = { dataUrl: "data:image/jpeg;base64,Zm9v", base64: "Zm9v" };

describe("análise de refeição com Gemini", () => {
  it("envia a imagem somente ao chamar a análise e interpreta a lista estruturada", async () => {
    const fetcher = vi.fn(async (_url: string, options: RequestInit) => {
      expect(options.headers).toMatchObject({
        "x-goog-api-key": "minha-chave",
      });
      const body = JSON.parse(String(options.body));
      expect(body.contents[0].parts[1].inline_data.data).toBe("Zm9v");
      expect(body.generationConfig.responseFormat.text.mimeType).toBe(
        "APPLICATION_JSON",
      );
      expect(body.generationConfig.thinkingConfig.thinkingLevel).toBe("LOW");
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      description: "Almoço",
                      foods: [
                        { name: "Arroz", amount: "100 g", caloriesKcal: 130 },
                      ],
                    }),
                  },
                ],
              },
            },
          ],
        }),
        { status: 200 },
      );
    });
    expect(fetcher).not.toHaveBeenCalled();
    const result = await analyzeMealImage(
      " minha-chave ",
      image,
      fetcher as unknown as typeof fetch,
    );
    expect(result.foods).toEqual([
      { name: "Arroz", amount: "100 g", caloriesKcal: 130 },
    ]);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("não envia a imagem sem chave e mostra erros de cota sem vazar detalhes", async () => {
    const fetcher = vi.fn(async () => new Response("{}", { status: 429 }));
    await expect(
      analyzeMealImage("", image, fetcher as typeof fetch),
    ).rejects.toThrow("Adicione sua chave");
    expect(fetcher).not.toHaveBeenCalled();
    await expect(
      analyzeMealImage("chave", image, fetcher as typeof fetch),
    ).rejects.toThrow("limite de uso");
  });

  it("distingue um pedido inválido de uma chave recusada", async () => {
    const invalidRequest = vi.fn(
      async () => new Response("{}", { status: 400 }),
    );
    await expect(
      analyzeMealImage("chave", image, invalidRequest as typeof fetch),
    ).rejects.toThrow("formato da solicitação");
    const invalidKey = vi.fn(async () => new Response("{}", { status: 403 }));
    await expect(
      analyzeMealImage("chave", image, invalidKey as typeof fetch),
    ).rejects.toThrow("não aceitou a chave");
  });

  it("rejeita sugestões malformadas sem preencher o diário", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: "{inválido" }] } }],
          }),
          { status: 200 },
        ),
    );
    await expect(
      analyzeMealImage("chave", image, fetcher as typeof fetch),
    ).rejects.toThrow("sugestão veio incompleta");
  });

  it("recusa arquivos grandes antes de preparar ou enviar uma imagem", async () => {
    const file = new File(["x"], "prato.jpg", { type: "image/jpeg" });
    Object.defineProperty(file, "size", { value: 15_000_001 });
    await expect(prepareMealImage(file)).rejects.toThrow("15 MB");
  });

  it("reduz a resolução antes de criar o JPEG enviado", async () => {
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage: vi.fn() })),
      toDataURL: vi.fn(() => "data:image/jpeg;base64,Zm9v"),
    };
    const createElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) =>
      tag === "canvas"
        ? canvas
        : createElement(tag)) as typeof document.createElement);
    vi.stubGlobal(
      "Image",
      class {
        naturalWidth = 4032;
        naturalHeight = 3024;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_url: string) {
          queueMicrotask(() => this.onload?.());
        }
      },
    );
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:test"),
      revokeObjectURL: vi.fn(),
    });
    const result = await prepareMealImage(
      new File(["image"], "meal.jpg", { type: "image/jpeg" }),
    );
    expect([canvas.width, canvas.height]).toEqual([768, 576]);
    expect(result.base64).toBe("Zm9v");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test");
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
});
