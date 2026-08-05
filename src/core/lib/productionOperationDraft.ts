export type ProductionOperationDraftValue = {
    trackId: string;
    quantity: number | null;
    note: string;
    expectedUpdatedAt: string | null;
};

export type ProductionOperationDraft = {
    version: 1;
    actorId: string;
    plantId: string;
    productionDate: string;
    lineId: string;
    slotKey: string;
    values: ProductionOperationDraftValue[];
    savedAt: string;
};

const STORAGE_KEY = 'haidang-production-operation-drafts-v1';
const TTL_MS = 3 * 24 * 60 * 60 * 1000;

const keyOf = (
    scope: Pick<ProductionOperationDraft, 'actorId' | 'plantId' | 'productionDate' | 'lineId' | 'slotKey'>
) => [scope.actorId, scope.plantId, scope.productionDate, scope.lineId, scope.slotKey].join(':');

const read = (): Record<string, ProductionOperationDraft> => {
    if (typeof localStorage === 'undefined') return {};
    try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Record<
            string,
            ProductionOperationDraft
        >;
        const now = Date.now();
        let changed = false;
        Object.entries(parsed).forEach(([key, draft]) => {
            const savedAt = new Date(draft?.savedAt || 0).getTime();
            if (
                draft?.version !== 1 ||
                !Array.isArray(draft.values) ||
                !Number.isFinite(savedAt) ||
                now - savedAt > TTL_MS
            ) {
                delete parsed[key];
                changed = true;
            }
        });
        if (changed) localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
        return parsed;
    } catch {
        return {};
    }
};

const write = (drafts: Record<string, ProductionOperationDraft>) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
    } catch {
        // Outbox vẫn là lớp lưu bắt buộc khi người dùng bấm lưu.
    }
};

export const getProductionOperationDraft = (
    scope: Pick<ProductionOperationDraft, 'actorId' | 'plantId' | 'productionDate' | 'lineId' | 'slotKey'>
) => read()[keyOf(scope)];

export const saveProductionOperationDraft = (draft: ProductionOperationDraft) => {
    const drafts = read();
    drafts[keyOf(draft)] = draft;
    write(drafts);
};

export const removeProductionOperationDraft = (
    scope: Pick<ProductionOperationDraft, 'actorId' | 'plantId' | 'productionDate' | 'lineId' | 'slotKey'>
) => {
    const drafts = read();
    delete drafts[keyOf(scope)];
    write(drafts);
};
