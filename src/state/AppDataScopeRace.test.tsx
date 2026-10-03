import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { emptyData } from "../domain/data";
import { forgetGoogleAccount } from "../sync/google";
import { loadDataState } from "../storage/indexedDb";
import { AppDataProvider, useAppData } from "./AppDataContext";

vi.mock("../storage/indexedDb", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../storage/indexedDb")>();
  return {
    ...actual,
    prepareAccountScopes: vi.fn().mockResolvedValue(undefined),
    loadDataState: vi.fn(),
  };
});

beforeEach(() => {
  localStorage.clear();
  forgetGoogleAccount();
  vi.mocked(loadDataState).mockReset();
});

it("ignora a leitura inicial do visitante que termina após trocar para a conta", async () => {
  const guest = emptyData();
  guest.profile.displayName = "Visitante";
  const account = emptyData();
  account.profile.displayName = "Conta";
  let resolveGuest!: (value: { data: typeof guest; epoch: string }) => void;
  const guestRead = new Promise<{ data: typeof guest; epoch: string }>(
    (resolve) => {
      resolveGuest = resolve;
    },
  );
  vi.mocked(loadDataState).mockImplementation((scope) =>
    scope === null
      ? guestRead
      : Promise.resolve({ data: account, epoch: "account-epoch" }),
  );

  function Probe() {
    const { data, switchScope } = useAppData();
    return (
      <>
        <span>{data.profile.displayName || "Vazio"}</span>
        <button onClick={() => void switchScope("test-account")}>Entrar</button>
      </>
    );
  }

  render(
    <AppDataProvider>
      <Probe />
    </AppDataProvider>,
  );
  await waitFor(() => expect(loadDataState).toHaveBeenCalledWith(null));
  await userEvent.setup().click(screen.getByRole("button", { name: "Entrar" }));
  await screen.findByText("Conta");
  await act(async () => resolveGuest({ data: guest, epoch: "guest-epoch" }));
  expect(screen.getByText("Conta")).toBeInTheDocument();
  expect(screen.queryByText("Visitante")).not.toBeInTheDocument();
});
