import api from '../lib/api';
import type { CreateTransferPayload, Transfer, TransferFilter, PaginatedResponse } from '../types';

const BASE = '/transfers';

export const transferService = {
    getAll: (params: Partial<TransferFilter>): Promise<PaginatedResponse<Transfer>> =>
        api.get<PaginatedResponse<Transfer>>(BASE, { params }),

    getByAsset: (assetId: string): Promise<Transfer[]> => api.get<Transfer[]>(`${BASE}/asset/${assetId}`),

    getById: (id: string): Promise<Transfer> => api.get<Transfer>(`${BASE}/${id}`),

    create: (data: CreateTransferPayload): Promise<Transfer> => api.post<Transfer>(BASE, data),

    approve: (id: string): Promise<Transfer> => api.patch<Transfer>(`${BASE}/${id}/approve`),

    reject: (id: string, reason: string): Promise<Transfer> => api.patch<Transfer>(`${BASE}/${id}/reject`, { reason }),

    complete: (id: string): Promise<Transfer> => api.patch<Transfer>(`${BASE}/${id}/complete`),
};
