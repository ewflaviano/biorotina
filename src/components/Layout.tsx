import {
  Activity,
  Apple,
  CalendarDays,
  Cloud,
  CloudAlert,
  CloudCheck,
  CloudUpload,
  Droplets,
  HeartPulse,
  HeartHandshake,
  House,
  LayoutGrid,
  Pill,
  Scale,
  Settings2,
  ShieldCheck,
  Sprout,
  X,
} from "lucide-react";
import { useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { InstallPrompt } from "./InstallApp";
import { GuestLoginPrompt } from "./GuestLoginPrompt";
import { GuestMergePrompt } from "./GuestMergePrompt";
import { DrivePermissionPrompt } from "./DrivePermissionPrompt";
import { SyncConflictPrompt } from "./SyncConflictPrompt";
import { useAppData } from "../state/AppDataContext";
import { useDriveSync } from "../sync/DriveSyncContext";
import { AnalyticsConsentBanner } from "../analytics/AnalyticsConsentBanner";
import { useAnalyticsPreference } from "../analytics/useAnalyticsPreference";

const desktopNav = [
  { to: "/", label: "Hoje", mobileLabel: "Hoje", icon: House },
  { to: "/peso", label: "Medidas", mobileLabel: "Medidas", icon: Scale },
  {
    to: "/atividades",
    label: "Atividades",
    mobileLabel: "Atividade",
    icon: Activity,
  },
  {
    to: "/alimentacao",
    label: "Alimentação",
    mobileLabel: "Refeição",
    icon: Apple,
  },
  {
    to: "/medicamentos",
    label: "Medicação",
    mobileLabel: "Medicação",
    icon: Pill,
  },
  {
    to: "/hidratacao",
    label: "Hidratação",
    mobileLabel: "Água",
    icon: Droplets,
  },
  {
    to: "/habitos",
    label: "Hábitos",
    mobileLabel: "Hábitos",
    icon: Sprout,
  },
] as const;

const mobileNav = [
  desktopNav[5],
  desktopNav[4],
  desktopNav[3],
  desktopNav[2],
  { to: "/mais", label: "Mais áreas", mobileLabel: "Mais", icon: LayoutGrid },
] as const;

export function Layout() {
  const { data, undoLabel, undoCount, undoLast, dismissUndo } = useAppData();
  const drive = useDriveSync();
  const analyticsPreference = useAnalyticsPreference();
  const location = useLocation();
  const [undoFailure, setUndoFailure] = useState<{
    label: string;
    count: number;
    message: string;
  } | null>(null);
  const name = data.profile.displayName.trim();
  const undoError =
    undoFailure?.label === undoLabel && undoFailure.count === undoCount
      ? undoFailure.message
      : "";

  async function handleUndo() {
    setUndoFailure(null);
    try {
      await undoLast();
    } catch {
      setUndoFailure({
        label: undoLabel ?? "",
        count: undoCount,
        message: "Não foi possível restaurar o registro. Tente novamente.",
      });
    }
  }

  return (
    <div className="app-shell">
      <aside className="side-nav" aria-label="Navegação principal">
        <Link to="/" className="brand" aria-label="Biorotina: início">
          <img src="/biorotina-mark.svg" alt="" />
          <span>
            Biorotina<small>Seu cuidado, no seu ritmo</small>
          </span>
        </Link>
        <nav className="side-links">
          {desktopNav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `nav-link${isActive ? " active" : ""}`
              }
            >
              <Icon size={20} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="side-bottom">
          <NavLink
            to="/configuracoes"
            className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
          >
            <Settings2 size={20} aria-hidden="true" />
            Configurações
          </NavLink>
          <div className="storage-note">
            <ShieldCheck size={18} aria-hidden="true" />
            <span>Dados neste navegador</span>
          </div>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <Link to="/" className="mobile-brand" aria-label="Biorotina: início">
            <img src="/biorotina-mark.svg" alt="" />
            <span>Biorotina</span>
          </Link>
          <div className="topbar-copy">
            <HeartPulse size={18} aria-hidden="true" />
            <span>Seu espaço de cuidado{name ? `, ${name}` : ""}</span>
          </div>
          <div className="topbar-actions">
            <NavLink
              className="support-topbar"
              to="/apoiar"
              aria-label="Apoiar o projeto"
            >
              <HeartHandshake size={17} aria-hidden="true" />
              <span>Apoiar</span>
            </NavLink>
            {drive.account && drive.status !== "reconnect-required" ? (
              <NavLink
                className={`drive-topbar ${drive.status}`}
                to="/configuracoes"
                aria-label={`Google Drive: ${drive.status === "synced" ? "sincronizado" : drive.status === "syncing" ? "sincronizando" : drive.status === "pending" ? "alterações pendentes" : drive.status === "authorization-needed" ? "ativação opcional" : "atenção necessária"}`}
                title={drive.account.email}
              >
                {drive.status === "synced" ? (
                  <CloudCheck size={18} aria-hidden="true" />
                ) : drive.status === "authorization-needed" ? (
                  <Cloud size={18} aria-hidden="true" />
                ) : drive.status === "pending" || drive.status === "syncing" ? (
                  <CloudUpload size={18} aria-hidden="true" />
                ) : (
                  <CloudAlert size={18} aria-hidden="true" />
                )}
                <span>
                  {drive.status === "syncing"
                    ? "Enviando…"
                    : drive.status === "pending"
                      ? "Pendente"
                      : drive.status === "authorization-needed"
                        ? "Ativar Drive"
                        : drive.status === "conflict" ||
                            drive.status === "error"
                          ? "Atenção"
                          : "Drive"}
                </span>
              </NavLink>
            ) : (
              <button
                className="drive-topbar"
                type="button"
                onClick={() => void drive.connect()}
                disabled={!drive.available || drive.busy}
                aria-label={
                  drive.reconnectAvailable
                    ? "Reconectar Google para sincronizar"
                    : "Entrar com Google para sincronizar"
                }
                title={
                  drive.available
                    ? drive.reconnectAvailable
                      ? "Renovar a conexão com o Google"
                      : "Entrar com Google"
                    : "Google Drive indisponível nesta instalação"
                }
              >
                <Cloud size={18} aria-hidden="true" />
                <span>
                  {drive.busy
                    ? "Conectando…"
                    : drive.reconnectAvailable
                      ? "Reconectar"
                      : "Entrar"}
                </span>
              </button>
            )}
            <NavLink
              className="settings-link"
              to="/configuracoes"
              aria-label="Abrir configurações"
            >
              <Settings2 size={21} aria-hidden="true" />
            </NavLink>
          </div>
        </header>
        <AnalyticsConsentBanner />
        {location.pathname !== "/configuracoes" &&
          (drive.error || drive.status === "conflict") && (
            <div
              className="sync-banner"
              role={drive.error ? "alert" : "status"}
            >
              <span>
                {drive.error ||
                  "Há versões diferentes dos seus dados no Drive."}
              </span>
              <NavLink to="/configuracoes">Ver detalhes</NavLink>
            </div>
          )}
        <main id="conteudo" className="main-content">
          <Outlet />
        </main>
        <footer className="app-footer">
          <Link to="/privacidade">Privacidade</Link>
          <span>Seus registros de saúde ficam sob seu controle.</span>
          <span>
            Métricas de acesso sem anúncios ·{" "}
            <Link to="/configuracoes">Ajustar</Link>
          </span>
        </footer>
        {undoLabel && (
          <div className="undo-banner" role="status">
            <span>
              {undoError || `Registro removido: ${undoLabel}.`}
              {undoCount > 1 && !undoError
                ? ` ${undoCount} exclusões para desfazer.`
                : ""}
            </span>
            <button type="button" className="undo-button" onClick={handleUndo}>
              Desfazer
            </button>
            <button
              type="button"
              className="undo-dismiss"
              aria-label="Dispensar opção de desfazer"
              onClick={() => {
                dismissUndo();
                setUndoFailure(null);
              }}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        )}
        <nav className="bottom-nav" aria-label="Navegação principal no celular">
          {mobileNav.map(({ to, mobileLabel, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              aria-label={mobileLabel}
              className={({ isActive }) =>
                `bottom-link${isActive || (to === "/mais" && location.pathname !== "/" && !mobileNav.some((item) => item.to === location.pathname)) ? " active" : ""}`
              }
            >
              <Icon size={20} aria-hidden="true" />
              <span>{mobileLabel}</span>
            </NavLink>
          ))}
        </nav>
      </div>
      {location.pathname === "/" && (
        <InstallPrompt
          enabled={analyticsPreference !== "unselected"}
          delayMs={1800}
        />
      )}
      <GuestLoginPrompt />
      <DrivePermissionPrompt />
      <SyncConflictPrompt />
      <GuestMergePrompt />
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action && <div className="page-action">{action}</div>}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof CalendarDays;
  title: string;
  description: string;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon size={25} aria-hidden="true" />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}

export function Notice({
  children,
  kind = "info",
}: {
  children: React.ReactNode;
  kind?: "info" | "success" | "warning" | "danger";
}) {
  return (
    <div
      className={`notice ${kind}`}
      role={kind === "danger" ? "alert" : "status"}
    >
      {children}
    </div>
  );
}
