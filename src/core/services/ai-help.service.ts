import api from '../lib/api';
import { getStoredAccessToken } from '../lib/auth-session';
import type { HelpTopic } from '../help/helpKnowledge';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

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

export type AssistantRequestBucket = { label: string; count: number; value?: number };

export type AssistantMaterialRequestRow = {
    id: string;
    requestCode: string;
    requestType?: string;
    requestTypeLabel?: string;
    status: string;
    statusLabel: string;
    plantName?: string;
    fromPlantName?: string;
    toPlantName?: string;
    requestedBy?: string;
    approvedBy?: string;
    approvedAt?: string;
    rejectedReason?: string;
    note?: string;
    createdAt?: string;
    requestDate?: string;
    ageDays?: number;
    itemCount?: number;
    totalRequested?: number;
    totalApproved?: number;
    totalOrdered?: number;
    totalWithVat?: number;
    items?: {
        materialName: string;
        unit?: string;
        quantityRequested?: number;
        quantityApproved?: number;
        quantityOrdered?: number;
        quantityReceived?: number;
        unitPrice?: number;
        totalWithVat?: number;
        supplierName?: string;
        proposedBy?: string;
        purpose?: string;
        catalogStatus?: string;
        note?: string;
    }[];
    distribution?: {
        distributionCount: number;
        distributionCodes: string[];
        distributedQty?: number;
        shortageQty?: number;
        outstandingQty?: number;
        shortageLines?: number;
        totalWithVat?: number;
        distributedAt?: string;
        shortages?: {
            materialName: string;
            unit?: string;
            quantityShortage?: number;
            quantityResolved?: number;
            outstandingQty?: number;
            statusLabel?: string;
        }[];
    };
    orders?: {
        orderCount: number;
        orderCodes: string[];
        statuses?: string[];
        orderedQty?: number;
        receivedQty?: number;
        missingQty?: number;
        totalWithVat?: number;
        firstOrderedAt?: string;
        lastReceivedAt?: string;
    };
};

export type AssistantMaterialRequestTopMaterial = {
    materialName: string;
    unit?: string;
    requestCount: number;
    quantityRequested?: number;
    quantityApproved?: number;
    quantityOrdered?: number;
    totalWithVat?: number;
    requestCodes?: string[];
};

export type AssistantMaterialRequestsAggregate = {
    kind: 'supply' | 'purchase';
    title: string;
    periodLabel: string;
    total: number;
    rows: AssistantMaterialRequestRow[];
    summary?: {
        totalValue?: number;
        byStatus?: AssistantRequestBucket[];
        byPlant?: AssistantRequestBucket[];
        topMaterials?: AssistantMaterialRequestTopMaterial[];
    };
};

export type AssistantRequestAnalysisAggregate = {
    kind: 'supply' | 'purchase';
    title: string;
    periodLabel: string;
    total: number;
    totalValue?: number;
    byStatus: AssistantRequestBucket[];
    byPlant: AssistantRequestBucket[];
    byRequester: AssistantRequestBucket[];
    topMaterials: AssistantMaterialRequestTopMaterial[];
    oldestPending: AssistantMaterialRequestRow[];
    largest: AssistantMaterialRequestRow[];
    approvedWithoutNextStep: AssistantMaterialRequestRow[];
    staleApproved: AssistantMaterialRequestRow[];
    shortages: AssistantMaterialRequestRow[];
};

export type AssistantRequestLifecycleAggregate = {
    found: number;
    message?: string;
    request: AssistantMaterialRequestRow | null;
    timeline?: { label: string; at?: string; by?: string; status: 'done' | 'current' | 'pending' | 'warning' | 'blocked' | string }[];
};

export type AssistantRequestBacklogAggregate = {
    periodLabel: string;
    cards: { key: string; label: string; count: number; quantity?: number }[];
    supply?: AssistantRequestAnalysisAggregate;
    purchase?: AssistantRequestAnalysisAggregate;
};

export type AssistantRequestRiskAggregate = {
    periodLabel: string;
    riskCount: number;
    risks: {
        severity: 'high' | 'medium' | 'low' | string;
        title: string;
        module?: string;
        requestCode?: string;
        plantName?: string;
        action?: string;
    }[];
    backlogCards?: { key: string; label: string; count: number; quantity?: number }[];
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
    // Tách 3 loại chi phí (mua / cấp phát / sửa ngoài) cho câu hỏi chi phí chung chung.
    costOverview?: {
        periodLabel: string;
        prevLabel: string;
        purchase: { current: number; previous: number; deltaPct: number };
        distribution: { current: number; previous: number; deltaPct: number };
        repair: { current: number; previous: number; deltaPct: number };
        total: { current: number; previous: number; deltaPct: number };
    };
    // So sánh chi phí mua vs cấp phát trong kỳ.
    compareCost?: {
        periodLabel: string;
        prevLabel: string;
        purchase: { current: number; previous: number; deltaPct: number };
        distribution: { current: number; previous: number; deltaPct: number };
        gap: number;
        higher: 'purchase' | 'distribution' | 'equal';
    };
    // Phân tích chi tiết chi phí mua vật tư (kỳ này vs kỳ trước, theo vật tư/NCC).
    purchaseAnalysis?: {
        periodLabel: string;
        prevLabel: string;
        groupBy: 'material' | 'supplier';
        plantName?: string;
        current: number;
        previous: number;
        deltaPct: number;
        rows: {
            label: string;
            unit: string;
            current: number;
            previous: number;
            qty: number;
            delta: number;
            contributionPct: number;
        }[];
    };
    // Lịch sử & xu hướng giá mua 1 vật tư.
    priceHistory?: {
        materialName: string;
        unit: string;
        count: number;
        minPrice: number;
        maxPrice: number;
        avgPrice: number;
        trendPct: number;
        points: {
            orderCode: string;
            date?: string;
            supplierName: string;
            unit: string;
            qty: number;
            unitPrice: number;
            totalWithVat: number;
        }[];
    };
    // So sánh giá giữa các nhà cung cấp cho 1 vật tư.
    supplierComparison?: {
        materialName: string;
        unit: string;
        cheapest?: string;
        suppliers: {
            supplierName: string;
            avgPrice: number;
            minPrice: number;
            maxPrice: number;
            qty: number;
            value: number;
            orders: number;
            unit: string;
        }[];
    };
    // Phân tích cấp phát chi tiết + thiếu hụt.
    distributionAnalysis?: {
        periodLabel: string;
        plantName?: string;
        totalValue: number;
        totalQty: number;
        totalShortageQty: number;
        totalShortageLines: number;
        topMaterials: { materialName: string; unit: string; qty: number; value: number; shortageQty: number }[];
        topShortages: { materialName: string; unit: string; shortageQty: number }[];
    };
    // Đề xuất mua sắm.
    purchaseSuggestion?: {
        count: number;
        suggestions: {
            materialName: string;
            code?: string;
            unit: string;
            stock: number;
            minLevel: number;
            used30: number;
            suggestQty: number;
            urgency: number;
        }[];
    };
    // Danh sách / chi tiết đơn hàng mua vật tư.
    purchaseOrders?: {
        detail: boolean;
        orders: {
            orderCode: string;
            supplierName: string;
            suppliers?: string[];
            supplierCount?: number;
            multiSupplier?: boolean;
            plantName?: string;
            plants?: string[];
            status: string;
            statusLabel: string;
            totalWithVat: number;
            itemCount: number;
            createdAt?: string;
            items?: {
                materialName: string;
                unit: string;
                quantityOrdered: number;
                quantityReceived: number;
                unitPrice: number;
                totalWithVat: number;
                supplierName?: string;
                plantName?: string;
            }[];
        }[];
    };
    // Phiếu đề xuất cấp/mua: danh sách, phân tích, vòng đời, backlog và rủi ro.
    materialRequests?: AssistantMaterialRequestsAggregate;
    requestAnalysis?: AssistantRequestAnalysisAggregate;
    requestLifecycle?: AssistantRequestLifecycleAggregate;
    requestBacklog?: AssistantRequestBacklogAggregate;
    requestRiskAnalysis?: AssistantRequestRiskAggregate;
    // Tra cứu vị trí + lệnh điều chuyển của 1 máy cụ thể.
    locate?: {
        found: number;
        asset: {
            id: string;
            machineCode: string;
            name: string;
            serial?: string;
            type?: string;
            brandName?: string;
            status: string;
            statusLabel: string;
            managedPlant: string;
            area?: string;
            lastSeenPlant?: string;
            lastSeenAt?: string;
            lastSeenDistanceM?: number;
            mislocated: boolean;
            nextMaintenanceDate?: string;
            activeTransfers: {
                from: string;
                to: string;
                status: string;
                statusLabel: string;
                transferDate?: string;
                reason?: string;
            }[];
            recentTransfers: { from: string; to: string; statusLabel: string; transferDate?: string }[];
        } | null;
        others: { id: string; machineCode: string; name: string }[];
    };
    // Danh sách lệnh điều chuyển (kèm máy trong lệnh).
    transferOrders?: {
        periodLabel: string;
        count: number;
        orders: {
            id: string;
            from: string;
            to: string;
            status: string;
            statusLabel: string;
            transferDate?: string;
            reason?: string;
            assetCount: number;
            machines: { machineCode: string; name: string }[];
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

export type AssistantSource = {
    tool: string;
    label: string;
    module: string;
    scope?: string;
    records?: number;
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
    sources?: AssistantSource[];
    confidence?: 'high' | 'medium' | 'low' | 'none';
    reqId?: string;
    tookMs?: number;
    provider: string;
    model?: string;
    tier?: 'light' | 'standard' | 'heavy';
};

// Bước tiến trình bắn ra trong lúc trợ lý đang xử lý (streaming).
export type AssistantStreamStep =
    | { type: 'analyze'; tier: 'light' | 'standard' | 'heavy' }
    | { type: 'tool'; tool: string; label: string }
    | { type: 'synthesize' };

// Trợ lý vận hành toàn cục: tự định tuyến máy / vật tư / chi phí.
export const operationsAssistantService = {
    ask: (messages: AssistantMessage[]): Promise<AssetAssistantResponse> =>
        api.post<AssetAssistantResponse, { messages: AssistantMessage[] }>(
            '/ai/assistant',
            { messages },
            { timeout: 90000 }
        ),

    // Streaming (SSE qua fetch): nhận tiến trình thật theo thời gian thực rồi trả kết quả cuối.
    // Nếu trình duyệt/mạng/proxy không hỗ trợ -> ném lỗi để nơi gọi fallback sang ask().
    askStream: async (
        messages: AssistantMessage[],
        handlers: { onStep?: (step: AssistantStreamStep) => void; signal?: AbortSignal } = {}
    ): Promise<AssetAssistantResponse> => {
        const token = getStoredAccessToken();
        const resp = await fetch(`${API_BASE_URL}/ai/assistant/stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            credentials: 'include',
            body: JSON.stringify({ messages }),
            signal: handlers.signal,
        });
        if (!resp.ok || !resp.body) throw new Error(`stream HTTP ${resp.status}`);

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let done: AssetAssistantResponse | null = null;
        let errored = false;

        const handleFrame = (frame: string) => {
            let event = 'message';
            const dataLines: string[] = [];
            for (const line of frame.split('\n')) {
                if (line.startsWith(':')) continue; // heartbeat / comment
                if (line.startsWith('event:')) event = line.slice(6).trim();
                else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
            }
            if (!dataLines.length) return;
            let payload: unknown;
            try {
                payload = JSON.parse(dataLines.join('\n'));
            } catch {
                return;
            }
            if (event === 'step') handlers.onStep?.(payload as AssistantStreamStep);
            else if (event === 'done') done = payload as AssetAssistantResponse;
            else if (event === 'error') errored = true;
        };

        // eslint-disable-next-line no-constant-condition
        while (true) {
            const { done: streamDone, value } = await reader.read();
            if (streamDone) break;
            buffer += decoder.decode(value, { stream: true });
            let idx: number;
            while ((idx = buffer.indexOf('\n\n')) >= 0) {
                handleFrame(buffer.slice(0, idx));
                buffer = buffer.slice(idx + 2);
            }
        }
        if (buffer.trim()) handleFrame(buffer);
        if (errored || !done) throw new Error('stream incomplete');
        return done;
    },
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

// OCR ảnh hóa đơn mua vật tư -> dòng có cấu trúc để điền sẵn đơn mua.
export type InvoiceOcrItem = {
    materialName: string;
    unit?: string;
    quantity?: number;
    unitPrice?: number;
    vatRate?: number;
};

export type InvoiceOcrResponse = {
    header: { supplierName?: string; invoiceNo?: string; invoiceDate?: string };
    items: InvoiceOcrItem[];
    count: number;
    available: boolean;
    usedFallback: boolean;
    provider?: string;
    model?: string;
    latencyMs?: number;
};

export const aiOcrService = {
    scanPurchaseInvoice: (image: File): Promise<InvoiceOcrResponse> => {
        const formData = new FormData();
        formData.append('image', image);
        return api.post<InvoiceOcrResponse, FormData>('/ai/ocr/purchase-invoice', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 90000,
        });
    },
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
