import api from '../lib/api';
import type { Maintenance, MaintenanceFilter, MaintenanceReport, PaginatedResponse } from '../types';

const BASE = '/maintenances';

export type MaintenancePayload = Pick<Maintenance, 'assetId' | 'type' | 'description' | 'startDate'> &
    Partial<
        Pick<
            Maintenance,
            'repairMode' | 'endDate' | 'technician' | 'cost' | 'note' | 'externalRepair' | 'approvalStatus' | 'status'
        >
    >;

export type CompleteMaintenancePayload = {
    endDate: string;
    note?: string;
    cost?: number;
    externalRepair?: Maintenance['externalRepair'];
};

export const maintenanceService = {
    getAll: (params: Partial<MaintenanceFilter>): Promise<PaginatedResponse<Maintenance>> =>
        api.get<PaginatedResponse<Maintenance>>(BASE, { params }),

    getReport: (params: Partial<MaintenanceFilter & { groupBy: 'day' | 'month' | 'quarter' }>): Promise<MaintenanceReport> =>
        api.get<MaintenanceReport>(`${BASE}/report`, { params }),

    getByAsset: (assetId: string): Promise<Maintenance[]> => api.get<Maintenance[]>(`${BASE}/asset/${assetId}`),

    getById: (id: string): Promise<Maintenance> => api.get<Maintenance>(`${BASE}/${id}`),

    create: (data: MaintenancePayload): Promise<Maintenance> =>
        api.post<Maintenance>(BASE, data),

    update: (id: string, data: Partial<Maintenance>): Promise<Maintenance> =>
        api.patch<Maintenance>(`${BASE}/${id}`, data),

    delete: (id: string): Promise<void> => api.delete(`${BASE}/${id}`),

    complete: (id: string, data: CompleteMaintenancePayload): Promise<Maintenance> =>
        api.patch<Maintenance>(`${BASE}/${id}/complete`, data),

    approve: (id: string, note?: string): Promise<Maintenance> =>
        api.patch<Maintenance>(`${BASE}/${id}/approve`, { note }),

    reject: (id: string, rejectReason: string): Promise<Maintenance> =>
        api.patch<Maintenance>(`${BASE}/${id}/reject`, { rejectReason }),
};
