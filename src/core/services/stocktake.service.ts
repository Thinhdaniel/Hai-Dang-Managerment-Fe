import api from '../lib/api';
import type {
    CreateStocktakeSessionPayload,
    PaginatedResponse,
    ReviewStocktakePositionProposalsPayload,
    ReviewStocktakePositionProposalsResult,
    StocktakeSession,
} from '../types';

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

    reviewPositionProposals: (
        sessionId: string,
        data: ReviewStocktakePositionProposalsPayload
    ): Promise<ReviewStocktakePositionProposalsResult> =>
        api.patch<ReviewStocktakePositionProposalsResult>(`${BASE}/${sessionId}/position-proposals/review`, data),

    createDriftPositionProposal: (
        sessionId: string,
        assetId: string
    ): Promise<{ proposal: import('../types').StocktakePositionProposal }> =>
        api.post<{ proposal: import('../types').StocktakePositionProposal }>(
            `${BASE}/${sessionId}/position-proposals/from-drift`,
            { assetId }
        ),
};
