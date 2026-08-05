import type { SaveProductionOperationEntryPayload } from '../types/production';

export type ProductionOperationOutboxStatus = 'pending' | 'syncing' | 'conflict';

export interface ProductionOperationOutboxItem {
    id: string;
    actorId: string;
    plantId: string;
    productionDate: string;
    dayId: string;
    lineId: string;
    lineCode: string;
    slotKey: string;
    entries: SaveProductionOperationEntryPayload[];
    status: ProductionOperationOutboxStatus;
    attempts: number;
    createdAt: string;
    updatedAt: string;
    nextRetryAt?: string;
    lastError?: string;
}

const STORAGE_KEY = 'haidang-production-operation-outbox-v1';
const CHANGE_EVENT = 'production-operation-outbox:changed';
const MAX_OUTBOX_ITEMS = 200;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const validTimestamp = (value: unknown) => typeof value === 'string' && Number.isFinite(new Date(value).getTime());

const validEntry = (entry: SaveProductionOperationEntryPayload) =>
    Boolean(
        entry &&
        typeof entry.trackId === 'string' &&
        entry.trackId &&
        Number.isInteger(entry.quantity) &&
        entry.quantity >= 0 &&
        entry.quantity <= 100_000_000 &&
        (entry.note === undefined || (typeof entry.note === 'string' && entry.note.length <= 500)) &&
        (entry.expectedUpdatedAt === undefined ||
            entry.expectedUpdatedAt === null ||
            validTimestamp(entry.expectedUpdatedAt))
    );

const validItem = (item: ProductionOperationOutboxItem) =>
    Boolean(
        item &&
        typeof item.id === 'string' &&
        typeof item.actorId === 'string' &&
        typeof item.plantId === 'string' &&
        DATE_PATTERN.test(item.productionDate) &&
        typeof item.dayId === 'string' &&
        typeof item.lineId === 'string' &&
        typeof item.lineCode === 'string' &&
        typeof item.slotKey === 'string' &&
        Array.isArray(item.entries) &&
        item.entries.length > 0 &&
        item.entries.length <= 20 &&
        item.entries.every(validEntry) &&
        ['pending', 'syncing', 'conflict'].includes(item.status) &&
        Number.isInteger(item.attempts) &&
        item.attempts >= 0 &&
        validTimestamp(item.createdAt) &&
        validTimestamp(item.updatedAt)
    );

const notify = () => {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
};

export const listProductionOperationOutbox = (): ProductionOperationOutboxItem[] => {
    if (typeof localStorage === 'undefined') return [];
    try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        return Array.isArray(parsed)
            ? parsed.filter(validItem).sort((left, right) => left.createdAt.localeCompare(right.createdAt))
            : [];
    } catch {
        return [];
    }
};

const write = (items: ProductionOperationOutboxItem[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    notify();
};

export const putProductionOperationOutbox = (item: ProductionOperationOutboxItem) => {
    const currentItems = listProductionOperationOutbox();
    const items = currentItems.filter((current) => current.id !== item.id);
    if (items.length >= MAX_OUTBOX_ITEMS && !currentItems.some((current) => current.id === item.id)) {
        throw new Error('Bộ nhớ chờ đồng bộ công đoạn đã đầy. Hãy kết nối mạng và đồng bộ trước khi nhập tiếp.');
    }
    items.push(item);
    write(items);
};

export const removeProductionOperationOutbox = (id: string) => {
    write(listProductionOperationOutbox().filter((item) => item.id !== id));
};

export const updateProductionOperationOutbox = (
    id: string,
    patch: Partial<
        Pick<ProductionOperationOutboxItem, 'status' | 'attempts' | 'updatedAt' | 'nextRetryAt' | 'lastError'>
    >
) => {
    write(listProductionOperationOutbox().map((item) => (item.id === id ? { ...item, ...patch } : item)));
};

export const subscribeProductionOperationOutbox = (listener: () => void) => {
    if (typeof window === 'undefined') return () => undefined;
    const onStorage = (event: StorageEvent) => {
        if (event.key === STORAGE_KEY) listener();
    };
    window.addEventListener(CHANGE_EVENT, listener);
    window.addEventListener('storage', onStorage);
    return () => {
        window.removeEventListener(CHANGE_EVENT, listener);
        window.removeEventListener('storage', onStorage);
    };
};
