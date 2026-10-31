import type { Music } from '../companion/music.ts';
import { musicPage, musicScript, musicStyle } from './music-page.ts';
import { studioPage, studioScript, studioStyle, studioLayoutStyle, embeddedStudioStyle } from './studio-page.ts';
import { handleManagement, type ManageServices } from './manage.ts';
import type { AppearanceService } from '../companion/appearance.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PACKAGE_ROOT } from '../host/paths.ts';
import { chatPage, chatScript, chatStyle, chatExtraStyle, workspaceStyle } from './chat-page.ts';
/**
 * 独立应用的 HTTP 入口：插件路由、AI 配置页与状态页共用同一个本机服务。
 *
 * 只做路由与请求边界（去重、限长、CORS、错误兜底），不实现各路由的业务逻辑；对 Electron 无依赖，
 * 便于直接测非法与不可信请求。依赖 standalone 的页面与安全模块，安全判定一律先于分发。
 *
 * @module dsh-pet/src/app/router
 */

import { createServer } from 'node:http';
import type { Companion } from '../companion/service.ts';
import { companionScript } from '../companion/page.ts';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { RegisteredRoute } from '../standalone/context.ts';
import { boundedRequest, MAX_REQUEST_BYTES, MAX_SETTINGS_BYTES } from '../standalone/request-body.ts';
import { rejectRequest, type RequestSecurity } from '../standalone/request-security.ts';
import { settingsHandler, testHandler, type StandaloneServerOptions } from '../standalone/server.ts';
import { settingsPage, settingsScript, settingsStyle } from '../standalone/settings-page.ts';

/** 路由依赖：安全校验、AI 处理器与两个页面的数据源，全部注入以脱离 Electron 测试。 */
interface RouterDeps extends Partial<ManageServices> {
  music?: Music;
  security: RequestSecurity;
  companion?: Companion;
  appearance?: AppearanceService;
  ai?: StandaloneServerOptions['ai'];
  log(message: string): void;
  status(port: number): unknown;
  landingPage(port: number): string;
}

/**
 * 启动本机服务并返回实际端口与关闭函数。
 *
 * 只监听 127.0.0.1 的随机端口；请求体在进入处理器前先按路由限长读取。
 */
export function startRouter(
  routes: RegisteredRoute[],
  deps: RouterDeps,
): Promise<{ port: number; close: () => Promise<void> }> {
  const settings = settingsHandler(deps.ai);
  const tester = testHandler(deps.ai);
  let boundPort = 0;

  const server = createServer((req, res) => {
    let url: URL;
    try {
      url = new URL(req.url ?? '/', 'http://127.0.0.1');
    } catch {
      rejectRequest(res, 400, '请求地址无效');
      return;
    }
    const route = routes.find((candidate) =>
      candidate.kind === 'exact'
        ? url.pathname === candidate.path
        : url.pathname === candidate.path || url.pathname.startsWith(`${candidate.path}/`),
    );
    // 只有插件路由接受来自 file 渲染端的请求，且仍需它自己的凭证。
    if (!deps.security.authorize(req, res, !!route)) return;
    const method = req.method ?? 'GET';
    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const dispatch = async (request: IncomingMessage): Promise<void> => {
      if (
        deps.world &&
        deps.media &&
        deps.budget &&
        deps.observer &&
        deps.companion &&
        deps.appearance &&
        deps.conversationStore
      ) {
        if (await handleManagement(request, res, url, deps as ManageServices)) return;
      }

      if (url.pathname === '/music/state' && deps.music) {
        if (method !== 'GET') {
          rejectRequest(res, 405, '仅支持读取');
          return;
        }
        sendText(res, 200, 'application/json', JSON.stringify(deps.music.read()));
        return;
      }
      if (url.pathname === '/music/control' && deps.music) {
        if (method !== 'POST') {
          rejectRequest(res, 405, '仅支持修改');
          return;
        }
        try {
          let raw = '';
          for await (const chunk of request) raw += String(chunk);
          sendText(res, 200, 'application/json', JSON.stringify(deps.music.control(JSON.parse(raw))));
        } catch {
          rejectRequest(res, 400, '播放设置无效');
        }
        return;
      }
      if (url.pathname.startsWith('/music/audio/') && deps.music) {
        deps.music.stream(request, res, url.pathname.slice('/music/audio/'.length));
        return;
      }
      if (url.pathname === '/avatar.jpg') {
        if (method !== 'GET') {
          rejectRequest(res, 405, '仅支持GET');
          return;
        }
        res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' });
        res.end(readFileSync(join(PACKAGE_ROOT, 'assets/default-avatar.png')));
        return;
      }
      if (url.pathname === '/dsh-pet-7340/appearance' && deps.appearance) {
        try {
          if (method === 'POST') {
            let raw = '';
            for await (const chunk of request) raw += String(chunk);
            const patch = JSON.parse(raw);
            deps.appearance.save(patch);
            if (patch.owner !== undefined && deps.world)
              deps.world.update({ user: { address: deps.appearance.read().owner } });
          } else if (method !== 'GET') {
            rejectRequest(res, 405, '不支持的方法');
            return;
          }
          const companion = deps.companion?.read();
          sendText(
            res,
            200,
            'application/json',
            JSON.stringify({
              ...deps.appearance.read(),
              ...(deps.world ? { owner: deps.world.read().user.address } : {}),
              ...(companion?.enabled ? { vitals: companion.pets.main.vitals } : {}),
            }),
          );
        } catch {
          rejectRequest(res, 400, '个性设置无效，请检查输入范围');
        }
        return;
      }
      if (url.pathname === '/companion' && deps.companion) {
        if (method === 'POST') {
          let raw = '';
          for await (const chunk of request) raw += String(chunk);
          const input: unknown = JSON.parse(raw);
          if (!input || typeof input !== 'object') {
            rejectRequest(res, 400, '请求无效');
            return;
          }
          const patch = input as Record<string, unknown>;
          if (patch.action === 'feed') deps.companion.feed();
          else if (
            patch.action === 'settings' &&
            typeof patch.enabled === 'boolean' &&
            typeof patch.memoryEnabled === 'boolean'
          )
            deps.companion.settings(patch.enabled, patch.memoryEnabled);
          else {
            rejectRequest(res, 400, '设置无效');
            return;
          }
        } else if (method !== 'GET') {
          rejectRequest(res, 405, '不支持的方法');
          return;
        }
        sendText(res, 200, 'application/json', JSON.stringify(deps.companion.read()));
        return;
      }
      const assets: Record<string, readonly [string, string]> = {
        '/standalone-ai/': [settingsPage, 'text/html'],
        '/companion.js': [companionScript, 'text/javascript'],
        '/chat/': [chatPage.replace('<!--music-panel-->', musicPage), 'text/html'],
        '/music.js': [musicScript, 'text/javascript'],
        '/chat.js': [chatScript, 'text/javascript'],
        '/chat.css': [chatStyle + chatExtraStyle + workspaceStyle + musicStyle, 'text/css'],
        '/studio/': [studioPage, 'text/html'],
        '/studio.js': [studioScript, 'text/javascript'],
        '/studio.css': [studioStyle + studioLayoutStyle + embeddedStudioStyle, 'text/css'],
        '/standalone-ai/settings.js': [settingsScript, 'text/javascript'],
        '/standalone-ai/settings.css': [settingsStyle, 'text/css'],
      };
      const asset = assets[url.pathname];
      if (asset || url.pathname === '/health' || url.pathname === '/') {
        if (method !== 'GET' && method !== 'HEAD') {
          rejectRequest(res, 405, '仅支持 GET');
          return;
        }
        if (asset) sendText(res, 200, asset[1], asset[0]);
        else if (url.pathname === '/health')
          sendText(res, 200, 'application/json', JSON.stringify(deps.status(boundPort)));
        else sendText(res, 200, 'text/html', deps.landingPage(boundPort));
        return;
      }
      if (url.pathname === '/standalone-ai/settings' || url.pathname === '/standalone-ai/test') {
        await (url.pathname === '/standalone-ai/test' ? tester : settings)(request, res);
        return;
      }
      if (!route) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('not found');
        return;
      }
      // CORS 只让已鉴权的 file 渲染端可用，它本身不授予任何能力。
      res.setHeader('access-control-allow-origin', '*');
      await route.handler(request, res);
    };

    const hasBody = req.headers['transfer-encoding'] !== undefined || Number(req.headers['content-length'] ?? 0) > 0;
    const bodyMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    void (async () => {
      if (hasBody || bodyMethod) {
        const limit =
          url.pathname === '/manage/restore'
            ? 64 * 1024 * 1024
            : url.pathname === '/standalone-ai/settings'
              ? MAX_SETTINGS_BYTES
              : MAX_REQUEST_BYTES;
        const bounded = await boundedRequest(req, res, limit);
        if (bounded) await dispatch(bounded);
      } else await dispatch(req);
    })().catch(() => {
      // 请求体、地址与抛出的值都可能带凭证：日志保持笼统。
      deps.log('本机接口处理失败');
      if (!res.headersSent) rejectRequest(res, 500, '接口暂时无法处理请求');
      else res.end();
    });
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.on('clientError', (_error, socket) => socket.destroy());

  return new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      boundPort = (server.address() as AddressInfo).port;
      resolvePromise({
        port: boundPort,
        close: async () => {
          server.closeAllConnections();
          await new Promise<void>((done) => server.close(() => done()));
        },
      });
    });
  });
}

/** 写一段纯文本响应：固定关缓存与嗅探，避免页面内联脚本被当资源加载。 */
function sendText(res: ServerResponse, status: number, type: string, body: string): void {
  res.writeHead(status, {
    'content-type': `${type}; charset=utf-8`,
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  });
  res.end(body);
}
