import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dashboardService } from '../services/dashboard.service';
import type { BriefingPeriodType } from '../types/executiveBriefing';

export const executiveBriefingKeys = {
    all: ['dashboard', 'executive-briefing'] as const,
    latest: (period: BriefingPeriodType) => [...executiveBriefingKeys.all, 'latest', period] as const,
    history: (period: BriefingPeriodType) => [...executiveBriefingKeys.all, 'history', period] as const,
    detail: (id: string) => [...executiveBriefingKeys.all, 'detail', id] as const,
};

export const useLatestExecutiveBriefing = (period: BriefingPeriodType, enabled = true) =>
    useQuery({
        queryKey: executiveBriefingKeys.latest(period),
        queryFn: () => dashboardService.getLatestBriefing(period),
        staleTime: 5 * 60_000,
        enabled,
    });

export const useExecutiveBriefingHistory = (period: BriefingPeriodType, enabled = true) =>
    useQuery({
        queryKey: executiveBriefingKeys.history(period),
        queryFn: () => dashboardService.getBriefingHistory(period),
        staleTime: 5 * 60_000,
        enabled,
    });

export const useExecutiveBriefingDetail = (id?: string) =>
    useQuery({
        queryKey: executiveBriefingKeys.detail(id ?? 'none'),
        queryFn: () => dashboardService.getBriefingById(id!),
        enabled: Boolean(id),
        staleTime: 5 * 60_000,
    });

export const useRefreshExecutiveBriefing = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: dashboardService.refreshBriefing,
        onSuccess: (briefing) => {
            queryClient.setQueryData(executiveBriefingKeys.latest(briefing.periodType), briefing);
            queryClient.setQueryData(executiveBriefingKeys.detail(briefing._id), briefing);
            void queryClient.invalidateQueries({ queryKey: executiveBriefingKeys.history(briefing.periodType) });
        },
    });
};
