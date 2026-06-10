import api from '../lib/api';
import type {
    ActivateMachineQrPayload,
    Asset,
    CreateQrBatchPayload,
    InternalQrResolveResponse,
    PaginatedResponse,
    PublicQrResolveResponse,
    QrBatchDetail,
    QrLabel,
    QrLabelBatch,
    QrLabelStatus,
    QrLabelType,
} from '../types';

const BASE = '/qr-labels';

export type QrLabelListParams = {
    page?: number;
    limit?: number;
    search?: string;
    type?: QrLabelType;
    status?: QrLabelStatus;
    batchId?: string;
    plantId?: string;
};

export type QrBatchListParams = {
    page?: number;
    limit?: number;
    search?: string;
    type?: QrLabelType;
    status?: string;
    plantId?: string;
};

export const qrLabelService = {
    getLabels: (params?: QrLabelListParams): Promise<PaginatedResponse<QrLabel>> =>
        api.get<PaginatedResponse<QrLabel>>(BASE, { params }),

    getBatches: (params?: QrBatchListParams): Promise<PaginatedResponse<QrLabelBatch>> =>
        api.get<PaginatedResponse<QrLabelBatch>>(`${BASE}/batches`, { params }),

    getBatchById: (id: string): Promise<QrBatchDetail> => api.get<QrBatchDetail>(`${BASE}/batches/${id}`),

    createBatch: (data: CreateQrBatchPayload): Promise<QrLabelBatch> =>
        api.post<QrLabelBatch, CreateQrBatchPayload>(`${BASE}/batches`, data),

    createLabel: (data?: {
        type?: QrLabelType;
        plannedPlantId?: string;
        plannedArea?: string;
        note?: string;
    }): Promise<QrLabel> => api.post<QrLabel>(BASE, data),

    markBatchPrinted: (id: string): Promise<QrLabelBatch> =>
        api.post<QrLabelBatch>(`${BASE}/batches/${id}/mark-printed`),

    resolvePublic: (publicId: string): Promise<PublicQrResolveResponse> =>
        api.get<PublicQrResolveResponse>(`/public/qr/${publicId}`),

    resolveInternal: (publicId: string): Promise<InternalQrResolveResponse> =>
        api.get<InternalQrResolveResponse>(`${BASE}/resolve/${publicId}`),

    activateMachine: (publicId: string, data: ActivateMachineQrPayload): Promise<{ label: QrLabel; asset: Asset }> =>
        api.post<{ label: QrLabel; asset: Asset }, ActivateMachineQrPayload>(
            `${BASE}/${publicId}/activate-machine`,
            data
        ),

    linkAsset: (
        publicId: string,
        data: { assetId: string; replaceExistingPublicId?: boolean }
    ): Promise<{ label: QrLabel; asset: Asset }> =>
        api.post<{ label: QrLabel; asset: Asset }, { assetId: string; replaceExistingPublicId?: boolean }>(
            `${BASE}/${publicId}/link-asset`,
            data
        ),
};
