import api from '../lib/api';
import axiosInstance from '../lib/axios';

const REPORTS_BASE = '/reports';

export type FacilityCostGroupBy = 'day' | 'month' | 'quarter';

export interface FacilityCostQueryParams {
    plantId?: string;
    startDate?: string;
    endDate?: string;
    groupBy?: FacilityCostGroupBy;
}

export interface FacilityCostSummary {
    materialDistributionCost: number;
    externalRepairCost: number;
    totalFacilityCost: number;
    distributionRecordCount: number;
    externalRepairCount: number;
    externalRepairAssetCount: number;
    pendingApprovalCount: number;
    inProgressCount: number;
}

export interface FacilityCostByPlant {
    plantId?: string;
    plantName: string;
    materialDistributionCost: number;
    externalRepairCost: number;
    totalCost: number;
    distributionCount: number;
    externalRepairCount: number;
    externalRepairAssetCount: number;
    repairSharePercent: number;
}

export interface FacilityCostByPeriod {
    period: string;
    materialDistributionCost: number;
    externalRepairCost: number;
    totalCost: number;
}

export interface TopExternalRepairAsset {
    assetId: string;
    assetName: string;
    machineCode?: string;
    plantName?: string;
    totalCost: number;
    count: number;
}

export interface FacilityCostReport {
    summary: FacilityCostSummary;
    costByPlant: FacilityCostByPlant[];
    costByPeriod: FacilityCostByPeriod[];
    topExternalRepairAssets: TopExternalRepairAsset[];
}

const downloadReportFile = async (url: string, filename: string, params?: FacilityCostQueryParams) => {
    const data: any = await axiosInstance.get(url, { params, responseType: 'blob' });
    const blob = data instanceof Blob ? data : new Blob([data]);
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(objectUrl);
};

export const facilityCostReportService = {
    getSummary: (params?: FacilityCostQueryParams): Promise<FacilityCostReport> =>
        api.get<FacilityCostReport>(`${REPORTS_BASE}/facility-cost-summary`, { params }),

    exportExcel: (params?: FacilityCostQueryParams): Promise<void> => {
        const startStr = params?.startDate ? params.startDate.replace(/-/g, '') : 'all';
        const endStr = params?.endDate ? params.endDate.replace(/-/g, '') : 'all';

        return downloadReportFile(
            `${REPORTS_BASE}/facility-cost-summary/export-excel`,
            `BaoCaoChiPhiVanHanh_${startStr}_${endStr}.xlsx`,
            params
        );
    },
};
