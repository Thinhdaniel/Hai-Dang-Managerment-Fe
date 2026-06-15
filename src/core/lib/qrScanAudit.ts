import { qrScanLogService } from '../services/qr-scan-log.service';
import type { CreateQrScanLogPayload } from '../types';
import { getCurrentCoords } from './geolocation';

export const recordQrScan = (payload: CreateQrScanLogPayload) => {
    // Best-effort dinh vi: dinh kem GPS vao metadata.geo de BE suy ra co so gan nhat.
    // Khong chan workflow hien truong neu nguoi dung tu choi dinh vi hay mang loi.
    void (async () => {
        let geo: { lat: number; lng: number; accuracy?: number } | undefined;
        try {
            const fix = await getCurrentCoords();
            if (fix) geo = fix;
        } catch {
            // bo qua - dinh vi chi la bo sung
        }

        const enriched: CreateQrScanLogPayload = geo
            ? { ...payload, metadata: { ...(payload.metadata ?? {}), geo } }
            : payload;

        await qrScanLogService.create(enriched).catch(() => {
            // Audit logging must not block field workflows when network/server logging fails.
        });
    })();
};
