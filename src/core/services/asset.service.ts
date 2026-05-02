import api from '../lib/api';
import type {
    Asset,
    AssetFilter,
    AssetImportPreview,
    AssetImportResult,
    AssetPublicIdResponse,
    PaginatedResponse,
} from '../types';

const BASE = '/assets';

const buildImportFormData = (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return formData;
};

export const assetService = {
    getAll: (params: Partial<AssetFilter>): Promise<PaginatedResponse<Asset>> =>
        api.get<PaginatedResponse<Asset>>(BASE, { params }),

    getModels: (): Promise<string[]> => api.get<string[]>(`${BASE}/models`),

    getTypes: (): Promise<string[]> => api.get<string[]>(`${BASE}/types`),

    getById: (id: string): Promise<Asset> => api.get<Asset>(`${BASE}/${id}`),

    ensurePublicId: (id: string): Promise<AssetPublicIdResponse> => api.post<AssetPublicIdResponse>(`${BASE}/${id}/public-id`),

    create: (data: Omit<Asset, 'id' | 'createdAt' | 'updatedAt'>): Promise<Asset> => api.post<Asset>(BASE, data),

    update: (id: string, data: Partial<Asset>): Promise<Asset> => api.patch<Asset>(`${BASE}/${id}`, data),

    delete: (id: string): Promise<void> => api.delete(`${BASE}/${id}`),

    updateStatus: (id: string, status: string, note?: string): Promise<Asset> =>
        api.patch<Asset>(`${BASE}/${id}/status`, { status, note }),

    exportExcel: (params: Partial<AssetFilter>): Promise<Blob> =>
        api.get<Blob>(`${BASE}/export`, {
            params,
            responseType: 'blob',
        }),

    previewImport: (file: File): Promise<AssetImportPreview> =>
        api.post<AssetImportPreview, FormData>(`${BASE}/import/preview`, buildImportFormData(file), {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        }),

    confirmImport: (file: File): Promise<AssetImportResult> =>
        api.post<AssetImportResult, FormData>(`${BASE}/import/confirm`, buildImportFormData(file), {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        }),
};
