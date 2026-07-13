import api from '../lib/api';
import type { AssetAssistantResponse, AssistantFeedbackInput } from './ai-help.service';

export type AssistantQualitySummary = {
    total: number;
    success: number;
    fallback: number;
    policy: number;
    error: number;
    verified: number;
    corrected: number;
    unverified: number;
    feedbackCount: number;
    helpful: number;
    notHelpful: number;
    failedToolCalls: number;
    successRate: number;
    trustedRate: number;
    helpfulRate: number;
    feedbackRate: number;
    fallbackRate: number;
    avgLatencyMs: number;
    p50LatencyMs: number;
    p95LatencyMs: number;
    avgToolCalls: number;
};

export type AssistantTraceSummary = {
    _id: string;
    reqId: string;
    question: string;
    status: 'success' | 'policy' | 'fallback' | 'error';
    tier: 'light' | 'standard' | 'heavy';
    provider?: string;
    model?: string;
    confidence?: 'high' | 'medium' | 'low' | 'none';
    grounding?: 'verified' | 'corrected' | 'unverified' | 'not_applicable';
    sourceCount: number;
    toolCallCount: number;
    failedToolCount: number;
    tookMs: number;
    plantName?: string;
    feedback?: AssistantFeedbackInput & { createdAt?: string };
    userId?: { _id: string; name?: string; email?: string };
    createdAt: string;
};

export type AssistantTraceDetail = AssistantTraceSummary & {
    promptVersion: string;
    toolRegistryVersion: string;
    answerPreview?: string;
    role: string;
    sources: Array<{ tool: string; label: string; module: string; scope?: string; records?: number }>;
    planner?: {
        used: boolean;
        durationMs: number;
        provider?: string;
        model?: string;
        goal?: string;
        steps?: Array<{ tool: string; purpose?: string }>;
        error?: string;
    };
    tools: Array<{
        tool: string;
        phase: 'forced' | 'planner' | 'react' | 'fallback';
        args?: Record<string, unknown>;
        success: boolean;
        durationMs: number;
        records?: number;
        scope?: string;
        errorCode?: string;
        errorMessage?: string;
    }>;
};

export type AssistantQualityOverview = {
    generatedAt: string;
    range: { days: number; from: string };
    healthScore: number;
    summary: AssistantQualitySummary;
    daily: Array<{
        date: string;
        total: number;
        fallback: number;
        unverified: number;
        notHelpful: number;
        avgLatencyMs: number;
    }>;
    providers: Array<{
        provider: string;
        total: number;
        avgLatencyMs: number;
        fallback: number;
        notHelpful: number;
    }>;
    models: Array<{
        provider: string;
        model?: string;
        total: number;
        avgLatencyMs: number;
        trusted: number;
        notHelpful: number;
    }>;
    tools: Array<{ tool: string; calls: number; errors: number; avgDurationMs: number; maxDurationMs: number }>;
    feedbackReasons: Array<{ reason: string; count: number }>;
    recentIssues: AssistantTraceSummary[];
    availableReplayModels: string[];
};

export type AssistantTraceListResponse = {
    rows: AssistantTraceSummary[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
};

export type AssistantReplayResult = {
    baseline: {
        reqId: string;
        answer?: string;
        provider?: string;
        model?: string;
        grounding?: string;
        confidence?: string;
        tookMs: number;
        toolCallCount: number;
    };
    replay: AssetAssistantResponse;
    comparison: { latencyDeltaMs: number; sameModel: boolean; sameAnswer: boolean };
};

export const aiAssistantQualityService = {
    getOverview: (days: number) =>
        api.get<AssistantQualityOverview>('/ai-assistant-quality/overview', { params: { days } }),
    listTraces: (params: Record<string, string | number | undefined>) =>
        api.get<AssistantTraceListResponse>('/ai-assistant-quality/traces', { params }),
    getTrace: (reqId: string) =>
        api.get<AssistantTraceDetail>(`/ai-assistant-quality/traces/${encodeURIComponent(reqId)}`),
    replay: (reqId: string, model?: string) =>
        api.post<AssistantReplayResult, { model?: string }>(
            `/ai-assistant-quality/traces/${encodeURIComponent(reqId)}/replay`,
            { model },
            { timeout: 120000 }
        ),
};
