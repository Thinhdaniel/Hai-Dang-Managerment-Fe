export interface ProductionEntryDraftScope {
    actorId: string;
    plantId: string;
    productionDate: string;
    lineId: string;
    slotKey: string;
}

export interface ProductionEntryDraft extends ProductionEntryDraftScope {
    version: 1;
    runId: string;
    quantity: number | null;
    reason: string;
    note: string;
    baseUpdatedAt: string | null;
    savedAt: string;
}

const STORAGE_KEY = 'haidang-production-entry-drafts-v1';
const DRAFT_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const PRODUCTION_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const isValidProductionDate = (value: unknown): value is string => {
    if (typeof value !== 'string' || !PRODUCTION_DATE_PATTERN.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const isValidOptionalTimestamp = (value: unknown): value is string | null =>
    value === null || (typeof value === 'string' && Number.isFinite(new Date(value).getTime()));

const draftKey = (scope: ProductionEntryDraftScope) =>
    [scope.actorId, scope.plantId, scope.productionDate, scope.lineId, scope.slotKey].join(':');

const readDraftMap = (): Record<string, ProductionEntryDraft> => {
    if (typeof localStorage === 'undefined') return {};
    try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Record<string, ProductionEntryDraft>;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

        const now = Date.now();
        let changed = false;
        Object.entries(parsed).forEach(([key, draft]) => {
            const savedAt = new Date(draft?.savedAt || 0).getTime();
            if (
                draft?.version !== 1 ||
                !draft.actorId ||
                !draft.plantId ||
                !isValidProductionDate(draft.productionDate) ||
                !draft.lineId ||
                !draft.slotKey ||
                !draft.runId ||
                typeof draft.actorId !== 'string' ||
                typeof draft.plantId !== 'string' ||
                typeof draft.lineId !== 'string' ||
                typeof draft.slotKey !== 'string' ||
                typeof draft.runId !== 'string' ||
                (draft.quantity !== null &&
                    (!Number.isInteger(draft.quantity) || draft.quantity < 0 || draft.quantity > 100_000_000)) ||
                typeof draft.reason !== 'string' ||
                draft.reason.length > 100 ||
                typeof draft.note !== 'string' ||
                draft.note.length > 500 ||
                !isValidOptionalTimestamp(draft.baseUpdatedAt) ||
                !Number.isFinite(savedAt) ||
                now - savedAt > DRAFT_TTL_MS ||
                savedAt - now > 5 * 60 * 1000
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

const writeDraftMap = (drafts: Record<string, ProductionEntryDraft>) => {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
    } catch {
        // Bản ghi đã bấm lưu vẫn đi qua IndexedDB outbox; draft chỉ là lớp khôi phục bổ sung.
    }
};

export const getProductionEntryDraft = (scope: ProductionEntryDraftScope) => readDraftMap()[draftKey(scope)];

export const saveProductionEntryDraft = (draft: ProductionEntryDraft) => {
    const drafts = readDraftMap();
    drafts[draftKey(draft)] = draft;
    writeDraftMap(drafts);
};

export const removeProductionEntryDraft = (scope: ProductionEntryDraftScope) => {
    const drafts = readDraftMap();
    const key = draftKey(scope);
    if (!(key in drafts)) return;
    delete drafts[key];
    writeDraftMap(drafts);
};

export const countProductionEntryDrafts = (actorId: string) =>
    Object.values(readDraftMap()).filter((draft) => draft.actorId === actorId).length;
