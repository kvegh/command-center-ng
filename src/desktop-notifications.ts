export type DesktopNotificationKind = 'needs-input' | 'error' | 'completed' | 'request';
export type DesktopNotificationEvent = { id: string; kind: DesktopNotificationKind };
export type DesktopNotificationPermissionResult = { enabled: boolean; notice: string };

type NativeNotification = Pick<Notification, 'onclick' | 'close'>;
type NativeNotificationConstructor = {
  new (title: string, options?: NotificationOptions): NativeNotification;
  readonly permission: NotificationPermission;
  requestPermission(): Promise<NotificationPermission>;
};
export type DesktopNotificationBrowser = {
  isSecureContext: boolean;
  Notification?: NativeNotificationConstructor;
  focus(): void;
};

const inApp = ' In-app alerts remain available.';
const unsupported = 'Desktop notifications are not supported by this browser.' + inApp;
const insecure = 'Desktop notifications require HTTPS or a trusted local page.' + inApp;
const denied = 'Desktop notifications are blocked in browser settings.' + inApp;
const ungranted = 'Desktop notification permission was not granted.' + inApp;

function currentBrowser(): DesktopNotificationBrowser | undefined {
  return typeof window === 'undefined' ? undefined : window;
}

function supportNotice(browser: DesktopNotificationBrowser | undefined): string | null {
  if (!browser || typeof browser.Notification !== 'function') return unsupported;
  return browser.isSecureContext ? null : insecure;
}

// Call only from an explicit checkbox/button gesture, never from an effect or event alert.
export async function requestDesktopNotifications(browser = currentBrowser()): Promise<DesktopNotificationPermissionResult> {
  try {
    const notice = supportNotice(browser);
    if (notice) return { enabled: false, notice };
    const Native = browser!.Notification!;
    if (Native.permission === 'granted') return { enabled: true, notice: 'Desktop notifications enabled.' };
    if (Native.permission === 'denied') return { enabled: false, notice: denied };
    if (Native.permission !== 'default' || typeof Native.requestPermission !== 'function') return { enabled: false, notice: unsupported };
    const permission = await Native.requestPermission();
    return permission === 'granted'
      ? { enabled: true, notice: 'Desktop notifications enabled.' }
      : { enabled: false, notice: permission === 'denied' ? denied : ungranted };
  } catch {
    return { enabled: false, notice: 'The browser could not enable desktop notifications.' + inApp };
  }
}

const bodies: Record<DesktopNotificationKind, string> = {
  'needs-input': 'A watched task needs input. Open Command Center NG to review it.',
  error: 'Work you are following reported an error. Open Command Center NG to review it.',
  completed: 'A watched task was marked completed. Open Command Center NG to review it.',
  request: 'A worker you are following needs attention. Open Command Center NG to review it.'
};

// A null result means the constructor accepted the request, not proof the OS displayed it.
export function showTaskDesktopNotification(event: DesktopNotificationEvent, open: () => void, browser = currentBrowser()): string | null {
  try {
    const notice = supportNotice(browser);
    if (notice) return notice;
    const Native = browser!.Notification!;
    if (Native.permission !== 'granted') return Native.permission === 'denied' ? denied : ungranted;
    if (typeof event.id !== 'string' || !event.id.trim() || event.id.length > 512 || !Object.hasOwn(bodies, event.kind)) {
      return 'The desktop alert could not be prepared.' + inApp;
    }
    // Only generic copy is sent to the desktop. The stable tag identifies repeat events.
    const notification = new Native('Command Center NG', { body: bodies[event.kind], tag: 'ccng-task-watch:' + event.id });
    notification.onclick = click => {
      click.preventDefault();
      try { browser!.focus(); } catch { /* Some browsers refuse programmatic focus. */ }
      try { open(); } finally {
        try { notification.close(); } catch { /* The browser may already have closed it. */ }
      }
    };
    return null;
  } catch {
    return 'The browser could not show a desktop notification.' + inApp;
  }
}
