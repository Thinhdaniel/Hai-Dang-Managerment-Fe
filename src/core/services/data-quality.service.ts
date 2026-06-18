import api from '../lib/api';
import type { DataQualityOverviewResponse } from '../types';

export const dataQualityService = {
    getOverview: (): Promise<DataQualityOverviewResponse> =>
        api.get<DataQualityOverviewResponse>('/data-quality/overview'),
};
