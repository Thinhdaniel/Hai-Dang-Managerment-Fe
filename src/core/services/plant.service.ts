import api from '../lib/api';
import type { Plant, PlantMachineStatsResponse } from '../types';
import { sortPlantsNaturally } from '../utils/plantSort';

const BASE = '/plants';

type PlantPayload = {
    name: string;
    code: string;
    address?: string;
    phone?: string;
    managerId?: string;
};

export const plantService = {
    getAll: async (params?: { search?: string }): Promise<Plant[]> => {
        const plants = await api.get<Plant[]>(BASE, { params });
        return sortPlantsNaturally(plants);
    },

    getWithMachineCount: async (params?: { search?: string }): Promise<PlantMachineStatsResponse> => {
        const response = await api.get<PlantMachineStatsResponse>(`${BASE}/with-machine-count`, { params });

        return {
            ...response,
            facilities: sortPlantsNaturally(response.facilities),
        };
    },

    getById: (id: string): Promise<Plant> => api.get<Plant>(`${BASE}/${id}`),

    create: (data: PlantPayload): Promise<Plant> => api.post<Plant, PlantPayload>(BASE, data),

    update: (id: string, data: Partial<PlantPayload>): Promise<Plant> =>
        api.patch<Plant, Partial<PlantPayload>>(`${BASE}/${id}`, data),

    delete: (id: string): Promise<void> => api.delete(`${BASE}/${id}`),
};
