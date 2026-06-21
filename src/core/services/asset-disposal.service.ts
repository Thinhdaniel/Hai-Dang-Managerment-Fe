import api from '../lib/api';
import type {
    AssetDisposalBatch,
    AssetDisposalBatchDetail,
    AssetDisposalBatchStatus,
    AssetDisposalItem,
    AssetDisposalItemPayload,
    CreateAssetDisposalBatchPayload,
    PaginatedResponse,
} from '../types';

const BASE = '/asset-disposals';

export type AssetDisposalBatchParams = {
    page?: number;
    limit?: number;
    search?: string;
    status?: AssetDisposalBatchStatus;
    plantId?: string;
};

export type AssetDisposalScanResponse = {
    item: AssetDisposalItem;
    result: 'asset' | 'qr_only' | 'duplicate';
    canEditExternalInfo: boolean;
};

export const assetDisposalService = {
    getBatches: (params?: AssetDisposalBatchParams): Promise<PaginatedResponse<AssetDisposalBatch>> =>
        api.get<PaginatedResponse<AssetDisposalBatch>>(`${BASE}/batches`, { params }),

    createBatch: (data: CreateAssetDisposalBatchPayload): Promise<AssetDisposalBatch> =>
        api.post<AssetDisposalBatch, CreateAssetDisposalBatchPayload>(`${BASE}/batches`, data),

    getBatchById: (id: string): Promise<AssetDisposalBatchDetail> =>
        api.get<AssetDisposalBatchDetail>(`${BASE}/batches/${id}`),

    updateBatch: (id: string, data: Partial<CreateAssetDisposalBatchPayload>): Promise<AssetDisposalBatch> =>
        api.patch<AssetDisposalBatch, Partial<CreateAssetDisposalBatchPayload>>(`${BASE}/batches/${id}`, data),

    addItem: (batchId: string, data: AssetDisposalItemPayload): Promise<AssetDisposalItem> =>
        api.post<AssetDisposalItem, AssetDisposalItemPayload>(`${BASE}/batches/${batchId}/items`, data),

    scanQr: (
        batchId: string,
        data: { rawValue: string } & AssetDisposalItemPayload
    ): Promise<AssetDisposalScanResponse> =>
        api.post<AssetDisposalScanResponse, { rawValue: string } & AssetDisposalItemPayload>(
            `${BASE}/batches/${batchId}/scan`,
            data
        ),

    updateItem: (itemId: string, data: AssetDisposalItemPayload): Promise<AssetDisposalItem> =>
        api.patch<AssetDisposalItem, AssetDisposalItemPayload>(`${BASE}/items/${itemId}`, data),

    deleteItem: (itemId: string): Promise<AssetDisposalBatchDetail> =>
        api.delete<AssetDisposalBatchDetail>(`${BASE}/items/${itemId}`),

    submitBatch: (id: string, note?: string): Promise<AssetDisposalBatchDetail> =>
        api.post<AssetDisposalBatchDetail, { note?: string }>(`${BASE}/batches/${id}/submit`, { note }),

    approveBatch: (id: string, note?: string): Promise<AssetDisposalBatchDetail> =>
        api.post<AssetDisposalBatchDetail, { note?: string }>(`${BASE}/batches/${id}/approve`, { note }),

    completeBatch: (id: string): Promise<AssetDisposalBatchDetail> =>
        api.post<AssetDisposalBatchDetail>(`${BASE}/batches/${id}/complete`),

    cancelBatch: (id: string, reason: string): Promise<AssetDisposalBatchDetail> =>
        api.post<AssetDisposalBatchDetail, { reason: string }>(`${BASE}/batches/${id}/cancel`, { reason }),

    exportXlsx: (id: string): Promise<Blob> =>
        api.get<Blob>(`${BASE}/batches/${id}/export-xlsx`, {
            responseType: 'blob',
        }),
};
