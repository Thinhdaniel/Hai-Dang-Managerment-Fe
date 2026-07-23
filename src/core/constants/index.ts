import {
    AssetOwnershipType,
    AssetStatus,
    BorrowingStatus,
    BorrowingType,
    MaintenanceType,
    TransferStatus,
    UserRole,
} from '../types';

// ===== ASSET STATUS =====
export const ASSET_STATUS_LABEL: Record<AssetStatus, string> = {
    [AssetStatus.PENDING_DISPOSAL]: 'Chuẩn bị thanh lý',
    [AssetStatus.DISPOSED]: 'Đã thanh lý',
    [AssetStatus.ACTIVE]: 'Hoạt động',
    [AssetStatus.MAINTENANCE]: 'Bảo trì',
    [AssetStatus.BROKEN]: 'Máy lỗi',
    [AssetStatus.BORROWING]: 'Đang mượn',
    [AssetStatus.STORAGE]: 'Tồn kho',
    [AssetStatus.RETURNED_TO_PARTNER]: 'Đã trả đối tác',
};

export const ASSET_STATUS_COLOR: Record<AssetStatus, string> = {
    [AssetStatus.PENDING_DISPOSAL]: 'orange',
    [AssetStatus.DISPOSED]: 'default',
    [AssetStatus.ACTIVE]: 'success',
    [AssetStatus.MAINTENANCE]: 'warning',
    [AssetStatus.BROKEN]: 'error',
    [AssetStatus.BORROWING]: 'purple',
    [AssetStatus.STORAGE]: 'default',
    [AssetStatus.RETURNED_TO_PARTNER]: 'default',
};

export const ASSET_STATUS_HEX: Record<AssetStatus, string> = {
    [AssetStatus.PENDING_DISPOSAL]: '#f97316',
    [AssetStatus.DISPOSED]: '#475569',
    [AssetStatus.ACTIVE]: '#52c41a',
    [AssetStatus.MAINTENANCE]: '#fa8c16',
    [AssetStatus.BROKEN]: '#f5222d',
    [AssetStatus.BORROWING]: '#722ed1',
    [AssetStatus.STORAGE]: '#8c8c8c',
    [AssetStatus.RETURNED_TO_PARTNER]: '#64748b',
};

// Status flow transitions
export const ASSET_STATUS_TRANSITIONS: Record<AssetStatus, AssetStatus[]> = {
    [AssetStatus.PENDING_DISPOSAL]: [AssetStatus.ACTIVE, AssetStatus.DISPOSED],
    [AssetStatus.DISPOSED]: [],
    [AssetStatus.ACTIVE]: [AssetStatus.MAINTENANCE, AssetStatus.BROKEN, AssetStatus.BORROWING, AssetStatus.STORAGE],
    [AssetStatus.MAINTENANCE]: [AssetStatus.ACTIVE, AssetStatus.BROKEN],
    [AssetStatus.BROKEN]: [AssetStatus.MAINTENANCE],
    [AssetStatus.BORROWING]: [AssetStatus.ACTIVE],
    [AssetStatus.STORAGE]: [AssetStatus.ACTIVE],
    [AssetStatus.RETURNED_TO_PARTNER]: [],
};

export const ASSET_OWNERSHIP_LABEL: Record<AssetOwnershipType, string> = {
    [AssetOwnershipType.OWNED]: 'Máy Hải Đăng',
    [AssetOwnershipType.PARTNER_BORROWED]: 'Mượn đối tác',
    [AssetOwnershipType.RENTAL]: 'Máy thuê',
};

export const ASSET_OWNERSHIP_OPTIONS = Object.entries(ASSET_OWNERSHIP_LABEL).map(([value, label]) => ({
    value,
    label,
}));

export const isReturnedToPartner = (status?: AssetStatus) => status === AssetStatus.RETURNED_TO_PARTNER;

export const isAssetClosedLifecycle = (status?: AssetStatus) =>
    status === AssetStatus.RETURNED_TO_PARTNER || status === AssetStatus.DISPOSED;

export const isAssetInDisposalFlow = (status?: AssetStatus) =>
    status === AssetStatus.PENDING_DISPOSAL || status === AssetStatus.DISPOSED;

export const isOwnedAsset = (ownershipType?: AssetOwnershipType) =>
    !ownershipType || ownershipType === AssetOwnershipType.OWNED;

// ===== MAINTENANCE TYPE =====
export const MAINTENANCE_TYPE_LABEL: Record<MaintenanceType, string> = {
    [MaintenanceType.PERIODIC]: 'Định kỳ',
    [MaintenanceType.EMERGENCY]: 'Khẩn cấp',
    [MaintenanceType.INSPECTION]: 'Kiểm tra',
};

export const MAINTENANCE_TYPE_COLOR: Record<MaintenanceType, string> = {
    [MaintenanceType.PERIODIC]: 'warning',
    [MaintenanceType.EMERGENCY]: 'error',
    [MaintenanceType.INSPECTION]: 'processing',
};

// ===== TRANSFER STATUS =====
export const TRANSFER_STATUS_LABEL: Record<TransferStatus, string> = {
    [TransferStatus.PENDING]: 'Chờ duyệt',
    [TransferStatus.APPROVED]: 'Đã duyệt',
    [TransferStatus.COMPLETED]: 'Hoàn thành',
    [TransferStatus.REJECTED]: 'Từ chối',
    [TransferStatus.CANCELLED]: 'Đã hủy',
};

export const TRANSFER_STATUS_COLOR: Record<TransferStatus, string> = {
    [TransferStatus.PENDING]: 'warning',
    [TransferStatus.APPROVED]: 'processing',
    [TransferStatus.COMPLETED]: 'success',
    [TransferStatus.REJECTED]: 'error',
    [TransferStatus.CANCELLED]: 'default',
};

// ===== BORROWING STATUS =====
export const BORROWING_STATUS_LABEL: Record<BorrowingStatus, string> = {
    [BorrowingStatus.ACTIVE]: 'Đang hoạt động',
    [BorrowingStatus.RETURNED]: 'Đã trả',
};

export const BORROWING_STATUS_COLOR: Record<BorrowingStatus, string> = {
    [BorrowingStatus.ACTIVE]: 'processing',
    [BorrowingStatus.RETURNED]: 'success',
};

export const BORROWING_TYPE_LABEL: Record<BorrowingType, string> = {
    [BorrowingType.INTERNAL]: 'Mượn nội bộ',
    [BorrowingType.EXTERNAL]: 'Mượn ngoài',
    [BorrowingType.RENTAL]: 'Thuê máy',
};

// ===== USER ROLE =====
export const USER_ROLE_LABEL: Record<UserRole, string> = {
    [UserRole.ADMIN]: 'Quản trị viên',
    [UserRole.MANAGER]: 'Quản lý',
    [UserRole.STAFF]: 'Bộ phận kỹ thuật',
    [UserRole.DIRECTOR]: 'Giám đốc',
    [UserRole.LINE_LEADER]: 'Tổ trưởng',
};

export const USER_ROLE_COLOR: Record<UserRole, string> = {
    [UserRole.ADMIN]: 'red',
    [UserRole.MANAGER]: 'blue',
    [UserRole.STAFF]: 'green',
    [UserRole.DIRECTOR]: 'purple',
    [UserRole.LINE_LEADER]: 'geekblue',
};

// ===== MACHINE TYPES =====
export const MACHINE_TYPES = [
    { value: 'cnc', label: 'CNC' },
    { value: 'laser', label: 'Laser' },
    { value: 'hydraulic', label: 'Thủy lực' },
    { value: 'welding', label: 'Hàn' },
    { value: 'industrial_pump', label: 'Bơm công nghiệp' },
    { value: 'compressor', label: 'Máy nén khí' },
    { value: 'conveyor', label: 'Băng tải' },
    { value: 'other', label: 'Khác' },
];

// ===== PAGINATION =====
export const DEFAULT_PAGE_SIZE = 10;
export const PAGE_SIZE_OPTIONS = ['10', '20', '50', '100'];

// ===== DATE FORMAT =====
export const DATE_FORMAT = 'DD/MM/YYYY';
export const DATETIME_FORMAT = 'DD/MM/YYYY HH:mm';
