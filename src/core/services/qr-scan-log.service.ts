import api from '../lib/api';
import type { CreateQrScanLogPayload, PaginatedResponse, QrScanLog } from '../types';

const BASE = '/qr-scan-logs';

export type QrScanLogListParams = {
    page?: number;
    limit?: number;
    assetId?: string;
    publicId?: string;
    action?: string;
    result?: string;
    startDate?: string;
    endDate?: string;
};

export const qrScanLogService = {
    create: (data: CreateQrScanLogPayload): Promise<QrScanLog> =>
        api.post<QrScanLog, CreateQrScanLogPayload>(BASE, data),

    getAll: (params?: QrScanLogListParams): Promise<PaginatedResponse<QrScanLog>> =>
        api.get<PaginatedResponse<QrScanLog>>(BASE, { params }),
};
