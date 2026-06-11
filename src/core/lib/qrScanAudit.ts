import { qrScanLogService } from '../services/qr-scan-log.service';
import type { CreateQrScanLogPayload } from '../types';

export const recordQrScan = (payload: CreateQrScanLogPayload) => {
    void qrScanLogService.create(payload).catch(() => {
        // Audit logging must not block field workflows when network/server logging fails.
    });
};
