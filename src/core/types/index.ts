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
    lastMaintenanceDate?: string;
    nextMaintenanceDate?: string;
    lastSeen?: AssetLastSeen;
    locationMismatch?: AssetLocationMismatch;
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
    partnerName: string;
    contractNo?: string;
    plantId: string;
    area?: string;
    borrowTime: string;
    expectedReturnTime?: string;
    plannedQuantity: number;
    note?: string;
    createQrBatch?: boolean;
}

export interface ReceiveBorrowingBatchByQrPayload {
    publicId: string;
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

export interface BulkReturnBorrowingBatchPayload {
    returnTime: string;
    note?: string;
    items: Array<{
        borrowingId: string;
        qrReturnAction: QrReturnAction;
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
    name?: string;
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
    asset: Omit<Asset, 'id' | 'createdAt' | 'updatedAt' | 'brand' | 'plant' | 'hasOpenTransfer'>;
};
