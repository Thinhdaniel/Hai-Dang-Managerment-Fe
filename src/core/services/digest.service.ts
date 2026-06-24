import api from '../lib/api';
import type { AiDigest } from '../types';

export type DigestPeriod = 'week' | 'month';

export const digestService = {
    getLatest: (type: DigestPeriod): Promise<AiDigest | null> =>
        api.get<AiDigest | null>('/digests/latest', { params: { type } }),

    list: (type: DigestPeriod): Promise<AiDigest[]> => api.get<AiDigest[]>('/digests', { params: { type } }),

    generate: (type: DigestPeriod): Promise<AiDigest> =>
        api.post<AiDigest, { type: DigestPeriod }>('/digests/generate', { type }, { timeout: 90000 }),
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
