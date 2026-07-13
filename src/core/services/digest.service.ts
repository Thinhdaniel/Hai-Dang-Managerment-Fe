import api from '../lib/api';
import type { AiDigest, AiDigestEditorial, AiDigestValidation } from '../types';

export type DigestPeriod = 'week' | 'month';

export type DigestEditorialUpdate = {
    narrative?: string;
    highlights?: string[];
    alerts?: string[];
    recommendations?: string[];
    editorial?: Pick<
        AiDigestEditorial,
        'hiddenIncidentIds' | 'hiddenRepairIds' | 'hiddenMaterialKeys' | 'hiddenPlantIds'
    >;
    note?: string;
};

export const digestService = {
    getLatest: (type: DigestPeriod): Promise<AiDigest | null> =>
        api.get<AiDigest | null>('/digests/latest', { params: { type } }),

    list: (type: DigestPeriod): Promise<AiDigest[]> => api.get<AiDigest[]>('/digests', { params: { type } }),

    getById: (id: string): Promise<AiDigest> => api.get<AiDigest>(`/digests/${id}`),

    generate: (type: DigestPeriod): Promise<AiDigest> =>
        api.post<AiDigest, { type: DigestPeriod }>('/digests/generate', { type }, { timeout: 180000 }),

    approve: (id: string, note?: string): Promise<AiDigest> =>
        api.post<AiDigest, { note?: string }>(`/digests/${id}/approve`, { note }),

    updateEditorial: (id: string, payload: DigestEditorialUpdate): Promise<AiDigest> =>
        api.patch<AiDigest, DigestEditorialUpdate>(`/digests/${id}/editorial`, payload),

    updateCover: (id: string, coverImageUrl: string | null, note?: string): Promise<AiDigest> =>
        api.patch<AiDigest, { coverImageUrl: string | null; note?: string }>(`/digests/${id}/cover`, {
            coverImageUrl,
            note,
        }),

    regenerateCover: (id: string): Promise<AiDigest> =>
        api.post<AiDigest>(`/digests/${id}/cover/regenerate`, {}, { timeout: 180000 }),

    validate: (id: string): Promise<AiDigestValidation> => api.post<AiDigestValidation>(`/digests/${id}/validate`, {}),

    reopen: (id: string, note?: string): Promise<AiDigest> =>
        api.post<AiDigest, { note?: string }>(`/digests/${id}/reopen`, { note }),

    publish: (id: string): Promise<AiDigest> => api.post<AiDigest>(`/digests/${id}/publish`, {}, { timeout: 180000 }),

    recordView: (id: string): Promise<{ uniqueViewers: number; totalViews: number }> =>
        api.post<{ uniqueViewers: number; totalViews: number }>(`/digests/${id}/view`, {}),

    downloadPdf: async (id: string, version?: number, fileName?: string) => {
        const data = await api.get<Blob>(`/digests/${id}/pdf`, {
            params: version ? { version } : undefined,
            responseType: 'blob',
            timeout: 60000,
        });
        const blob = data instanceof Blob ? data : new Blob([data], { type: 'application/pdf' });
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = fileName || `ban-tin-dieu-hanh-v${version || 1}.pdf`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(objectUrl);
    },
};

export type VarianceMetric = 'repair_cost' | 'distribution_cost' | 'total_cost' | 'maintenance_tickets';

export interface VarianceDriver {
    label: string;
    current: number;
    previous: number;
    delta: number;
    contributionPct: number;
}

export interface VarianceResult {
    metric: VarianceMetric;
    metricLabel: string;
    periodType: DigestPeriod;
    isCost: boolean;
    current: number;
    previous: number;
    deltaPct: number;
    drivers: VarianceDriver[];
    explanation: string;
    provider: string;
}

export const varianceService = {
    explain: (metric: VarianceMetric, periodType: DigestPeriod): Promise<VarianceResult> =>
        api.post<VarianceResult, { metric: VarianceMetric; periodType: DigestPeriod }>(
            '/digests/variance',
            { metric, periodType },
            { timeout: 60000 }
        ),
};
