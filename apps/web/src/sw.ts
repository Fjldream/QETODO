/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };

const cacheName = 'qetodo-shell-v1';
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(self.__WB_MANIFEST.map(({ url }) => url))));
});
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | undefined)?.type === 'SKIP_WAITING') void self.skipWaiting();
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith(caches.match(event.request).then(async (cached) => {
    if (cached) return cached;
    if (event.request.mode === 'navigate') {
      const shell = await caches.match('/index.html');
      if (shell) return shell;
    }
    return fetch(event.request);
  }));
});
self.addEventListener('push', (event) => {
  const payload = event.data?.json() as { title?: string; body?: string; taskId?: string; url?: string } | undefined;
  event.waitUntil(self.registration.showNotification(payload?.title ?? '质量待办提醒', {
    body: payload?.body ?? '有一项任务需要处理',
    icon: '/icons/app-icon-192.png',
    badge: '/icons/app-icon-192.png',
    data: { url: payload?.url ?? '/today', taskId: payload?.taskId ?? '' },
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = String((event.notification.data as { url?: string } | undefined)?.url ?? '/today');
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
    const existing = clients[0] as WindowClient | undefined;
    if (existing) { await existing.navigate(url); return existing.focus(); }
    return self.clients.openWindow(url);
  }));
});

export {};
