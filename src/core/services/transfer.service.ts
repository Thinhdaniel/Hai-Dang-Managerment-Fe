import api from '../lib/api';
import axiosInstance from '../lib/axios';
import type { CreateTransferPayload, Transfer, TransferFilter, PaginatedResponse } from '../types';

const BASE = '/transfers';

const downloadBlob = (data: unknown, filename: string) => {
    const blob = data instanceof Blob ? data : new Blob([data as BlobPart]);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

export const transferService = {
    getAll: (params: Partial<TransferFilter>): Promise<PaginatedResponse<Transfer>> =>
        api.get<PaginatedResponse<Transfer>>(BASE, { params }),

    getByAsset: (assetId: string): Promise<Transfer[]> => api.get<Transfer[]>(`${BASE}/asset/${assetId}`),

    getById: (id: string): Promise<Transfer> => api.get<Transfer>(`${BASE}/${id}`),

    create: (data: CreateTransferPayload): Promise<Transfer> => api.post<Transfer>(BASE, data),

    approve: (id: string): Promise<Transfer> => api.patch<Transfer>(`${BASE}/${id}/approve`),

    reject: (id: string, reason: string): Promise<Transfer> => api.patch<Transfer>(`${BASE}/${id}/reject`, { reason }),

    complete: (id: string, payload: { receivedBy: string; handoverImages?: string[] }): Promise<Transfer> =>
        api.patch<Transfer>(`${BASE}/${id}/complete`, payload),

    cancel: (id: string, reason: string): Promise<Transfer> => api.patch<Transfer>(`${BASE}/${id}/cancel`, { reason }),

    exportStockOutXlsx: async (id: string, code: string): Promise<void> => {
        const data: any = await axiosInstance.get(`${BASE}/${id}/export-stock-out-xlsx`, { responseType: 'blob' });
        downloadBlob(data, `Phieu_Xuat_Kho_Dieu_Chuyen_${code}.xlsx`);
    },
};
