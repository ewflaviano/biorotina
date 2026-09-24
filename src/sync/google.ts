import {
  parseBackup,
  validateAnthropometrics,
  type AppData,
} from "../domain/data";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const SCOPES = `openid email ${DRIVE_SCOPE}`;
const BACKUP_NAME = "biorotina-backup.json";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const ACCOUNT_STORAGE_KEY = "biorotina:google-account";

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
}

interface TokenClient {
  requestAccessToken(options: { prompt: string }): void;
}

interface GoogleIdentity {
  accounts: {
    oauth2: {
      initTokenClient(options: {
        client_id: string;
        scope: string;
        login_hint?: string;
        callback: (response: TokenResponse) => void;
        error_callback: () => void;
      }): TokenClient;
      revoke(token: string, callback: () => void): void;
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
      "token" in parsed &&
      typeof parsed.token === "string" &&
      "expiresAt" in parsed &&
      typeof parsed.expiresAt === "number"
    )
      return parsed as GoogleAccount;
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
  if (connectedAccount && connectedAccount.expiresAt <= Date.now() + 60_000)
    connectedAccount = null;
  return connectedAccount;
}

export function hasRememberedGoogleAccount(): boolean {
  return readStoredAccount() !== null;
}

export function rememberGoogleAccount(account: GoogleAccount): void {
  connectedAccount = account;
  try {
    localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(account));
  } catch {
    // O login ainda funciona durante esta visita sem armazenamento persistente.
  }
}

async function requestGoogleAccount(
  clientId: string,
  prompt: "select_account" | "none",
  loginHint?: string,
): Promise<GoogleAccount> {
  await preloadGoogleIdentity();
  const oauth2 = window.google?.accounts.oauth2;
  if (!oauth2)
    throw new Error("O login Google não está disponível neste navegador.");
  const token = await new Promise<TokenResponse>((resolve, reject) => {
    const timeout =
      prompt === "none"
        ? window.setTimeout(
            () =>
              reject(
                new Error("Não foi possível renovar o acesso sem interação."),
              ),
            10_000,
          )
        : undefined;
    const finish = (action: () => void) => {
      window.clearTimeout(timeout);
      action();
    };
    try {
      const client = oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        login_hint: loginHint,
        callback: (response) =>
          finish(() =>
            response.error
              ? reject(
                  new Error(
                    "A conexão com o Google foi cancelada ou recusada.",
                  ),
                )
              : resolve(response),
          ),
        error_callback: () =>
          finish(() =>
            reject(
              new Error(
                "A janela de login foi fechada. Tente conectar novamente.",
              ),
            ),
          ),
      });
      client.requestAccessToken({ prompt });
    } catch (cause) {
      finish(() => reject(cause));
    }
  });
  if (!token.access_token || !token.scope?.split(" ").includes(DRIVE_SCOPE)) {
    throw new Error("Autorize o acesso à área privada de backups do Drive.");
  }
  const response = await fetch(
    "https://openidconnect.googleapis.com/v1/userinfo",
    {
      headers: { Authorization: `Bearer ${token.access_token}` },
    },
  );
  if (!response.ok)
    throw new Error("Não foi possível identificar a conta Google.");
  const identity: unknown = await response.json();
  if (
    !identity ||
    typeof identity !== "object" ||
    !("sub" in identity) ||
    typeof identity.sub !== "string" ||
    !("email" in identity) ||
    typeof identity.email !== "string"
  ) {
    throw new Error("A conta Google não retornou uma identificação válida.");
  }
  return {
    id: identity.sub,
    email: identity.email,
    token: token.access_token,
    expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000,
  };
}

export function connectGoogle(clientId: string): Promise<GoogleAccount> {
  return requestGoogleAccount(clientId, "select_account");
}

export async function renewGoogle(
  clientId: string,
): Promise<GoogleAccount | null> {
  const previous = readStoredAccount();
  if (!previous) return null;
  if (previous.expiresAt > Date.now() + 60_000) return previous;
  const renewed = await requestGoogleAccount(clientId, "none", previous.email);
  if (renewed.id !== previous.id)
    throw new Error("Confirme sua conta Google para continuar sincronizando.");
  return renewed;
}

export function disconnectGoogle(account: GoogleAccount): void {
  forgetGoogleAccount();
  window.google?.accounts.oauth2.revoke(account.token, () => undefined);
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
    throw new Error("A conexão com o Google expirou. Conecte novamente.");
  if (response.status === 403)
    throw new Error(
      "O Google Drive recusou o acesso. Confira a permissão do app.",
    );
  if (!response.ok)
    throw new Error(`Falha ao acessar o Google Drive (${response.status}).`);
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
  if (Number(snapshot.size ?? 0) > 10_000_000)
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
