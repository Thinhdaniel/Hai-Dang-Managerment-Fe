import { useEffect } from 'react';
import { App, Button } from 'antd';

const SERVICE_WORKER_URL = '/sw.js';
const UPDATE_NOTIFICATION_KEY = 'pwa-update-available';

const canRegisterServiceWorker = () =>
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    // Không đăng ký SW khi chạy vite dev: SW cacheFirst sẽ giữ bản module cũ → mọi thay đổi không hiện ra
    !import.meta.env.DEV &&
    (window.isSecureContext || window.location.hostname === 'localhost');

const sendSkipWaiting = (worker: ServiceWorker) => {
    worker.postMessage({ type: 'SKIP_WAITING' });
};

const cleanupDevelopmentPwa = async () => {
    if (!('serviceWorker' in navigator)) return;

    try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.allSettled(registrations.map((registration) => registration.unregister()));

        if ('caches' in window) {
            const cacheNames = await caches.keys();
            await Promise.allSettled(
                cacheNames.filter((name) => name.startsWith('hai-dang-manager')).map((name) => caches.delete(name))
            );
        }
    } catch {
        // Dọn cache dev là best-effort; không được cản ứng dụng khởi động.
    }
};

const ServiceWorkerManager = () => {
    const { notification } = App.useApp();

    useEffect(() => {
        if (import.meta.env.DEV) {
            void cleanupDevelopmentPwa();
            return;
        }

        if (!canRegisterServiceWorker()) return;

        let refreshing = false;
        const onControllerChange = () => {
            if (refreshing) return;
            refreshing = true;
            window.location.reload();
        };

        const promptUpdate = (worker: ServiceWorker) => {
            notification.open({
                key: UPDATE_NOTIFICATION_KEY,
                message: 'Có phiên bản mới',
                description: 'Tải lại ứng dụng để dùng bản cập nhật mới nhất.',
                duration: 0,
                btn: (
                    <Button type='primary' size='small' onClick={() => sendSkipWaiting(worker)}>
                        Tải lại
                    </Button>
                ),
            });
        };

        const register = async () => {
            try {
                const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL);

                if (registration.waiting && navigator.serviceWorker.controller) {
                    promptUpdate(registration.waiting);
                }

                registration.addEventListener('updatefound', () => {
                    const nextWorker = registration.installing;
                    if (!nextWorker) return;

                    nextWorker.addEventListener('statechange', () => {
                        if (nextWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            promptUpdate(nextWorker);
                        }
                    });
                });
            } catch {
                // Service worker registration is best-effort; the app remains usable without it.
            }
        };

        navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

        if (document.readyState === 'complete') {
            void register();
        } else {
            window.addEventListener('load', () => void register(), { once: true });
        }

        return () => {
            navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
        };
    }, [notification]);

    return null;
};

export default ServiceWorkerManager;
