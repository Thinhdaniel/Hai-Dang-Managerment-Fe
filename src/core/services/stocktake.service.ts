import api from '../lib/api';
import type { CreateStocktakeSessionPayload, PaginatedResponse, StocktakeSession } from '../types';

const BASE = '/stocktakes';

export type StocktakeSessionListParams = {
    page?: number;
    limit?: number;
    plantId?: string;
    startDate?: string;
    endDate?: string;
};

export const stocktakeService = {
    create: (data: CreateStocktakeSessionPayload): Promise<StocktakeSession> =>
        api.post<StocktakeSession, CreateStocktakeSessionPayload>(BASE, data),

    getAll: (params?: StocktakeSessionListParams): Promise<PaginatedResponse<StocktakeSession>> =>
        api.get<PaginatedResponse<StocktakeSession>>(BASE, { params }),
};
