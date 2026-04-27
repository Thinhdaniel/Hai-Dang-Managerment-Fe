import api from '../lib/api';
import type { DashboardChartData, DashboardOverviewResponse, DashboardStats } from '../types';

export const dashboardService = {
    getOverview: (): Promise<DashboardOverviewResponse> => api.get<DashboardOverviewResponse>('/dashboard/overview'),

    getStats: (): Promise<DashboardStats> => api.get<DashboardStats>('/dashboard/stats'),

    getChartData: (): Promise<DashboardChartData> => api.get<DashboardChartData>('/dashboard/charts'),
};
