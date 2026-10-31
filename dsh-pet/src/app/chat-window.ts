import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PACKAGE_ROOT } from '../host/paths.ts';
/** Open one focusable messenger window per pet; pet rendering remains independent. */
import { createRequire } from 'node:module';
interface ChatWindow {
  isDestroyed(): boolean;
  show(): void;
  focus(): void;
  minimize(): void;
  close(): void;
  loadURL(url: string): Promise<void>;
  on(event: string, listener: (...args: unknown[]) => void): void;
  webContents: { id: number; getURL(): string; setWindowOpenHandler(handler: () => { action: 'deny' }): void };
}
/** Bind the desktop preload action to a local-only BrowserWindow. */
export function installChatWindows(
  origin: string,
  authenticate: (url: string) => string,
  allowedPet: (id: string) => boolean,
): void {
  const { BrowserWindow, ipcMain, app, screen } = createRequire(import.meta.url)('electron') as {
    app: { getPath(name: string): string };
    screen: { getPrimaryDisplay(): { workAreaSize: { width: number; height: number } } };
    BrowserWindow: new (options: Record<string, unknown>) => ChatWindow;
    ipcMain: {
      handle(
        channel: string,
        listener: (event: { sender: { getURL(): string; id: number } }, id: unknown) => void,
      ): void;
    };
  };
  const windows = new Map<string, ChatWindow>();
  ipcMain.handle('whale:window', (event, action) => {
    const window = [...windows.values()].find((w) => w.webContents.id === event.sender.id);
    if (!window || window.isDestroyed()) return;
    if (action === 'minimize') window.minimize();
    if (action === 'close') window.close();
  });
  ipcMain.handle('whale:open-chat', (event, value) => {
    if (!event.sender.getURL().startsWith('file:')) throw new Error('Untrusted chat source');
    const requested = value && typeof value === 'object' ? (value as { id?: unknown; view?: unknown }) : undefined;
    const id = String(requested?.id ?? value ?? 'main');
    const view = requested?.view === 'api' ? '&view=api' : '';
    if (!allowedPet(id)) throw new Error('Unknown pet');
    const current = windows.get(id);
    if (current && !current.isDestroyed()) {
      if (view || !current.webContents.getURL().startsWith(origin + '/chat/'))
        void current.loadURL(authenticate(origin + '/chat/?pet=' + encodeURIComponent(id) + view));
      current.show();
      current.focus();
      return;
    }
    // Desktop rendering uses physical pixels; scale the messenger separately for readable text on HiDPI.
    let scale = 1;
    try {
      scale = Math.max(
        1,
        Math.min(
          3,
          Number(JSON.parse(readFileSync(join(app.getPath('userData'), 'primary-scale.json'), 'utf8')).scaleFactor) ||
            1,
        ),
      );
    } catch {
      /* Default display scale. */
    }
    const area = screen.getPrimaryDisplay().workAreaSize;
    const window = new BrowserWindow({
      title: '鱼团 · 聊天',
      frame: false,
      titleBarStyle: 'hidden',
      width: Math.min(Math.round(640 * scale), Math.round(area.width * 0.9)),
      height: Math.min(Math.round(780 * scale), Math.round(area.height * 0.92)),
      minWidth: Math.round(360 * scale),
      minHeight: Math.round(500 * scale),
      autoHideMenuBar: true,
      backgroundColor: '#f3f6fa',
      webPreferences: {
        zoomFactor: scale,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        preload: join(PACKAGE_ROOT, 'runtime/electron-helper/chat-preload.cjs'),
      },
    });
    windows.set(id, window);
    window.on('closed', () => windows.delete(id));
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.on('will-navigate', (...args) => {
      const event = args[0] as { preventDefault(): void };
      const url = String(args[1] ?? '');
      if (!url.startsWith(origin + '/')) event.preventDefault();
    });
    void window.loadURL(authenticate(origin + '/chat/?pet=' + encodeURIComponent(id) + view));
  });
}
