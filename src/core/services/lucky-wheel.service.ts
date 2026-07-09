import api from '../lib/api';

export type LuckyWheelTheme = 'haidang-night' | 'gold-night' | 'tet' | 'ocean';

export type LuckyWheelParticipant = {
    _id?: string;
    id?: string;
    name: string;
    code?: string;
    department?: string;
    plantName?: string;
    userId?: string;
    weight?: number;
    active?: boolean;
};

export type LuckyWheelWinner = {
    _id?: string;
    participantId?: string;
    name: string;
    code?: string;
    department?: string;
    plantName?: string;
    spinNo: number;
    poolSize: number;
    randomIndex: number;
    spunByName?: string;
    spunAt?: string;
};

export type LuckyWheelSettings = {
    removeWinnerAfterSpin: boolean;
    allowRepeatWinners: boolean;
    spinDurationMs: number;
    theme: LuckyWheelTheme;
    soundEnabled: boolean;
    confettiEnabled: boolean;
};

export type LuckyWheelEvent = {
    _id: string;
    name: string;
    description?: string;
    status: 'draft' | 'active' | 'finished' | 'archived';
    participants: LuckyWheelParticipant[];
    winners: LuckyWheelWinner[];
    settings: LuckyWheelSettings;
    createdByName?: string;
    createdAt?: string;
    updatedAt?: string;
};

export type LuckyWheelPayload = {
    name: string;
    description?: string;
    participants: LuckyWheelParticipant[];
    settings?: Partial<LuckyWheelSettings>;
};

export type LuckyWheelSpinResult = {
    event: LuckyWheelEvent;
    winner: LuckyWheelWinner;
    winnerIndex: number;
    eligibleCount: number;
};

const BASE = '/lucky-wheel';

export const luckyWheelService = {
    list: (): Promise<LuckyWheelEvent[]> => api.get<LuckyWheelEvent[]>(BASE),
    getById: (id: string): Promise<LuckyWheelEvent> => api.get<LuckyWheelEvent>(`${BASE}/${id}`),
    create: (payload: LuckyWheelPayload): Promise<LuckyWheelEvent> =>
        api.post<LuckyWheelEvent, LuckyWheelPayload>(BASE, payload),
    update: (id: string, payload: Partial<LuckyWheelPayload>): Promise<LuckyWheelEvent> =>
        api.patch<LuckyWheelEvent, Partial<LuckyWheelPayload>>(`${BASE}/${id}`, payload),
    spin: (id: string): Promise<LuckyWheelSpinResult> => api.post<LuckyWheelSpinResult>(`${BASE}/${id}/spin`),
    reset: (id: string): Promise<LuckyWheelEvent> => api.post<LuckyWheelEvent>(`${BASE}/${id}/reset`),
    delete: (id: string): Promise<{ id: string }> => api.delete<{ id: string }>(`${BASE}/${id}`),
};
