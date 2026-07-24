export type ProductionOutboxStatus = 'pending' | 'syncing' | 'conflict';

export interface ProductionEntryOutboxItem {
    id: string;
    actorId: string;
    plantId: string;
    productionDate: string;
    dayId: string;
    lineId: string;
    lineCode: string;
    slotKey: string;
    runId: string;
    quantity: number;
    note?: string;
    expectedUpdatedAt: string | null;
    status: ProductionOutboxStatus;
    attempts: number;
    createdAt: string;
    updatedAt: string;
    nextRetryAt?: string;
    lastError?: string;
}

const DB_NAME = 'haidang-production';
const DB_VERSION = 1;
const STORE_NAME = 'entry-outbox';
const FALLBACK_KEY = 'haidang-production-entry-outbox';
const CHANGE_EVENT = 'production-outbox:changed';
const CHANGE_STORAGE_KEY = 'haidang-production-outbox-pulse';
const STORAGE_OPERATION_TIMEOUT_MS = 3000;
const STORAGE_RETRY_COOLDOWN_MS = 30_000;
const PRODUCTION_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

let databasePromise: Promise<IDBDatabase> | undefined;
let databaseRetryAfter = 0;

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

const isValidProductionDate = (value: unknown): value is string => {
    if (typeof value !== 'string' || !PRODUCTION_DATE_PATTERN.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const isValidTimestamp = (value: unknown): value is string =>
    typeof value === 'string' && Number.isFinite(new Date(value).getTime());

const isProductionOutboxItem = (value: unknown): value is ProductionEntryOutboxItem => {
    if (!value || typeof value !== 'object') return false;
    const item = value as Partial<ProductionEntryOutboxItem>;
    return Boolean(
        isNonEmptyString(item.id) &&
        isNonEmptyString(item.actorId) &&
        isNonEmptyString(item.plantId) &&
        isValidProductionDate(item.productionDate) &&
        isNonEmptyString(item.dayId) &&
        isNonEmptyString(item.lineId) &&
        isNonEmptyString(item.lineCode) &&
        isNonEmptyString(item.slotKey) &&
        isNonEmptyString(item.runId) &&
        typeof item.quantity === 'number' &&
        Number.isInteger(item.quantity) &&
        item.quantity >= 0 &&
        item.quantity <= 100_000_000 &&
        (item.note === undefined || (typeof item.note === 'string' && item.note.length <= 500)) &&
        typeof item.attempts === 'number' &&
        Number.isInteger(item.attempts) &&
        item.attempts >= 0 &&
        (item.expectedUpdatedAt === null || isValidTimestamp(item.expectedUpdatedAt)) &&
        ['pending', 'syncing', 'conflict'].includes(String(item.status)) &&
        isValidTimestamp(item.createdAt) &&
        isValidTimestamp(item.updatedAt) &&
        (item.nextRetryAt === undefined || isValidTimestamp(item.nextRetryAt)) &&
        (item.lastError === undefined || typeof item.lastError === 'string')
    );
};

const notifyChanged = () => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
    try {
        localStorage.setItem(CHANGE_STORAGE_KEY, `${Date.now()}:${Math.random()}`);
    } catch {
        // IndexedDB vẫn hoạt động nếu trình duyệt chặn localStorage.
    }
};

const openDatabase = () => {
    if (databasePromise) return databasePromise;
    if (Date.now() < databaseRetryAfter) {
        return Promise.reject(new Error('IndexedDB đang tạm thời không khả dụng'));
    }
    const openingPromise = new Promise<IDBDatabase>((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            reject(new Error('IndexedDB không khả dụng'));
            return;
        }
        let settled = false;
        const settle = (callback: () => void) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            callback();
        };
        const timeout = setTimeout(
            () => settle(() => reject(new Error('IndexedDB không phản hồi'))),
            STORAGE_OPERATION_TIMEOUT_MS
        );
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('actor-date', ['actorId', 'productionDate'], { unique: false });
                store.createIndex('plant-date', ['plantId', 'productionDate'], { unique: false });
            }
        };
        request.onsuccess = () => {
            if (settled) {
                request.result.close();
                return;
            }
            settle(() => resolve(request.result));
        };
        request.onerror = () => settle(() => reject(request.error || new Error('Không thể mở hàng đợi đồng bộ')));
        request.onblocked = () => settle(() => reject(new Error('IndexedDB đang bị chặn bởi một phiên ứng dụng khác')));
    });
    databasePromise = openingPromise
        .then((database) => {
            databaseRetryAfter = 0;
            return database;
        })
        .catch((error) => {
            databasePromise = undefined;
            databaseRetryAfter = Date.now() + STORAGE_RETRY_COOLDOWN_MS;
            throw error;
        });
    return databasePromise;
};

const readFallback = (): ProductionEntryOutboxItem[] => {
    if (typeof localStorage === 'undefined') return [];
    try {
        const parsed = JSON.parse(localStorage.getItem(FALLBACK_KEY) || '[]');
        return Array.isArray(parsed) ? parsed.filter(isProductionOutboxItem) : [];
    } catch {
        return [];
    }
};

const writeFallback = (items: ProductionEntryOutboxItem[]) => {
    if (typeof localStorage === 'undefined') return false;
    try {
        localStorage.setItem(FALLBACK_KEY, JSON.stringify(items));
        return true;
    } catch {
        return false;
    }
};

const mergeOutboxItems = (...sources: ProductionEntryOutboxItem[][]) => {
    const merged = new Map<string, ProductionEntryOutboxItem>();
    sources.flat().forEach((item) => {
        if (!isProductionOutboxItem(item)) return;
        const current = merged.get(item.id);
        if (!current || current.updatedAt < item.updatedAt) merged.set(item.id, item);
    });
    return [...merged.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
};

const runRequest = async <T>(
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> => {
    const database = await openDatabase();
    return new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, mode);
        const request = operation(transaction.objectStore(STORE_NAME));
        let result!: T;
        let settled = false;
        const settle = (callback: () => void) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            callback();
        };
        const timeout = setTimeout(() => {
            try {
                transaction.abort();
            } catch {
                // Giao dịch có thể đã tự đóng ngay trước timeout.
            }
            settle(() => reject(new Error('Thao tác hàng đợi trên thiết bị quá thời gian')));
        }, STORAGE_OPERATION_TIMEOUT_MS);
        request.onsuccess = () => {
            result = request.result;
        };
        transaction.oncomplete = () => settle(() => resolve(result));
        transaction.onerror = () =>
            settle(() =>
                reject(transaction.error || request.error || new Error('Không thể cập nhật hàng đợi đồng bộ'))
            );
        transaction.onabort = () =>
            settle(() =>
                reject(transaction.error || request.error || new Error('Giao dịch hàng đợi đồng bộ đã bị hủy'))
            );
    });
};

export const createProductionMutationId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `entry_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
};

export const listProductionOutbox = async (): Promise<ProductionEntryOutboxItem[]> => {
    const fallbackItems = readFallback();
    try {
        const items = await runRequest<ProductionEntryOutboxItem[]>('readonly', (store) => store.getAll());
        return mergeOutboxItems(items, fallbackItems);
    } catch {
        return mergeOutboxItems(fallbackItems);
    }
};

export const putProductionOutbox = async (item: ProductionEntryOutboxItem) => {
    try {
        await runRequest<IDBValidKey>('readwrite', (store) => store.put(item));
        const fallbackItems = readFallback();
        if (fallbackItems.some((entry) => entry.id === item.id)) {
            writeFallback(fallbackItems.filter((entry) => entry.id !== item.id));
        }
    } catch {
        const items = readFallback().filter((entry) => entry.id !== item.id);
        items.push(item);
        if (!writeFallback(items)) {
            throw new Error('Thiết bị không thể lưu bản ghi chờ đồng bộ');
        }
    }
    notifyChanged();
};

export const removeProductionOutbox = async (id: string) => {
    let databaseRemoved = false;
    try {
        await runRequest<undefined>('readwrite', (store) => store.delete(id));
        databaseRemoved = true;
    } catch {
        // Vẫn thử xóa bản dự phòng để tránh gửi lại một bản đã đồng bộ.
    }
    const fallbackItems = readFallback();
    const hadFallbackItem = fallbackItems.some((entry) => entry.id === id);
    const nextFallbackItems = fallbackItems.filter((entry) => entry.id !== id);
    const fallbackRemoved = !hadFallbackItem || writeFallback(nextFallbackItems);
    if ((!databaseRemoved && !hadFallbackItem) || !fallbackRemoved) {
        throw new Error('Không thể xóa bản ghi đã đồng bộ khỏi thiết bị');
    }
    notifyChanged();
};

export const updateProductionOutbox = async (
    id: string,
    patch: Partial<Pick<ProductionEntryOutboxItem, 'status' | 'attempts' | 'updatedAt' | 'nextRetryAt' | 'lastError'>>
) => {
    const items = await listProductionOutbox();
    const current = items.find((item) => item.id === id);
    if (!current) return;
    await putProductionOutbox({ ...current, ...patch });
};

export const subscribeProductionOutbox = (listener: () => void) => {
    if (typeof window === 'undefined') return () => undefined;
    window.addEventListener(CHANGE_EVENT, listener);
    const onStorage = (event: StorageEvent) => {
        if (event.key === FALLBACK_KEY || event.key === CHANGE_STORAGE_KEY) listener();
    };
    window.addEventListener('storage', onStorage);
    return () => {
        window.removeEventListener(CHANGE_EVENT, listener);
        window.removeEventListener('storage', onStorage);
    };
};
