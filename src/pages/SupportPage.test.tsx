import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { SupportPage } from "./SupportPage";
import { PIX_COPY_PASTE, PIX_KEY } from "../support/pix";

afterEach(() => vi.unstubAllGlobals());

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
});
