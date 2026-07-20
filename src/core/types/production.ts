export type ProductionDayStatus = 'draft' | 'submitted' | 'locked';
export type ProductionTimeSlotKind = 'regular' | 'overtime';

export interface ProductionActor {
    id: string;
    name?: string;
}

export interface ProductionDayStatusEvent {
    id?: string;
    from: ProductionDayStatus;
    to: ProductionDayStatus;
    note?: string;
    actor?: ProductionActor;
    at?: string;
}

export interface ProductionLine {
    id: string;
    plantId: string;
    code: string;
    name?: string;
    leaderName?: string;
    sortOrder: number;
    isActive: boolean;
    createdAt?: string;
    updatedAt?: string;
}

export interface ProductionItem {
    id: string;
    plantId: string;
    code: string;
    name?: string;
    unit: string;
    unitPrice: number;
    isActive: boolean;
    createdAt?: string;
    updatedAt?: string;
}

export interface ProductionTimeSlot {
    key: string;
    label: string;
    startMinute: number;
    endMinute: number;
    kind: ProductionTimeSlotKind;
    isActive: boolean;
}

export interface ProductionRun {
    id: string;
    itemId: string;
    itemCode: string;
    itemName?: string;
    unit: string;
    unitPriceSnapshot: number;
    hourlyQuota: number;
    startedSlotKey: string;
    endedSlotKey?: string;
    plannedEndSlotKey?: string;
    status: 'planned' | 'active' | 'closed';
    source: 'manual' | 'plan';
    planAllocationId?: string;
    plannedQuantity?: number;
    orderCode?: string;
    priority?: ProductionPlanPriority;
    dueDate?: string;
    createdAt?: string;
    createdBy?: string;
    createdByName?: string;
}

export interface HourlyProductionEntry {
    id: string;
    slotKey: string;
    runId: string;
    quantity: number;
    note?: string;
    amount: number;
    enteredBy?: string;
    enteredByName?: string;
    enteredAt?: string;
    updatedBy?: string;
    updatedByName?: string;
    updatedAt?: string;
}

export interface ProductionSlotValue {
    key: string;
    target: number;
    actual: number;
    reported: boolean;
    runId?: string;
    entryIds: string[];
}

export interface ProductionLineRecord {
    id: string;
    dayId: string;
    plantId: string;
    productionDate: string;
    lineId: string;
    lineCode: string;
    lineName?: string;
    leaderName?: string;
    sortOrder: number;
    workerCount: number;
    workerCountConfirmed: boolean;
    workerCountConfirmedAt?: string;
    workerCountConfirmedBy?: string;
    workerCountConfirmedByName?: string;
    runs: ProductionRun[];
    entries: HourlyProductionEntry[];
    slotValues: ProductionSlotValue[];
    totalTarget: number;
    totalActual: number;
    achievementPercent: number;
    totalAmount: number;
    averageIncome: number;
    configured: boolean;
    updatedBy?: string;
    updatedByName?: string;
    updatedAt?: string;
}

export interface ProductionDaySummary {
    lineCount: number;
    configuredLineCount: number;
    totalWorkers: number;
    totalTarget: number;
    totalActual: number;
    achievementPercent: number;
    totalAmount: number;
    averageIncome: number;
    itemCount: number;
}

export interface ProductionSlotSummary {
    key: string;
    target: number;
    actual: number;
    reportedLines: number;
    totalLines: number;
}

export interface ProductionDay {
    id: string;
    plantId: string;
    plantName?: string;
    plantCode?: string;
    productionDate: string;
    status: ProductionDayStatus;
    statusNote?: string;
    submittedAt?: string;
    submittedBy?: ProductionActor;
    lockedAt?: string;
    lockedBy?: ProductionActor;
    reopenedAt?: string;
    reopenedBy?: ProductionActor;
    statusHistory: ProductionDayStatusEvent[];
    financialsVisible?: boolean;
    timeSlots: ProductionTimeSlot[];
    lines: ProductionLineRecord[];
    summary: ProductionDaySummary;
    slotSummaries: ProductionSlotSummary[];
    createdAt?: string;
    updatedAt?: string;
}

export interface ProductionDayPage {
    data: ProductionDay[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export type ProductionMonitorAlertSeverity = 'critical' | 'warning' | 'info';
export type ProductionMonitorAlertType =
    | 'line_not_configured'
    | 'missing_report'
    | 'zero_without_note'
    | 'low_output'
    | 'output_spike'
    | 'plan_at_risk'
    | 'plan_overdue';
export type ProductionMonitorLineStatus =
    | 'not_configured'
    | 'waiting'
    | 'missing'
    | 'critical'
    | 'at_risk'
    | 'on_track';

export interface ProductionMonitorAlert {
    id: string;
    type: ProductionMonitorAlertType;
    severity: ProductionMonitorAlertSeverity;
    lineId: string;
    lineCode: string;
    slotKey?: string;
    slotLabel?: string;
    allocationId?: string;
    title: string;
    description: string;
}

export interface ProductionMonitorLine {
    lineId: string;
    lineCode: string;
    lineName?: string;
    leaderName?: string;
    workerCount: number;
    configured: boolean;
    targetToNow: number;
    actualToNow: number;
    achievementPercent: number;
    reportedSlots: number;
    dueSlots: number;
    missingSlots: string[];
    baselineAchievement?: number;
    deltaVsBaseline?: number;
    status: ProductionMonitorLineStatus;
}

export interface ProductionMonitorSlot {
    key: string;
    label: string;
    startMinute: number;
    endMinute: number;
    due: boolean;
    target: number;
    actual: number;
    achievementPercent: number;
    reportedLines: number;
    totalLines: number;
}

export interface ProductionMonitorSummary {
    configuredLines: number;
    totalLines: number;
    targetToNow: number;
    actualToNow: number;
    achievementToNow: number;
    reportedSlots: number;
    dueSlots: number;
    reportingRate: number;
    onTrackLines: number;
    atRiskLines: number;
    criticalAlerts: number;
    warningAlerts: number;
    baselineDays: number;
    baselineAchievement?: number;
}

export interface ProductionMonitor {
    asOf: string;
    localDate: string;
    minuteOfDay: number;
    currentSlotKey?: string;
    dueSlotKeys: string[];
    summary: ProductionMonitorSummary;
    alerts: ProductionMonitorAlert[];
    linePerformance: ProductionMonitorLine[];
    slotPerformance: ProductionMonitorSlot[];
    forecast?: ProductionForecast;
}

export interface ProductionMonitorResponse {
    day: ProductionDay;
    monitor: ProductionMonitor;
    plan?: ProductionPlan;
}

export type ProductionPlanStatus = 'draft' | 'published';
export type ProductionPlanPriority = 'low' | 'normal' | 'high' | 'urgent';
export type ProductionPlanSourceType = 'manual' | 'carry_over';

export interface ProductionPlanAllocation {
    id: string;
    lineId: string;
    lineCode: string;
    lineName?: string;
    itemId: string;
    itemCode: string;
    itemName?: string;
    unit: string;
    unitPriceSnapshot: number;
    orderCode?: string;
    plannedQuantity: number;
    hourlyQuota: number;
    startSlotKey: string;
    endSlotKey: string;
    priority: ProductionPlanPriority;
    dueDate?: string;
    note?: string;
    sourceType: ProductionPlanSourceType;
    sourcePlanId?: string;
    sourceAllocationId?: string;
    sourceProductionDate?: string;
}

export interface ProductionPlanHistoryEvent {
    id?: string;
    type: 'created' | 'updated' | 'published' | 'reopened' | 'carry_over';
    note?: string;
    revision: number;
    actor?: ProductionActor;
    at?: string;
}

export interface ProductionPlanSummary {
    allocationCount: number;
    lineCount: number;
    itemCount: number;
    totalPlannedQuantity: number;
    carryOverQuantity: number;
}

export interface ProductionPlan {
    id: string;
    plantId: string;
    plantName?: string;
    plantCode?: string;
    productionDate: string;
    status: ProductionPlanStatus;
    revision: number;
    timeSlots: ProductionTimeSlot[];
    allocations: ProductionPlanAllocation[];
    summary: ProductionPlanSummary;
    publishedAt?: string;
    publishedBy?: ProductionActor;
    reopenedAt?: string;
    reopenedBy?: ProductionActor;
    lastChangeReason?: string;
    history: ProductionPlanHistoryEvent[];
    createdBy?: ProductionActor;
    updatedBy?: ProductionActor;
    createdAt?: string;
    updatedAt?: string;
}

export type ProductionForecastConfidence = 'low' | 'medium' | 'high';
export type ProductionForecastStatus = 'not_started' | 'on_track' | 'at_risk' | 'behind' | 'completed' | 'overdue';

export interface ProductionForecastAllocation {
    allocationId: string;
    lineId: string;
    lineCode: string;
    itemId: string;
    itemCode: string;
    itemName?: string;
    orderCode?: string;
    priority: ProductionPlanPriority;
    startSlotKey: string;
    endSlotKey: string;
    plannedQuantity: number;
    actualQuantity: number;
    expectedToNow: number;
    remainingQuantity: number;
    projectedEndOfDay: number;
    projectedCompletionPercent: number;
    pacePercent: number;
    elapsedMinutes: number;
    totalMinutes: number;
    reportedEntries: number;
    confidence: ProductionForecastConfidence;
    status: ProductionForecastStatus;
    sourceType: ProductionPlanSourceType;
}

export interface ProductionForecast {
    asOf: string;
    summary: {
        plannedQuantity: number;
        actualQuantity: number;
        expectedToNow: number;
        remainingQuantity: number;
        projectedEndOfDay: number;
        projectedCompletionPercent: number;
        atRiskAllocations: number;
        completedAllocations: number;
        confidence: ProductionForecastConfidence;
    };
    allocations: ProductionForecastAllocation[];
    alerts: ProductionMonitorAlert[];
}

export type ProductionPlanAllocationPayload = {
    id?: string;
    lineId: string;
    itemId: string;
    orderCode?: string;
    plannedQuantity: number;
    hourlyQuota: number;
    startSlotKey: string;
    endSlotKey: string;
    priority: ProductionPlanPriority;
    dueDate?: string;
    note?: string;
};

export type ProductionLinePayload = {
    plantId: string;
    code: string;
    name?: string;
    leaderName?: string;
    sortOrder?: number;
    isActive?: boolean;
};

export type ProductionItemPayload = {
    plantId: string;
    code: string;
    name?: string;
    unit?: string;
    unitPrice?: number;
    isActive?: boolean;
};

export type ConfigureProductionLinePayload = {
    workerCount: number;
    workerCountConfirmed?: boolean;
    itemId?: string;
    hourlyQuota?: number;
    startSlotKey?: string;
};

export type ProductionReportScope = 'all' | 'locked';
export type ProductionReportHealth = 'healthy' | 'warning' | 'critical';
export type ProductionReportExceptionSeverity = 'critical' | 'warning' | 'info';
export type ProductionReportExceptionType =
    | 'missing_report'
    | 'under_target'
    | 'zero_without_note'
    | 'unconfigured_line'
    | 'open_day';

export interface ProductionReportSummary {
    dayCount: number;
    statusCounts: Record<ProductionDayStatus, number>;
    targetQuantity: number;
    actualQuantity: number;
    achievementPercent: number;
    plannedQuantity: number;
    plannedActualQuantity: number;
    planAttainmentPercent: number;
    expectedReports: number;
    reportedEntries: number;
    reportingRate: number;
    averageWorkers: number;
    outputPerWorkerDay: number;
    averageDailyActual: number;
    lineCount: number;
    itemCount: number;
    exceptionCount: number;
    health: ProductionReportHealth;
    totalAmount?: number;
}

export interface ProductionReportTrendPoint {
    productionDate: string;
    status: ProductionDayStatus;
    targetQuantity: number;
    actualQuantity: number;
    achievementPercent: number;
    plannedQuantity: number;
    plannedActualQuantity: number;
    planAttainmentPercent: number;
    expectedReports: number;
    reportedEntries: number;
    reportingRate: number;
    workers: number;
    configuredLines: number;
    totalLines: number;
    totalAmount?: number;
}

export interface ProductionReportLine {
    lineId: string;
    lineCode: string;
    lineName?: string;
    leaderName?: string;
    activeDays: number;
    averageWorkers: number;
    targetQuantity: number;
    actualQuantity: number;
    achievementPercent: number;
    plannedQuantity: number;
    plannedActualQuantity: number;
    planAttainmentPercent: number;
    reportingRate: number;
    outputPerWorkerDay: number;
    underTargetDays: number;
    totalAmount?: number;
}

export interface ProductionReportItem {
    itemId: string;
    itemCode: string;
    itemName?: string;
    unit: string;
    activeDays: number;
    lineCount: number;
    targetQuantity: number;
    actualQuantity: number;
    achievementPercent: number;
    plannedQuantity: number;
    plannedActualQuantity: number;
    planAttainmentPercent: number;
    totalAmount?: number;
}

export interface ProductionReportException {
    id: string;
    type: ProductionReportExceptionType;
    severity: ProductionReportExceptionSeverity;
    productionDate: string;
    lineId?: string;
    lineCode?: string;
    slotKey?: string;
    slotLabel?: string;
    title: string;
    description: string;
    value?: number;
}

export interface ProductionReport {
    meta: {
        plantId: string;
        plantName?: string;
        plantCode?: string;
        from: string;
        to: string;
        scope: ProductionReportScope;
        generatedAt: string;
        financialsVisible: boolean;
    };
    summary: ProductionReportSummary;
    comparison: {
        available: boolean;
        from?: string;
        to?: string;
        previous?: ProductionReportSummary;
        delta?: {
            actualPercent: number | null;
            achievementPoints: number;
            reportingPoints: number;
            productivityPercent: number | null;
            amountPercent?: number | null;
        };
    };
    highlights: {
        bestLine?: { lineId: string; lineCode: string; achievementPercent: number };
        attentionLine?: { lineId: string; lineCode: string; achievementPercent: number };
        topItem?: { itemId: string; itemCode: string; actualQuantity: number };
    };
    trend: ProductionReportTrendPoint[];
    lines: ProductionReportLine[];
    items: ProductionReportItem[];
    exceptionSummary: {
        total: number;
        critical: number;
        warning: number;
        info: number;
        missingReports: number;
        underTarget: number;
        zeroWithoutNote: number;
        unconfiguredLines: number;
        openDays: number;
    };
    exceptions: ProductionReportException[];
}
