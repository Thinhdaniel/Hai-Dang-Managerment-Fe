const CACHE_NAME = 'hai-dang-manager-pwa-v2';
const APP_SHELL_URL = '/index.html';
const OFFLINE_URL = '/offline.html';
const PRECACHE_URLS = [
    APP_SHELL_URL,
    OFFLINE_URL,
    '/manifest.webmanifest',
    '/favicon.svg',
    '/icons/apple-touch-icon.png',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/icons/icon-maskable-512.png',
];

const isHttpGet = (request) => request.method === 'GET';

const isSameOrigin = (url) => url.origin === self.location.origin;

const isApiRequest = (url) => url.pathname.startsWith('/api/');

const isHtmlResponse = (response) => {
    const contentType = response?.headers?.get('content-type') || '';
    return Boolean(response?.ok && contentType.includes('text/html'));
};

const isNavigationRequest = (request) =>
    request.mode === 'navigate' ||
    request.destination === 'document' ||
    (request.headers.get('accept') || '').includes('text/html');

const isStaticRequest = (request, url) =>
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/favicon.svg' ||
    url.pathname === '/manifest.webmanifest' ||
    ['font', 'image', 'script', 'style', 'worker'].includes(request.destination);

async function cacheAllSafely(cache, urls) {
    await Promise.allSettled(
        urls.map(async (url) => {
            const response = await fetch(url, { cache: 'reload' });
            if (!response?.ok) return;
            if ((url === APP_SHELL_URL || url === OFFLINE_URL) && !isHtmlResponse(response)) return;

            await cache.put(url, response.clone());
        })
    );
}

async function fetchAndCacheAppShell(cache) {
    try {
        const response = await fetch(APP_SHELL_URL, { cache: 'reload' });
        if (!isHtmlResponse(response)) return undefined;

        await cache.put(APP_SHELL_URL, response.clone());
        return response;
    } catch {
        return undefined;
    }
}

async function cacheFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request, { ignoreSearch: false });
    if (cached) return cached;

    const response = await fetch(request);
    if (response && response.ok && !isHtmlResponse(response)) {
        await cache.put(request, response.clone());
    }
    return response;
}

async function navigationFallback() {
    const cache = await caches.open(CACHE_NAME);
    const freshShell = await fetchAndCacheAppShell(cache);
    if (freshShell) return freshShell;

    const cachedShell = await cache.match(APP_SHELL_URL);
    if (isHtmlResponse(cachedShell)) return cachedShell;

    const cachedOffline = await cache.match(OFFLINE_URL);
    if (isHtmlResponse(cachedOffline)) return cachedOffline;

    return new Response('Ứng dụng đang ngoại tuyến.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
}

async function networkFirstNavigation(event) {
    try {
        const preload = await event.preloadResponse;
        const response = preload || (await fetch(event.request));
        if (isHtmlResponse(response)) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(APP_SHELL_URL, response.clone());
            return response;
        }

        return navigationFallback();
    } catch {
        return navigationFallback();
    }
}

async function setBadgeCount(count) {
    const safeCount = Number.isFinite(Number(count)) ? Number(count) : undefined;

    try {
        if (safeCount && safeCount > 0 && 'setAppBadge' in self.navigator) {
            await self.navigator.setAppBadge(safeCount);
            return;
        }

        if ('clearAppBadge' in self.navigator) {
            await self.navigator.clearAppBadge();
            return;
        }

        if ('setAppBadge' in self.navigator) {
            await self.navigator.setAppBadge(0);
        }
    } catch {
        // Badge support is best-effort and depends on OS/browser notification settings.
    }
}

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cacheAllSafely(cache, PRECACHE_URLS)));
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            if ('navigationPreload' in self.registration) {
                await self.registration.navigationPreload.enable();
            }

            const cacheNames = await caches.keys();
            await Promise.all(cacheNames.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)));
            await self.clients.claim();
        })()
    );
});

self.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (!isHttpGet(request)) return;

    let url;
    try {
        url = new URL(request.url);
    } catch {
        return;
    }

    if (!isSameOrigin(url) || isApiRequest(url)) return;

    if (isNavigationRequest(request)) {
        event.respondWith(networkFirstNavigation(event));
        return;
    }

    if (isStaticRequest(request, url)) {
        event.respondWith(cacheFirst(request));
    }
});

self.addEventListener('push', (event) => {
    let payload = {};

    try {
        payload = event.data ? event.data.json() : {};
    } catch {
        payload = {
            title: 'Thông báo mới',
            body: event.data ? event.data.text() : '',
        };
    }

    const title = payload.title || 'Thông báo mới';
    const options = {
        body: payload.body || payload.message || '',
        icon: payload.icon || '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: payload.tag || payload.notificationId || 'hai-dang-notification',
        renotify: Boolean(payload.tag),
        data: {
            url: payload.url || '/dashboard',
            notificationId: payload.notificationId,
            actionType: payload.actionType,
            actionId: payload.actionId,
        },
    };

    const badgeCount = payload.unreadCount ?? payload.badgeCount;

    event.waitUntil(Promise.all([self.registration.showNotification(title, options), setBadgeCount(badgeCount)]));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const url = new URL(event.notification.data?.url || '/dashboard', self.location.origin).href;

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
            for (const client of clients) {
                if (new URL(client.url).origin === self.location.origin) {
                    if ('navigate' in client) {
                        return client.navigate(url).then(() => client.focus());
                    }
                    return client.focus();
                }
            }

            if (self.clients.openWindow) {
                return self.clients.openWindow(url);
            }

            return undefined;
        })
    );
});
