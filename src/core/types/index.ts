// ===== ENUMS =====
export enum AssetStatus {
    ACTIVE = 'active',
    MAINTENANCE = 'maintenance',
    BROKEN = 'broken',
    BORROWING = 'borrowing',
    STORAGE = 'storage',
}

export enum MaintenanceType {
    PERIODIC = 'periodic',
    EMERGENCY = 'emergency',
    INSPECTION = 'inspection',
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

export enum BorrowingType {
    INTERNAL = 'internal',
    EXTERNAL = 'external',
    RENTAL = 'rental',
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
    assetCount?: number;
    machineCount?: number;
    createdAt: string;
    updatedAt: string;
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
    purchaseDate?: string;
    purchasePrice?: number;
    specifications?: Record<string, string | number>;
    note?: string;
    imageUrl?: string;
    lastMaintenanceDate?: string;
    nextMaintenanceDate?: string;
    createdAt: string;
    updatedAt: string;
    hasOpenTransfer?: boolean;
}

export interface AssetFilter extends PaginationParams {
    search?: string;
    name?: string;
    status?: AssetStatus;
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
    type: MaintenanceType;
    status?: 'pending' | 'in_progress' | 'completed' | 'overdue';
    description: string;
    startDate: string;
    endDate?: string;
    technician?: string;
    cost?: number;
    note?: string;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
}

export interface MaintenanceFilter extends PaginationParams {
    search?: string;
    assetId?: string;
    type?: MaintenanceType;
    plantId?: string;
    startDate?: string;
    endDate?: string;
}

// ===== TRANSFER (Điều chuyển) =====
export interface Transfer {
    id: string;
    assetId: string;
    asset?: Asset;
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
    assetId: string;
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

// ===== BORROWING (Mượn/Trả) =====
export interface Borrowing {
    id: string;
    assetId: string;
    asset?: Asset;
    type: BorrowingType;
    borrowerId?: string;
    borrower?: User;
    borrowerName?: string;
    partnerName?: string;
    borrowTime: string;
    returnTime?: string;
    status: BorrowingStatus;
    purpose?: string;
    location?: string;
    cost?: number;
    note?: string;
    returnNote?: string;
    assetStatusBefore?: AssetStatus;
    createdBy?: string;
    returnedBy?: string;
    createdAt: string;
    updatedAt: string;
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
    facilityStats: DashboardFacilityStat[];
    recentActivities: DashboardRecentActivity[];
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
    facility?: {
        name: string;
        code?: string;
    };
}
