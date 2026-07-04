import api from '../lib/api';
import type { FloorMachineStats, FloorMapData, FloorZone } from '../types';

const BASE = '/floor-map';

export const floorMapService = {
    getMap: (plantId: string): Promise<FloorMapData> => api.get<FloorMapData>(BASE, { params: { plantId } }),

    getMachineStats: (assetId: string): Promise<FloorMachineStats> =>
        api.get<FloorMachineStats>(`${BASE}/machines/${assetId}/stats`),

    saveZones: (
        plantId: string,
        zones: (Omit<FloorZone, 'id'> & { id?: string })[]
    ): Promise<{ zones: FloorZone[] }> => api.put<{ zones: FloorZone[] }>(`${BASE}/zones`, { plantId, zones }),

    savePositions: (items: { assetId: string; x: number | null; y: number | null }[]): Promise<{ updated: number }> =>
        api.patch<{ updated: number }>(`${BASE}/positions`, { items }),
};
