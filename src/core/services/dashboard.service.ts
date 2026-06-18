import api from '../lib/api';
import type {
    AssetLocationsResponse,
    DashboardChartData,
    DashboardInsights,
    DashboardOverviewResponse,
    DashboardStats,
} from '../types';

export const dashboardService = {
    getOverview: (): Promise<DashboardOverviewResponse> => api.get<DashboardOverviewResponse>('/dashboard/overview'),

    getInsights: (): Promise<DashboardInsights> => api.get<DashboardInsights>('/dashboard/insights'),

    getStats: (): Promise<DashboardStats> => api.get<DashboardStats>('/dashboard/stats'),

    getChartData: (): Promise<DashboardChartData> => api.get<DashboardChartData>('/dashboard/charts'),

    getAssetLocations: (plantId?: string): Promise<AssetLocationsResponse> =>
        api.get<AssetLocationsResponse>('/dashboard/asset-locations', {
            params: plantId ? { plantId } : undefined,
        }),
};
