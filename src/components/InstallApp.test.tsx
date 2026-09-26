import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InstallPrompt } from "./InstallApp";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("mobile install invitation", () => {
  it("appears after the delay and stays dismissed in this browser", () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({ matches: query === "(max-width: 700px)" })),
    );
    const { unmount } = render(
      <MemoryRouter>
        <InstallPrompt enabled delayMs={1800} />
      </MemoryRouter>,
    );
    expect(
      screen.queryByLabelText("Instalar Biorotina"),
    ).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1800));
    expect(screen.getByLabelText("Instalar Biorotina")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Ver passo a passo" }),
    ).toHaveAttribute("href", "/instalar");
    fireEvent.click(
      screen.getByRole("button", { name: "Dispensar convite para instalar" }),
    );
    expect(
      screen.queryByLabelText("Instalar Biorotina"),
    ).not.toBeInTheDocument();
    expect(localStorage.getItem("biorotina.install.dismissed.v1")).toBe("1");
    unmount();
    render(
      <MemoryRouter>
        <InstallPrompt enabled delayMs={1800} />
      </MemoryRouter>,
    );
    act(() => vi.advanceTimersByTime(1800));
    expect(
      screen.queryByLabelText("Instalar Biorotina"),
    ).not.toBeInTheDocument();
  });

  it("does not interrupt the initial privacy choice", () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({ matches: query === "(max-width: 700px)" })),
    );
    render(
      <MemoryRouter>
        <InstallPrompt enabled={false} delayMs={1800} />
      </MemoryRouter>,
    );
    act(() => vi.advanceTimersByTime(2000));
    expect(
      screen.queryByLabelText("Instalar Biorotina"),
    ).not.toBeInTheDocument();
  });

  it("waits for a priority onboarding decision before starting its delay", () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({ matches: query === "(max-width: 700px)" })),
    );
    const { rerender } = render(
      <MemoryRouter>
        <InstallPrompt enabled delayMs={10_000} blocked />
      </MemoryRouter>,
    );
    act(() => vi.advanceTimersByTime(20_000));
    expect(
      screen.queryByLabelText("Instalar Biorotina"),
    ).not.toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <InstallPrompt enabled delayMs={10_000} blocked={false} />
      </MemoryRouter>,
    );
    act(() => vi.advanceTimersByTime(9_999));
    expect(
      screen.queryByLabelText("Instalar Biorotina"),
    ).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByLabelText("Instalar Biorotina")).toBeInTheDocument();
  });
});
