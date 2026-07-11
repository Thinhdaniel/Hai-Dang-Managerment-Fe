import api from '../lib/api';
import type {
    FloorMachineStats,
    FloorMapData,
    FloorMapRevision,
    FloorMapRollbackResult,
    FloorRealityHealth,
    RealityAlertRule,
    RealityAlertStatus,
    RealityOperationalAlert,
    RealityOperationsDashboard,
    FloorZone,
    Plant,
} from '../types';

const BASE = '/floor-map';

export const floorMapService = {
    getMap: (plantId: string): Promise<FloorMapData> => api.get<FloorMapData>(BASE, { params: { plantId } }),

    getMachineStats: (assetId: string): Promise<FloorMachineStats> =>
        api.get<FloorMachineStats>(`${BASE}/machines/${assetId}/stats`),

    resolveZoneAnchor: (anchorCode: string): Promise<{ zone: FloorZone; plant: Pick<Plant, 'id' | 'name' | 'code'> }> =>
        api.get<{ zone: FloorZone; plant: Pick<Plant, 'id' | 'name' | 'code'> }>(
            `${BASE}/zones/anchor/${encodeURIComponent(anchorCode)}`
        ),

    saveZones: (plantId: string, zones: (Omit<FloorZone, 'id'> & { id?: string })[]): Promise<{ zones: FloorZone[] }> =>
        api.put<{ zones: FloorZone[] }>(`${BASE}/zones`, { plantId, zones }),

    savePositions: (
        items: {
            assetId: string;
            x: number | null;
            y: number | null;
            expectedX?: number | null;
            expectedY?: number | null;
        }[]
    ): Promise<{ updated: number; conflicts: string[]; revisionIds: string[] }> =>
        api.patch<{ updated: number; conflicts: string[]; revisionIds: string[] }>(`${BASE}/positions`, { items }),

    getRevisions: (plantId: string, limit = 20): Promise<{ revisions: FloorMapRevision[] }> =>
        api.get<{ revisions: FloorMapRevision[] }>(`${BASE}/revisions`, { params: { plantId, limit } }),

    rollbackRevision: (revisionId: string): Promise<FloorMapRollbackResult> =>
        api.post<FloorMapRollbackResult>(`${BASE}/revisions/${revisionId}/rollback`),

    getRealityHealth: (plantId: string, staleDays = 30): Promise<FloorRealityHealth> =>
        api.get<FloorRealityHealth>(`${BASE}/reality-health`, { params: { plantId, staleDays } }),

    getOperations: (plantId: string): Promise<RealityOperationsDashboard> =>
        api.get<RealityOperationsDashboard>(`${BASE}/operations`, { params: { plantId } }),

    updateOperationsRule: (data: Partial<RealityAlertRule> & { plantId: string }): Promise<RealityAlertRule> =>
        api.patch<RealityAlertRule>(`${BASE}/operations/rule`, data),

    updateOperationalAlert: (
        alertId: string,
        data: {
            status?: RealityAlertStatus;
            assignedTo?: string | null;
            dueAt?: string | null;
            resolutionNote?: string;
        }
    ): Promise<RealityOperationalAlert> =>
        api.patch<RealityOperationalAlert>(`${BASE}/operations/alerts/${alertId}`, data),

    evaluateOperations: (
        plantId: string
    ): Promise<{
        opened: number;
        updated: number;
        resolved: number;
        notified: number;
    }> => api.post(`${BASE}/operations/evaluate`, { plantId }),
};
