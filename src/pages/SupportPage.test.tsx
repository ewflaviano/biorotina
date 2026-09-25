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

  it("copies the contact email without sending a request", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    const fetch = vi.fn();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    vi.stubGlobal("fetch", fetch);
    render(
      <MemoryRouter>
        <SupportPage />
      </MemoryRouter>,
    );
    expect(
      screen.queryByRole("textbox", { name: "Sua mensagem" }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: "Copiar e-mail ewanderson.flaviano@gmail.com",
      }),
    );
    expect(writeText).toHaveBeenCalledWith("ewanderson.flaviano@gmail.com");
    expect(fetch).not.toHaveBeenCalled();
    expect(await screen.findByRole("status")).toHaveTextContent(
      "E-mail copiado",
    );
  });

  it("keeps the address visible when automatic copy is unavailable", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    render(
      <MemoryRouter>
        <SupportPage />
      </MemoryRouter>,
    );
    await user.click(
      screen.getByRole("button", {
        name: "Copiar e-mail ewanderson.flaviano@gmail.com",
      }),
    );
    expect(
      screen.getByRole("button", {
        name: "Copiar e-mail ewanderson.flaviano@gmail.com",
      }),
    ).toHaveTextContent("ewanderson.flaviano@gmail.com");
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Não foi possível copiar automaticamente",
    );
  });
});
