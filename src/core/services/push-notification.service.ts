import { api } from '../lib/api';

type PushPublicKeyResponse = {
    enabled: boolean;
    publicKey: string;
};

type PushStatusResponse = {
    enabled: boolean;
    activeDevices: number;
};

export type PushSendSummary = {
    enabled: boolean;
    attempted: number;
    sent: number;
    failed: number;
};

type PushTestResponse = {
    delivery: PushSendSummary;
};

export type PushNotificationState = {
    supported: boolean;
    enabled: boolean;
    permission: NotificationPermission | 'unsupported';
    subscribed: boolean;
    activeDevices: number;
};

type SerializedPushSubscription = {
    endpoint?: string;
    expirationTime?: number | null;
    keys?: {
        p256dh?: string;
        auth?: string;
    };
};

const SERVICE_WORKER_PATH = '/sw.js';

const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = `${base64String}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; i += 1) {
        outputArray[i] = rawData.charCodeAt(i);
    }

    return outputArray;
};

const isSupported = () =>
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    window.isSecureContext;

const getRegistration = async () => {
    const existing = await navigator.serviceWorker.getRegistration(SERVICE_WORKER_PATH);
    if (existing) return existing;
    return navigator.serviceWorker.register(SERVICE_WORKER_PATH);
};

const getSubscription = async () => {
    if (!isSupported()) return null;
    const registration = await getRegistration();
    return registration.pushManager.getSubscription();
};

const getPublicKey = () => api.get<PushPublicKeyResponse>('/notifications/push/public-key');

const getBackendStatus = () => api.get<PushStatusResponse>('/notifications/push/status');

export const pushNotificationService = {
    isSupported,

    getState: async (): Promise<PushNotificationState> => {
        if (!isSupported()) {
            return {
                supported: false,
                enabled: false,
                permission: 'unsupported',
                subscribed: false,
                activeDevices: 0,
            };
        }

        const [backendStatus, subscription] = await Promise.all([getBackendStatus(), getSubscription()]);

        return {
            supported: true,
            enabled: backendStatus.enabled,
            permission: window.Notification.permission,
            subscribed: Boolean(subscription),
            activeDevices: backendStatus.activeDevices,
        };
    },

    subscribeCurrentDevice: async (deviceName?: string) => {
        if (!isSupported()) {
            throw new Error('Trình duyệt hoặc kết nối hiện tại chưa hỗ trợ Web Push');
        }

        const { enabled, publicKey } = await getPublicKey();
        if (!enabled || !publicKey) {
            throw new Error('Server chưa cấu hình Web Push');
        }

        const permission = await window.Notification.requestPermission();
        if (permission !== 'granted') {
            throw new Error('Bạn chưa cấp quyền nhận thông báo cho trình duyệt');
        }

        const registration = await getRegistration();
        const existing = await registration.pushManager.getSubscription();
        const subscription =
            existing ??
            (await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(publicKey),
            }));

        const serialized = subscription.toJSON() as SerializedPushSubscription;
        await api.post('/notifications/push/subscribe', {
            endpoint: serialized.endpoint,
            expirationTime: serialized.expirationTime ?? null,
            keys: serialized.keys,
            deviceName:
                deviceName ||
                [navigator.platform, navigator.userAgent.includes('Mobile') ? 'Mobile' : 'Desktop']
                    .filter(Boolean)
                    .join(' · '),
            platform: navigator.platform,
        });

        return subscription;
    },

    unsubscribeCurrentDevice: async () => {
        const subscription = await getSubscription();
        const endpoint = subscription?.endpoint;

        if (subscription) {
            await subscription.unsubscribe();
        }

        await api.post('/notifications/push/unsubscribe', { endpoint });
    },

    sendTest: () => api.post<PushTestResponse>('/notifications/push/test'),
};
