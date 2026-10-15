/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };

const scope = self.registration.scope;
const scopePath = new URL(scope).pathname;
const cacheName = `qetodo-shell-v1-${scopePath}`;
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(self.__WB_MANIFEST.map(({ url }) => url))));
});
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | undefined)?.type === 'SKIP_WAITING') void self.skipWaiting();
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(scopePath) || url.pathname.startsWith(`${scopePath}api/`)) return;
  event.respondWith(caches.match(event.request).then(async (cached) => {
    if (cached) return cached;
    if (event.request.mode === 'navigate') {
      const shell = await caches.match(new URL('index.html', scope).href);
      if (shell) return shell;
    }
    return fetch(event.request);
  }));
});
self.addEventListener('push', (event) => {
  const payload = event.data?.json() as { title?: string; body?: string; taskId?: string; url?: string } | undefined;
  event.waitUntil(self.registration.showNotification(payload?.title ?? '质量待办提醒', {
    body: payload?.body ?? '有一项任务需要处理',
    icon: new URL('icons/app-icon-192.png', scope).href,
    badge: new URL('icons/app-icon-192.png', scope).href,
    data: { url: new URL((payload?.url ?? '/today').replace(/^\//, ''), scope).href, taskId: payload?.taskId ?? '' },
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = String((event.notification.data as { url?: string } | undefined)?.url ?? new URL('today', scope).href);
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
    const existing = clients.find((client) => client.url.startsWith(scope)) as WindowClient | undefined;
    if (existing) { await existing.navigate(url); return existing.focus(); }
    return self.clients.openWindow(url);
  }));
});

export {};
