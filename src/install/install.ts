type InstallChoice = { outcome: "accepted" | "dismissed"; platform: string };

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<InstallChoice>;
}

const DISMISSED_KEY = "biorotina.install.dismissed.v1";
let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    dismissInstallPrompt();
    notify();
  });
}

export function subscribeToInstall(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function canInstallDirectly() {
  return deferredPrompt !== null;
}

export async function installDirectly() {
  const prompt = deferredPrompt;
  if (!prompt) return false;
  deferredPrompt = null;
  notify();
  try {
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") dismissInstallPrompt();
    return choice.outcome === "accepted";
  } catch {
    return false;
  }
}

export function isInstalled() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

export function isMobileViewport() {
  return window.matchMedia?.("(max-width: 700px)").matches ?? false;
}

export function wasInstallPromptDismissed() {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissInstallPrompt() {
  try {
    localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // The invitation can be dismissed for this page even without storage.
  }
}

export function installInstructions() {
  if (/iPad|iPhone|iPod/.test(navigator.userAgent))
    return "No iPhone, toque em Compartilhar (quadrado com seta) e depois em Adicionar à Tela de Início. Se a opção não aparecer, abra a Biorotina no Safari.";
  return "Abra o menu ⋮ do navegador e escolha Instalar app ou Adicionar à tela inicial. Se não encontrar, abra a página no Chrome.";
}
