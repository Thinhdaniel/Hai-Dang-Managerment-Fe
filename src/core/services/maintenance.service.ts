import api from '../lib/api';
import type { Maintenance, MaintenanceFilter, PaginatedResponse } from '../types';

const BASE = '/maintenances';

export const maintenanceService = {
    getAll: (params: Partial<MaintenanceFilter>): Promise<PaginatedResponse<Maintenance>> =>
        api.get<PaginatedResponse<Maintenance>>(BASE, { params }),

    getByAsset: (assetId: string): Promise<Maintenance[]> => api.get<Maintenance[]>(`${BASE}/asset/${assetId}`),

    getById: (id: string): Promise<Maintenance> => api.get<Maintenance>(`${BASE}/${id}`),

    create: (data: Omit<Maintenance, 'id' | 'createdAt' | 'updatedAt'>): Promise<Maintenance> =>
        api.post<Maintenance>(BASE, data),

    update: (id: string, data: Partial<Maintenance>): Promise<Maintenance> =>
        api.patch<Maintenance>(`${BASE}/${id}`, data),

    delete: (id: string): Promise<void> => api.delete(`${BASE}/${id}`),

    complete: (id: string, data: { endDate: string; note?: string; cost?: number }): Promise<Maintenance> =>
        api.patch<Maintenance>(`${BASE}/${id}/complete`, data),
};
