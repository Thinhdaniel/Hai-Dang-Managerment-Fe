import type { Plant, User } from '../types';
import { UserRole } from '../types';
import { can } from './permissions';

export const hasGlobalProductionAccess = (role?: UserRole | null) =>
    role === UserRole.ADMIN || role === UserRole.DIRECTOR;

/**
 * Dùng để ẩn điểm vào sớm trên FE. ProductionAccessGate và BE vẫn là nguồn
 * xác thực cuối cùng. Payload cũ chưa có cờ được cho qua để deploy không gián đoạn.
 */
export const canOpenProduction = (user?: User | null) => {
    if (!user || !can(user.role, 'production.view')) return false;
    if (hasGlobalProductionAccess(user.role)) return true;
    if (!user.plantId) return false;
    return user.plant?.productionAccess?.enabled !== false;
};

export const productionPlantLabel = (plant: Pick<Plant, 'name' | 'productionAccess'>) =>
    plant.productionAccess?.enabled === false ? `${plant.name} · Chưa triển khai` : plant.name;
