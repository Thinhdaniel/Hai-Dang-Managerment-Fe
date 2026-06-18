// Đối chiếu vị trí GPS lúc quét với cơ sở hệ thống (real-time, client-side).
// Dùng chung ngưỡng với BE (constant/mislocation.ts) để cảnh báo nhất quán.
import type { GeoFix } from './geolocation';
import type { Plant } from '../types';

/** Sai số GPS tối đa (m) để coi lần quét là đáng tin. */
export const MAX_ACCURACY_M = 100;
/** Bán kính (m) coi như máy "đang ở" cơ sở gần nhất. */
export const AT_PLANT_RADIUS_M = 300;

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

export const haversineMeters = (a: { lat: number; lng: number }, b: { lat: number; lng: number }): number => {
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const sinLat = Math.sin(dLat / 2);
    const sinLng = Math.sin(dLng / 2);
    const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
    return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
};

export const findNearestPlant = (
    point: { lat: number; lng: number },
    plants: Plant[]
): { plant: Plant; distanceM: number } | null => {
    let best: { plant: Plant; distanceM: number } | null = null;
    for (const plant of plants) {
        const coords = plant.coordinates;
        if (!coords || typeof coords.lat !== 'number' || typeof coords.lng !== 'number') continue;
        const distanceM = haversineMeters(point, coords);
        if (!best || distanceM < best.distanceM) best = { plant, distanceM };
    }
    return best;
};

export type ScanLocationResult = {
    /** Lệch vị trí đáng tin: cơ sở GPS gần nhất khác cơ sở hệ thống. */
    mismatch: boolean;
    /** Lần quét đủ tin cậy (sai số nhỏ + đang ở cạnh cơ sở) — dù lệch hay không. */
    confident: boolean;
    nearestPlant?: Plant;
    distanceM?: number;
    accuracy?: number;
};

/**
 * Đánh giá vị trí quét: tìm cơ sở GPS gần nhất, so với cơ sở hệ thống của máy.
 * Áp guard độ tin cậy để tránh báo nhầm do GPS sai số lớn / máy đang vận chuyển.
 */
export const evaluateScanLocation = (params: {
    coords: GeoFix | null;
    plants: Plant[];
    officialPlantId?: string;
}): ScanLocationResult => {
    const { coords, plants, officialPlantId } = params;
    if (!coords) return { mismatch: false, confident: false };

    const nearest = findNearestPlant(coords, plants);
    if (!nearest) return { mismatch: false, confident: false };

    const accuracy = coords.accuracy;
    const confident =
        typeof accuracy === 'number' && accuracy <= MAX_ACCURACY_M && nearest.distanceM <= AT_PLANT_RADIUS_M;
    const mismatch = Boolean(confident && officialPlantId && nearest.plant.id !== officialPlantId);

    return {
        mismatch,
        confident,
        nearestPlant: nearest.plant,
        distanceM: Math.round(nearest.distanceM),
        accuracy,
    };
};
