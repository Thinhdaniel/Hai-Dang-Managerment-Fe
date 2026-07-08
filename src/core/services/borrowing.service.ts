import api from '../lib/api';
import type {
    Borrowing,
    BorrowingBatch,
    BorrowingBatchDetail,
    BorrowingBatchStatus,
    BorrowingFilter,
    BorrowingType,
    BulkReturnBorrowingBatchPayload,
    BulkReturnBorrowingBatchResponse,
    CreateBorrowingBatchPayload,
    CreateBorrowingPayload,
    PaginatedResponse,
    ReceiveBorrowingBatchByQrPayload,
    UpdateBorrowingBatchPayload,
} from '../types';

const BASE = '/borrowings';

export type BorrowingBatchListParams = {
    page?: number;
    limit?: number;
    search?: string;
    type?: BorrowingType;
    status?: BorrowingBatchStatus;
    plantId?: string;
};

export const borrowingService = {
    getAll: (params: Partial<BorrowingFilter>): Promise<PaginatedResponse<Borrowing>> =>
        api.get<PaginatedResponse<Borrowing>>(BASE, { params }),

    getByAsset: (assetId: string): Promise<Borrowing[]> => api.get<Borrowing[]>(`${BASE}/asset/${assetId}`),

    getById: (id: string): Promise<Borrowing> => api.get<Borrowing>(`${BASE}/${id}`),

    create: (data: CreateBorrowingPayload): Promise<Borrowing> => api.post<Borrowing>(BASE, data),

    returnAsset: (id: string, returnTime: string, note?: string): Promise<Borrowing> =>
        api.patch<Borrowing>(`${BASE}/${id}/return`, { returnTime, note }),

    getBatches: (params?: BorrowingBatchListParams): Promise<PaginatedResponse<BorrowingBatch>> =>
        api.get<PaginatedResponse<BorrowingBatch>>(`${BASE}/batches`, { params }),

    createBatch: (data: CreateBorrowingBatchPayload): Promise<BorrowingBatch> =>
        api.post<BorrowingBatch, CreateBorrowingBatchPayload>(`${BASE}/batches`, data),

    getBatchById: (id: string): Promise<BorrowingBatchDetail> => api.get<BorrowingBatchDetail>(`${BASE}/batches/${id}`),

    updateBatch: (id: string, data: UpdateBorrowingBatchPayload): Promise<BorrowingBatch> =>
        api.patch<BorrowingBatch, UpdateBorrowingBatchPayload>(`${BASE}/batches/${id}`, data),

    createBatchQr: (id: string, quantity?: number): Promise<BorrowingBatch> =>
        api.post<BorrowingBatch, { quantity?: number }>(`${BASE}/batches/${id}/qr-batch`, { quantity }),

    receiveBatchByQr: (id: string, data: ReceiveBorrowingBatchByQrPayload): Promise<Borrowing> =>
        api.post<Borrowing, ReceiveBorrowingBatchByQrPayload>(`${BASE}/batches/${id}/receive-by-qr`, data),

    bulkReturnBatch: (id: string, data: BulkReturnBorrowingBatchPayload): Promise<BulkReturnBorrowingBatchResponse> =>
        api.post<BulkReturnBorrowingBatchResponse, BulkReturnBorrowingBatchPayload>(
            `${BASE}/batches/${id}/bulk-return`,
            data
        ),
};
