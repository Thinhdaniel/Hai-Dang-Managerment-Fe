import api from '../lib/api';
import type { HelpTopic } from '../help/helpKnowledge';

export type AiHelpContextTopic = Pick<
    HelpTopic,
    'title' | 'summary' | 'category' | 'prerequisites' | 'steps' | 'checkpoints' | 'commonMistakes' | 'notes'
>;

export type AiHelpRequest = {
    question: string;
    route?: string;
    contextTopics: AiHelpContextTopic[];
};

export type AiHelpResponse = {
    answer: string;
    provider: 'ollama' | 'fallback';
    model?: string;
    available: boolean;
    usedFallback: boolean;
};

export const aiHelpService = {
    ask: (data: AiHelpRequest): Promise<AiHelpResponse> =>
        api.post<AiHelpResponse, AiHelpRequest>('/ai/help', data, {
            timeout: 90000,
        }),
};

export type AiAssetSearchFilters = {
    search?: string;
    status?: string;
    ownershipType?: string;
    plantId?: string;
    brandId?: string;
};

export type AiAssetSearchResponse = {
    filters: AiAssetSearchFilters;
    intent: 'search' | 'create_transfer';
    explanation: string;
    matchedPlantName?: string;
    matchedBrandName?: string;
    statusLabel?: string;
    ownershipLabel?: string;
    suggestedActions: { label: string; hint: string }[];
    provider: 'ollama' | 'fallback';
};

export const aiAssetSearchService = {
    search: (query: string): Promise<AiAssetSearchResponse> =>
        api.post<AiAssetSearchResponse, { query: string }>(
            '/ai/asset-search',
            { query },
            {
                timeout: 75000,
            }
        ),
};
