import api from '../lib/api';
import type { HelpTopic } from '../help/helpKnowledge';

export type AiHelpContextTopic = Pick<HelpTopic, 'title' | 'summary' | 'category' | 'steps' | 'notes'>;

export type AiHelpRequest = {
    question: string;
    route?: string;
    contextTopics: AiHelpContextTopic[];
};

export type AiHelpResponse = {
    answer: string;
    provider: 'ollama' | 'fallback';
    model?: string;
    available: boolean;
    usedFallback: boolean;
};

export const aiHelpService = {
    ask: (data: AiHelpRequest): Promise<AiHelpResponse> =>
        api.post<AiHelpResponse, AiHelpRequest>('/ai/help', data, {
            timeout: 90000,
        }),
};
