import api from '../lib/api';
import axiosInstance from '../lib/axios';
import type { PaginatedResponse, Plant, User } from '../types';

const MATERIALS_BASE = '/materials';
const MATERIAL_SUPPLIERS_BASE = '/material-suppliers';
const PURCHASE_REQUESTS_BASE = '/purchase-requests';
const SUPPLY_REQUESTS_BASE = '/supply-requests';
const TECHNICAL_PURCHASE_BASE = '/technical-purchase-requests';
const PURCHASE_ORDERS_BASE = '/purchase-orders';
const INVENTORY_BASE = '/inventory';
const DISTRIBUTIONS_BASE = '/distributions';
const SUPPLY_SHORTAGES_BASE = '/supply-shortages';

async function downloadFile(url: string, filename: string): Promise<void> {
    // axiosInstance interceptor returns response.data directly, so result is the Blob
    const data: any = await axiosInstance.get(url, { responseType: 'blob' });
    const blob = data instanceof Blob ? data : new Blob([data]);
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(objectUrl);
}

export type MaterialStatus = 'active' | 'inactive';
export type PurchaseRequestStatus =
    | 'draft'
    | 'pending'
    | 'approved'
    | 'rejected'
    | 'ordered'
    | 'received'
    | 'in_progress'
    | 'partially_distributed'
    | 'distributed'
    | 'cancelled';
export type PurchaseOrderStatus =
    | 'draft'
    | 'sent'
    | 'confirmed'
    | 'ordered'
    | 'partially_received'
    | 'received'
    | 'cancelled';
export type DistributionStatus = 'draft' | 'pending' | 'processing' | 'distributed' | 'confirmed';
export type DistributionType = 'facility_transfer' | 'internal_issue';
export type InventoryTransactionType = 'import' | 'export' | 'adjust' | 'adjustment';
export type InventoryTransactionRelatedType = 'purchase_order' | 'distribution' | 'manual';

// Phân loại bản chất chi phí: consumable+spare_part = OPEX (tính chi phí vận hành);
// tool+asset = CAPEX (mua sắm/đầu tư, tách riêng). Rỗng = chưa phân loại.
export type MaterialCostType = 'consumable' | 'spare_part' | 'tool' | 'asset';

export const MATERIAL_COST_TYPE_LABEL: Record<MaterialCostType, string> = {
    consumable: 'Vật tư tiêu hao',
    spare_part: 'Linh kiện thay thế',
    tool: 'CCDC (tái sử dụng)',
    asset: 'Máy móc / tài sản',
};

export const MATERIAL_COST_TYPE_OPTIONS: { value: MaterialCostType; label: string }[] = (
    Object.keys(MATERIAL_COST_TYPE_LABEL) as MaterialCostType[]
).map((value) => ({ value, label: MATERIAL_COST_TYPE_LABEL[value] }));

export interface Material {
    id: string;
    code: string;
    name: string;
    category?: string;
    costType?: MaterialCostType;
    unit: string;
    minStockLevel?: number;
    description?: string;
    trackInventory?: boolean;
    isActive: boolean;
    totalCurrentStock?: number;
    lowStock?: boolean;
    createdAt: string;
    updatedAt: string;
    deletedAt?: string | null;
}

export interface MaterialPayload {
    code?: string;
    name: string;
    category?: string;
    unit: string;
    minStockLevel?: number;
    description?: string;
    trackInventory?: boolean;
    isActive?: boolean;
}

export interface MaterialQueryParams {
    search?: string;
    code?: string;
    category?: string;
    isActive?: boolean;
    page?: number;
    limit?: number;
}

export interface MaterialSupplier {
    id: string;
    code?: string;
    name: string;
    contactName?: string;
    contactPerson?: string;
    phone?: string;
    email?: string;
    address?: string;
    note?: string;
    isActive?: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface MaterialSupplierPayload {
    code?: string;
    name: string;
    contactName?: string;
    contactPerson?: string;
    phone?: string;
    email?: string;
    address?: string;
    note?: string;
    isActive?: boolean;
}

export interface PurchaseRequestItem {
    id?: string;
    materialId?: string;
    material?: Material;
    materialName: string;
    unit?: string;
    proposedBy?: string;
    purpose?: string;
    plantId?: string;
    quantityRequested: number;
    quantityApproved?: number;
    quantityOrdered?: number;
    unitPrice?: number;
    totalPrice?: number;
    vatRate?: number;
    vatAmount?: number;
    totalWithVat?: number;
    orderDate?: string;
    receivedDate?: string;
    supplierName?: string;
    supplierNote?: string;
    estimatedPrice?: number;
    estimatedTotal?: number;
    supplierId?: string;
    supplier?: MaterialSupplier;
    catalogStatus?: 'matched' | 'unmatched' | 'ignored';
    note?: string;
}

export interface PurchaseRequestItemPayload {
    materialId?: string;
    materialName: string;
    unit?: string;
    proposedBy: string;
    purpose: string;
    plantId?: string;
    quantityRequested: number;
    quantityOrdered?: number;
    unitPrice?: number;
    vatRate?: number;
    orderDate?: string;
    receivedDate?: string;
    supplierId?: string;
    supplierName?: string;
    supplierNote?: string;
    catalogStatus?: 'matched' | 'unmatched' | 'ignored';
    note?: string;
}

export interface PurchaseRequest {
    id: string;
    requestCode?: string;
    requestType?: 'purchase' | 'supply_request' | 'technical_purchase';
    requesterName?: string;
    department?: string;
    plantId: string;
    plant?: Plant;
    fromPlantId?: string;
    fromPlant?: Plant;
    toPlantId?: string;
    toPlant?: Plant;
    requestedBy?: string | User;
    approvedBy?: string | User;
    items: PurchaseRequestItem[];
    totalEstimated?: number;
    totalActual?: number;
    totalWithVat?: number;
    requestMonth?: number;
    requestYear?: number;
    requestDate?: string;
    note?: string;
    status: PurchaseRequestStatus;
    createdAt: string;
    updatedAt: string;
    approvedAt?: string;
    rejectedAt?: string;
    rejectedBy?: string | User;
    rejectedReason?: string;
}

export interface PurchaseRequestPayload {
    plantId?: string;
    fromPlantId?: string;
    toPlantId?: string;
    requestMonth?: number;
    requestYear?: number;
    requestDate?: string;
    status?: PurchaseRequestStatus;
    note?: string;
    items: PurchaseRequestItemPayload[];
}

export interface ApprovePurchaseRequestItemPayload {
    materialId: string;
    quantityApproved?: number;
    estimatedPrice?: number;
    supplierId?: string;
    note?: string;
}

export interface ApprovePurchaseRequestPayload {
    items?: ApprovePurchaseRequestItemPayload[];
    note?: string;
}

export interface PurchaseRequestQueryParams {
    search?: string;
    plantId?: string;
    fromPlantId?: string;
    toPlantId?: string;
    requestedBy?: string;
    status?: PurchaseRequestStatus;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
}

export interface ConsolidatePurchaseRequestsPayload {
    requestIds: string[];
    supplierId?: string;
    note?: string;
}

export interface PurchaseOrderItem {
    purchaseRequestId?: string;
    purchaseRequestCode?: string;
    sourceLines?: Array<{
        purchaseRequestId?: string;
        purchaseRequestCode?: string;
        requestItemIndex?: number;
        materialId?: string;
        materialName?: string;
        unit?: string;
        plantId?: string;
        plantName?: string;
        proposedBy?: string;
        purpose?: string;
        quantityRequested?: number;
        quantityOrdered?: number;
    }>;
    materialId?: string;
    material?: Material; // backward compat
    materialName?: string;
    unit?: string;
    quantityRequested?: number;
    quantityOrdered?: number;
    quantityReceived?: number;
    quantityMissing?: number;
    receiveStatus?: 'pending' | 'partially_received' | 'received';
    quantity?: number; // backward compat alias
    unitPrice?: number;
    totalPrice?: number;
    vatRate?: number;
    vatAmount?: number;
    totalWithVat?: number;
    supplierId?: string;
    supplierName?: string;
    plantName?: string;
    proposedBy?: string;
    purpose?: string;
    catalogStatus?: 'matched' | 'unmatched' | 'ignored';
    quantityInventoried?: number;
    inventoryStatus?: 'pending' | 'applied' | 'skipped';
    inventorySkipReason?: string;
    note?: string;
}

export interface PurchaseOrderItemUpdate {
    index: number;
    quantityOrdered?: number;
    unitPrice?: number;
    vatRate?: number;
    supplierId?: string;
    supplierName?: string;
    note?: string;
}

export interface PurchaseOrder {
    id: string;
    orderCode?: string;
    purchaseRequestIds?: string[];
    purchaseRequestCodes?: string[];
    plantId?: string;
    // backward compat
    requestIds?: string[];
    requests?: PurchaseRequest[];
    supplierId?: string;
    supplier?: MaterialSupplier;
    supplierName?: string;
    items: PurchaseOrderItem[];
    totalAmount?: number;
    totalVat?: number;
    totalWithVat?: number;
    status: PurchaseOrderStatus;
    note?: string;
    createdBy?: string | User;
    orderedBy?: string | User;
    orderedAt?: string;
    receivedBy?: string | User;
    receivedAt?: string;
    createdAt: string;
    updatedAt: string;
}

export interface PurchaseOrderPayload {
    supplierId?: string;
    supplierName?: string;
    requestIds?: string[];
    purchaseRequestIds?: string[];
    status?: PurchaseOrderStatus;
    items?: PurchaseOrderItemUpdate[];
    orderedAt?: string;
    note?: string;
}

// backward compat alias
export type PurchaseOrderItemPayload = PurchaseOrderItemUpdate;

export interface PurchaseOrderQueryParams {
    search?: string;
    supplierId?: string;
    status?: PurchaseOrderStatus;
    startDate?: string;
    endDate?: string;
    plantId?: string;
    page?: number;
    limit?: number;
}

export interface ReceivePurchaseOrderPayload {
    plantId?: string;
    receiptScanId?: string;
    items?: Array<{ index: number; quantityReceived: number; markShortage?: boolean; note?: string }>;
    shortageAllocations?: Array<{ shortageId: string; quantityReceived: number; note?: string }>;
    receivedAt?: string;
    note?: string;
}

export interface PurchaseReceiptScanLine {
    pageIndex?: number;
    lineNo?: number;
    materialName: string;
    unit?: string;
    quantity?: number;
    unitPrice?: number;
    vatRate?: number;
    supplierName?: string;
    note?: string;
    rawText?: string;
    confidence?: number;
}

export interface PurchaseReceiptScanPreview {
    scanId?: string;
    available: boolean;
    provider?: string;
    model?: string;
    latencyMs?: number;
    header?: {
        supplierName?: string;
        invoiceNo?: string;
        deliveryCode?: string;
        invoiceDate?: string;
        receivedDate?: string;
    };
    extractedLines: PurchaseReceiptScanLine[];
    currentAllocations: Array<{
        sourceLine: PurchaseReceiptScanLine;
        poItemIndex: number;
        materialName: string;
        unit?: string;
        quantity: number;
        confidence?: number;
        reason?: string;
    }>;
    shortageAllocations: Array<{
        sourceLine: PurchaseReceiptScanLine;
        shortageId: string;
        originalPurchaseOrderCode?: string;
        materialName: string;
        unit?: string;
        quantity: number;
        confidence?: number;
        reason?: string;
    }>;
    reviewLines: Array<{
        sourceLine: PurchaseReceiptScanLine;
        quantity: number;
        reason: string;
    }>;
    shortageMarks: Array<{
        index: number;
        materialName: string;
        remainingAfterReceipt: number;
        reason: string;
    }>;
    proposedPayload: ReceivePurchaseOrderPayload;
    summary: {
        extractedLineCount: number;
        currentOrderQuantity: number;
        shortageResolvedQuantity: number;
        reviewQuantity: number;
        reviewLineCount: number;
        shortageMarkCount: number;
    };
}

export interface PurchaseReceiptScanHistoryItem {
    id: string;
    purchaseOrderId: string;
    purchaseOrderCode?: string;
    status: 'preview' | 'applied' | 'discarded';
    fileCount?: number;
    header?: PurchaseReceiptScanPreview['header'];
    summary?: Partial<PurchaseReceiptScanPreview['summary']>;
    provider?: string;
    model?: string;
    latencyMs?: number;
    createdBy?: string;
    appliedBy?: string;
    appliedAt?: string;
    createdAt?: string;
    updatedAt?: string;
}

export interface PurchaseShortage {
    id: string;
    originalPurchaseOrderId: string;
    originalPurchaseOrderCode?: string;
    originalItemIndex: number;
    supplierId?: string;
    supplierName?: string;
    materialId?: string;
    materialName: string;
    unit?: string;
    quantityMissing: number;
    quantityResolved: number;
    quantityOutstanding: number;
    status: 'outstanding' | 'partially_settled' | 'settled' | 'cancelled';
    createdAt?: string;
    updatedAt?: string;
}

export interface MaterialInventory {
    id?: string;
    materialId: string;
    material?: Material;
    plantId: string;
    plant?: Plant;
    currentStock: number;
    minStockLevel?: number;
    lowStock?: boolean;
    lastUpdated?: string;
}

export interface InventoryQueryParams {
    search?: string;
    category?: string;
    plantId?: string;
    page?: number;
    limit?: number;
}

export interface InventoryTransaction {
    id: string;
    materialId: string;
    material?: Material;
    plantId: string;
    plant?: Plant;
    type: InventoryTransactionType | string;
    quantity: number;
    stockBefore?: number;
    stockAfter?: number;
    relatedId?: string;
    relatedType?: InventoryTransactionRelatedType | string;
    performedBy?: string | User;
    note?: string;
    referenceCode?: string;
    createdAt: string;
    updatedAt?: string;
}

export interface MaterialInventoryDetailResponse {
    material: Material;
    stocks: MaterialInventory[];
}

export interface InventoryTransactionQueryParams {
    materialId?: string;
    plantId?: string;
    type?: InventoryTransactionType | string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
}

export interface DistributionItem {
    id?: string;
    materialId?: string;
    material?: Material;
    materialName?: string;
    unit?: string;
    quantity: number;
    quantityRequested?: number;
    quantityDistributed?: number;
    quantityShortage?: number;
    sourceRequestItemIndex?: number;
    sourceShortageId?: string;
    fulfillmentStatus?: 'fulfilled' | 'partial' | 'not_supplied';
    unitPrice?: number;
    totalPrice?: number;
    vatRate?: number;
    vatAmount?: number;
    totalWithVat?: number;
    catalogStatus?: 'matched' | 'unmatched' | 'ignored';
    quantityInventoried?: number;
    inventoryStatus?: 'pending' | 'applied' | 'skipped';
    inventorySkipReason?: string;
    adjustReason?: string;
    note?: string;
}

export interface DistributionItemPayload {
    materialId?: string;
    materialName?: string;
    unit?: string;
    quantity: number;
    quantityRequested?: number;
    quantityDistributed?: number;
    quantityShortage?: number;
    sourceRequestItemIndex?: number;
    sourceShortageId?: string;
    fulfillmentStatus?: 'fulfilled' | 'partial' | 'not_supplied';
    unitPrice?: number;
    vatRate?: number;
    catalogStatus?: 'matched' | 'unmatched' | 'ignored';
    inventorySkipReason?: string;
    adjustReason?: string;
    note?: string;
}

export interface Distribution {
    id: string;
    distributionCode?: string;
    distributionType?: DistributionType;
    purchaseOrderId?: string;
    purchaseOrder?: PurchaseOrder;
    supplyRequestId?: string;
    supplyRequest?: PurchaseRequest;
    fromPlantId: string;
    fromPlant?: Plant;
    toPlantId: string;
    toPlant?: Plant;
    items: DistributionItem[];
    note?: string;
    status: DistributionStatus;
    distributedBy?: string | User;
    distributedAt?: string;
    confirmedBy?: string | User;
    createdAt: string;
    updatedAt: string;
    confirmedAt?: string;
    requesterName?: string;
    targetDepartment?: string;
    targetLine?: string;
    isCompensation?: boolean;
    compensationForShortageIds?: string[];
}

export interface SupplyShortage {
    id: string;
    originalSupplyRequestId: string;
    originalSupplyRequestCode?: string;
    originalDistributionId: string;
    originalDistributionCode?: string;
    originalItemIndex: number;
    toPlantId: string;
    toPlant?: Plant;
    materialId?: string;
    material?: Material;
    materialName: string;
    unit?: string;
    quantityRequested: number;
    quantityDistributed: number;
    quantityShortage: number;
    quantityResolved: number;
    quantityOutstanding: number;
    status: 'outstanding' | 'partially_settled' | 'settled' | 'cancelled';
    reason?: string;
    note?: string;
    createdAt?: string;
    updatedAt?: string;
}

export interface DistributionPayload {
    purchaseOrderId?: string;
    fromPlantId?: string;
    toPlantId: string;
    supplyRequestId?: string;
    distributedAt?: string;
    items: DistributionItemPayload[];
    note?: string;
}

export interface InternalDistributionPayload {
    distributedAt?: string;
    requesterName: string;
    targetDepartment?: string;
    targetLine?: string;
    items: DistributionItemPayload[];
    note?: string;
    status?: 'draft' | 'confirmed';
}

export interface DistributionQueryParams {
    search?: string;
    fromPlantId?: string;
    toPlantId?: string;
    distributionType?: DistributionType;
    status?: DistributionStatus;
    startDate?: string;
    endDate?: string;
    supplyRequestId?: string;
    page?: number;
    limit?: number;
}

export interface MaterialReportQueryParams {
    plantId?: string;
    startDate?: string;
    endDate?: string;
    materialId?: string;
    category?: string;
    supplierId?: string;
    status?: string;
    groupBy?: 'day' | 'week' | 'month' | 'quarter';
}

export interface MaterialCostByPeriodQueryParams extends MaterialReportQueryParams {
    year?: number;
    period?: 'month' | 'quarter';
}

export interface MaterialReportSummary {
    totalMaterials?: number;
    totalMonthlyCost?: number;
    totalPurchaseCost?: number;
    totalDistributionCost?: number;
    totalRefund?: number;
    totalNetPurchaseCost?: number;
    totalPriceVariance?: number;
    distributionRecordCount?: number;
    pendingRequestCount?: number;
    totalCostThisMonth?: number;
    pendingPurchaseRequests?: number;
    lowStockCount?: number;
    monthlyCosts?: MaterialMonthlyCostPoint[];
    topConsumedMaterials?: TopConsumedMaterial[];
}

export interface MaterialMonthlyCostPoint {
    month: string;
    totalCost: number;
}

export interface MaterialCostByPeriodPoint {
    period: string;
    totalAmount: number;
}

export interface TopConsumedMaterial {
    materialId?: string;
    materialCode?: string;
    materialName: string;
    category?: string;
    unit?: string;
    quantity?: number;
    totalQuantityOut?: number;
    currentStock?: number;
    minStockLevel?: number;
    totalAmount?: number;
}

export interface SupplierReportRow {
    supplierId?: string;
    supplierName: string;
    orderCount?: number;
    totalAmount?: number;
}

export interface DistributionCostByPlant {
    plantId: string;
    plantName: string;
    totalWithVat: number;
    totalAmount: number;
    count: number;
}

export interface DistributionCostByPeriod {
    period: string;
    totalWithVat: number;
    count: number;
}

export interface DistributionCostReport {
    byPlant: DistributionCostByPlant[];
    byPeriod: DistributionCostByPeriod[];
}

export interface MaterialCostFlowByPlant {
    plantId?: string;
    plantName: string;
    purchaseCost: number;
    distributionCost: number;
    totalCost: number;
    purchaseOrderCount: number;
    distributionCount: number;
    purchaseItemCount: number;
    distributionItemCount: number;
    canPurchase: boolean;
    purchaseOrderIds?: string[];
    distributionIds?: string[];
}

export interface PriceComparisonReportRow {
    orderId: string;
    orderCode?: string;
    supplierId?: string;
    supplierName: string;
    requestCodes?: string[];
    estimatedTotal?: number;
    actualTotal?: number;
    refundTotal?: number;
    netActual?: number;
    difference?: number;
    orderedAt?: string;
    receivedAt?: string;
    status?: PurchaseOrderStatus | string;
}

export type MaterialListApiResponse = Material[] | PaginatedResponse<Material>;
export type MaterialSupplierListApiResponse = MaterialSupplier[] | PaginatedResponse<MaterialSupplier>;
export type PurchaseRequestListApiResponse = PurchaseRequest[] | PaginatedResponse<PurchaseRequest>;
export type PurchaseOrderListApiResponse = PurchaseOrder[] | PaginatedResponse<PurchaseOrder>;
export type InventoryListApiResponse = MaterialInventory[] | PaginatedResponse<MaterialInventory>;
export type InventoryTransactionListApiResponse = InventoryTransaction[] | PaginatedResponse<InventoryTransaction>;
export type DistributionListApiResponse = Distribution[] | PaginatedResponse<Distribution>;
export type SupplyShortageListApiResponse = SupplyShortage[] | PaginatedResponse<SupplyShortage>;

const shouldFallbackToSupplierSoftDelete = (error: unknown) => {
    if (!error || typeof error !== 'object' || !('status' in error)) {
        return false;
    }

    return [404, 405, 501].includes(Number(error.status));
};

export interface MaterialCostTypeSuggestion {
    id: string;
    name?: string;
    code?: string;
    category?: string;
    unit?: string;
    currentCostType?: MaterialCostType;
    suggestedCostType?: MaterialCostType;
    confidence?: number;
}

export interface MaterialCostTypeSuggestResponse {
    total: number;
    items: MaterialCostTypeSuggestion[];
    provider?: string;
    model?: string;
}

export const materialService = {
    getAll: (params?: MaterialQueryParams): Promise<MaterialListApiResponse> =>
        api.get<MaterialListApiResponse>(MATERIALS_BASE, { params }),

    // AI đề xuất phân loại chi phí cho danh mục (không lưu — trả đề xuất để rà).
    suggestCostTypes: (onlyUnclassified = false): Promise<MaterialCostTypeSuggestResponse> =>
        api.post<MaterialCostTypeSuggestResponse, Record<string, never>>(
            `${MATERIALS_BASE}/cost-type/suggest`,
            {} as Record<string, never>,
            { params: { onlyUnclassified }, timeout: 180000 }
        ),

    // Lưu phân loại chi phí hàng loạt sau khi người dùng rà/sửa.
    saveCostTypes: (items: { id: string; costType?: MaterialCostType | null }[]): Promise<{ updated: number }> =>
        api.patch<{ updated: number }, { items: { id: string; costType?: MaterialCostType | null }[] }>(
            `${MATERIALS_BASE}/cost-type`,
            { items }
        ),

    getById: (id: string): Promise<Material> => api.get<Material>(`${MATERIALS_BASE}/${id}`),

    getLowStock: (params?: InventoryQueryParams): Promise<Material[]> =>
        api.get<Material[]>(`${MATERIALS_BASE}/low-stock`, { params }),

    create: (data: MaterialPayload): Promise<Material> => api.post<Material, MaterialPayload>(MATERIALS_BASE, data),

    update: (id: string, data: Partial<MaterialPayload>): Promise<Material> =>
        api.put<Material, Partial<MaterialPayload>>(`${MATERIALS_BASE}/${id}`, data),

    delete: (id: string): Promise<void> => api.delete(`${MATERIALS_BASE}/${id}`),

    exportExcel: () => downloadFile(`${MATERIALS_BASE}/export-excel`, 'danh-muc-vat-tu.xlsx'),

    downloadTemplate: () => downloadFile(`${MATERIALS_BASE}/import-template`, 'mau-nhap-vat-tu.xlsx'),

    previewImport: (
        file: File
    ): Promise<{
        summary: { totalRows: number; validRows: number; invalidRows: number; toCreate: number; toUpdate: number };
        rows: Array<{
            rowNumber: number;
            isValid: boolean;
            action?: string;
            values: { code: string; name: string; category: string; unit: string; minStockLevel: number };
            errors: string[];
        }>;
    }> => {
        const fd = new FormData();
        fd.append('file', file);
        return api.post(`${MATERIALS_BASE}/import/preview`, fd, { headers: { 'Content-Type': undefined } });
    },

    confirmImport: (file: File): Promise<{ created: number; updated: number; errors: number; total: number }> => {
        const fd = new FormData();
        fd.append('file', file);
        return api.post(`${MATERIALS_BASE}/import/confirm`, fd, { headers: { 'Content-Type': undefined } });
    },
};

export const materialSupplierService = {
    getAll: (params?: {
        search?: string;
        isActive?: boolean;
        page?: number;
        limit?: number;
    }): Promise<MaterialSupplierListApiResponse> =>
        api.get<MaterialSupplierListApiResponse>(MATERIAL_SUPPLIERS_BASE, { params }),

    getById: (id: string): Promise<MaterialSupplier> => api.get<MaterialSupplier>(`${MATERIAL_SUPPLIERS_BASE}/${id}`),

    create: (data: MaterialSupplierPayload): Promise<MaterialSupplier> =>
        api.post<MaterialSupplier, MaterialSupplierPayload>(MATERIAL_SUPPLIERS_BASE, data),

    update: (id: string, data: Partial<MaterialSupplierPayload>): Promise<MaterialSupplier> =>
        api.put<MaterialSupplier, Partial<MaterialSupplierPayload>>(`${MATERIAL_SUPPLIERS_BASE}/${id}`, data),

    delete: async (id: string): Promise<void | MaterialSupplier> => {
        try {
            return await api.delete<void>(`${MATERIAL_SUPPLIERS_BASE}/${id}`);
        } catch (error) {
            if (!shouldFallbackToSupplierSoftDelete(error)) {
                throw error;
            }

            return api.put<MaterialSupplier, Partial<MaterialSupplierPayload>>(`${MATERIAL_SUPPLIERS_BASE}/${id}`, {
                isActive: false,
            });
        }
    },
};

export type ApprovalReviewFlag = {
    severity: 'high' | 'medium' | 'info';
    type: string;
    item?: string;
    message: string;
};

export type ApprovalReviewResult = {
    requestCode: string;
    overall: 'ok' | 'review' | 'warn';
    flags: ApprovalReviewFlag[];
    summary: string;
    checkedItems: number;
    historyDepth: number;
};

export const purchaseRequestService = {
    getAll: (params?: PurchaseRequestQueryParams): Promise<PurchaseRequestListApiResponse> =>
        api.get<PurchaseRequestListApiResponse>(PURCHASE_REQUESTS_BASE, { params }),

    getById: (id: string): Promise<PurchaseRequest> => api.get<PurchaseRequest>(`${PURCHASE_REQUESTS_BASE}/${id}`),

    create: (data: PurchaseRequestPayload): Promise<PurchaseRequest> =>
        api.post<PurchaseRequest, PurchaseRequestPayload>(PURCHASE_REQUESTS_BASE, data),

    update: (id: string, data: Partial<PurchaseRequestPayload>): Promise<PurchaseRequest> =>
        api.patch<PurchaseRequest, Partial<PurchaseRequestPayload>>(`${PURCHASE_REQUESTS_BASE}/${id}`, data),

    delete: (id: string): Promise<void> => api.delete(`${PURCHASE_REQUESTS_BASE}/${id}`),

    approve: (id: string, data: ApprovePurchaseRequestPayload = {}): Promise<PurchaseRequest> =>
        api.patch<PurchaseRequest, ApprovePurchaseRequestPayload>(`${PURCHASE_REQUESTS_BASE}/${id}/approve`, data),

    reject: (id: string, reason: string): Promise<PurchaseRequest> =>
        api.patch<PurchaseRequest, { reason: string }>(`${PURCHASE_REQUESTS_BASE}/${id}/reject`, { reason }),

    // Trợ lý duyệt thông minh: rà soát phiếu (giá lệch, SL bất thường, NCC lạ, trùng phiếu) + tóm tắt AI.
    review: (id: string): Promise<ApprovalReviewResult> =>
        api.post<ApprovalReviewResult, Record<string, never>>(`/ai/purchase-request/${id}/review`, {}),

    consolidate: (data: ConsolidatePurchaseRequestsPayload): Promise<PurchaseOrder> =>
        api.post<PurchaseOrder, ConsolidatePurchaseRequestsPayload>(`${PURCHASE_REQUESTS_BASE}/consolidate`, data),

    exportXlsx: async (id: string, code: string): Promise<void> => {
        const data: any = await axiosInstance.get(`${PURCHASE_REQUESTS_BASE}/${id}/export-xlsx`, {
            responseType: 'blob',
        });
        const blob = data instanceof Blob ? data : new Blob([data]);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${code}.xlsx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    },
};

export const supplyRequestService = {
    getAll: (params?: PurchaseRequestQueryParams): Promise<PurchaseRequestListApiResponse> =>
        api.get<PurchaseRequestListApiResponse>(SUPPLY_REQUESTS_BASE, { params }),

    getById: (id: string): Promise<PurchaseRequest> => api.get<PurchaseRequest>(`${SUPPLY_REQUESTS_BASE}/${id}`),

    create: (data: Partial<PurchaseRequestPayload>): Promise<PurchaseRequest> =>
        api.post<PurchaseRequest, Partial<PurchaseRequestPayload>>(SUPPLY_REQUESTS_BASE, data),

    update: (id: string, data: Partial<PurchaseRequestPayload>): Promise<PurchaseRequest> =>
        api.put<PurchaseRequest, Partial<PurchaseRequestPayload>>(`${SUPPLY_REQUESTS_BASE}/${id}`, data),

    approve: (
        id: string,
        payload: { items: Array<{ materialId: string; quantityApproved: number }> }
    ): Promise<PurchaseRequest> => api.patch<PurchaseRequest, any>(`${SUPPLY_REQUESTS_BASE}/${id}/approve`, payload),

    approveAndDistribute: (id: string): Promise<{ supplyRequest: PurchaseRequest; distribution: any }> =>
        api.patch<{ supplyRequest: PurchaseRequest; distribution: any }, void>(
            `${SUPPLY_REQUESTS_BASE}/${id}/approve-and-distribute`
        ),

    reject: (id: string, reason: string): Promise<PurchaseRequest> =>
        api.patch<PurchaseRequest, { reason: string }>(`${SUPPLY_REQUESTS_BASE}/${id}/reject`, { reason }),
};

// ─── Giấy đề nghị mua vật tư (bộ phận kỹ thuật) ─────────────────────────────────
export interface TechnicalPurchaseItemPayload {
    materialName: string;
    unit: string;
    quantityRequested: number;
    note?: string;
}

export interface TechnicalPurchasePayload {
    items: TechnicalPurchaseItemPayload[];
    requesterName?: string;
    department?: string;
    note?: string;
    requestDate?: string;
}

export const technicalPurchaseService = {
    getAll: (params?: PurchaseRequestQueryParams): Promise<PurchaseRequestListApiResponse> =>
        api.get<PurchaseRequestListApiResponse>(TECHNICAL_PURCHASE_BASE, { params }),

    getById: (id: string): Promise<PurchaseRequest> => api.get<PurchaseRequest>(`${TECHNICAL_PURCHASE_BASE}/${id}`),

    create: (data: TechnicalPurchasePayload): Promise<PurchaseRequest> =>
        api.post<PurchaseRequest, TechnicalPurchasePayload>(TECHNICAL_PURCHASE_BASE, data),

    update: (id: string, data: Partial<TechnicalPurchasePayload>): Promise<PurchaseRequest> =>
        api.put<PurchaseRequest, Partial<TechnicalPurchasePayload>>(`${TECHNICAL_PURCHASE_BASE}/${id}`, data),

    approve: (id: string, payload: { items?: Array<{ quantityApproved: number }> } = {}): Promise<PurchaseRequest> =>
        api.patch<PurchaseRequest, any>(`${TECHNICAL_PURCHASE_BASE}/${id}/approve`, payload),

    reject: (id: string, reason: string): Promise<PurchaseRequest> =>
        api.patch<PurchaseRequest, { reason: string }>(`${TECHNICAL_PURCHASE_BASE}/${id}/reject`, { reason }),

    exportXlsx: async (id: string, code: string): Promise<void> => {
        const data: any = await axiosInstance.get(`${TECHNICAL_PURCHASE_BASE}/${id}/export-xlsx`, {
            responseType: 'blob',
        });
        const blob = data instanceof Blob ? data : new Blob([data]);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${code}.xlsx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    },
};

export const purchaseOrderService = {
    getAll: (params?: PurchaseOrderQueryParams): Promise<PurchaseOrderListApiResponse> =>
        api.get<PurchaseOrderListApiResponse>(PURCHASE_ORDERS_BASE, { params }),

    getById: (id: string): Promise<PurchaseOrder> => api.get<PurchaseOrder>(`${PURCHASE_ORDERS_BASE}/${id}`),

    create: (data: { purchaseRequestIds: string[]; note?: string }): Promise<PurchaseOrder> =>
        api.post<PurchaseOrder, any>(PURCHASE_ORDERS_BASE, data),

    update: (id: string, data: { items?: PurchaseOrderItemUpdate[]; note?: string }): Promise<PurchaseOrder> =>
        api.put<PurchaseOrder, any>(`${PURCHASE_ORDERS_BASE}/${id}`, data),

    confirm: (id: string): Promise<PurchaseOrder> => api.patch<PurchaseOrder>(`${PURCHASE_ORDERS_BASE}/${id}/confirm`),

    receive: (id: string, data: ReceivePurchaseOrderPayload): Promise<PurchaseOrder> =>
        api.patch<PurchaseOrder, ReceivePurchaseOrderPayload>(`${PURCHASE_ORDERS_BASE}/${id}/receive`, data),

    previewReceiptScan: (id: string, files: File[]): Promise<PurchaseReceiptScanPreview> => {
        const formData = new FormData();
        files.forEach((file) => formData.append('images', file));
        return api.post<PurchaseReceiptScanPreview, FormData>(
            `${PURCHASE_ORDERS_BASE}/${id}/receipt-scan/preview`,
            formData,
            { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 }
        );
    },

    linkItemMaterial: (id: string, index: number, materialId: string): Promise<PurchaseOrder> =>
        api.patch<PurchaseOrder, { materialId: string }>(`${PURCHASE_ORDERS_BASE}/${id}/items/${index}/link-material`, {
            materialId,
        }),

    createItemMaterial: (id: string, index: number, data: Partial<MaterialPayload>): Promise<PurchaseOrder> =>
        api.post<PurchaseOrder, Partial<MaterialPayload>>(
            `${PURCHASE_ORDERS_BASE}/${id}/items/${index}/create-material`,
            data
        ),

    ignoreItemInventory: (id: string, index: number, reason?: string): Promise<PurchaseOrder> =>
        api.patch<PurchaseOrder, { reason?: string }>(`${PURCHASE_ORDERS_BASE}/${id}/items/${index}/ignore-inventory`, {
            reason,
        }),

    getShortages: (params?: {
        status?: 'open' | string;
        supplierId?: string;
        materialId?: string;
        limit?: number;
    }): Promise<PurchaseShortage[]> => api.get<PurchaseShortage[]>(`${PURCHASE_ORDERS_BASE}/shortages`, { params }),

    getReceiptScans: (id: string, limit = 20): Promise<PurchaseReceiptScanHistoryItem[]> =>
        api.get<PurchaseReceiptScanHistoryItem[]>(`${PURCHASE_ORDERS_BASE}/${id}/receipt-scans`, {
            params: { limit },
        }),

    remove: (id: string): Promise<void> => api.delete(`${PURCHASE_ORDERS_BASE}/${id}`),

    exportXlsx: async (id: string, code: string): Promise<void> => {
        const data: any = await axiosInstance.get(`${PURCHASE_ORDERS_BASE}/${id}/export-xlsx`, {
            responseType: 'blob',
        });
        const blob = data instanceof Blob ? data : new Blob([data]);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${code}.xlsx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    },
};

export const inventoryService = {
    getAll: (params?: InventoryQueryParams): Promise<InventoryListApiResponse> =>
        api.get<InventoryListApiResponse>(INVENTORY_BASE, { params }),

    getByMaterial: (materialId: string, params?: { plantId?: string }): Promise<MaterialInventoryDetailResponse> =>
        api.get<MaterialInventoryDetailResponse>(`${INVENTORY_BASE}/${materialId}`, { params }),

    getTransactions: (params?: InventoryTransactionQueryParams): Promise<InventoryTransactionListApiResponse> =>
        api.get<InventoryTransactionListApiResponse>(`${INVENTORY_BASE}/transactions`, { params }),

    adjust: (data: { materialId: string; plantId: string; quantity: number; note?: string }) =>
        api.post<MaterialInventory, any>(`${INVENTORY_BASE}/adjust`, data),

    overrideStock: (data: { materialId: string; plantId: string; newStock: number; reason: string }) =>
        api.put<any, any>(`${INVENTORY_BASE}/adjust`, data),

    initialize: (data: {
        plantId: string;
        items: Array<{ materialId: string; currentStock: number; note?: string }>;
        reason: string;
    }) => api.post<{ success: number; failed: number; errors: any[] }, any>(`${INVENTORY_BASE}/initialize`, data),

    previewImport: (
        file: File,
        plantId: string
    ): Promise<{
        summary: { totalRows: number; validRows: number; invalidRows: number };
        rows: Array<{
            row: number;
            materialCode: string;
            materialName?: string;
            currentStock?: number;
            newStock: number;
            note: string;
            isValid: boolean;
            reason?: string;
        }>;
    }> => {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('plantId', plantId);
        return api.post(`${INVENTORY_BASE}/import-preview`, fd, { headers: { 'Content-Type': undefined } });
    },

    importExcel: (formData: FormData) =>
        api.post<
            { success: number; failed: number; errors: Array<{ row: number; materialCode: string; reason: string }> },
            FormData
        >(`${INVENTORY_BASE}/import-excel`, formData, { headers: { 'Content-Type': undefined } }),

    downloadTemplate: () => downloadFile(`${INVENTORY_BASE}/import-template`, 'mau-nhap-ton-kho.xlsx'),

    exportStock: (params?: { plantId?: string }) => {
        const query = new URLSearchParams({ type: 'stock' });
        if (params?.plantId) query.set('plantId', params.plantId);
        return downloadFile(`${INVENTORY_BASE}/export-excel?${query.toString()}`, 'bao-cao-ton-kho.xlsx');
    },

    exportHistory: (params: { plantId?: string; startDate?: string; endDate?: string }) => {
        const query = new URLSearchParams({ type: 'history' });
        if (params.plantId) query.set('plantId', params.plantId);
        if (params.startDate) query.set('startDate', params.startDate);
        if (params.endDate) query.set('endDate', params.endDate);
        return downloadFile(`${INVENTORY_BASE}/export-excel?${query.toString()}`, 'lich-su-nhap-xuat.xlsx');
    },
};

export const distributionService = {
    getAll: (params?: DistributionQueryParams): Promise<DistributionListApiResponse> =>
        api.get<DistributionListApiResponse>(DISTRIBUTIONS_BASE, { params }),

    getById: (id: string): Promise<Distribution> => api.get<Distribution>(`${DISTRIBUTIONS_BASE}/${id}`),

    create: (data: DistributionPayload): Promise<Distribution> =>
        api.post<Distribution, DistributionPayload>(DISTRIBUTIONS_BASE, data),

    createCompensation: (data: {
        shortageIds: string[];
        distributedAt?: string;
        items: DistributionItemPayload[];
        note?: string;
    }): Promise<Distribution> => api.post<Distribution, any>(`${DISTRIBUTIONS_BASE}/compensations`, data),

    createInternal: (data: InternalDistributionPayload): Promise<Distribution> =>
        api.post<Distribution, InternalDistributionPayload>(`${DISTRIBUTIONS_BASE}/internal`, data),

    appendInternalItems: (id: string, items: DistributionItemPayload[]): Promise<Distribution> =>
        api.post<Distribution, { items: DistributionItemPayload[] }>(`${DISTRIBUTIONS_BASE}/${id}/internal/items`, {
            items,
        }),

    finalizeInternalDraft: (id: string): Promise<Distribution> =>
        api.patch<Distribution>(`${DISTRIBUTIONS_BASE}/${id}/internal/finalize`),

    update: (
        id: string,
        data: { items?: Array<{ index: number; unitPrice?: number; vatRate?: number; note?: string }>; note?: string }
    ): Promise<Distribution> => api.patch<Distribution, any>(`${DISTRIBUTIONS_BASE}/${id}`, data),

    // CS1 xuất kho → trừ stock
    distribute: (id: string): Promise<Distribution> =>
        api.patch<Distribution>(`${DISTRIBUTIONS_BASE}/${id}/distribute`),

    // CS nhận xác nhận → chỉ update status
    confirm: (id: string): Promise<Distribution> => api.patch<Distribution>(`${DISTRIBUTIONS_BASE}/${id}/confirm`),

    exportXlsx: async (id: string, code: string): Promise<void> => {
        const data: any = await axiosInstance.get(`${DISTRIBUTIONS_BASE}/${id}/export-xlsx`, { responseType: 'blob' });
        const blob = data instanceof Blob ? data : new Blob([data]);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${code}.xlsx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    },

    exportRangeXlsx: async (params: Record<string, string | undefined>, filename: string): Promise<void> => {
        const data: any = await axiosInstance.get(`${DISTRIBUTIONS_BASE}/export-range-xlsx`, {
            params,
            responseType: 'blob',
        });
        const blob = data instanceof Blob ? data : new Blob([data]);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    },
};

export const supplyShortageService = {
    getAll: (params?: {
        search?: string;
        status?: string;
        originalSupplyRequestId?: string;
        originalDistributionId?: string;
        toPlantId?: string;
        page?: number;
        limit?: number;
    }): Promise<SupplyShortageListApiResponse> =>
        api.get<SupplyShortageListApiResponse>(SUPPLY_SHORTAGES_BASE, { params }),

    getById: (id: string): Promise<SupplyShortage> => api.get<SupplyShortage>(`${SUPPLY_SHORTAGES_BASE}/${id}`),
};

export const materialReportService = {
    getSummary: (params?: MaterialReportQueryParams): Promise<MaterialReportSummary> =>
        api.get<MaterialReportSummary>(`${MATERIALS_BASE}/reports/summary`, { params }),

    getCostByPeriod: (params?: MaterialCostByPeriodQueryParams): Promise<MaterialCostByPeriodPoint[]> =>
        api.get<MaterialCostByPeriodPoint[]>(`${MATERIALS_BASE}/reports/cost-by-period`, { params }),

    getTopMaterials: (params?: MaterialReportQueryParams & { limit?: number }): Promise<TopConsumedMaterial[]> =>
        api.get<TopConsumedMaterial[]>(`${MATERIALS_BASE}/reports/top-materials`, { params }),

    getBySupplier: (params?: MaterialReportQueryParams): Promise<SupplierReportRow[]> =>
        api.get<SupplierReportRow[]>(`${MATERIALS_BASE}/reports/by-supplier`, { params }),

    getPriceComparison: (params?: MaterialReportQueryParams): Promise<PriceComparisonReportRow[]> =>
        api.get<PriceComparisonReportRow[]>(`${MATERIALS_BASE}/reports/price-comparison`, { params }),

    getDistributionCost: (params?: MaterialReportQueryParams): Promise<DistributionCostReport> =>
        api.get<DistributionCostReport>(`${MATERIALS_BASE}/reports/distribution-cost`, { params }),

    getCostFlowByPlant: (params?: MaterialReportQueryParams): Promise<MaterialCostFlowByPlant[]> =>
        api.get<MaterialCostFlowByPlant[]>(`${MATERIALS_BASE}/reports/cost-flow-by-plant`, { params }),

    exportExcel: async (params?: MaterialReportQueryParams): Promise<void> => {
        const data: any = await axiosInstance.get(`${MATERIALS_BASE}/reports/export-excel`, {
            params,
            responseType: 'blob',
        });
        const blob = data instanceof Blob ? data : new Blob([data]);
        const startStr = params?.startDate ? params.startDate.replace(/-/g, '') : '';
        const endStr = params?.endDate ? params.endDate.replace(/-/g, '') : '';
        const filename = `BaoCaoVatTu_${startStr}_${endStr}.xlsx`;
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(objectUrl);
    },
};

const EXPRESS_DISPATCH_BASE = '/express-dispatch';

export interface QuickSupplier {
    name: string;
    phone?: string;
    address?: string;
}

export interface ExpressDispatchItem {
    materialName: string;
    unit: string;
    quantity: number;
    unitPrice: number;
    vatRate?: number;
    supplierId?: string;
    quickSupplier?: QuickSupplier;
    note?: string;
}

export interface ExpressDispatchPayload {
    items: ExpressDispatchItem[];
    toPlantId: string;
    note?: string;
}

export interface ExpressDispatchResult {
    orderCode: string;
    distributionCode: string;
    newSupplierIds?: string[];
}

export const expressDispatchService = {
    create: (data: ExpressDispatchPayload): Promise<ExpressDispatchResult> =>
        api.post<ExpressDispatchResult, ExpressDispatchPayload>(EXPRESS_DISPATCH_BASE, data),
};

// ─── Return Records ───────────────────────────────────────────────────────────

export interface ReturnRecordItem {
    materialId?: string;
    materialName: string;
    unit: string;
    quantityReturned: number;
    unitPrice: number;
    vatRate: number;
    refundAmount: number;
    refundWithVat: number;
    reason?: string;
}

export interface ReturnRecord {
    id?: string;
    returnCode?: string;
    purchaseOrderId: string;
    purchaseOrderCode?: string;
    supplierId?: string;
    supplierName?: string;
    items: ReturnRecordItem[];
    totalRefund: number;
    totalRefundWithVat: number;
    returnedAt?: string;
    note?: string;
    createdAt?: string;
}

export interface ReturnRecordPayload {
    purchaseOrderId: string;
    items: Array<{
        materialId?: string;
        materialName: string;
        unit: string;
        quantityReturned: number;
        unitPrice: number;
        vatRate: number;
        reason?: string;
    }>;
    note?: string;
    returnedAt?: string;
}

export const returnRecordService = {
    create: (data: ReturnRecordPayload): Promise<ReturnRecord> =>
        api.post<ReturnRecord, ReturnRecordPayload>('/return-records', data),

    getAll: (params?: {
        purchaseOrderId?: string;
        supplierId?: string;
        page?: number;
        limit?: number;
    }): Promise<PaginatedResponse<ReturnRecord> | ReturnRecord[]> => api.get('/return-records', { params }),

    getByPurchaseOrder: (purchaseOrderId: string): Promise<ReturnRecord[]> =>
        api.get<ReturnRecord[]>(`/return-records/by-po/${purchaseOrderId}`),
};
