import type { MaintenanceRepairMode, MaintenanceType } from '../types';

export type AssistantActionType = 'maintenance_draft' | 'supply_request_draft' | 'purchase_request_draft';

export type AssistantActionProposal = {
    id: string;
    type: AssistantActionType;
    label: string;
    description: string;
    targetPath: string;
    payload: Record<string, unknown>;
    warnings: string[];
    requiresConfirmation: true;
};

export type MaintenanceAssistantDraft = {
    assetIds: string[];
    assets?: Array<{ id: string; machineCode?: string; name?: string; plantId?: string; plantName?: string }>;
    type?: MaintenanceType;
    repairMode?: MaintenanceRepairMode;
    description?: string;
    technician?: string;
    note?: string;
};

export type MaterialAssistantDraftItem = {
    materialId: string;
    materialCode?: string;
    materialName: string;
    unit: string;
    quantityRequested: number;
    note?: string;
};

export type MaterialAssistantDraft = {
    plantId?: string;
    plantName?: string;
    purpose?: string;
    proposedBy?: string;
    items: MaterialAssistantDraftItem[];
    unresolved?: string[];
};

const STORAGE_PREFIX = 'hd-assistant-action:';
const MAX_AGE_MS = 30 * 60 * 1000;

export const ASSISTANT_ACTION_PATH: Record<AssistantActionType, string> = {
    maintenance_draft: '/maintenances',
    supply_request_draft: '/materials/supply-requests',
    purchase_request_draft: '/materials/purchase-requests',
};

type StoredAssistantAction = {
    savedAt: number;
    action: AssistantActionProposal;
};

const isActionType = (value: unknown): value is AssistantActionType =>
    value === 'maintenance_draft' || value === 'supply_request_draft' || value === 'purchase_request_draft';

export const storeAssistantAction = (action: AssistantActionProposal) => {
    if (
        !action.id ||
        !isActionType(action.type) ||
        !action.requiresConfirmation ||
        action.targetPath !== ASSISTANT_ACTION_PATH[action.type]
    )
        return false;
    try {
        const stored: StoredAssistantAction = { savedAt: Date.now(), action };
        sessionStorage.setItem(`${STORAGE_PREFIX}${action.id}`, JSON.stringify(stored));
        return true;
    } catch {
        return false;
    }
};

export const consumeAssistantAction = <T>(
    id: string | null,
    expectedType: AssistantActionType
): (AssistantActionProposal & { payload: T }) | null => {
    if (!id) return null;
    const key = `${STORAGE_PREFIX}${id}`;
    try {
        const raw = sessionStorage.getItem(key);
        sessionStorage.removeItem(key);
        if (!raw) return null;
        const stored = JSON.parse(raw) as StoredAssistantAction;
        if (
            !stored?.savedAt ||
            Date.now() - stored.savedAt > MAX_AGE_MS ||
            stored.action?.id !== id ||
            stored.action?.type !== expectedType ||
            !stored.action.requiresConfirmation ||
            !stored.action.payload ||
            typeof stored.action.payload !== 'object'
        ) {
            return null;
        }
        return stored.action as AssistantActionProposal & { payload: T };
    } catch {
        sessionStorage.removeItem(key);
        return null;
    }
};
