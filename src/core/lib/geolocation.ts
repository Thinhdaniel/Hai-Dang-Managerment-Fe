// Lay toa do GPS cua thiet bi (best-effort) cho viec dinh vi may luc quet QR + nhap toa do co so.
// Im lang khi nguoi dung tu choi / trinh duyet khong ho tro -> tra ve null, khong nem loi.

export type GeoFix = { lat: number; lng: number; accuracy?: number };

let cached: { fix: GeoFix; at: number } | null = null;

const isSupported = () => typeof navigator !== 'undefined' && 'geolocation' in navigator;

/**
 * Lay vi tri hien tai. Tra ve null neu khong lay duoc (tu choi, timeout, khong ho tro).
 * @param maxAgeMs  Cho phep dung lai fix da co trong khoang nay (mac dinh 60s) de khoi hoi lai lien tuc.
 * @param timeoutMs Toi da cho GPS phan hoi (mac dinh 6s) - tranh treo luong quet.
 */
export const getCurrentCoords = (maxAgeMs = 60_000, timeoutMs = 6_000): Promise<GeoFix | null> => {
    if (!isSupported()) return Promise.resolve(null);

    if (cached && Date.now() - cached.at < maxAgeMs) {
        return Promise.resolve(cached.fix);
    }

    return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const fix: GeoFix = {
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                    accuracy: typeof pos.coords.accuracy === 'number' ? Math.round(pos.coords.accuracy) : undefined,
                };
                cached = { fix, at: Date.now() };
                resolve(fix);
            },
            () => resolve(null),
            { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: maxAgeMs }
        );
    });
};

// Tach toa do tu link / chuoi Google Maps, vd: ".../@10.762622,106.660172,17z" hoac "?q=10.76,106.66"
export const parseCoordsFromText = (text: string): GeoFix | null => {
    if (!text) return null;
    const atMatch = text.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    const qMatch = text.match(/[?&](?:q|ll|query)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    const bareMatch = text.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    const m = atMatch ?? qMatch ?? bareMatch;
    if (!m) return null;

    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return null;
    }
    return { lat, lng };
};
