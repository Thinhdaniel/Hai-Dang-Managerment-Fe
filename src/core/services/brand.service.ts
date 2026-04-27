import api from '../lib/api';
import type { Brand } from '../types';

const BASE = '/brands';

type BrandPayload = {
    name: string;
    description?: string;
};

export const brandService = {
    getAll: (params?: { search?: string }): Promise<Brand[]> => api.get<Brand[]>(BASE, { params }),

    create: (data: BrandPayload): Promise<Brand> => api.post<Brand, BrandPayload>(BASE, data),

    update: (id: string, data: BrandPayload): Promise<Brand> => api.put<Brand, BrandPayload>(`${BASE}/${id}`, data),

    delete: (id: string): Promise<void> => api.delete(`${BASE}/${id}`),
};
