import type { User } from '../types';
import { UserRole } from '../types';

type Role = User['role'] | null | undefined;

/** Toàn bộ năng lực (capability) trong hệ thống — một nguồn sự thật cho FE. */
export type Capability =
    | 'asset.view'
    | 'asset.write'
    | 'asset.status'
    | 'asset.delete'
    | 'assetDisposal.manage'
    | 'stocktake'
    | 'qrscanlog.view'
    | 'qrlabel.manage'
    | 'transfer.view'
    | 'transfer.write'
    | 'borrowing.view'
    | 'borrowing.write'
    | 'maintenance.view'
    | 'maintenance.create'
    | 'maintenance.manage'
    | 'brand.manage'
    | 'material.view'
    | 'material.manage'
    | 'inventory.view'
    | 'distribution.view'
    | 'distribution.manage'
    | 'supplyRequest.manage'
    | 'technicalPurchase.manage'
    | 'procurement.operate'
    | 'procurement.approve'
    | 'report.view'
    | 'plant.view'
    | 'plant.manage'
    | 'user.view'
    | 'user.manage'
    | 'storage.view'
    | 'dataQuality.view';

const ALL_VIEW: Capability[] = ['asset.view', 'transfer.view', 'borrowing.view', 'maintenance.view'];

// Năng lực theo từng role. Super Admin có tất cả (xử lý riêng bên dưới).
const ROLE_CAPS: Record<Exclude<UserRole, UserRole.ADMIN>, Capability[]> = {
    [UserRole.DIRECTOR]: [
        ...ALL_VIEW,
        'asset.write',
        'asset.status',
        'assetDisposal.manage',
        'stocktake',
        'qrscanlog.view',
        'transfer.write',
        'borrowing.write',
        'maintenance.create',
        'maintenance.manage',
        'brand.manage',
        'material.view',
        'material.manage',
        'inventory.view',
        'distribution.view',
        'distribution.manage',
        'supplyRequest.manage',
        'technicalPurchase.manage',
        'procurement.operate',
        'procurement.approve',
        'report.view',
        'plant.view',
        'user.view',
    ],
    [UserRole.MANAGER]: [
        ...ALL_VIEW,
        'asset.write',
        'asset.status',
        'assetDisposal.manage',
        'stocktake',
        'qrscanlog.view',
        'transfer.write',
        'borrowing.write',
        'maintenance.create',
        'maintenance.manage',
        'brand.manage',
        'material.view',
        'material.manage',
        'inventory.view',
        'distribution.view',
        'distribution.manage',
        'supplyRequest.manage',
        'technicalPurchase.manage',
        'procurement.operate',
        'report.view',
    ],
    [UserRole.STAFF]: [
        'asset.view',
        'asset.status',
        'stocktake',
        'transfer.view',
        'borrowing.view',
        'maintenance.view',
        'maintenance.create',
        'technicalPurchase.manage',
    ],
};

export const isSuperAdmin = (role: Role) => role === UserRole.ADMIN;
export const isDirector = (role: Role) => role === UserRole.DIRECTOR;
export const isFieldStaff = (role: Role) => role === UserRole.STAFF;

/** Quản lý trở lên (Super Admin + Giám đốc + Quản lý) — đã gồm Giám đốc. */
export const hasManagerAccess = (role: Role) =>
    role === UserRole.ADMIN || role === UserRole.DIRECTOR || role === UserRole.MANAGER;

/** Giám đốc trở lên (Super Admin + Giám đốc) — dùng cho thao tác nhạy cảm như hủy lệnh. */
export const hasDirectorAccess = (role: Role) => role === UserRole.ADMIN || role === UserRole.DIRECTOR;

export const isAdmin = (role: Role) => role === UserRole.ADMIN;

/** Kiểm tra một role có năng lực cụ thể không. */
export const can = (role: Role, capability: Capability): boolean => {
    if (!role) return false;
    if (role === UserRole.ADMIN) return true; // Super Admin: toàn quyền
    return ROLE_CAPS[role]?.includes(capability) ?? false;
};
