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
    provider: string;
    model?: string;
    available: boolean;
    usedFallback: boolean;
    latencyMs?: number;
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
    provider: string;
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

// ===== TRỢ LÝ MÁY MÓC (chat đa lượt) =====
export type AssistantMessage = { role: 'user' | 'assistant'; content: string };

export type AssistantItem = {
    id: string;
    machineCode?: string;
    name?: string;
    status?: string;
    statusLabel?: string;
    plantName?: string;
    brandName?: string;
    area?: string;
    purchasePrice?: number;
    mislocated?: boolean;
};

export type AssistantAggregates = {
    totalValue?: number;
    breakdown?: { key: string; label: string; count: number }[];
    topBroken?: { id: string; machineCode?: string; name?: string; plantName?: string; count: number }[];
    variance?: {
        metricLabel: string;
        current: number;
        previous: number;
        deltaPct: number;
        isCost: boolean;
        drivers: { label: string; current: number; previous: number; delta: number; contributionPct: number }[];
    };
    // Cấp phát vật tư nhiều nhất, phân rã theo cơ sở nhận.
    usageByPlant?: {
        periodLabel: string;
        plantName?: string;
        totalValue: number;
        totalQty: number;
        materials: {
            materialName: string;
            unit: string;
            totalQty: number;
            totalValue: number;
            plants: { plantName: string; qty: number; value: number }[];
        }[];
    };
    // Phân tích chi tiết chi phí mua vật tư (kỳ này vs kỳ trước, theo vật tư/NCC).
    purchaseAnalysis?: {
        periodLabel: string;
        prevLabel: string;
        groupBy: 'material' | 'supplier';
        current: number;
        previous: number;
        deltaPct: number;
        rows: { label: string; unit: string; current: number; previous: number; qty: number; delta: number; contributionPct: number }[];
    };
    // Danh sách / chi tiết đơn hàng mua vật tư.
    purchaseOrders?: {
        detail: boolean;
        orders: {
            orderCode: string;
            supplierName: string;
            plantName?: string;
            status: string;
            statusLabel: string;
            totalWithVat: number;
            itemCount: number;
            createdAt?: string;
            items?: { materialName: string; unit: string; quantityOrdered: number; quantityReceived: number; unitPrice: number; totalWithVat: number; supplierName?: string }[];
        }[];
    };
};

export type AssistantAppliedFilters = {
    search?: string;
    status?: string[];
    ownershipType?: string[];
    plantId?: string;
    plantName?: string;
    brandId?: string;
    brandName?: string;
    area?: string;
    flags?: string[];
};

export type AssetAssistantResponse = {
    domain?: 'asset' | 'material' | 'cost';
    answer: string;
    intent: string;
    count: number;
    items: AssistantItem[];
    aggregates: AssistantAggregates;
    appliedFilters?: AssistantAppliedFilters;
    followups: string[];
    provider: string;
    model?: string;
    tier?: 'light' | 'standard' | 'heavy';
};

// Trợ lý vận hành toàn cục: tự định tuyến máy / vật tư / chi phí.
export const operationsAssistantService = {
    ask: (messages: AssistantMessage[]): Promise<AssetAssistantResponse> =>
        api.post<AssetAssistantResponse, { messages: AssistantMessage[] }>('/ai/assistant', { messages }, { timeout: 90000 }),
};

export type AiMaterialMatchRequestItem = {
    key: string;
    materialName: string;
    unit?: string;
    note?: string;
};

export type AiMaterialMatchCandidate = {
    id: string;
    code: string;
    name: string;
    unit: string;
    category?: string;
    score: number;
};

export type AiMaterialMatchItem = {
    key: string;
    status: 'matched' | 'suggested' | 'ambiguous' | 'unmatched';
    materialId?: string;
    confidence: number;
    reason: string;
    warnings: string[];
    candidate?: AiMaterialMatchCandidate;
    candidates: AiMaterialMatchCandidate[];
};

export type AiMaterialMatchResponse = {
    items: AiMaterialMatchItem[];
    provider: string;
    model?: string;
    available: boolean;
    usedFallback: boolean;
    latencyMs?: number;
};

export const aiMaterialMatchService = {
    match: (items: AiMaterialMatchRequestItem[]): Promise<AiMaterialMatchResponse> =>
        api.post<AiMaterialMatchResponse, { items: AiMaterialMatchRequestItem[] }>(
            '/ai/material-match',
            { items },
            {
                timeout: 65000,
            }
        ),
};

export type AiChatSummaryActionItem = {
    task: string;
    owner?: string;
    dueDate?: string;
    priority?: 'low' | 'medium' | 'high';
};

export type AiChatSummaryResponse = {
    summary: string;
    decisions: string[];
    actionItems: AiChatSummaryActionItem[];
    risks: string[];
    openQuestions: string[];
    nextSteps: string[];
    provider: string;
    model?: string;
    available: boolean;
    usedFallback: boolean;
    latencyMs?: number;
    messageCount: number;
    conversationTitle: string;
};

export const aiChatSummaryService = {
    summarize: (conversationId: string, limit = 80): Promise<AiChatSummaryResponse> =>
        api.post<AiChatSummaryResponse, { conversationId: string; limit: number }>(
            '/ai/chat-summary',
            { conversationId, limit },
            {
                timeout: 65000,
            }
        ),
};
