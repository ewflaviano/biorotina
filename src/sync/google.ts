import {
  parseBackup,
  validateAnthropometrics,
  type AppData,
} from "../domain/data";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const IDENTITY_SCOPES = "openid email";
const DRIVE_SCOPES = `${IDENTITY_SCOPES} ${DRIVE_SCOPE}`;
const BACKUP_NAME = "biorotina-backup.json";
const MAX_BACKUP_BYTES = 10_000_000;
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const ACCOUNT_STORAGE_KEY = "biorotina:google-account";
const API = (import.meta.env.VITE_PUSH_API_URL || "").replace(/\/$/, "");

interface CodeClient {
  requestCode(): void;
}

interface GoogleIdentity {
  accounts: {
    oauth2: {
      initCodeClient(options: {
        client_id: string;
        scope: string;
        ux_mode: "popup";
        callback: (response: { code?: string; error?: string }) => void;
        error_callback: () => void;
      }): CodeClient;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

let scriptPromise: Promise<void> | null = null;

export function preloadGoogleIdentity(): Promise<void> {
  if (window.google?.accounts.oauth2) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () =>
        reject(new Error("Não foi possível carregar o login Google."));
      document.head.append(script);
    }).catch((error: unknown) => {
      scriptPromise = null;
      throw error;
    });
  }
  return scriptPromise;
}

export interface GoogleAccount {
  id: string;
  email: string;
  token: string;
  expiresAt: number;
  // Contas salvas antes da separação já tinham autorização para o Drive.
  driveAuthorized?: boolean;
}

export class GoogleReconnectRequiredError extends Error {}

export class GoogleDriveHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

let connectedAccount: GoogleAccount | null = null;

function readStoredAccount(): GoogleAccount | null {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(ACCOUNT_STORAGE_KEY) || "null",
    );
    if (
      parsed &&
      typeof parsed === "object" &&
      "id" in parsed &&
      typeof parsed.id === "string" &&
      "email" in parsed &&
      typeof parsed.email === "string" &&
      "expiresAt" in parsed &&
      typeof parsed.expiresAt === "number"
    ) {
      const account = parsed as Omit<GoogleAccount, "token"> & {
        token?: string;
      };
      if (account.token) {
        const safeAccount = { ...account };
        delete safeAccount.token;
        localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(safeAccount));
      }
      return { ...account, token: account.token ?? "" };
    }
  } catch {
    // Sessões privadas podem bloquear o armazenamento; a conexão segue em memória.
  }
  return null;
}

export function forgetGoogleAccount(): void {
  connectedAccount = null;
  try {
    localStorage.removeItem(ACCOUNT_STORAGE_KEY);
  } catch {
    // Ignora armazenamento indisponível.
  }
}

export function currentGoogleAccount(): GoogleAccount | null {
  if (!connectedAccount) connectedAccount = readStoredAccount();
  if (
    connectedAccount &&
    (!connectedAccount.token ||
      connectedAccount.expiresAt <= Date.now() + 60_000)
  )
    connectedAccount = null;
  return connectedAccount;
}

export function hasRememberedGoogleAccount(): boolean {
  return readStoredAccount() !== null;
}

export function rememberedGoogleAccountId(): string | null {
  return currentGoogleAccount()?.id ?? null;
}

export function rememberGoogleAccount(account: GoogleAccount): void {
  connectedAccount = account;
  try {
    const remembered: Partial<GoogleAccount> = { ...account };
    delete remembered.token;
    localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(remembered));
  } catch {
    // O login ainda funciona durante esta visita sem armazenamento persistente.
  }
}

export function connectGoogle(clientId: string): Promise<GoogleAccount> {
  return authorizeCode(clientId, `${IDENTITY_SCOPES}`, null);
}

async function authorizeCode(
  clientId: string,
  scope: string,
  expected: GoogleAccount | null,
): Promise<GoogleAccount> {
  await preloadGoogleIdentity();
  const oauth2 = window.google?.accounts.oauth2;
  if (!oauth2)
    throw new Error("O login Google não está disponível neste navegador.");
  const code = await new Promise<string>((resolve, reject) => {
    try {
      oauth2
        .initCodeClient({
          client_id: clientId,
          scope,
          ux_mode: "popup",
          callback: (response) =>
            response.code
              ? resolve(response.code)
              : reject(new Error("Não foi possível conectar ao Google.")),
          error_callback: () =>
            reject(
              new Error("A janela do Google foi fechada. Tente novamente."),
            ),
        })
        .requestCode();
    } catch (cause) {
      reject(cause);
    }
  });
  const response = await fetch(`${API}/api/auth/google/exchange`, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: JSON.stringify({ code }),
  });
  if (!response.ok) {
    const failure: unknown = await response.json().catch(() => null);
    const message =
      failure &&
      typeof failure === "object" &&
      "error" in failure &&
      typeof failure.error === "string"
        ? failure.error
        : "Não foi possível manter a conexão com o Google. Tente conectar novamente.";
    throw new Error(message);
  }
  const payload: unknown = await response.json();
  if (
    !payload ||
    typeof payload !== "object" ||
    !("id" in payload) ||
    typeof payload.id !== "string" ||
    !("email" in payload) ||
    typeof payload.email !== "string" ||
    !("accessToken" in payload) ||
    typeof payload.accessToken !== "string" ||
    !("expiresIn" in payload) ||
    typeof payload.expiresIn !== "number" ||
    !("driveAuthorized" in payload) ||
    typeof payload.driveAuthorized !== "boolean"
  )
    throw new Error("Resposta de conexão inválida.");
  if (expected && payload.id !== expected.id)
    throw new Error("Selecione a mesma conta Google para ativar o Drive.");
  return {
    id: payload.id,
    email: payload.email,
    token: payload.accessToken,
    expiresAt: Date.now() + payload.expiresIn * 1000,
    driveAuthorized: payload.driveAuthorized,
  };
}

export async function authorizeGoogleDrive(
  clientId: string,
  account: GoogleAccount,
): Promise<GoogleAccount> {
  return authorizeCode(clientId, DRIVE_SCOPES, account);
}

export async function renewGoogle(
  _clientId: string,
): Promise<GoogleAccount | null> {
  void _clientId;
  const previous = readStoredAccount();
  if (!previous) return null;
  if (previous.driveAuthorized === false) return previous;
  const response = await fetch(`${API}/api/auth/drive-token`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Conecte novamente sua conta Google.");
  const result: unknown = await response.json();
  if (
    !result ||
    typeof result !== "object" ||
    !("accessToken" in result) ||
    typeof result.accessToken !== "string" ||
    !("expiresIn" in result) ||
    typeof result.expiresIn !== "number"
  )
    throw new Error("Resposta de sessão inválida.");
  return {
    ...previous,
    token: result.accessToken,
    expiresAt: Date.now() + result.expiresIn * 1000,
  };
}

/** Reuses an existing grant after a user gesture, without asking for it twice. */
export async function reconnectGoogle(
  clientId: string,
  currentAccount?: GoogleAccount,
): Promise<GoogleAccount> {
  const previous = currentAccount ?? readStoredAccount();
  if (!previous) throw new Error("Não há uma conta Google para reconectar.");
  return authorizeGoogleDrive(clientId, previous);
}

export function disconnectGoogle(_account: GoogleAccount): void {
  void _account;
  forgetGoogleAccount();
  void fetch(`${API}/api/auth/logout`, {
    method: "POST",
    credentials: "include",
    headers: { "X-Requested-With": "XMLHttpRequest" },
  }).catch(() => {
    // Encerrar a sessão local não depende de a API estar disponível.
  });
}

export interface DriveSnapshot {
  id: string;
  createdTime: string;
  size?: string;
}

async function authorizedFetch(
  token: string,
  url: string,
  init: RequestInit = {},
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  const response = await fetcher(url, { ...init, headers });
  if (response.status === 401)
    throw new GoogleReconnectRequiredError(
      "A conexão com o Google expirou. Conecte novamente.",
    );
  if (response.status === 403)
    throw new GoogleDriveHttpError(
      "O Google Drive recusou o acesso. Confira a permissão do app.",
      response.status,
    );
  if (!response.ok)
    throw new GoogleDriveHttpError(
      `Falha ao acessar o Google Drive (${response.status}).`,
      response.status,
    );
  return response;
}

export async function listDriveSnapshots(
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<DriveSnapshot[]> {
  const snapshots: DriveSnapshot[] = [];
  let pageToken: string | undefined;
  do {
    const query = new URLSearchParams({
      spaces: "appDataFolder",
      q: `name = '${BACKUP_NAME}' and 'appDataFolder' in parents and trashed = false`,
      fields: "nextPageToken,files(id,name,createdTime,size)",
      pageSize: "1000",
    });
    if (pageToken) query.set("pageToken", pageToken);
    const response = await authorizedFetch(
      token,
      `${DRIVE_API}/files?${query}`,
      {},
      fetcher,
    );
    const page: {
      nextPageToken?: string;
      files?: Array<DriveSnapshot & { name: string }>;
    } = await response.json();
    snapshots.push(
      ...(page.files ?? [])
        .filter(
          (file) => file.name === BACKUP_NAME && file.id && file.createdTime,
        )
        .map(({ id, createdTime, size }) => ({ id, createdTime, size })),
    );
    pageToken = page.nextPageToken;
  } while (pageToken);
  return snapshots.sort(
    (a, b) =>
      b.createdTime.localeCompare(a.createdTime) || b.id.localeCompare(a.id),
  );
}

export async function downloadDriveSnapshot(
  token: string,
  snapshot: DriveSnapshot,
  fetcher: typeof fetch = fetch,
): Promise<AppData> {
  if (Number(snapshot.size ?? 0) > MAX_BACKUP_BYTES)
    throw new Error(
      "O backup no Drive ultrapassa o limite de importação de 10 MB.",
    );
  const response = await authorizedFetch(
    token,
    `${DRIVE_API}/files/${encodeURIComponent(snapshot.id)}?alt=media`,
    {},
    fetcher,
  );
  const data = parseBackup(await response.json());
  validateAnthropometrics(data);
  return data;
}

export async function uploadDriveSnapshot(
  token: string,
  data: AppData,
  fetcher: typeof fetch = fetch,
): Promise<DriveSnapshot> {
  const metadata = {
    name: BACKUP_NAME,
    mimeType: "application/json",
    parents: ["appDataFolder"],
    description: "Backup privado da Biorotina",
  };
  const content = JSON.stringify(data);
  const size = new TextEncoder().encode(content).byteLength;
  if (size > MAX_BACKUP_BYTES)
    throw new Error(
      "O backup do Drive não foi enviado porque excede 10 MB. Seus registros continuam neste navegador.",
    );
  let response: Response;
  if (size <= 5_000_000) {
    const boundary = `biorotina-${crypto.randomUUID()}`;
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n${content}\r\n--${boundary}--`;
    response = await authorizedFetch(
      token,
      `${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id,createdTime,size`,
      {
        method: "POST",
        headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
        body,
      },
      fetcher,
    );
  } else {
    const start = await authorizedFetch(
      token,
      `${DRIVE_UPLOAD}/files?uploadType=resumable&fields=id,createdTime,size`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": "application/json",
          "X-Upload-Content-Length": String(size),
        },
        body: JSON.stringify(metadata),
      },
      fetcher,
    );
    const uploadUrl = start.headers.get("Location");
    if (!uploadUrl || !uploadUrl.startsWith("https://www.googleapis.com/"))
      throw new Error("O Drive não iniciou o envio do backup.");
    response = await authorizedFetch(
      token,
      uploadUrl,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: content,
      },
      fetcher,
    );
  }
  const saved: DriveSnapshot = await response.json();
  if (!saved.id || !saved.createdTime)
    throw new Error("O Drive não confirmou o backup enviado.");
  return saved;
}

export async function contentHash(data: AppData): Promise<string> {
  const content = Object.fromEntries(
    Object.entries(data).filter(
      ([key]) => key !== "revision" && key !== "updatedAt",
    ),
  );
  const bytes = new TextEncoder().encode(JSON.stringify(content));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
