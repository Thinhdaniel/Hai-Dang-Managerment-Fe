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
    operationTemplates: ProductionItemOperationTemplate[];
    isActive: boolean;
    priceUpdate?: ProductionUnitPriceUpdateResult;
    createdAt?: string;
    updatedAt?: string;
}

export type ProductionUnitPriceMode = 'future_only' | 'recalculate_from_date';

export interface ProductionUnitPriceUpdateResult {
    mode: ProductionUnitPriceMode;
    previousUnitPrice: number;
    nextUnitPrice: number;
    effectiveFrom?: string;
    affectedDayCount: number;
    affectedRecordCount: number;
    affectedRunCount: number;
    affectedEntryCount: number;
    affectedPlanCount: number;
    affectedPlanAllocationCount: number;
}

export interface ProductionOperation {
    id: string;
    plantId: string;
    code: string;
    name: string;
    unit: string;
    sortOrder: number;
    isActive: boolean;
    createdAt?: string;
    updatedAt?: string;
}

export interface ProductionItemOperationTemplate {
    operationId: string;
    operationCode: string;
    operationName: string;
    unit: string;
    hourlyQuota: number;
    required: boolean;
    sortOrder: number;
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

export interface HourlyQcEntry {
    id: string;
    slotKey: string;
    runId?: string;
    itemId?: string;
    itemCode?: string;
    itemName?: string;
    orderCode?: string;
    inspectionType?: ProductionQcInspectionType;
    sourceType?: ProductionQcSourceType;
    sourceProductionDate?: string;
    allocationState?: 'exact' | 'unallocated';
    legacy?: boolean;
    passedQuantity: number;
    defectQuantity: number;
    totalQuantity: number;
    defectRate: number;
    note?: string;
    enteredBy?: string;
    enteredByName?: string;
    enteredAt?: string;
    updatedBy?: string;
    updatedByName?: string;
    updatedAt?: string;
}

export type ProductionQcInspectionType = 'first_pass' | 'recheck';
export type ProductionQcSourceType = 'current_day' | 'carryover';

export interface ProductionQcInspection {
    id?: string;
    itemId: string;
    itemCode: string;
    itemName?: string;
    unit: string;
    orderCode?: string;
    inspectionType: ProductionQcInspectionType;
    sourceType: ProductionQcSourceType;
    sourceProductionDate?: string;
    passedQuantity: number;
    defectQuantity: number;
    totalQuantity: number;
    defectRate: number;
    note?: string;
}

export interface ProductionQcSlotRecord {
    id: string;
    dayId: string;
    lineId: string;
    slotKey: string;
    inspections: ProductionQcInspection[];
    passedQuantity: number;
    defectQuantity: number;
    totalQuantity: number;
    enteredBy?: string;
    enteredByName?: string;
    enteredAt?: string;
    updatedBy?: string;
    updatedByName?: string;
    updatedAt?: string;
}

export interface ProductionOperationTrack {
    id: string;
    operationId: string;
    operationCode: string;
    operationName: string;
    unit: string;
    itemId: string;
    itemCode: string;
    sourceRunId: string;
    hourlyQuota: number;
    required: boolean;
    sortOrder: number;
    startedSlotKey: string;
    endedSlotKey?: string;
    status: 'active' | 'closed';
    createdBy?: string;
    createdByName?: string;
    createdAt?: string;
}

export interface HourlyOperationEntry {
    id: string;
    slotKey: string;
    trackId: string;
    quantity: number;
    note?: string;
    enteredBy?: string;
    enteredByName?: string;
    enteredAt?: string;
    updatedBy?: string;
    updatedByName?: string;
    updatedAt?: string;
}

export interface ProductionOperationSlotValue {
    key: string;
    trackId: string;
    operationId: string;
    operationCode: string;
    operationName: string;
    unit: string;
    itemId: string;
    itemCode: string;
    sourceRunId: string;
    required: boolean;
    due: boolean;
    transition: boolean;
    overtime: boolean;
    target: number;
    actual: number;
    achievementPercent: number;
    reported: boolean;
    entryIds: string[];
    note?: string;
    enteredBy?: string;
    enteredByName?: string;
    enteredAt?: string;
    updatedBy?: string;
    updatedByName?: string;
    updatedAt?: string;
}

export interface ProductionOperationTrackSummary extends ProductionOperationTrack {
    target: number;
    actual: number;
    achievementPercent: number;
    expectedEntries: number;
    reportedEntries: number;
    coveragePercent: number;
}

export interface ProductionSlotValue {
    key: string;
    /** Khung tăng ca: không có khoán (target = 0), sản lượng là phần vượt để xét thưởng. */
    overtime?: boolean;
    target: number;
    actual: number;
    reported: boolean;
    runId?: string;
    entryIds: string[];
}

export interface ProductionQcSlotValue {
    key: string;
    overtime?: boolean;
    passedQuantity: number;
    defectQuantity: number;
    totalQuantity: number;
    defectRate: number;
    firstPassQuantity?: number;
    recheckQuantity?: number;
    unallocatedQuantity?: number;
    /** Sản lượng chuyền trong giờ, chỉ để tham khảo; không dùng đối soát QC. */
    productionActualReference: number;
    /** Payload backend cũ trong thời gian rollout. */
    productionActual?: number;
    referenceRunId?: string;
    reported: boolean;
    /** Tương thích payload cũ trong thời gian rollout. */
    runId?: string;
    entryIds: string[];
    note?: string;
    enteredBy?: string;
    enteredByName?: string;
    enteredAt?: string;
    updatedBy?: string;
    updatedByName?: string;
    updatedAt?: string;
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
    qcEntries: HourlyQcEntry[];
    qcSlotRecords: ProductionQcSlotRecord[];
    qcSlotValues: ProductionQcSlotValue[];
    operationTrackingEnabled: boolean;
    operationTracks: ProductionOperationTrack[];
    operationEntries: HourlyOperationEntry[];
    operationSlotValues: ProductionOperationSlotValue[];
    operationTrackSummaries: ProductionOperationTrackSummary[];
    totalTarget: number;
    totalActual: number;
    achievementPercent: number;
    totalAmount: number;
    averageIncome: number;
    qcPassedQuantity: number;
    qcDefectQuantity: number;
    qcTotalQuantity: number;
    qcFirstPassQuantity: number;
    qcRecheckQuantity: number;
    qcUnallocatedQuantity: number;
    qcDefectRate: number;
    qcReportedSlots: number;
    qcExpectedSlots: number;
    qcCoveragePercent: number;
    operationExpectedEntries: number;
    operationReportedEntries: number;
    operationCoveragePercent: number;
    operationBehindCount: number;
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
    qcPassedQuantity: number;
    qcDefectQuantity: number;
    qcTotalQuantity: number;
    qcFirstPassQuantity: number;
    qcRecheckQuantity: number;
    qcUnallocatedQuantity: number;
    qcDefectRate: number;
    qcReportedLineSlots: number;
    qcExpectedLineSlots: number;
    qcCoveragePercent: number;
    operationTrackedLineCount: number;
    operationTrackCount: number;
    operationExpectedEntries: number;
    operationReportedEntries: number;
    operationCoveragePercent: number;
    operationBehindCount: number;
}

export interface ProductionSlotSummary {
    key: string;
    overtime?: boolean;
    target: number;
    actual: number;
    reportedLines: number;
    qcPassedQuantity: number;
    qcDefectQuantity: number;
    qcTotalQuantity: number;
    qcReportedLines: number;
    qcExpectedLines: number;
    qcCoveragePercent: number;
    operationExpectedEntries: number;
    operationReportedEntries: number;
    operationCoveragePercent: number;
    operationBehindCount: number;
    totalLines: number;
}

export interface ProductionDay {
    id: string;
    plantId: string;
    plantName?: string;
    plantCode?: string;
    productionDate: string;
    status: ProductionDayStatus;
    reportingState?: 'provisional' | 'official';
    dataAsOf?: string;
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

export interface SaveProductionEntryPayload {
    runId: string;
    quantity: number;
    note?: string;
    clientMutationId?: string;
    /**
     * null: client tin ô chưa tồn tại; string: phiên bản client đã đọc;
     * undefined: tương thích luồng cũ, không kiểm tra xung đột.
     */
    expectedUpdatedAt?: string | null;
}

export interface SaveProductionQcEntryPayload {
    /** Chỉ gửi để tương thích backend cũ trong lúc rollout. */
    runId?: string;
    passedQuantity: number;
    defectQuantity: number;
    /** Backend mới tự tính; field này chỉ phục vụ phiên bản cũ. */
    totalQuantity?: number;
    note?: string;
    clientMutationId?: string;
    expectedUpdatedAt?: string | null;
}

export interface SaveProductionQcInspectionPayload {
    id?: string;
    itemId: string;
    orderCode?: string;
    inspectionType: ProductionQcInspectionType;
    sourceType: ProductionQcSourceType;
    sourceProductionDate?: string;
    passedQuantity: number;
    defectQuantity: number;
    note?: string;
}

export interface SaveProductionQcRecordPayload {
    inspections: SaveProductionQcInspectionPayload[];
    clientMutationId?: string;
    expectedUpdatedAt?: string | null;
}

export interface ProductionOperationConfigPayload {
    operationId: string;
    hourlyQuota: number;
    required: boolean;
    sortOrder: number;
}

export interface SaveProductionOperationEntryPayload {
    trackId: string;
    quantity: number;
    note?: string;
    clientMutationId?: string;
    expectedUpdatedAt?: string | null;
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

export type ProductionMonitorOperationStatus =
    | 'waiting'
    | 'reference'
    | 'missing'
    | 'critical'
    | 'at_risk'
    | 'on_track';

export type ProductionMonitorOperationAlertType =
    | 'missing_operation_report'
    | 'low_operation_output'
    | 'operation_output_spike';

export interface ProductionMonitorOperationCurrentSlot {
    key: string;
    label: string;
    target: number;
    actual: number;
    reported: boolean;
}

export interface ProductionMonitorOperation {
    key: string;
    trackId: string;
    lineId: string;
    lineCode: string;
    lineName?: string;
    leaderName?: string;
    itemId: string;
    itemCode: string;
    sourceRunId: string;
    operationId: string;
    operationCode: string;
    operationName: string;
    unit: string;
    required: boolean;
    sortOrder: number;
    trackStatus: 'active' | 'closed';
    startedSlotKey: string;
    endedSlotKey?: string;
    status: ProductionMonitorOperationStatus;
    targetToNow: number;
    actualToNow: number;
    achievementPercent: number;
    expectedEntries: number;
    reportedEntries: number;
    coveragePercent: number;
    missingSlotKeys: string[];
    behindSlotKeys: string[];
    transitionQuantity: number;
    currentSlot?: ProductionMonitorOperationCurrentSlot;
    lastEnteredByName?: string;
    lastUpdatedAt?: string;
}

export interface ProductionMonitorOperationAlert {
    id: string;
    type: ProductionMonitorOperationAlertType;
    severity: ProductionMonitorAlertSeverity;
    lineId: string;
    lineCode: string;
    trackId: string;
    operationId: string;
    operationCode: string;
    operationName: string;
    itemCode: string;
    slotKey: string;
    slotLabel: string;
    title: string;
    description: string;
}

export interface ProductionMonitorOperationSummary {
    trackedLines: number;
    trackCount: number;
    requiredTrackCount: number;
    expectedEntries: number;
    reportedEntries: number;
    missingEntries: number;
    coveragePercent: number;
    behindTrackCount: number;
    onTrackTrackCount: number;
    currentTrackCount: number;
    currentReportedCount: number;
    criticalAlerts: number;
    warningAlerts: number;
    lastUpdatedAt?: string;
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
    operationSummary: ProductionMonitorOperationSummary;
    operationAlerts: ProductionMonitorOperationAlert[];
    operationPerformance: ProductionMonitorOperation[];
    forecast?: ProductionForecast;
}

export interface ProductionMonitorResponse {
    day: ProductionDay;
    monitor: ProductionMonitor;
    plan?: ProductionPlan;
}

export type ProductionBoardLineStatus =
    | 'not_configured'
    | 'waiting'
    | 'missing'
    | 'critical'
    | 'at_risk'
    | 'on_track'
    | 'ahead';

export type ProductionBoardGuidanceTone = 'neutral' | 'info' | 'warning' | 'danger' | 'success';

export interface ProductionBoardSlot {
    key: string;
    label: string;
    startMinute: number;
    endMinute: number;
    /** Khung tăng ca: không có khoán, sản lượng là phần vượt để xét thưởng. */
    overtime?: boolean;
    target: number;
    actual: number;
    targetAmount: number;
    actualAmount: number;
    achievementPercent: number;
    reported: boolean;
    due: boolean;
    current: boolean;
    elapsedMinutes: number;
    remainingMinutes: number;
    itemCode?: string;
    itemName?: string;
    orderCode?: string;
    state: 'not_planned' | 'missing' | 'current' | 'complete' | 'upcoming';
}

export interface ProductionBoardCurrentSlot {
    key: string;
    label: string;
    startMinute: number;
    endMinute: number;
    elapsedMinutes: number;
    remainingMinutes: number;
    target: number;
    actual: number;
    reported: boolean;
    carryShortfall: number;
    requiredQuantity: number;
    basePer15: number;
    requiredPer15: number;
}

export interface ProductionBoardOperation {
    trackId: string;
    operationCode: string;
    operationName: string;
    itemCode: string;
    unit: string;
    required: boolean;
    sortOrder: number;
    status: ProductionMonitorOperationStatus;
    target: number;
    actual: number;
    achievementPercent: number;
    expectedEntries: number;
    reportedEntries: number;
    missingCount: number;
    behindCount: number;
    currentSlot?: {
        key: string;
        target: number;
        actual: number;
        reported: boolean;
    };
}

export interface ProductionBoardLine {
    lineId: string;
    lineCode: string;
    lineName?: string;
    leaderName?: string;
    workerCount: number;
    configured: boolean;
    status: ProductionBoardLineStatus;
    activeItem?: {
        runId: string;
        itemCode: string;
        itemName?: string;
        orderCode?: string;
        unitPrice: number;
        hourlyQuota: number;
    };
    checkpoint: {
        target: number;
        actual: number;
        gap: number;
        achievementPercent: number;
        targetAmount: number;
        actualAmount: number;
        amountGap: number;
    };
    live: {
        targetToNow: number;
        actualToNow: number;
        gapToNow: number;
        targetAmountToNow: number;
        actualAmountToNow: number;
    };
    day: {
        target: number;
        actual: number;
        remaining: number;
        achievementPercent: number;
        targetAmount: number;
        actualAmount: number;
        averageIncome: number;
        targetAverageIncome: number;
        projectedQuantity?: number;
        projectedAmount?: number;
        projectedAverageIncome?: number;
        projectedIncomeGap?: number;
        requiredPer15: number;
        overQuotaQuantity: number;
        overQuotaAmount: number;
    };
    currentSlot?: ProductionBoardCurrentSlot;
    operations?: {
        trackedCount: number;
        expectedEntries: number;
        reportedEntries: number;
        missingCount: number;
        behindCount: number;
        currentCount: number;
        currentReportedCount: number;
        items: ProductionBoardOperation[];
    };
    guidance: {
        tone: ProductionBoardGuidanceTone;
        title: string;
        description: string;
    };
    missingSlots: string[];
    slots: ProductionBoardSlot[];
    updatedAt?: string;
}

export interface ProductionBoard {
    asOf: string;
    localDate: string;
    productionDate: string;
    plantId: string;
    plantName?: string;
    plantCode?: string;
    dayStatus: ProductionDayStatus;
    currentSlot?: {
        key: string;
        label: string;
        startMinute: number;
        endMinute: number;
        remainingMinutes: number;
    };
    summary: {
        totalLines: number;
        configuredLines: number;
        totalWorkers: number;
        checkpointTarget: number;
        checkpointActual: number;
        checkpointGap: number;
        checkpointAchievementPercent: number;
        target: number;
        actual: number;
        achievementPercent: number;
        targetAmount: number;
        actualAmount: number;
        averageIncome: number;
        targetAverageIncome: number;
        projectedAmount?: number;
        projectedAverageIncome?: number;
        onTrackLines: number;
        attentionLines: number;
        missingLines: number;
        operationTrackedLines?: number;
        operationTrackCount?: number;
        operationExpectedEntries?: number;
        operationReportedEntries?: number;
        operationCoveragePercent?: number;
        missingOperationEntries?: number;
        behindOperations?: number;
    };
    lines: ProductionBoardLine[];
    updatedAt?: string;
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
    unitPriceMode?: ProductionUnitPriceMode;
    unitPriceEffectiveFrom?: string;
    unitPriceChangeReason?: string;
};

export type ConfigureProductionLinePayload = {
    workerCount: number;
    workerCountConfirmed?: boolean;
    itemId?: string;
    hourlyQuota?: number;
    startSlotKey?: string;
    operationTrackingEnabled?: boolean;
};

export type ProductionReportScope = 'all' | 'locked';
export type ProductionReportHealth = 'healthy' | 'warning' | 'critical';
export type ProductionReportExceptionSeverity = 'critical' | 'warning' | 'info';
export type ProductionReportExceptionType =
    | 'missing_report'
    | 'missing_operation_report'
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
    operationExpectedEntries: number;
    operationReportedEntries: number;
    operationCoveragePercent: number;
    operationBehindCount: number;
    operationCount: number;
    averageWorkers: number;
    outputPerWorkerDay: number;
    averageDailyActual: number;
    lineCount: number;
    itemCount: number;
    exceptionCount: number;
    health: ProductionReportHealth;
    totalAmount?: number;
    periodQuantity: number;
    carryInQuantity: number;
    trackedBeforePeriodQuantity: number;
    openingQuantity: number;
    trackedToDateQuantity: number;
    cumulativeQuantity?: number;
    unallocatedOpeningQuantity: number;
    unpricedOpeningQuantity: number;
    cumulativeLineCount: number;
    cumulativeItemCount: number;
    orderCount: number;
    periodAmount?: number;
    openingAmount?: number;
    cumulativeAmount?: number;
    cumulativeAmountComplete?: boolean;
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
    operationExpectedEntries: number;
    operationReportedEntries: number;
    operationCoveragePercent: number;
    operationBehindCount: number;
    workers: number;
    configuredLines: number;
    totalLines: number;
    totalAmount?: number;
    periodQuantity: number;
    cumulativeQuantity: number;
    cumulativeAmount?: number;
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
    periodQuantity: number;
    openingQuantity: number;
    cumulativeQuantity: number;
    unallocatedOpeningQuantity: number;
    openingAmountComplete: boolean;
    periodAmount?: number;
    openingAmount?: number;
    cumulativeAmount?: number;
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
    periodQuantity: number;
    openingQuantity: number;
    cumulativeQuantity: number;
    openingAmountComplete: boolean;
    periodAmount?: number;
    openingAmount?: number;
    cumulativeAmount?: number;
}

export interface ProductionReportOrder {
    orderKey: string;
    orderCode?: string;
    itemCodes: string[];
    activeDays: number;
    lineCount: number;
    itemCount: number;
    targetQuantity: number;
    actualQuantity: number;
    periodQuantity: number;
    openingQuantity: number;
    cumulativeQuantity: number;
    achievementPercent: number;
    plannedQuantity: number;
    plannedActualQuantity: number;
    planAttainmentPercent: number;
    openingAmountComplete: boolean;
    totalAmount?: number;
    periodAmount?: number;
    openingAmount?: number;
    cumulativeAmount?: number;
}

export interface ProductionReportOperation {
    key: string;
    lineId: string;
    lineCode: string;
    leaderName?: string;
    itemId: string;
    itemCode: string;
    operationId: string;
    operationCode: string;
    operationName: string;
    unit: string;
    required: boolean;
    activeDays: number;
    targetQuantity: number;
    actualQuantity: number;
    achievementPercent: number;
    expectedEntries: number;
    reportedEntries: number;
    coveragePercent: number;
    behindSlots: number;
    transitionQuantity: number;
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
        dataCoverage: {
            status: 'missing' | 'partial' | 'complete';
            openingBalanceAvailable: boolean;
            cutoffDate?: string;
            trackingStartDate?: string;
            batchCount: number;
            periodDetailComplete: boolean;
            cumulativeAvailable: boolean;
            amountCoveragePercent: number;
            unallocatedQuantity: number;
            unpricedQuantity: number;
            lastConfirmedAt?: string;
        };
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
    orders: ProductionReportOrder[];
    operations: ProductionReportOperation[];
    exceptionSummary: {
        total: number;
        critical: number;
        warning: number;
        info: number;
        missingReports: number;
        missingOperationReports: number;
        underTarget: number;
        zeroWithoutNote: number;
        unconfiguredLines: number;
        openDays: number;
    };
    exceptions: ProductionReportException[];
}

export interface ProductionOpeningBalanceEntry {
    id?: string;
    lineId: string;
    lineCode: string;
    lineName?: string;
    itemId?: string;
    itemCode?: string;
    itemName?: string;
    orderCode?: string;
    unit: string;
    quantity: number;
    unitPriceSnapshot?: number;
    amountSnapshot?: number;
    allocationState: 'exact' | 'unallocated';
    sourceRow?: number;
}

export interface ProductionOpeningBalanceSummary {
    entryCount: number;
    totalQuantity: number;
    exactQuantity: number;
    unallocatedQuantity: number;
    valuedQuantity: number;
    totalAmount: number;
}

export interface ProductionOpeningBalanceCoverage extends ProductionOpeningBalanceSummary {
    available: boolean;
    cutoffDate?: string;
    batchCount: number;
    amountCoveragePercent: number;
    lastConfirmedAt?: string;
}

export interface ProductionOpeningBalanceBatch {
    id: string;
    code: string;
    plantId: string;
    plantName: string;
    plantCode?: string;
    cutoffDate: string;
    sourceType: 'manual' | 'excel';
    sourceFileName?: string;
    sourceFileSize?: number;
    sourceSheet?: string;
    note?: string;
    status: 'confirmed' | 'voided';
    summary: ProductionOpeningBalanceSummary;
    entries: ProductionOpeningBalanceEntry[];
    confirmedBy?: ProductionActor;
    confirmedAt?: string;
    voidedBy?: ProductionActor;
    voidedAt?: string;
    voidReason?: string;
    history: Array<{
        id?: string;
        type: 'confirmed' | 'voided';
        reason?: string;
        actor?: ProductionActor;
        at?: string;
    }>;
    createdAt?: string;
    updatedAt?: string;
}

export interface ProductionOpeningBalanceList {
    plant: { id: string; name: string; code?: string };
    coverage: ProductionOpeningBalanceCoverage;
    batches: ProductionOpeningBalanceBatch[];
}

export interface ProductionOpeningBalancePreviewRow {
    rowNumber: number;
    lineCode: string;
    itemCode?: string;
    orderCode?: string;
    quantity?: number;
    unitPrice?: number;
    unit?: string;
    lineName?: string;
    itemName?: string;
    allocationState: 'exact' | 'unallocated';
    isValid: boolean;
    errors: string[];
}

export interface ProductionOpeningBalancePreview {
    plant: { id: string; name: string; code?: string };
    cutoffDate: string;
    fileName?: string;
    sheetName: string;
    headerRow: number;
    summary: ProductionOpeningBalanceSummary & {
        totalRows: number;
        validRows: number;
        invalidRows: number;
    };
    rows: ProductionOpeningBalancePreviewRow[];
}

export type ProductionQcOpeningMode = 'full' | 'backlog_only';

export interface ProductionQcOpeningBalanceEntry {
    id?: string;
    lineId: string;
    lineCode: string;
    lineName?: string;
    itemId?: string;
    itemCode?: string;
    itemName?: string;
    orderCode?: string;
    unit: string;
    mode: ProductionQcOpeningMode;
    passedQuantity: number;
    defectQuantity: number;
    inspectedQuantity: number;
    pendingQuantity: number;
    allocationState: 'exact' | 'unallocated';
    sourceRow?: number;
}

export interface ProductionQcOpeningBalanceSummary {
    entryCount: number;
    passedQuantity: number;
    defectQuantity: number;
    inspectedQuantity: number;
    pendingQuantity: number;
    exactPendingQuantity: number;
    unallocatedPendingQuantity: number;
    fullEntryCount: number;
}

export interface ProductionQcOpeningBalanceCoverage extends ProductionQcOpeningBalanceSummary {
    available: boolean;
    cutoffDate?: string;
    batchCount: number;
    exactCoveragePercent: number;
    historicalQualityComplete: boolean;
    lastConfirmedAt?: string;
}

export interface ProductionQcOpeningBalanceBatch {
    id: string;
    code: string;
    plantId: string;
    plantName: string;
    plantCode?: string;
    cutoffDate: string;
    sourceType: 'manual' | 'excel';
    sourceFileName?: string;
    sourceFileSize?: number;
    sourceSheet?: string;
    note: string;
    status: 'confirmed' | 'voided';
    summary: ProductionQcOpeningBalanceSummary;
    entries: ProductionQcOpeningBalanceEntry[];
    confirmedBy?: ProductionActor;
    confirmedAt?: string;
    voidedBy?: ProductionActor;
    voidedAt?: string;
    voidReason?: string;
    createdAt?: string;
    updatedAt?: string;
}

export interface ProductionQcOpeningBalanceList {
    plant: { id: string; name: string; code?: string };
    coverage: ProductionQcOpeningBalanceCoverage;
    batches: ProductionQcOpeningBalanceBatch[];
}

export interface ProductionQcOpeningBalancePreview {
    plant: { id: string; name: string; code?: string };
    cutoffDate: string;
    fileName?: string;
    sheetName: string;
    headerRow: number;
    summary: ProductionQcOpeningBalanceSummary & {
        totalRows: number;
        validRows: number;
        invalidRows: number;
        reconciliationInvalidCount: number;
    };
    rows: Array<{
        rowNumber: number;
        lineCode: string;
        itemCode?: string;
        itemName?: string;
        orderCode?: string;
        mode: ProductionQcOpeningMode;
        passedQuantity?: number;
        defectQuantity?: number;
        pendingQuantity?: number;
        allocationState: 'exact' | 'unallocated';
        isValid: boolean;
        errors: string[];
    }>;
    reconciliation: Array<{
        entryKey: string;
        lineCode: string;
        itemCode?: string;
        orderCode?: string;
        mode: ProductionQcOpeningMode;
        productionQuantity?: number;
        declaredQuantity: number;
        variance?: number;
        reconciled: boolean;
        message: string;
    }>;
}

export type ProductionQcReportCoverageStatus = 'missing' | 'partial' | 'complete';

export interface ProductionQcReportRow {
    itemId?: string;
    itemCode?: string;
    itemName?: string;
    lineId?: string;
    lineCode?: string;
    lineName?: string;
    openingProduced: number;
    openingPending: number;
    openingPassed: number;
    openingDefect: number;
    historicalQualityComplete: boolean;
    periodProduced: number;
    periodPassed: number;
    periodDefect: number;
    periodFirstPass: number;
    periodRecheck: number;
    trackedProducedToDate: number;
    trackedFirstPassToDate: number;
    trackedRecheckToDate: number;
    legacyQuantity: number;
    cumulativeProduced: number;
    cumulativeInspected?: number;
    cumulativeKnownPassed: number;
    cumulativeKnownDefect: number;
    pendingQuantity?: number;
    overInspectedQuantity: number;
    qcCompletionPercent?: number;
    periodDefectRate: number;
    periodFirstPassYield: number;
    cumulativeKnownDefectRate: number;
    lastQcDate?: string;
}

export interface ProductionQcReport {
    meta: {
        plantId: string;
        plantName?: string;
        plantCode?: string;
        from: string;
        to: string;
        generatedAt: string;
        filters: {
            itemId?: string;
            lineId?: string;
            orderCode?: string;
        };
        coverage: {
            status: ProductionQcReportCoverageStatus;
            productionOpeningAvailable: boolean;
            qcOpeningAvailable: boolean;
            cutoffDate?: string;
            trackingStartDate?: string;
            exactCoveragePercent: number;
            allocationCoveragePercent: number;
            historicalQualityComplete: boolean;
            legacyUnallocatedQuantity: number;
            openingUnallocatedPendingQuantity: number;
            itemBreakdownPendingKnown: boolean;
        };
    };
    summary: {
        periodProduced: number;
        periodFirstPass: number;
        periodPassed: number;
        periodDefect: number;
        periodRecheck: number;
        periodBalance: number;
        periodDefectRate: number;
        periodFirstPassYield: number;
        openingProduced: number;
        openingPending: number;
        openingKnownPassed: number;
        openingKnownDefect: number;
        trackedProducedToDate: number;
        trackedFirstPassToDate: number;
        cumulativeProduced: number;
        cumulativeInspected?: number;
        pendingQuantity?: number;
        pendingKnown: boolean;
        pendingUnknownReason?: 'missing_opening' | 'unallocated_scope';
        overInspectedQuantity: number;
        qcCompletionPercent?: number;
        itemCount: number;
        lineCount: number;
        exceptionCount: number;
    };
    trend: Array<{
        date: string;
        produced: number;
        firstPass: number;
        passed: number;
        defect: number;
        recheck: number;
        defectRate: number;
        cumulativeProduced: number;
        cumulativePending?: number;
        cumulativeInspected?: number;
        overInspectedQuantity: number;
    }>;
    items: ProductionQcReportRow[];
    lines: ProductionQcReportRow[];
    exceptions: Array<{
        id: string;
        type: 'missing_opening' | 'legacy_unallocated' | 'opening_unallocated' | 'over_inspected' | 'high_defect';
        severity: 'critical' | 'warning';
        itemId?: string;
        itemCode?: string;
        title: string;
        description: string;
        quantity?: number;
    }>;
}

export interface ProductionReminderRule {
    id: string;
    plantId: string;
    enabled: boolean;
    graceMinutes: number;
    repeatMinutes: number;
    escalationMinutes: number;
    escalateToManagers: boolean;
    telegramFallback: boolean;
    underTargetEnabled: boolean;
    underTargetThreshold: number;
    additionalRecipientIds: string[];
    updatedAt?: string;
}

export interface ProductionReminderDelivery {
    attemptedRecipients?: number;
    inAppCreated?: number;
    webPushSent?: number;
    telegramSent?: number;
    failedChannels?: number;
    at?: string;
}

export interface ProductionReminderEvent {
    id: string;
    plantId: string;
    dayId: string;
    productionDate: string;
    slotKey: string;
    slotLabel: string;
    state: 'open' | 'resolved' | 'expired';
    dueAt: string;
    missingLineCodes: string[];
    missingOperationLabels: string[];
    underTargetLineCodes: string[];
    reminderCount: number;
    lastNotifiedAt?: string;
    nextNotifyAt?: string;
    escalatedAt?: string;
    performanceNotifiedAt?: string;
    resolvedAt?: string;
    lastDelivery?: ProductionReminderDelivery;
}

export interface ProductionReminderStatus {
    plant: { id: string; name: string; code?: string };
    productionDate: string;
    serverTime: string;
    rule: ProductionReminderRule;
    channel: {
        pushDeviceCount: number;
        telegramLinked: boolean;
        ready: boolean;
    };
    events: ProductionReminderEvent[];
}

export interface ProductionReminderRecipient {
    id: string;
    fullname: string;
    username?: string;
    role: string;
    pushDeviceCount: number;
    telegramLinked: boolean;
}

export interface ProductionReminderSettings {
    plant: { id: string; name: string; code?: string };
    rule: ProductionReminderRule;
    recipients: ProductionReminderRecipient[];
}

export type UpdateProductionReminderSettingsPayload = Omit<ProductionReminderRule, 'id' | 'updatedAt'>;

export interface ProductionReminderTestResult {
    inAppCreated: number;
    webPushSent: number;
    telegramSent: number;
    failedChannels: number;
    recipient: ProductionReminderRecipient;
    channel: {
        pushDeviceCount: number;
        telegramLinked: boolean;
        ready: boolean;
    };
}
