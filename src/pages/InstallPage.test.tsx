import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { InstallPage } from "./InstallPage";

describe("guia de instalação", () => {
  it("mostra os passos do iPhone e do Android e como ativar avisos", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <InstallPage />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: "iPhone" }));
    expect(screen.getByText("Abra a Biorotina no Safari")).toBeInTheDocument();
    expect(
      screen.getByText(/Deixe “Abrir como App” ligado/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/sem a barra de endereço do navegador/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Android" }));
    expect(screen.getByText("Abra a Biorotina no Chrome")).toBeInTheDocument();
    expect(
      screen.getByText(/“Adicionar à tela inicial” e “Instalar”/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Configurações" })).toHaveAttribute(
      "href",
      "/configuracoes",
    );
    expect(screen.getByRole("link", { name: "Hidratação" })).toHaveAttribute(
      "href",
      "/hidratacao",
    );
  });
});
