import api from '../lib/api';
import type { PaginatedResponse } from '../types';

const BASE = '/material-custody';

export type ReuseTrackingMode = 'none' | 'quantity' | 'serialized';
export type CustodyHolderType = 'employee' | 'team';
export type CustodyCampaignStatus = 'active' | 'recalling' | 'closed';
export type CustodyAssignmentStatus = 'active' | 'partial' | 'recall_due' | 'resolved';
export type CustodyResolution = 'usable' | 'repair' | 'damaged' | 'lost';

export interface MaterialRecipient {
    id: string;
    employeeCode: string;
    fullName: string;
    plantId: string;
    department?: string;
    lineName?: string;
    phone?: string;
    isActive: boolean;
    createdAt?: string;
    updatedAt?: string;
}

export interface MaterialUsageCampaign {
    id: string;
    campaignCode: string;
    plantId: string;
    productionItemId?: string;
    itemCode: string;
    itemName?: string;
    orderCode?: string;
    status: CustodyCampaignStatus;
    startedAt: string;
    recallOpenedAt?: string;
    dueAt?: string;
    closedAt?: string;
    note?: string;
    assignmentCount: number;
    issuedQuantity: number;
    transferredInQuantity: number;
    outstandingQuantity: number;
    holderCount: number;
}

export interface MaterialCustodyAssignment {
    id: string;
    plantId: string;
    materialId: string;
    materialCode?: string;
    materialName: string;
    unit: string;
    trackingMode: Exclude<ReuseTrackingMode, 'none'>;
    holderType: CustodyHolderType;
    recipientId?: string;
    holderCode?: string;
    holderName: string;
    department?: string;
    lineName?: string;
    campaignId: string;
    productionItemId?: string;
    itemCode: string;
    itemName?: string;
    orderCode?: string;
    sourceType: 'new_stock' | 'opening_balance' | 'reusable_pool' | 'custody_transfer';
    sourceDistributionId?: string;
    sourceAssignmentId?: string;
    quantityIssued: number;
    quantityReturnedUsable: number;
    quantityReturnedRepair: number;
    quantityReturnedDamaged: number;
    quantityLost: number;
    quantityTransferred: number;
    outstandingQuantity: number;
    unitPrice: number;
    outstandingValue: number;
    status: CustodyAssignmentStatus;
    issuedAt: string;
    dueAt?: string;
    resolvedAt?: string;
    overdue: boolean;
    note?: string;
}

export interface ReusableMaterialStock {
    id: string;
    plantId: string;
    materialId: string;
    materialCode?: string;
    materialName: string;
    unit: string;
    trackingMode: Exclude<ReuseTrackingMode, 'none'>;
    availableQuantity: number;
    repairQuantity: number;
    damagedQuantity: number;
    lastMovementAt?: string;
    availableReferenceValue?: number;
    repairReferenceValue?: number;
    damagedReferenceValue?: number;
}

export type ReusableBucket = 'available' | 'repair' | 'damaged';
export type ReusableAction = 'repair_complete' | 'mark_damaged' | 'dispose';
export interface ReusableProcessPayload {
    action: ReusableAction;
    fromBucket: ReusableBucket;
    quantity: number;
    referenceUnitPrice?: number;
    note: string;
}
export interface ReusableMovement {
    id: string;
    type: ReusableAction | 'return' | 'reissue';
    fromBucket?: ReusableBucket;
    toBucket?: ReusableBucket;
    quantity: number;
    referenceValue?: number;
    note?: string;
    performedBy?: { fullName?: string; name?: string; email?: string };
    occurredAt: string;
}

export interface MaterialCustodySummary {
    totalAssignments: number;
    openAssignments: number;
    overdueAssignments: number;
    outstandingQuantity: number;
    outstandingValue: number;
    activeHolderCount: number;
    lostQuantity: number;
    damagedQuantity: number;
    reusableMaterialCount: number;
    reusableAvailableQuantity: number;
    reusableRepairQuantity: number;
    reusableDamagedQuantity: number;
    activeCampaigns: number;
    recallingCampaigns: number;
    activeRecipientCount: number;
}

export interface ProductionItemReference {
    id: string;
    code: string;
    name?: string;
    isActive: boolean;
}

export interface TrackedMaterialReference {
    id: string;
    code?: string;
    name: string;
    unit: string;
    trackingMode: Exclude<ReuseTrackingMode, 'none'>;
    defaultReturnDays: number;
}

export interface CustodyMovement {
    id: string;
    assignmentId: string;
    type: 'issue' | 'return' | 'loss' | 'transfer_out' | 'transfer_in' | 'adjustment';
    resolution?: CustodyResolution;
    quantity: number;
    note?: string;
    evidenceUrls: string[];
    performedBy?: string;
    occurredAt: string;
}

export interface RecipientImportPreview {
    summary: { totalRows: number; validRows: number; invalidRows: number; toCreate: number; toUpdate: number };
    rows: Array<{
        rowNumber: number;
        isValid: boolean;
        action?: 'create' | 'update';
        values: {
            employeeCode: string;
            fullName: string;
            department: string;
            lineName: string;
            phone: string;
            isActive: boolean;
        };
        errors: string[];
    }>;
}

const recipientImportForm = (file: File, plantId?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (plantId) form.append('plantId', plantId);
    return form;
};

export const materialCustodyService = {
    processReusableStock: (id: string, data: ReusableProcessPayload): Promise<void> =>
        api.post(`${BASE}/reusable-stock/${id}/process`, data),
    getReusableMovements: (id: string, page = 1): Promise<PaginatedResponse<ReusableMovement>> =>
        api.get(`${BASE}/reusable-stock/${id}/movements`, { params: { page, limit: 15 } }),
    getSummary: (plantId?: string): Promise<MaterialCustodySummary> =>
        api.get(`${BASE}/summary`, { params: { plantId } }),
    exportReport: (params?: Record<string, unknown>): Promise<Blob> =>
        api.get(`${BASE}/export`, { params, responseType: 'blob' }),
    getAssignments: (params?: Record<string, unknown>): Promise<PaginatedResponse<MaterialCustodyAssignment>> =>
        api.get(`${BASE}/assignments`, { params }),
    getAssignmentMovements: (
        id: string
    ): Promise<{ assignment: MaterialCustodyAssignment; movements: CustodyMovement[] }> =>
        api.get(`${BASE}/assignments/${id}/movements`),
    resolveAssignment: (
        id: string,
        data: {
            quantity: number;
            resolution: CustodyResolution;
            occurredAt?: string;
            note?: string;
            evidenceUrls?: string[];
        }
    ): Promise<MaterialCustodyAssignment> => api.post(`${BASE}/assignments/${id}/resolve`, data),
    transferAssignment: (
        id: string,
        data: {
            quantity: number;
            holderType: CustodyHolderType;
            recipientId?: string;
            holderName?: string;
            holderCode?: string;
            department?: string;
            lineName?: string;
            campaignId: string;
            dueAt?: string;
            note?: string;
        }
    ): Promise<MaterialCustodyAssignment> => api.post(`${BASE}/assignments/${id}/transfer`, data),
    getCampaigns: (params?: Record<string, unknown>): Promise<PaginatedResponse<MaterialUsageCampaign>> =>
        api.get(`${BASE}/campaigns`, { params }),
    createCampaign: (data: {
        plantId?: string;
        productionItemId?: string;
        itemCode?: string;
        itemName?: string;
        orderCode?: string;
        startedAt?: string;
        note?: string;
    }): Promise<MaterialUsageCampaign> => api.post(`${BASE}/campaigns`, data),
    openRecall: (id: string, data: { dueAt: string; note?: string }): Promise<MaterialUsageCampaign> =>
        api.post(`${BASE}/campaigns/${id}/open-recall`, data),
    closeCampaign: (id: string): Promise<MaterialUsageCampaign> => api.post(`${BASE}/campaigns/${id}/close`),
    getRecipients: (params?: Record<string, unknown>): Promise<PaginatedResponse<MaterialRecipient>> =>
        api.get(`${BASE}/recipients`, { params }),
    createRecipient: (data: Omit<MaterialRecipient, 'id' | 'createdAt' | 'updatedAt'>): Promise<MaterialRecipient> =>
        api.post(`${BASE}/recipients`, data),
    updateRecipient: (id: string, data: Partial<MaterialRecipient>): Promise<MaterialRecipient> =>
        api.patch(`${BASE}/recipients/${id}`, data),
    downloadRecipientTemplate: (plantId?: string): Promise<Blob> =>
        api.get(`${BASE}/recipients/import-template`, { params: { plantId }, responseType: 'blob' }),
    previewRecipientImport: (file: File, plantId?: string): Promise<RecipientImportPreview> =>
        api.post(`${BASE}/recipients/import/preview`, recipientImportForm(file, plantId)),
    confirmRecipientImport: (
        file: File,
        plantId?: string
    ): Promise<{ created: number; updated: number; errors: number; total: number }> =>
        api.post(`${BASE}/recipients/import/confirm`, recipientImportForm(file, plantId)),
    getReusableStock: (plantId?: string): Promise<ReusableMaterialStock[]> =>
        api.get(`${BASE}/reusable-stock`, { params: { plantId } }),
    reissue: (data: {
        referenceUnitPrice?: number;
        plantId?: string;
        materialId: string;
        quantity: number;
        holderType: CustodyHolderType;
        recipientId?: string;
        holderName?: string;
        holderCode?: string;
        department?: string;
        lineName?: string;
        campaignId: string;
        dueAt?: string;
        note?: string;
    }): Promise<MaterialCustodyAssignment> => api.post(`${BASE}/reissue`, data),
    createOpeningBalance: (data: {
        plantId?: string;
        materialId: string;
        quantity: number;
        unitPrice?: number;
        issuedAt?: string;
        holderType: CustodyHolderType;
        recipientId?: string;
        holderName?: string;
        holderCode?: string;
        department?: string;
        lineName?: string;
        campaignId: string;
        dueAt?: string;
        note?: string;
    }): Promise<MaterialCustodyAssignment> => api.post(`${BASE}/assignments/opening-balance`, data),
    getProductionItems: (plantId?: string, search?: string): Promise<ProductionItemReference[]> =>
        api.get(`${BASE}/references/production-items`, { params: { plantId, search } }),
    getTrackedMaterials: (): Promise<TrackedMaterialReference[]> => api.get(`${BASE}/references/materials`),
};
