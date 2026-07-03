import api from '../lib/api';
import type {
    Asset,
    AssetCodeSuggestion,
    AssetFilter,
    AssetImportPreview,
    AssetImportResult,
    AssetPublicIdResponse,
    MachineTypeCodeList,
    NormalizeCodePreview,
    NormalizeCodeResult,
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
    getNames: (): Promise<string[]> => api.get<string[]>(`${BASE}/names`),
    getTypes: (): Promise<string[]> => api.get<string[]>(`${BASE}/types`),

    getById: (id: string): Promise<Asset> => api.get<Asset>(`${BASE}/${id}`),

    ensurePublicId: (id: string): Promise<AssetPublicIdResponse> => api.post<AssetPublicIdResponse>(`${BASE}/${id}/public-id`),

    create: (data: Omit<Asset, 'id' | 'createdAt' | 'updatedAt'> & { typeCode?: string }): Promise<Asset> =>
        api.post<Asset>(BASE, data),

    suggestCode: (data: {
        type: string;
        brandId: string;
        ownershipType?: string;
        typeCode?: string;
    }): Promise<AssetCodeSuggestion> => api.post<AssetCodeSuggestion>(`${BASE}/code/suggest`, data),

    previewNormalizeCodes: (): Promise<NormalizeCodePreview> =>
        api.post<NormalizeCodePreview>(`${BASE}/code/normalize/preview`),

    confirmNormalizeCodes: (): Promise<NormalizeCodeResult> =>
        api.post<NormalizeCodeResult>(`${BASE}/code/normalize/confirm`),

    getTypeCodes: (): Promise<MachineTypeCodeList> => api.get<MachineTypeCodeList>(`${BASE}/code/type-codes`),

    aiSuggestTypeCodes: (): Promise<MachineTypeCodeList> =>
        api.post<MachineTypeCodeList>(`${BASE}/code/type-codes/ai-suggest`),

    saveTypeCodes: (items: { label: string; code: string }[]): Promise<{ updated: number }> =>
        api.patch<{ updated: number }>(`${BASE}/code/type-codes`, { items }),

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
