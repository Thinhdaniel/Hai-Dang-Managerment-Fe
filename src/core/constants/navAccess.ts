import type { Capability } from '../lib/permissions';
import { can } from '../lib/permissions';
import type { User } from '../types';

const mainPlantId = import.meta.env.VITE_MAIN_PLANT_ID as string | undefined;
const procurementPlantIds = String(import.meta.env.VITE_PROCUREMENT_PLANT_IDS || mainPlantId || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

/** Cơ sở của người dùng có nằm trong nhóm cơ sở được phép mua sắm không. */
export const isProcurementPlant = (user?: User | null) =>
    Boolean(user?.plantId && procurementPlantIds.includes(user.plantId));

export type AccessCheck = (user: User | null | undefined) => boolean;

/** Yêu cầu một năng lực cụ thể. */
export const requireCap =
    (capability: Capability): AccessCheck =>
    (user) =>
        can(user?.role, capability);

/** Mua sắm: cần năng lực vận hành mua sắm + thuộc cơ sở được cấu hình mua hàng. */
export const requireProcurement: AccessCheck = (user) =>
    can(user?.role, 'procurement.operate') && isProcurementPlant(user);

/**
 * Bản đồ quyền truy cập theo route (dùng cho RequireAccess trong router).
 * Route không có trong map = mọi người dùng đã đăng nhập đều xem được.
 */
export const ROUTE_ACCESS: Record<string, AccessCheck> = {
    '/qr-labels': requireCap('qrlabel.manage'),
    '/qr-labels/batches/:id/print': requireCap('qrlabel.manage'),
    '/qr/:publicId/activate': requireCap('qrlabel.manage'),
    '/borrowings/batches/:id': requireCap('borrowing.write'),
    '/brands': requireCap('brand.manage'),
    '/materials': requireCap('material.view'),
    '/materials/suppliers': requireCap('material.view'),
    '/materials/inventory': requireCap('inventory.view'),
    '/materials/supply-requests': requireCap('supplyRequest.manage'),
    '/materials/technical-purchase-requests': requireCap('technicalPurchase.manage'),
    '/materials/purchase-requests': requireProcurement,
    '/materials/purchase-orders': requireProcurement,
    '/materials/distributions': requireCap('distribution.view'),
    '/materials/reports': requireCap('report.view'),
    '/reports/facility-costs': requireCap('report.view'),
    '/plants': requireCap('plant.view'),
    '/users': requireCap('user.view'),
    '/storage': requireCap('storage.view'),
};
