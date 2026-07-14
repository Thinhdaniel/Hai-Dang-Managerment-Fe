import api from '../lib/api';

export type VariancePeriod = 'week' | 'month';
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
    periodType: VariancePeriod;
    isCost: boolean;
    current: number;
    previous: number;
    deltaPct: number;
    drivers: VarianceDriver[];
    explanation: string;
    provider: string;
}

export const varianceService = {
    explain: (metric: VarianceMetric, periodType: VariancePeriod): Promise<VarianceResult> =>
        api.post<VarianceResult, { metric: VarianceMetric; periodType: VariancePeriod }>(
            '/variance/explain',
            { metric, periodType },
            { timeout: 60000 }
        ),
};
