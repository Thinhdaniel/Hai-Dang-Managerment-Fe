import api from '../lib/api';
import type { PublicMachine } from '../types';

export const publicMachineService = {
    getByPublicId: (publicId: string): Promise<PublicMachine> => api.get<PublicMachine>(`/public/machines/${publicId}`),
};
