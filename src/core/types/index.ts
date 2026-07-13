// ===== ENUMS =====
export enum AssetStatus {
    ACTIVE = 'active',
    MAINTENANCE = 'maintenance',
    BROKEN = 'broken',
    BORROWING = 'borrowing',
    STORAGE = 'storage',
    PENDING_DISPOSAL = 'pending_disposal',
    DISPOSED = 'disposed',
    RETURNED_TO_PARTNER = 'returned_to_partner',
}

export enum AssetOwnershipType {
    OWNED = 'owned',
    PARTNER_BORROWED = 'partner_borrowed',
    RENTAL = 'rental',
}

export type AssetLifecycleView = 'operating' | 'pending_disposal' | 'disposed' | 'all';

export enum MaintenanceType {
    PERIODIC = 'periodic',
    EMERGENCY = 'emergency',
    INSPECTION = 'inspection',
}

export enum MaintenanceRepairMode {
    INTERNAL = 'internal',
    EXTERNAL = 'external',
}

export enum TransferStatus {
    PENDING = 'pending',
    APPROVED = 'approved',
    COMPLETED = 'completed',
    REJECTED = 'rejected',
    CANCELLED = 'cancelled',
}

export enum BorrowingStatus {
    ACTIVE = 'active',
    RETURNED = 'returned',
}

export enum BorrowingBatchStatus {
    DRAFT = 'draft',
    RECEIVING = 'receiving',
    ACTIVE = 'active',
    PARTIALLY_RETURNED = 'partially_returned',
    RETURNED = 'returned',
    CANCELLED = 'cancelled',
}

export enum BorrowingType {
    INTERNAL = 'internal',
    EXTERNAL = 'external',
    RENTAL = 'rental',
}

export enum QrReturnAction {
    REMOVED = 'removed',
    LOST = 'lost',
    DAMAGED = 'damaged',
    LEFT_ON_PARTNER = 'left_on_partner',
}

export enum UserRole {
    ADMIN = 'admin',
    MANAGER = 'manager',
    STAFF = 'staff',
    DIRECTOR = 'director',
}

// ===== BASE =====
export interface PaginationParams {
    page: number;
    limit: number;
}

export interface PaginatedResponse<T> {
    data: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

// ===== BRAND =====
export interface Brand {
    id: string;
    name: string;
    description?: string;
    createdAt: string;
    updatedAt: string;
}

// ===== PLANT (Cơ sở) =====
export interface Plant {
    id: string;
    name: string;
    code: string;
    address: string;
    phone?: string;
    managerId?: string;
    coordinates?: { lat: number; lng: number };
    assetCount?: number;
    machineCount?: number;
    createdAt: string;
    updatedAt: string;
}

// Vị trí thực tế gần nhất của máy, suy ra từ GPS lúc quét QR
export interface AssetLastSeen {
    plantId?: string;
    plantName?: string;
    plantCode?: string;
    lat?: number;
    lng?: number;
    accuracy?: number;
    distanceM?: number;
    scannedById?: string;
    scannedByName?: string;
    scannedAt?: string;
}

// Cảnh báo máy lệch vị trí: cơ sở GPS gần nhất khác cơ sở hệ thống (đã qua guard độ tin cậy)
export interface AssetLocationMismatch {
    mismatch: true;
    officialPlantId?: string;
    officialPlantName?: string;
    actualPlantId?: string;
    actualPlantName?: string;
    distanceM?: number;
    accuracy?: number;
    scannedAt?: string;
}

export interface PlantMachineStatsResponse {
    facilities: Plant[];
    summary: {
        totalFacilities: number;
        totalMachines: number;
        unassignedMachines: number;
    };
}

// ===== ASSET (Máy móc) =====
export interface Asset {
    id: string;
    name: string;
    machineCode: string;
    publicId?: string;
    serial: string;
    type: string;
    model: string;
    brandId: string;
    brand?: Brand;
    plantId: string;
    plant?: Plant;
    area?: string;
    status: AssetStatus;
    ownershipType: AssetOwnershipType;
    purchaseDate?: string;
    purchasePrice?: number;
    specifications?: Record<string, string | number>;
    note?: string;
    imageUrl?: string;
    verificationImages?: string[];
    lastMaintenanceDate?: string;
    nextMaintenanceDate?: string;
    lastSeen?: AssetLastSeen;
    locationMismatch?: AssetLocationMismatch;
    floorPos?: { x: number; y: number } | null;
    createdAt: string;
    updatedAt: string;
    hasOpenTransfer?: boolean;
    disposalRecords?: AssetDisposalItem[];
}

export interface AssetFilter extends PaginationParams {
    search?: string;
    name?: string;
    status?: AssetStatus;
    lifecycle?: AssetLifecycleView;
    ownershipType?: AssetOwnershipType;
    plantId?: string;
    model?: string;
    type?: string;
    brandId?: string;
}

export interface AssetImportRow {
    rowNumber: number;
    isValid: boolean;
    values: {
        name?: string;
        machineCode?: string;
        model?: string;
        type?: string;
        status?: string;
        ownershipType?: string;
        brand?: string;
        plant?: string;
    };
    errors: string[];
}

export interface AssetImportPreview {
    summary: {
        totalRows: number;
        validRows: number;
        invalidRows: number;
    };
    rows: AssetImportRow[];
}

export interface AssetImportResult {
    summary: {
        totalRows: number;
        importedRows: number;
        failedRows: number;
    };
    rows: AssetImportRow[];
}

// ===== MAINTENANCE (Bảo trì) =====
export interface Maintenance {
    id: string;
    assetId: string;
    asset?: Asset;
    assetIds?: string[];
    assets?: Asset[];
    plantId?: string;
    plantName?: string;
    areaAtCreation?: string;
    plantIdBackfilled?: boolean;
    type: MaintenanceType;
    repairMode?: MaintenanceRepairMode;
    status?: 'pending' | 'in_progress' | 'completed' | 'overdue' | 'cancelled';
    approvalStatus?: 'none' | 'pending' | 'approved' | 'rejected';
    description: string;
    startDate: string;
    endDate?: string;
    technician?: string;
    cost?: number;
    beforeImages?: string[];
    afterImages?: string[];
    externalRepair?: {
        vendorName?: string;
        sentOutAt?: string;
        expectedReturnAt?: string;
        returnedAt?: string;
        estimateCost?: number;
        actualCost?: number;
        invoiceNo?: string;
        invoiceImageUrl?: string;
        costItems?: { name?: string; amount?: number; note?: string }[];
        approvedBy?: string;
        approvedAt?: string;
        rejectedBy?: string;
        rejectedAt?: string;
        rejectReason?: string;
    };
    note?: string;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
}

export interface MaintenanceFilter extends PaginationParams {
    search?: string;
    assetId?: string;
    type?: MaintenanceType;
    repairMode?: MaintenanceRepairMode;
    status?: Maintenance['status'];
    approvalStatus?: Maintenance['approvalStatus'];
    plantId?: string;
    startDate?: string;
    endDate?: string;
}

export interface MaintenanceReport {
    summary: {
        totalExternalRepairCost: number;
        externalRepairCount: number;
        pendingApprovalCount: number;
        inProgressCount: number;
    };
    costByPeriod: { period: string; totalCost: number }[];
    costByPlant: { plantId?: string; plantName: string; totalCost: number; count: number }[];
    topAssets: {
        assetId: string;
        assetName: string;
        machineCode?: string;
        plantName?: string;
        totalCost: number;
        count: number;
    }[];
}

// ===== TRANSFER (Điều chuyển) =====
export interface Transfer {
    id: string;
    assetId: string;
    asset?: Asset;
    assetIds?: string[];
    assets?: Asset[];
    fromPlantId: string;
    fromPlant?: Plant;
    fromArea?: string;
    sourceSnapshots?: {
        assetId?: string;
        plantId?: string;
        area?: string;
        machineCode?: string;
        name?: string;
    }[];
    toPlantId: string;
    toPlant?: Plant;
    toArea?: string;
    status: TransferStatus;
    reason: string;
    transferDate: string;
    approvedBy?: string;
    approvedAt?: string;
    completedBy?: string;
    completedAt?: string;
    rejectReason?: string;
    receivedBy?: string;
    handoverImages?: string[];
    cancelledBy?: string;
    cancelledAt?: string;
    cancelReason?: string;
    note?: string;
    createdBy?: string;
    createdAt: string;
    updatedAt: string;
}

export interface CreateTransferPayload {
    assetId?: string;
    assetIds?: string[];
    toPlantId: string;
    toArea?: string;
    reason: string;
    transferDate: string;
    note?: string;
}

export interface TransferFilter extends PaginationParams {
    search?: string;
    assetId?: string;
    fromPlantId?: string;
    toPlantId?: string;
    status?: TransferStatus;
}

// ===== STOCKTAKE (Kiểm kê QR) =====
export type StocktakeItemType = 'missing' | 'present' | 'wrong_area' | 'wrong_plant' | 'unknown';
export type StocktakeCaptureMode = 'single' | 'sweep';
export type StocktakeScannerEngine = 'zxing' | 'barcode_detector';
export type StocktakeCoverageStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';
export type StocktakeCoverageActivationSource = 'anchor' | 'manual' | 'auto';
export type StocktakePositionProposalStatus = 'pending' | 'approved' | 'rejected' | 'conflict';

export interface StocktakeCoverageZone {
    zoneId?: string;
    name: string;
    anchorCode?: string;
    x?: number;
    y?: number;
    w?: number;
    h?: number;
    status: StocktakeCoverageStatus;
    activationSource?: StocktakeCoverageActivationSource;
    expectedCount: number;
    scannedCount: number;
    startedAt?: string;
    completedAt?: string;
}

export interface StocktakePositionProposal {
    assetId: string;
    machineCode?: string;
    name?: string;
    zoneId: string;
    zoneName: string;
    currentX?: number;
    currentY?: number;
    proposedX: number;
    proposedY: number;
    assetUpdatedAt: string;
    scannedAt: string;
    confidence: number;
    basis: 'scan_order';
    status?: StocktakePositionProposalStatus;
    conflictReason?: string;
    reviewedBy?: string;
    reviewedAt?: string;
    reviewNote?: string;
}

export interface StocktakeSessionItem {
    type: StocktakeItemType;
    assetId?: string;
    rawValue?: string;
    machineCode?: string;
    name?: string;
    plantName?: string;
    area?: string;
    status?: string;
    message?: string;
    gpsNote?: string;
    scannedAt?: string;
    coverageZoneId?: string;
    coverageZoneName?: string;
}

export interface StocktakeSession {
    id: string;
    plantId: string;
    plantName?: string;
    plant?: Plant;
    area?: string;
    areaLabel?: string;
    captureMode?: StocktakeCaptureMode;
    scannerEngine?: StocktakeScannerEngine;
    detectedCodeCount?: number;
    duplicateScanCount?: number;
    coveragePercent?: number;
    coverageCompletedCount?: number;
    coverageZones?: StocktakeCoverageZone[];
    positionProposals?: StocktakePositionProposal[];
    startedAt: string;
    finishedAt: string;
    expectedCount: number;
    scannedCount: number;
    presentCount: number;
    missingCount: number;
    anomalyCount: number;
    items: StocktakeSessionItem[];
    createdBy?: string;
    createdByName?: string;
    createdAt: string;
    updatedAt: string;
}

export interface CreateStocktakeSessionPayload {
    plantId: string;
    plantName?: string;
    area?: string;
    areaLabel?: string;
    captureMode?: StocktakeCaptureMode;
    scannerEngine?: StocktakeScannerEngine;
    detectedCodeCount?: number;
    duplicateScanCount?: number;
    coveragePercent?: number;
    coverageCompletedCount?: number;
    coverageZones?: StocktakeCoverageZone[];
    positionProposals?: StocktakePositionProposal[];
    startedAt: string;
    finishedAt: string;
    expectedCount: number;
    scannedCount: number;
    presentCount: number;
    missingCount: number;
    anomalyCount: number;
    items: StocktakeSessionItem[];
}

export interface ReviewStocktakePositionProposalsPayload {
    assetIds: string[];
    action: 'approve' | 'reject';
    note?: string;
}

export interface ReviewStocktakePositionProposalsResult {
    session: StocktakeSession;
    summary: { approved: number; rejected: number; conflicts: number };
}

// ===== ASSET DISPOSAL (Thanh ly may) =====
export enum AssetDisposalBatchStatus {
    DRAFT = 'draft',
    SCANNING = 'scanning',
    REVIEWING = 'reviewing',
    APPROVED = 'approved',
    COMPLETED = 'completed',
    CANCELLED = 'cancelled',
}

export enum AssetDisposalItemStatus {
    PENDING = 'pending',
    CHECKED = 'checked',
    APPROVED = 'approved',
    DISPOSED = 'disposed',
    KEPT = 'kept',
    CANCELLED = 'cancelled',
}

export enum AssetDisposalSourceType {
    ASSET = 'asset',
    EXTERNAL = 'external',
    QR_ONLY = 'qr_only',
}

export enum AssetDisposalCondition {
    USABLE = 'usable',
    MINOR_FAULT = 'minor_fault',
    MAJOR_FAULT = 'major_fault',
    MISSING_PARTS = 'missing_parts',
    SCRAP = 'scrap',
    UNKNOWN = 'unknown',
}

export enum AssetDisposalAction {
    SELL = 'sell',
    PART_OUT = 'part_out',
    SCRAP = 'scrap',
    KEEP = 'keep',
    REPAIR = 'repair',
    UNKNOWN = 'unknown',
}

export interface AssetDisposalBatch {
    id: string;
    code: string;
    plantId: string;
    plant?: Plant;
    area?: string;
    status: AssetDisposalBatchStatus;
    reason: string;
    note?: string;
    submittedBy?: string;
    submittedByName?: string;
    submittedAt?: string;
    approvedBy?: string;
    approvedByName?: string;
    approvedAt?: string;
    approvalNote?: string;
    completedBy?: string;
    completedByName?: string;
    completedAt?: string;
    cancelledBy?: string;
    cancelledByName?: string;
    cancelledAt?: string;
    cancelReason?: string;
    totalItems?: number;
    assetItems?: number;
    externalItems?: number;
    pendingItems?: number;
    checkedItems?: number;
    approvedItems?: number;
    disposedItems?: number;
    keptItems?: number;
    createdBy?: string;
    createdByName?: string;
    updatedBy?: string;
    updatedByName?: string;
    createdAt: string;
    updatedAt: string;
}

export interface AssetDisposalItem {
    id: string;
    batchId: string;
    batch?: AssetDisposalBatch;
    sourceType: AssetDisposalSourceType;
    assetId?: string;
    asset?: Asset;
    qrLabelId?: string;
    qrLabel?: Pick<QrLabel, 'id' | 'publicId' | 'status'>;
    publicId?: string;
    machineCode?: string;
    name?: string;
    type?: string;
    model?: string;
    serial?: string;
    plantId?: string;
    plant?: Plant;
    area?: string;
    condition?: AssetDisposalCondition;
    reason?: string;
    suggestedAction?: AssetDisposalAction;
    estimatedValue?: number;
    finalValue?: number;
    photos?: string[];
    status: AssetDisposalItemStatus;
    previousAssetStatus?: AssetStatus;
    checkedBy?: string;
    checkedByName?: string;
    checkedAt?: string;
    disposedAt?: string;
    note?: string;
    createdBy?: string;
    createdByName?: string;
    updatedBy?: string;
    updatedByName?: string;
    createdAt: string;
    updatedAt: string;
}

export interface AssetDisposalBatchDetail {
    batch: AssetDisposalBatch;
    items: AssetDisposalItem[];
    summary: {
        total: number;
        asset: number;
        external: number;
        pending: number;
        checked: number;
        approved: number;
        disposed: number;
        kept: number;
    };
}

export interface CreateAssetDisposalBatchPayload {
    plantId: string;
    area?: string;
    reason: string;
    note?: string;
}

export type AssetDisposalItemPayload = Partial<
    Pick<
        AssetDisposalItem,
        | 'sourceType'
        | 'assetId'
        | 'qrLabelId'
        | 'publicId'
        | 'machineCode'
        | 'name'
        | 'type'
        | 'model'
        | 'serial'
        | 'plantId'
        | 'area'
        | 'condition'
        | 'reason'
        | 'suggestedAction'
        | 'estimatedValue'
        | 'finalValue'
        | 'photos'
        | 'note'
        | 'status'
    >
>;

// ===== BORROWING (Mượn/Trả) =====
export interface Borrowing {
    id: string;
    assetId: string;
    asset?: Asset;
    batchId?: string;
    batch?: BorrowingBatch;
    qrLabelId?: string;
    type: BorrowingType;
    borrowerId?: string;
    borrower?: User;
    borrowerName?: string;
    partnerName?: string;
    borrowTime: string;
    returnTime?: string;
    expectedReturnTime?: string;
    status: BorrowingStatus;
    partnerMachineCode?: string;
    purpose?: string;
    location?: string;
    cost?: number;
    note?: string;
    returnNote?: string;
    receiveCondition?: string;
    receiveNote?: string;
    returnCondition?: string;
    qrReturnAction?: QrReturnAction;
    qrReturnNote?: string;
    qrRemovedAt?: string;
    qrRemovedBy?: string;
    returnedInBatchAt?: string;
    assetStatusBefore?: AssetStatus;
    createdBy?: string;
    returnedBy?: string;
    createdAt: string;
    updatedAt: string;
}

export interface BorrowingBatch {
    id: string;
    code: string;
    type: BorrowingType.EXTERNAL | BorrowingType.RENTAL;
    status: BorrowingBatchStatus;
    partnerName: string;
    contractNo?: string;
    plantId: string;
    plant?: Plant;
    area?: string;
    borrowTime: string;
    expectedReturnTime?: string;
    plannedQuantity: number;
    qrBatchId?: string;
    qrBatch?: Pick<QrLabelBatch, 'id' | 'code' | 'quantity' | 'status' | 'printedAt'>;
    labelPolicy: 'temporary';
    removeQrOnReturn: boolean;
    note?: string;
    receivedCount?: number;
    activeCount?: number;
    returnedCount?: number;
    unusedQrCount?: number;
    closedAt?: string;
    createdAt: string;
    updatedAt: string;
}

export interface BorrowingBatchDetail {
    batch: BorrowingBatch;
    items: Borrowing[];
}

export interface CreateBorrowingPayload {
    assetId: string;
    type: BorrowingType;
    borrowerId?: string;
    borrowerName?: string;
    partnerName?: string;
    borrowTime: string;
    purpose?: string;
    location?: string;
    cost?: number;
    note?: string;
}

export interface BorrowingFilter extends PaginationParams {
    search?: string;
    assetId?: string;
    borrowerId?: string;
    type?: BorrowingType;
    status?: BorrowingStatus;
    startDate?: string;
    endDate?: string;
}

export interface CreateBorrowingBatchPayload {
    type: BorrowingType.EXTERNAL | BorrowingType.RENTAL;
    /** Bỏ trống khi rà soát chưa rõ máy của ai — BE tự điền "Chưa xác định", bổ sung sau */
    partnerName?: string;
    contractNo?: string;
    plantId: string;
    area?: string;
    borrowTime: string;
    expectedReturnTime?: string;
    plannedQuantity: number;
    note?: string;
    createQrBatch?: boolean;
}

export interface BorrowingBatchStats {
    activeMachines: number;
    partnerCount: number;
    openBatches: number;
    overdueBatches: number;
    needsInfoBatches: number;
    byPartner: Array<{
        partnerName: string;
        machines: number;
        nearestDue: string | null;
        overdue: number;
    }>;
}

export interface UpdateBorrowingBatchPayload {
    partnerName?: string;
    contractNo?: string;
    area?: string;
    expectedReturnTime?: string;
    note?: string;
}

export interface ReceiveBorrowingBatchByQrPayload {
    /** Bỏ trống = nhận máy KHÔNG dán tem (không đụng gì vào máy khách) */
    publicId?: string;
    asset: {
        name: string;
        machineCode?: string;
        serial?: string;
        type: string;
        model: string;
        brandId: string;
        plantId?: string;
        area?: string;
        note?: string;
        imageUrl?: string;
        purchaseDate?: string;
        purchasePrice?: number;
        specifications?: Record<string, string | number>;
    };
    partnerMachineCode?: string;
    receiveCondition?: string;
    receiveNote?: string;
}

export interface ReceiveBorrowingBatchBulkPayload {
    rows: Array<{
        name: string;
        model?: string;
        serial?: string;
        partnerMachineCode?: string;
        note?: string;
    }>;
    receiveCondition?: string;
    receiveNote?: string;
}

export interface BulkReturnBorrowingBatchPayload {
    returnTime: string;
    note?: string;
    items: Array<{
        borrowingId: string;
        /** Chỉ bắt buộc với máy có tem QR tạm; máy không tem bỏ qua */
        qrReturnAction?: QrReturnAction;
        returnCondition?: string;
        returnNote?: string;
        qrReturnNote?: string;
    }>;
}

export interface BulkReturnBorrowingBatchResponse extends BorrowingBatchDetail {
    returnedIds: string[];
}

// ===== USER =====
export interface User {
    id: string;
    name: string;
    email: string;
    phone?: string;
    role: UserRole;
    plantId?: string;
    plant?: Plant;
    avatarUrl?: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

// ===== INTERNAL CHAT =====
export type ChatConversationType = 'direct' | 'group' | 'plant_group' | 'role_group' | 'workflow_thread';

export type ChatWorkflowContextType =
    | 'asset'
    | 'maintenance'
    | 'transfer'
    | 'borrowing'
    | 'purchase_request'
    | 'supply_request'
    | 'technical_purchase'
    | 'purchase_order'
    | 'distribution'
    | 'system';

export interface ChatUserSummary {
    id: string;
    name: string;
    email?: string;
    role: UserRole;
    plantId?: string;
    plant?: Pick<Plant, 'id' | 'name' | 'code'>;
    avatarUrl?: string;
    isActive: boolean;
}

export interface ChatReadReceipt {
    userId: string;
    lastReadAt?: string;
}

export interface ChatConversation {
    id: string;
    type: ChatConversationType;
    title: string;
    plantId?: string;
    plant?: Pick<Plant, 'id' | 'name' | 'code'>;
    context?: {
        type: ChatWorkflowContextType;
        id?: string;
        label?: string;
        path?: string;
    };
    participants: ChatUserSummary[];
    lastMessagePreview?: string;
    lastMessageAt?: string;
    lastMessageSenderId?: string;
    unreadCount: number;
    muted: boolean;
    archivedAt?: string;
    readReceipts?: ChatReadReceipt[];
    createdAt: string;
    updatedAt: string;
}

export interface ChatReplyPreview {
    id: string;
    senderId?: string;
    senderName?: string;
    body: string;
    hasImage?: boolean;
    hasAudio?: boolean;
    isDeleted?: boolean;
}

export interface ChatReaction {
    userId: string;
    emoji: string;
}

export interface ChatMessage {
    id: string;
    conversationId: string;
    senderId: string;
    sender?: ChatUserSummary;
    body: string;
    attachments?: Array<{
        type: 'image' | 'audio' | 'file';
        url: string;
        thumbnailUrl?: string;
        publicId?: string;
        name?: string;
        mimeType?: string;
        size?: number;
        width?: number;
        height?: number;
        durationMs?: number;
    }>;
    replyTo?: ChatReplyPreview;
    reactions?: ChatReaction[];
    mentions?: string[];
    pinned?: boolean;
    system: boolean;
    isDeleted: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface ChatConversationListResponse {
    conversations: ChatConversation[];
    unreadCount: number;
    archivedCount?: number;
    archived?: boolean;
}

export interface ChatUnreadSummary {
    unreadCount: number;
}

export interface UserListParams {
    search?: string;
    role?: UserRole;
    isActive?: boolean;
    plantId?: string;
    page?: number;
    limit?: number;
}

export interface CreateUserPayload {
    name: string;
    email: string;
    password: string;
    role: UserRole;
    phone?: string;
    plantId?: string;
    avatarUrl?: string;
    isActive?: boolean;
}

export interface UpdateUserPayload {
    name: string;
    role: UserRole;
    isActive: boolean;
    plantId?: string;
}

// ===== DASHBOARD =====
export interface DashboardStats {
    totalAssets: number;
    activeAssets: number;
    maintenanceAssets: number;
    brokenAssets: number;
    borrowingAssets: number;
    storageAssets: number;
}

export interface DashboardChartData {
    statusDistribution: { status: AssetStatus; count: number }[];
    maintenanceByWeek: { date: string; count: number }[];
}

export interface DashboardOverviewSummary {
    totalMachines: number;
    activeMachines: number;
    maintenanceMachines: number;
    inactiveMachines: number;
    totalFacilities: number;
    unassignedMachines: number;
}

export interface DashboardMaintenanceCost {
    externalRepairCostThisMonth: number;
    externalRepairCompletedThisMonth: number;
    externalRepairPendingApproval: number;
    externalRepairInProgress: number;
}

export interface DashboardFacilityStat {
    facilityId: string;
    facilityName: string;
    facilityCode: string;
    address?: string;
    machineCount: number;
    sharePercent: number;
}

export interface DashboardRecentActivity {
    id: string;
    category: 'transfer' | 'borrowing';
    action: 'created' | 'approved' | 'completed' | 'rejected' | 'borrowed' | 'returned';
    status: string;
    timestamp: string;
    asset?: {
        id?: string | null;
        name?: string | null;
        machineCode?: string | null;
    };
    facility?: {
        id?: string | null;
        name?: string | null;
    };
    fromFacility?: {
        id?: string | null;
        name?: string | null;
    };
    toFacility?: {
        id?: string | null;
        name?: string | null;
    };
    counterpart?: string | null;
    description?: string | null;
    note?: string | null;
}

export interface DashboardOverviewResponse {
    summary: DashboardOverviewSummary;
    maintenanceCost?: DashboardMaintenanceCost;
    facilityStats: DashboardFacilityStat[];
    recentActivities: DashboardRecentActivity[];
}

export interface DashboardTopBrokenAsset {
    assetId: string;
    assetName?: string;
    machineCode?: string;
    plantName?: string;
    count: number;
    lastDate?: string;
}

export interface DashboardResolutionStats {
    avgDaysAll: number;
    completedAll: number;
    avgDaysThisMonth: number;
    completedThisMonth: number;
}

export interface DashboardOverdueTicket {
    id: string;
    assetName?: string;
    machineCode?: string;
    plantName?: string;
    status: string;
    repairMode: string;
    description?: string;
    createdAt?: string;
    daysOpen: number;
}

export interface DashboardCostTrendPoint {
    month: string;
    repairCost: number;
    distributionCost: number;
    totalCost: number;
}

export interface DashboardMislocatedAsset {
    assetId: string;
    assetName?: string;
    machineCode?: string;
    officialPlantName?: string;
    actualPlantName?: string;
    distanceM?: number;
    accuracy?: number;
    scannedAt?: string;
}

export interface DashboardInsights {
    topBrokenAssets: DashboardTopBrokenAsset[];
    resolution: DashboardResolutionStats;
    overdue: { count: number; thresholdDays: number; items: DashboardOverdueTicket[] };
    costTrend: DashboardCostTrendPoint[];
    mislocatedAssets: DashboardMislocatedAsset[];
}

// ===== MINI-MAP (vị trí GPS lần quét cuối) =====
export interface AssetLocationPoint {
    id: string;
    machineCode?: string;
    publicId?: string;
    name?: string;
    type?: string;
    model?: string;
    brandName?: string;
    area?: string;
    status: AssetStatus;
    plantId?: string;
    plantName?: string;
    lat: number;
    lng: number;
    accuracy?: number;
    distanceM?: number;
    scannedAt?: string;
    scannedByName?: string;
    mismatch: boolean;
    officialPlantName?: string;
    actualPlantName?: string;
}

export interface MapFacilityPoint {
    id: string;
    name: string;
    code?: string;
    lat: number;
    lng: number;
}

export interface AssetLocationsResponse {
    assets: AssetLocationPoint[];
    facilities: MapFacilityPoint[];
    withoutGps: number;
}

// ===== BẢN TIN AI ĐỊNH KỲ =====
export interface AiDigest {
    _id: string;
    periodType: 'week' | 'month';
    periodKey: string;
    periodLabel?: string;
    rangeStart?: string;
    rangeEnd?: string;
    snapshot?: AiDigestSnapshot;
    narrative?: string;
    highlights?: string[];
    alerts?: string[];
    recommendations?: string[];
    dataWarnings?: string[];
    provider?: string;
    model?: string;
    visual?: AiDigestVisual;
    editorial?: AiDigestEditorial;
    validation?: AiDigestValidation;
    artifact?: AiDigestArtifact;
    delivery?: AiDigestDelivery;
    contentRevision?: number;
    editHistory?: AiDigestEditHistory[];
    viewReceipts?: AiDigestViewReceipt[];
    status?: 'draft' | 'approved' | 'published';
    version?: number;
    generatedBy?: DigestActor;
    approvedBy?: DigestActor;
    approvedAt?: string;
    approvalNote?: string;
    publishedBy?: DigestActor;
    publishedAt?: string;
    revisionHistory?: AiDigestRevision[];
    createdAt?: string;
    updatedAt?: string;
}

export type DigestActor =
    | string
    | {
          _id?: string;
          id?: string;
          name?: string;
          fullname?: string;
          fullName?: string;
          email?: string;
      };

export interface AiDigestVisual {
    status?: 'disabled' | 'pending' | 'ready' | 'fallback' | 'custom' | 'failed';
    coverImageUrl?: string;
    provider?: string;
    model?: string;
    generatedAt?: string;
    promptVersion?: string;
    error?: string;
    aiGenerated?: boolean;
}

export interface AiDigestEditorial {
    hiddenIncidentIds?: string[];
    hiddenRepairIds?: string[];
    hiddenMaterialKeys?: string[];
    hiddenPlantIds?: string[];
    lastEditedBy?: DigestActor;
    lastEditedAt?: string;
}

export interface AiDigestValidationIssue {
    code: string;
    severity: 'critical' | 'warning' | 'info';
    title: string;
    detail?: string;
    actionUrl?: string;
    refType?: string;
    refId?: string;
}

export interface AiDigestValidation {
    status?: 'unchecked' | 'passed' | 'warning' | 'blocked';
    issues?: AiDigestValidationIssue[];
    checkedAt?: string;
    checksum?: string;
}

export interface AiDigestArtifact {
    status?: 'none' | 'generating' | 'ready' | 'failed';
    publicId?: string;
    fileName?: string;
    checksum?: string;
    bytes?: number;
    version?: number;
    contentRevision?: number;
    generatedAt?: string;
    error?: string;
}

export interface AiDigestDelivery {
    expectedRecipients?: number;
    inAppCreated?: number;
    webPushSent?: number;
    telegramSent?: number;
    failedChannels?: number;
    deliveredAt?: string;
}

export interface AiDigestViewReceipt {
    userId?: DigestActor;
    firstViewedAt?: string;
    lastViewedAt?: string;
    viewCount?: number;
}

export interface AiDigestEditHistory {
    editedBy?: DigestActor;
    editedAt?: string;
    changedFields?: string[];
    note?: string;
    previous?: Record<string, unknown>;
}

export interface AiDigestRepair {
    id?: string;
    machineCode?: string;
    machineName?: string;
    machineCount?: number;
    plantName?: string;
    description?: string;
    repairMode?: string;
    technician?: string;
    completedAt?: string;
    resolutionDays?: number;
    cost?: number;
    beforeImages?: string[];
    afterImages?: string[];
    hasBeforeAfter?: boolean;
}

export interface AiDigestSnapshot {
    machines?: { total?: number; active?: number; maintenance?: number; inactive?: number };
    maintenance?: {
        newTickets?: number;
        newTicketsPrev?: number;
        newTicketsDeltaPct?: number;
        overdueCount?: number;
        avgResolutionDays?: number;
    };
    cost?: {
        repair?: number;
        repairPrev?: number;
        distribution?: number;
        distributionPrev?: number;
        total?: number;
        totalPrev?: number;
        totalDeltaPct?: number;
    };
    gps?: { mislocatedCount?: number };
    topBroken?: Array<{ machineCode?: string; name?: string; plantName?: string; count?: number }>;
    notableIncidents?: AiDigestRepair[];
    successfulRepairs?: AiDigestRepair[];
    inventory?: {
        lowStockCount?: number;
        lowStock?: Array<{
            materialId?: string;
            materialCode?: string;
            materialName?: string;
            unit?: string;
            plantId?: string;
            plantName?: string;
            currentStock?: number;
            minStockLevel?: number;
            shortage?: number;
        }>;
    };
    plantPerformance?: Array<{
        plantId?: string;
        plantName?: string;
        totalMachines?: number;
        activeMachines?: number;
        maintenanceMachines?: number;
        activeRate?: number;
        newTickets?: number;
        completedRepairs?: number;
        openTickets?: number;
        avgResolutionDays?: number;
        lowStockCount?: number;
        achievements?: string[];
    }>;
    evidence?: {
        completedRepairsCount?: number;
        completedWithBeforeAfter?: number;
        coveragePct?: number;
    };
    dataWarnings?: string[];
}

export interface AiDigestRevision {
    version: number;
    status?: 'draft' | 'approved' | 'published';
    snapshot?: AiDigestSnapshot;
    narrative?: string;
    highlights?: string[];
    alerts?: string[];
    recommendations?: string[];
    dataWarnings?: string[];
    visual?: AiDigestVisual;
    editorial?: AiDigestEditorial;
    validation?: AiDigestValidation;
    artifact?: AiDigestArtifact;
    delivery?: AiDigestDelivery;
    contentRevision?: number;
    editHistory?: AiDigestEditHistory[];
    generatedAt?: string;
    approvedAt?: string;
    approvalNote?: string;
    publishedAt?: string;
}

// ===== KIỂM TOÁN ĐÊM =====
export interface AiAuditFinding {
    code?: string;
    source: 'rule' | 'ai';
    severity: 'critical' | 'warning' | 'info';
    title: string;
    detail?: string;
    refs?: string[];
}

export interface AiAudit {
    _id: string;
    runKey: string;
    runAt?: string;
    trigger?: 'cron' | 'manual';
    summary?: string;
    findings?: AiAuditFinding[];
    recommendations?: string[];
    stats?: { total?: number; critical?: number; warning?: number; info?: number };
    provider?: string;
    model?: string;
    createdAt?: string;
    updatedAt?: string;
}

// ===== MÃ MÁY THÔNG MINH =====
export interface AssetCodeSuggestion {
    code: string;
    typeCode: string;
    brandCode: string;
    originCode: string;
    seq: number;
    prefix: string;
    typeCodeIsNew: boolean;
}

export interface NormalizeCodeRow {
    id: string;
    name?: string;
    plantName?: string;
    oldCode?: string;
    newCode: string;
    changed: boolean;
}

export interface NormalizeCodePreview {
    summary: { total: number; willChange: number; unchanged: number };
    rows: NormalizeCodeRow[];
}

export interface NormalizeCodeResult {
    total: number;
    willChange: number;
    updated: number;
    failed: number;
}

/** 1 dòng trong bảng mã loại máy (màn rà/sửa mã viết tắt loại). */
export interface MachineTypeCodeRow {
    typeKey: string;
    label: string;
    assetCount: number;
    currentCode: string | null;
    suggestedCode: string;
    /** Mã do AI đề xuất (chỉ có sau khi gọi AI gợi ý). */
    aiCode?: string | null;
}

export interface MachineTypeCodeList {
    total: number;
    rows: MachineTypeCodeRow[];
    provider?: string;
    model?: string;
}

/** Khu vực trên sơ đồ mặt bằng xưởng — toạ độ % (0-100) so với sàn. */
export interface FloorZone {
    id: string;
    name: string;
    anchorCode?: string;
    x: number;
    y: number;
    w: number;
    h: number;
}

/** Máy trên sơ đồ xưởng. floorPos = null nghĩa là chưa xếp lên sơ đồ. */
export interface FloorMapMachine {
    id: string;
    name: string;
    machineCode: string;
    type: string;
    status: AssetStatus;
    /** Trường khu vực nhập tay trên máy — nguồn cho nút tự xếp theo khu. */
    area?: string;
    /** Số phiếu hỏng đột xuất 6 tháng gần nhất — dùng cho chế độ nhiệt sự cố. */
    incidents6m?: number;
    floorPos: { x: number; y: number } | null;
}

export interface FloorMapData {
    zones: FloorZone[];
    machines: FloorMapMachine[];
}

export interface FloorMapRevisionChange {
    assetId: string;
    machineCode?: string;
    name?: string;
    before: { x: number; y: number } | null;
    after: { x: number; y: number } | null;
}

export interface FloorMapRevision {
    id: string;
    plantId: string;
    source: 'manual' | 'stocktake';
    stocktakeSessionId?: string;
    status: 'applied' | 'reverted' | 'partial';
    changedBy?: string;
    changedByName?: string;
    changes: FloorMapRevisionChange[];
    revertedBy?: string;
    revertedByName?: string;
    revertedAt?: string;
    conflictAssetIds?: string[];
    createdAt: string;
}

export interface FloorMapRollbackResult {
    revision: FloorMapRevision;
    summary: { reverted: number; conflicts: number; conflictAssetIds: string[] };
}

export type FloorRealityStatus = 'verified' | 'drift' | 'unplaced' | 'stale' | 'unverified';

export interface FloorRealityMachineHealth {
    assetId: string;
    machineCode: string;
    name: string;
    floorPos: { x: number; y: number } | null;
    status: FloorRealityStatus;
    score: number;
    currentZone?: { id: string; name: string };
    evidence?: {
        sessionId: string;
        scannedAt?: string;
        ageDays?: number;
        zoneId?: string;
        zoneName?: string;
        captureMode?: StocktakeCaptureMode;
        createdByName?: string;
        proposalStatus?: StocktakePositionProposalStatus;
    };
}

export interface FloorRealityZoneHealth {
    zoneId: string;
    zoneName: string;
    anchorCode?: string;
    total: number;
    score: number;
    counts: Record<FloorRealityStatus, number>;
}

export interface FloorRealityHealth {
    generatedAt: string;
    staleDays: number;
    score: number;
    total: number;
    counts: Record<FloorRealityStatus, number>;
    machines: FloorRealityMachineHealth[];
    zones: FloorRealityZoneHealth[];
    latestSession?: {
        id: string;
        createdAt: string;
        coveragePercent: number;
        coverageCompletedCount: number;
        coverageZoneCount: number;
        createdByName?: string;
    };
}

export type RealityAlertCode = 'low_score' | 'zone_drift' | 'stale_evidence' | 'coverage_overdue' | 'proposal_overdue';
export type RealityAlertStatus = 'open' | 'in_progress' | 'resolved' | 'dismissed';

export interface RealityAlertRule {
    _id?: string;
    plantId: string;
    enabled: boolean;
    staleDays: number;
    minScore: number;
    driftThreshold: number;
    stalePercentThreshold: number;
    coverageOverdueDays: number;
    proposalOverdueDays: number;
    cooldownHours: number;
    defaultAssignee?: string | null;
}

export interface RealityOperationalAlert {
    id: string;
    plantId: string;
    code: RealityAlertCode;
    scopeKey: string;
    severity: 'info' | 'warning' | 'critical';
    status: RealityAlertStatus;
    title: string;
    message: string;
    zoneId?: string;
    zoneName?: string;
    assetIds: string[];
    metrics: Record<string, number | string | null>;
    assignedTo?: string;
    assignedToName?: string;
    dueAt?: string;
    firstDetectedAt: string;
    lastDetectedAt: string;
    lastNotifiedAt?: string;
    occurrenceCount: number;
    resolvedAt?: string;
    resolutionNote?: string;
    createdAt: string;
    updatedAt: string;
}

export interface RealityHealthSnapshot {
    id: string;
    snapshotKey: string;
    generatedAt: string;
    score: number;
    total: number;
    counts: Record<FloorRealityStatus, number>;
}

export interface RealityOperationsDashboard {
    rule: RealityAlertRule;
    alerts: RealityOperationalAlert[];
    summary: { open: number; inProgress: number; overdue: number; resolved: number };
    snapshots: RealityHealthSnapshot[];
    managers: Array<{ id: string; name: string; role: string }>;
}

/** Thống kê 1 máy cho panel chi tiết sơ đồ xưởng. */
export interface FloorMachineStats {
    months: { ym: string; cost: number }[];
    total12m: number;
    incidents6m: number;
    ticketCount12m: number;
    lastMaintenanceAt: string | null;
}

export type DataQualitySeverity = 'critical' | 'warning' | 'info';
export type DataQualityCategoryKey = 'assets' | 'materials' | 'qr' | 'plants' | 'users' | 'maintenance';

export interface DataQualityRecord {
    id: string;
    label: string;
    code?: string;
    meta?: string;
    path?: string;
}

export interface DataQualityCheck {
    key: string;
    title: string;
    severity: DataQualitySeverity;
    count: number;
    total: number;
    ratio: number;
    description: string;
    action: string;
    records: DataQualityRecord[];
}

export interface DataQualityCategory {
    key: DataQualityCategoryKey;
    title: string;
    totalRecords: number;
    issueCount: number;
    criticalCount: number;
    warningCount: number;
    infoCount: number;
    score: number;
    checks: DataQualityCheck[];
}

export interface DataQualityOverviewResponse {
    generatedAt: string;
    overallScore: number;
    summary: {
        totalRecords: number;
        totalIssues: number;
        criticalIssues: number;
        warningIssues: number;
        infoIssues: number;
        affectedCategories: number;
    };
    categories: DataQualityCategory[];
}

// ===== NOTIFICATION =====
export interface Notification {
    id: string;
    type: 'error' | 'maintenance' | 'transfer' | 'borrowing';
    title: string;
    message: string;
    assetId?: string;
    isRead: boolean;
    createdAt: string;
}

export interface AssetPublicIdResponse {
    publicId: string;
}

export interface PublicMachine {
    publicId: string;
    name: string;
    machineCode?: string;
    serialNumber?: string;
    model?: string;
    status: AssetStatus;
    ownershipType?: AssetOwnershipType;
    facility?: {
        name: string;
        code?: string;
    };
}

// ===== QR LABEL =====
export enum QrLabelType {
    MACHINE = 'machine',
}

export enum QrLabelStatus {
    UNUSED = 'unused',
    ASSIGNED = 'assigned',
    RETIRED = 'retired',
    LOST = 'lost',
    DAMAGED = 'damaged',
}

export enum QrLabelBatchStatus {
    DRAFT = 'draft',
    PRINTED = 'printed',
    PARTIALLY_ASSIGNED = 'partially_assigned',
    COMPLETED = 'completed',
}

export interface QrLabel {
    id: string;
    publicId: string;
    type: QrLabelType;
    status: QrLabelStatus;
    assetId?: string;
    asset?: Asset;
    batchId?: string;
    batchCode?: string;
    plannedPlantId?: string;
    plannedPlant?: Plant;
    plannedArea?: string;
    note?: string;
    printedAt?: string;
    activatedAt?: string;
    retiredAt?: string;
    retiredReason?: string;
    scanCount: number;
    lastScannedAt?: string;
    createdAt: string;
    updatedAt: string;
}

export interface QrLabelBatch {
    id: string;
    code: string;
    type: QrLabelType;
    quantity: number;
    status: QrLabelBatchStatus;
    plantId?: string;
    plant?: Plant;
    area?: string;
    note?: string;
    printedAt?: string;
    assignedCount?: number;
    unusedCount?: number;
    createdAt: string;
    updatedAt: string;
}

export interface QrBatchDetail {
    batch: QrLabelBatch;
    labels: QrLabel[];
}

export interface PublicQrLabel {
    publicId: string;
    type: QrLabelType;
    status: QrLabelStatus;
}

export interface PublicQrResolveResponse {
    source: 'qr_label' | 'legacy_asset';
    publicId: string;
    type: QrLabelType;
    status: QrLabelStatus;
    label?: PublicQrLabel;
    asset?: PublicMachine;
}

export interface InternalQrResolveResponse {
    source: 'qr_label' | 'legacy_asset';
    publicId: string;
    type: QrLabelType;
    status: QrLabelStatus;
    label?: QrLabel;
    asset?: Asset;
    canActivate: boolean;
}

export type QrScanAction =
    | 'open_profile'
    | 'quick_update'
    | 'stocktake'
    | 'transfer_scan'
    | 'maintenance_quick_create'
    | 'maintenance_quick_create_success'
    | 'borrowing_receive'
    | 'borrowing_receive_success'
    | 'borrowing_return'
    | 'borrowing_return_success'
    | 'asset_disposal_scan'
    | 'asset_disposal_scan_success';

export type QrScanResult =
    | 'resolved'
    | 'not_found'
    | 'ambiguous'
    | 'duplicate'
    | 'present'
    | 'wrong_area'
    | 'wrong_plant'
    | 'success'
    | 'failed';

export type QrScanSource = 'camera' | 'manual' | 'qr_label' | 'legacy_asset' | 'search' | 'unknown';

export interface QrScanLog {
    id: string;
    rawValue?: string;
    publicId?: string;
    labelId?: string;
    assetId?: string;
    asset?: Pick<Asset, 'id' | 'name' | 'machineCode' | 'area'>;
    action: QrScanAction;
    result: QrScanResult;
    source: QrScanSource;
    actorId?: string;
    actor?: Pick<User, 'id' | 'name' | 'email'>;
    actorRole?: string;
    ip?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
    createdAt: string;
    updatedAt?: string;
}

export type CreateQrScanLogPayload = {
    rawValue?: string;
    publicId?: string;
    labelId?: string;
    assetId?: string;
    action: QrScanAction;
    result: QrScanResult;
    source?: QrScanSource;
    metadata?: Record<string, unknown>;
};

export type CreateQrBatchPayload = {
    type?: QrLabelType;
    quantity: number;
    plantId?: string;
    area?: string;
    note?: string;
};

export type ActivateMachineQrPayload = {
    asset: Omit<Asset, 'id' | 'createdAt' | 'updatedAt' | 'brand' | 'plant' | 'hasOpenTransfer' | 'machineCode'> & {
        machineCode?: string; // để trống -> BE tự sinh mã thông minh
    };
};
