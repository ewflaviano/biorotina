import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { SupportPage } from "./SupportPage";
import { PIX_COPY_PASTE, PIX_KEY } from "../support/pix";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("support page", () => {
  it("shows the provided Pix recipient, QR and copy-paste code", () => {
    render(
      <MemoryRouter>
        <SupportPage />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("heading", { name: "Apoie a Biorotina" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Inovaprog Desenvolvimento")).toBeInTheDocument();
    expect(screen.getByText("CNPJ 64.420.635/0001-20")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /QR Code Pix/ })).toHaveAttribute(
      "src",
      "/pix-biorotina.svg",
    );
    expect(screen.getByLabelText("Pix copia e cola")).toHaveValue(
      PIX_COPY_PASTE,
    );
    expect(screen.getByText(PIX_KEY)).toBeInTheDocument();
    expect(
      screen
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual([
      "Se o app ajuda você, considere apoiar o projeto.",
      "Apoiar com Pix",
      "Sua opinião também ajuda",
    ]);
  });

  it("copies the complete code", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(
      <MemoryRouter>
        <SupportPage />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: "Copiar código Pix" }));
    expect(writeText).toHaveBeenCalledWith(PIX_COPY_PASTE);
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Cole o código",
    );
  });

  it("sends only the message the person typed and confirms delivery", async () => {
    const user = userEvent.setup();
    vi.stubEnv("VITE_PUSH_API_URL", "https://api.example.test");
    const send = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", send);
    render(
      <MemoryRouter>
        <SupportPage />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("button", { name: "Enviar feedback" }),
    ).toBeDisabled();

    const feedback = "A tela de água ficou ótima & simples.";
    await user.type(
      screen.getByRole("textbox", { name: "Sua mensagem" }),
      feedback,
    );

    await user.click(screen.getByRole("button", { name: "Enviar feedback" }));
    expect(send).toHaveBeenCalledWith("https://api.example.test/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: feedback }),
      signal: expect.any(AbortSignal),
    });
    expect(
      await screen.findByText("Mensagem enviada. Obrigado pela ajuda!"),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Sua mensagem" })).toHaveValue(
      "",
    );
  });

  it("keeps the message when sending fails", async () => {
    const user = userEvent.setup();
    vi.stubEnv("VITE_PUSH_API_URL", "https://api.example.test");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503 }),
    );
    render(
      <MemoryRouter>
        <SupportPage />
      </MemoryRouter>,
    );
    await user.type(
      screen.getByRole("textbox", { name: "Sua mensagem" }),
      "Minha ideia",
    );
    await user.click(screen.getByRole("button", { name: "Enviar feedback" }));
    expect(
      await screen.findByText(/Não foi possível enviar agora/),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Sua mensagem" })).toHaveValue(
      "Minha ideia",
    );
  });

  it("offers a copy fallback for the feedback", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(
      <MemoryRouter>
        <SupportPage />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("button", { name: "Copiar mensagem" }),
    ).toBeDisabled();
    await user.type(
      screen.getByRole("textbox", { name: "Sua mensagem" }),
      "Minha sugestão",
    );
    await user.click(screen.getByRole("button", { name: "Copiar mensagem" }));
    expect(writeText).toHaveBeenCalledWith("Minha sugestão");
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Mensagem copiada",
    );
  });
});
