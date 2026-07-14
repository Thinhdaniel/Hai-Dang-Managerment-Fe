import api from '../lib/api';
import type {
    AssetLocationsResponse,
    DashboardChartData,
    DashboardInsights,
    DashboardOverviewResponse,
    DashboardStats,
} from '../types';
import type { BriefingPeriodType, ExecutiveBriefing, ExecutiveBriefingHistoryItem } from '../types/executiveBriefing';

export const dashboardService = {
    getOverview: (): Promise<DashboardOverviewResponse> => api.get<DashboardOverviewResponse>('/dashboard/overview'),

    getInsights: (): Promise<DashboardInsights> => api.get<DashboardInsights>('/dashboard/insights'),

    getStats: (): Promise<DashboardStats> => api.get<DashboardStats>('/dashboard/stats'),

    getChartData: (): Promise<DashboardChartData> => api.get<DashboardChartData>('/dashboard/charts'),

    getAssetLocations: (plantId?: string): Promise<AssetLocationsResponse> =>
        api.get<AssetLocationsResponse>('/dashboard/asset-locations', {
            params: plantId ? { plantId } : undefined,
        }),

    getLatestBriefing: (period: BriefingPeriodType): Promise<ExecutiveBriefing> =>
        api.get<ExecutiveBriefing>('/dashboard/briefings/latest', {
            params: { period },
            timeout: 100_000,
        }),

    getBriefingHistory: (period: BriefingPeriodType, limit = 12): Promise<ExecutiveBriefingHistoryItem[]> =>
        api.get<ExecutiveBriefingHistoryItem[]>('/dashboard/briefings', { params: { period, limit } }),

    getBriefingById: (id: string): Promise<ExecutiveBriefing> =>
        api.get<ExecutiveBriefing>(`/dashboard/briefings/${id}`),

    refreshBriefing: (period: BriefingPeriodType): Promise<ExecutiveBriefing> =>
        api.post<ExecutiveBriefing, { period: BriefingPeriodType }>(
            '/dashboard/briefings/refresh',
            { period },
            { timeout: 100_000 }
        ),
};
