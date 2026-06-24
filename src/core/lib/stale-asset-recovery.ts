const STALE_RELOAD_KEY = 'hai-dang-stale-asset-reloaded';
const STALE_ASSET_PATTERNS = [
    'Failed to fetch dynamically imported module',
    'Importing a module script failed',
    'Loading chunk',
    'dynamically imported module',
    // Lệch pha module do service worker phục vụ chunk cũ (export không khớp).
    'does not provide an export named',
    'error loading dynamically imported module',
    "Unexpected token '<'",
    'is not a valid JavaScript MIME type',
];

const hasStaleAssetMessage = (value: unknown) => {
    const message =
        value instanceof Error
            ? value.message
            : typeof value === 'string'
              ? value
              : typeof value === 'object' && value && 'message' in value
                ? String((value as { message?: unknown }).message)
                : '';

    return STALE_ASSET_PATTERNS.some((pattern) => message.includes(pattern));
};

const clearBrowserCaches = async () => {
    if (!('caches' in window)) {
        return;
    }

    const cacheNames = await caches.keys();
    await Promise.all(
        cacheNames.filter((name) => name.startsWith('hai-dang-manager')).map((name) => caches.delete(name))
    );
};

const updateServiceWorkers = async () => {
    if (!('serviceWorker' in navigator)) {
        return;
    }

    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.update()));
};

const recoverFromStaleAssets = async () => {
    if (sessionStorage.getItem(STALE_RELOAD_KEY)) {
        return;
    }

    sessionStorage.setItem(STALE_RELOAD_KEY, '1');

    try {
        await clearBrowserCaches();
        await updateServiceWorkers();
    } finally {
        window.location.reload();
    }
};

// Cho ErrorBoundary React gọi: nếu lỗi là stale-asset thì tự phục hồi (xoá cache + reload) và trả true.
export const maybeRecoverFromStaleError = (error: unknown): boolean => {
    if (typeof window === 'undefined' || !hasStaleAssetMessage(error)) {
        return false;
    }
    void recoverFromStaleAssets();
    return true;
};

export const installStaleAssetRecovery = () => {
    if (typeof window === 'undefined') {
        return;
    }

    window.setTimeout(() => {
        sessionStorage.removeItem(STALE_RELOAD_KEY);
    }, 15000);

    window.addEventListener('vite:preloadError', (event) => {
        event.preventDefault();
        void recoverFromStaleAssets();
    });

    window.addEventListener(
        'error',
        (event) => {
            if (!hasStaleAssetMessage(event.error ?? event.message)) {
                return;
            }

            event.preventDefault();
            void recoverFromStaleAssets();
        },
        true
    );

    window.addEventListener('unhandledrejection', (event) => {
        if (!hasStaleAssetMessage(event.reason)) {
            return;
        }

        event.preventDefault();
        void recoverFromStaleAssets();
    });
};
