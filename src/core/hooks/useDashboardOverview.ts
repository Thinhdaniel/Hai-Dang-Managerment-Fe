import { useQuery } from '@tanstack/react-query';
import { dashboardService } from '../services/dashboard.service';

export const useDashboardOverview = () =>
    useQuery({
        queryKey: ['dashboard', 'overview'],
        queryFn: dashboardService.getOverview,
        staleTime: 60_000,
    });
