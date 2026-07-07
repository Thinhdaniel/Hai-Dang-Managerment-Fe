import api from '../lib/api';
import type { AiAudit } from '../types';

// Kiểm toán đêm: rule-check + AI rà bất thường toàn hệ thống, chạy 03:30 hằng ngày.
export const auditService = {
    getLatest: (): Promise<AiAudit | null> => api.get<AiAudit | null>('/ai-audits/latest'),

    list: (): Promise<AiAudit[]> => api.get<AiAudit[]>('/ai-audits'),

    run: (): Promise<AiAudit> => api.post<AiAudit, Record<string, never>>('/ai-audits/run', {}, { timeout: 150000 }),
};
