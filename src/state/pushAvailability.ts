export interface PushPlatform {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  standalone: boolean;
}

export function needsHomeScreenForPush(device: PushPlatform): boolean {
  const appleMobile =
    /iPad|iPhone|iPod/.test(device.userAgent) ||
    (device.platform === "MacIntel" && device.maxTouchPoints > 1);
  return appleMobile && !device.standalone;
}

export function currentDeviceNeedsHomeScreen(): boolean {
  if (typeof window === "undefined") return false;
  return needsHomeScreenForPush({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints || 0,
    standalone:
      window.matchMedia?.("(display-mode: standalone)").matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone),
  });
}

export async function requestNotificationPermission(
  request: () => Promise<NotificationPermission>,
  timeoutMs = 20_000,
): Promise<NotificationPermission> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      request(),
      new Promise<NotificationPermission>((_, reject) => {
        timeout = setTimeout(
          () =>
            reject(
              new Error(
                "O navegador não mostrou a permissão de notificações. Verifique as permissões do site e tente novamente.",
              ),
            ),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}
