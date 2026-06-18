import { useQuery } from '@tanstack/react-query';
import { dashboardService } from '../services/dashboard.service';

export const useDashboardOverview = () =>
    useQuery({
        queryKey: ['dashboard', 'overview'],
        queryFn: dashboardService.getOverview,
        staleTime: 60_000,
    });

export const useDashboardCharts = () =>
    useQuery({
        queryKey: ['dashboard', 'charts'],
        queryFn: dashboardService.getChartData,
        staleTime: 60_000,
    });

export const useDashboardInsights = () =>
    useQuery({
        queryKey: ['dashboard', 'insights'],
        queryFn: dashboardService.getInsights,
        staleTime: 60_000,
    });

export const useAssetLocations = (plantId?: string) =>
    useQuery({
        queryKey: ['dashboard', 'asset-locations', plantId ?? 'all'],
        queryFn: () => dashboardService.getAssetLocations(plantId),
        staleTime: 30_000,
    });
