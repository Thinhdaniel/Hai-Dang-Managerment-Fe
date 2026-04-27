import api from '../lib/api';
import type { Borrowing, BorrowingFilter, CreateBorrowingPayload, PaginatedResponse } from '../types';

const BASE = '/borrowings';

export const borrowingService = {
    getAll: (params: Partial<BorrowingFilter>): Promise<PaginatedResponse<Borrowing>> =>
        api.get<PaginatedResponse<Borrowing>>(BASE, { params }),

    getByAsset: (assetId: string): Promise<Borrowing[]> => api.get<Borrowing[]>(`${BASE}/asset/${assetId}`),

    getById: (id: string): Promise<Borrowing> => api.get<Borrowing>(`${BASE}/${id}`),

    create: (data: CreateBorrowingPayload): Promise<Borrowing> => api.post<Borrowing>(BASE, data),

    returnAsset: (id: string, returnTime: string, note?: string): Promise<Borrowing> =>
        api.patch<Borrowing>(`${BASE}/${id}/return`, { returnTime, note }),
};
