export type BriefingPeriodType = 'week' | 'month';
export type BriefingSeverity = 'positive' | 'info' | 'warning' | 'critical';
export type BriefingGenerationStatus = 'ready' | 'degraded';
export type BriefingFallbackCode =
    | 'ai_disabled'
    | 'authentication'
    | 'quota'
    | 'timeout'
    | 'invalid_response'
    | 'provider_unavailable';

export interface BriefingComparison {
    current: number;
    previous: number;
    delta: number;
    deltaPct: number | null;
}

export interface BriefingEvidence {
    key: string;
    label: string;
    value: number;
    formattedValue: string;
    previous?: number;
    formattedPrevious?: string;
    deltaPct?: number | null;
    unit: 'count' | 'percent' | 'currency' | 'days';
    tone: 'neutral' | 'positive' | 'warning' | 'critical';
}

export interface BriefingContentItem {
    id: string;
    title: string;
    detail: string;
    severity: BriefingSeverity;
    evidenceKeys: string[];
    actionKey?: string;
    actionLabel?: string;
    actionUrl?: string;
}

export interface BriefingPlantPerformance {
    plantId: string;
    plantName: string;
    plantCode?: string;
    operationalMachines: number;
    activeMachines: number;
    maintenanceMachines: number;
    brokenMachines: number;
    availabilityPct: number;
    newTickets: number;
    completedTickets: number;
    overdueTickets: number;
    lowStockCount: number;
    purchaseValue: number;
    distributionValue: number;
    stocktakeAnomalies: number;
    attentionLevel: 'stable' | 'watch' | 'critical';
}

export interface ExecutiveBriefingSnapshot {
    fleet: {
        registeredOwned: number;
        operationalMachines: number;
        activeMachines: number;
        maintenanceMachines: number;
        brokenMachines: number;
        storageMachines: number;
        pendingDisposalMachines: number;
        disposedMachines: number;
        unassignedMachines: number;
        linkedQrAssets: number;
        availabilityPct: number;
        qrCoveragePct: number;
    };
    maintenance: {
        newTickets: BriefingComparison;
        completedTickets: BriefingComparison;
        emergencyTickets: BriefingComparison;
        externalRepairCost: BriefingComparison;
        openTickets: number;
        overdueTickets: number;
        avgResolutionDays: number;
        repeatFailureAssets: number;
        completedWithEvidence: number;
        evidenceCoveragePct: number;
        topRepeatAssets: Array<Record<string, unknown>>;
        notableIncidents: Array<Record<string, unknown>>;
    };
    materials: {
        purchaseValue: BriefingComparison;
        distributionValue: BriefingComparison;
        pendingPurchaseRequests: number;
        approvedAwaitingOrder: number;
        partialPurchaseOrders: number;
        openPurchaseShortages: number;
        openPurchaseShortageQuantity: number;
        openSupplyShortages: number;
        openSupplyShortageQuantity: number;
        lowStockCount: number;
        lowStockItems: Array<{
            materialId?: string;
            materialCode?: string;
            materialName: string;
            unit?: string;
            plantId?: string;
            plantName: string;
            currentStock: number;
            minStockLevel: number;
            shortage: number;
        }>;
    };
    operations: {
        transfersCreated: BriefingComparison;
        transfersCompleted: BriefingComparison;
        transferredAssets: number;
        openTransfers: number;
        mislocatedAssets: number;
        mislocatedItems: Array<Record<string, unknown>>;
        stocktakeSessions: BriefingComparison;
        stocktakeMissing: number;
        stocktakeAnomalies: number;
    };
    plants: BriefingPlantPerformance[];
    evidence: BriefingEvidence[];
    dataDefinitions: Array<{ key: string; label: string; definition: string }>;
    dataWarnings: string[];
}

export interface ExecutiveBriefing {
    _id: string;
    periodType: BriefingPeriodType;
    periodKey: string;
    periodLabel: string;
    rangeStart: string;
    rangeEnd: string;
    comparisonKey: string;
    comparisonLabel: string;
    comparisonStart: string;
    comparisonEnd: string;
    dataAsOf: string;
    snapshotVersion: number;
    sourceHash: string;
    snapshot: ExecutiveBriefingSnapshot;
    summary: string;
    highlights: BriefingContentItem[];
    risks: BriefingContentItem[];
    actions: BriefingContentItem[];
    generationStatus: BriefingGenerationStatus;
    trigger: 'cron' | 'startup' | 'manual' | 'internal';
    provider?: string;
    model?: string;
    latencyMs?: number;
    fallbackCode?: BriefingFallbackCode;
    fallbackReason?: string;
    aiAttemptedAt?: string;
    nextAiRetryAt?: string;
    aiContributionCount?: number;
    version: number;
    createdAt: string;
    updatedAt: string;
    changed?: boolean;
}

export type ExecutiveBriefingHistoryItem = Pick<
    ExecutiveBriefing,
    | '_id'
    | 'periodType'
    | 'periodKey'
    | 'periodLabel'
    | 'rangeStart'
    | 'rangeEnd'
    | 'dataAsOf'
    | 'generationStatus'
    | 'trigger'
    | 'provider'
    | 'model'
    | 'fallbackCode'
    | 'fallbackReason'
    | 'aiAttemptedAt'
    | 'nextAiRetryAt'
    | 'aiContributionCount'
    | 'version'
    | 'createdAt'
    | 'updatedAt'
>;
