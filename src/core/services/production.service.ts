import api from '../lib/api';
import type {
    ConfigureProductionLinePayload,
    ProductionBoard,
    ProductionAccessStatus,
    ProductionDay,
    ProductionDayPage,
    ProductionDayStatus,
    ProductionItem,
    ProductionItemPayload,
    ProductionLine,
    ProductionLinePayload,
    ProductionLineRecord,
    ProductionMonitorResponse,
    ProductionOperation,
    ProductionOperationConfigPayload,
    ProductionOpeningBalanceBatch,
    ProductionOpeningBalanceList,
    ProductionOpeningBalancePreview,
    ProductionQcOpeningBalanceBatch,
    ProductionQcOpeningBalanceList,
    ProductionQcOpeningBalancePreview,
    ProductionQcReport,
    ProductionPlan,
    ProductionPlanAllocationPayload,
    ProductionReport,
    ProductionReportScope,
    ProductionReminderSettings,
    ProductionReminderStatus,
    ProductionReminderTestResult,
    ProductionScheduleTemplate,
    SaveProductionEntryPayload,
    SaveProductionOperationEntryPayload,
    SaveProductionQcEntryPayload,
    SaveProductionQcRecordPayload,
    ProductionTimeSlot,
    UpdateProductionReminderSettingsPayload,
} from '../types/production';

const BASE = '/production';

export const productionService = {
    getAccess: (plantId?: string): Promise<ProductionAccessStatus> =>
        api.get(`${BASE}/access`, { params: plantId ? { plantId } : undefined }),

    getLines: (plantId: string, includeInactive = false): Promise<ProductionLine[]> =>
        api.get(`${BASE}/lines`, { params: { plantId, includeInactive } }),

    createLine: (payload: ProductionLinePayload): Promise<ProductionLine> => api.post(`${BASE}/lines`, payload),

    updateLine: (id: string, payload: Partial<Omit<ProductionLinePayload, 'plantId'>>): Promise<ProductionLine> =>
        api.patch(`${BASE}/lines/${id}`, payload),

    getItems: (plantId: string, includeInactive = false): Promise<ProductionItem[]> =>
        api.get(`${BASE}/items`, { params: { plantId, includeInactive } }),

    getOperations: (plantId: string, includeInactive = false): Promise<ProductionOperation[]> =>
        api.get(`${BASE}/operations`, { params: { plantId, includeInactive } }),

    createOperation: (payload: {
        plantId: string;
        code: string;
        name: string;
        unit?: string;
        sortOrder?: number;
        isActive?: boolean;
    }): Promise<ProductionOperation> => api.post(`${BASE}/operations`, payload),

    updateOperation: (
        id: string,
        payload: Partial<Omit<ProductionOperation, 'id' | 'plantId' | 'createdAt' | 'updatedAt'>>
    ): Promise<ProductionOperation> => api.patch(`${BASE}/operations/${id}`, payload),

    createItem: (payload: ProductionItemPayload): Promise<ProductionItem> => api.post(`${BASE}/items`, payload),

    updateItem: (id: string, payload: Partial<Omit<ProductionItemPayload, 'plantId'>>): Promise<ProductionItem> =>
        api.patch(`${BASE}/items/${id}`, payload),

    updateItemOperations: (id: string, operations: ProductionOperationConfigPayload[]): Promise<ProductionItem> =>
        api.put(`${BASE}/items/${id}/operations`, { operations }),

    lookupDay: (plantId: string, date: string): Promise<ProductionDay | null> =>
        api.get(`${BASE}/days/lookup`, { params: { plantId, date } }),

    createDay: (payload: {
        plantId: string;
        productionDate: string;
        timeSlots?: ProductionTimeSlot[];
    }): Promise<ProductionDay> => api.post(`${BASE}/days`, payload),

    getDay: (dayId: string): Promise<ProductionDay> => api.get(`${BASE}/days/${dayId}`),

    getDays: (params: {
        plantId: string;
        from?: string;
        to?: string;
        status?: ProductionDayStatus;
        page?: number;
        limit?: number;
    }): Promise<ProductionDayPage> => api.get(`${BASE}/days`, { params }),

    getMonitor: (plantId: string, date: string): Promise<ProductionMonitorResponse | null> =>
        api.get(`${BASE}/monitor`, { params: { plantId, date } }),

    getBoard: (plantId: string, date: string): Promise<ProductionBoard | null> =>
        api.get(`${BASE}/board`, { params: { plantId, date } }),

    getReminderStatus: (plantId: string, date: string): Promise<ProductionReminderStatus> =>
        api.get(`${BASE}/reminders/status`, { params: { plantId, date } }),

    getReminderSettings: (plantId: string): Promise<ProductionReminderSettings> =>
        api.get(`${BASE}/reminders/settings`, { params: { plantId } }),

    updateReminderSettings: (
        payload: UpdateProductionReminderSettingsPayload
    ): Promise<ProductionReminderSettings['rule']> => api.put(`${BASE}/reminders/settings`, payload),

    sendReminderTest: (plantId: string, recipientId?: string): Promise<ProductionReminderTestResult> =>
        api.post(`${BASE}/reminders/test`, { plantId, ...(recipientId ? { recipientId } : {}) }),

    getScheduleTemplates: (plantId: string): Promise<ProductionScheduleTemplate[]> =>
        api.get(`${BASE}/schedule-templates`, { params: { plantId } }),

    updateScheduleTemplate: (
        plantId: string,
        weekday: number,
        payload: { isWorkingDay: boolean; timeSlots: ProductionTimeSlot[] }
    ): Promise<ProductionScheduleTemplate> => api.put(`${BASE}/schedule-templates/${weekday}`, { plantId, ...payload }),

    resetScheduleTemplate: (plantId: string, weekday: number): Promise<ProductionScheduleTemplate> =>
        api.delete(`${BASE}/schedule-templates/${weekday}`, { params: { plantId } }),

    getReport: (params: {
        plantId: string;
        from: string;
        to: string;
        scope?: ProductionReportScope;
    }): Promise<ProductionReport> => api.get(`${BASE}/reports/summary`, { params }),

    exportReport: (params: {
        plantId: string;
        from: string;
        to: string;
        scope?: ProductionReportScope;
    }): Promise<Blob> => api.get(`${BASE}/reports/export`, { params, responseType: 'blob' }),

    getQcReport: (params: {
        plantId: string;
        from: string;
        to: string;
        itemId?: string;
        lineId?: string;
        orderCode?: string;
    }): Promise<ProductionQcReport> => api.get(`${BASE}/qc/reports/summary`, { params }),

    exportQcReport: (params: {
        plantId: string;
        from: string;
        to: string;
        itemId?: string;
        lineId?: string;
        orderCode?: string;
    }): Promise<Blob> => api.get(`${BASE}/qc/reports/export`, { params, responseType: 'blob' }),

    getQcOpeningBalances: (plantId: string): Promise<ProductionQcOpeningBalanceList> =>
        api.get(`${BASE}/qc/opening-balances`, { params: { plantId } }),

    createManualQcOpeningBalance: (payload: {
        plantId: string;
        cutoffDate: string;
        note: string;
        entries: Array<{
            lineId: string;
            itemId?: string | null;
            orderCode?: string;
            mode: 'full' | 'backlog_only';
            passedQuantity: number;
            defectQuantity: number;
            pendingQuantity: number;
        }>;
    }): Promise<ProductionQcOpeningBalanceBatch> => api.post(`${BASE}/qc/opening-balances/manual`, payload),

    previewQcOpeningBalanceImport: (
        file: File,
        payload: { plantId: string; cutoffDate: string; note: string }
    ): Promise<ProductionQcOpeningBalancePreview> => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('plantId', payload.plantId);
        formData.append('cutoffDate', payload.cutoffDate);
        formData.append('note', payload.note);
        return api.post<ProductionQcOpeningBalancePreview, FormData>(
            `${BASE}/qc/opening-balances/import/preview`,
            formData,
            { headers: { 'Content-Type': 'multipart/form-data' } }
        );
    },

    confirmQcOpeningBalanceImport: (
        file: File,
        payload: { plantId: string; cutoffDate: string; note: string }
    ): Promise<ProductionQcOpeningBalanceBatch> => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('plantId', payload.plantId);
        formData.append('cutoffDate', payload.cutoffDate);
        formData.append('note', payload.note);
        return api.post<ProductionQcOpeningBalanceBatch, FormData>(
            `${BASE}/qc/opening-balances/import/confirm`,
            formData,
            { headers: { 'Content-Type': 'multipart/form-data' } }
        );
    },

    voidQcOpeningBalance: (id: string, reason: string): Promise<ProductionQcOpeningBalanceBatch> =>
        api.post(`${BASE}/qc/opening-balances/${id}/void`, { reason }),

    downloadQcOpeningBalanceTemplate: (plantId: string): Promise<Blob> =>
        api.get(`${BASE}/qc/opening-balances/template`, { params: { plantId }, responseType: 'blob' }),

    getOpeningBalances: (plantId: string): Promise<ProductionOpeningBalanceList> =>
        api.get(`${BASE}/opening-balances`, { params: { plantId } }),

    createManualOpeningBalance: (payload: {
        plantId: string;
        cutoffDate: string;
        note: string;
        entries: Array<{
            lineId: string;
            itemId?: string | null;
            orderCode?: string;
            quantity: number;
            unitPrice?: number | null;
        }>;
    }): Promise<ProductionOpeningBalanceBatch> => api.post(`${BASE}/opening-balances/manual`, payload),

    previewOpeningBalanceImport: (
        file: File,
        payload: { plantId: string; cutoffDate: string; note: string }
    ): Promise<ProductionOpeningBalancePreview> => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('plantId', payload.plantId);
        formData.append('cutoffDate', payload.cutoffDate);
        formData.append('note', payload.note);
        return api.post<ProductionOpeningBalancePreview, FormData>(
            `${BASE}/opening-balances/import/preview`,
            formData,
            { headers: { 'Content-Type': 'multipart/form-data' } }
        );
    },

    confirmOpeningBalanceImport: (
        file: File,
        payload: { plantId: string; cutoffDate: string; note: string }
    ): Promise<ProductionOpeningBalanceBatch> => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('plantId', payload.plantId);
        formData.append('cutoffDate', payload.cutoffDate);
        formData.append('note', payload.note);
        return api.post<ProductionOpeningBalanceBatch, FormData>(`${BASE}/opening-balances/import/confirm`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
    },

    voidOpeningBalance: (id: string, reason: string): Promise<ProductionOpeningBalanceBatch> =>
        api.post(`${BASE}/opening-balances/${id}/void`, { reason }),

    downloadOpeningBalanceTemplate: (plantId: string): Promise<Blob> =>
        api.get(`${BASE}/opening-balances/template`, { params: { plantId }, responseType: 'blob' }),

    lookupPlan: (plantId: string, date: string): Promise<ProductionPlan | null> =>
        api.get(`${BASE}/plans/lookup`, { params: { plantId, date } }),

    createPlan: (payload: { plantId: string; productionDate: string }): Promise<ProductionPlan> =>
        api.post(`${BASE}/plans`, payload),

    updatePlan: (
        id: string,
        payload: { revision: number; changeReason: string; allocations: ProductionPlanAllocationPayload[] }
    ): Promise<ProductionPlan> => api.put(`${BASE}/plans/${id}`, payload),

    publishPlan: (
        id: string,
        payload: { revision: number; note?: string }
    ): Promise<{
        plan: ProductionPlan;
        sync: { dayId: string; synchronizedLines: number; preservedLines: string[] };
    }> => api.post(`${BASE}/plans/${id}/publish`, payload),

    reopenPlan: (id: string, payload: { revision: number; reason: string }): Promise<ProductionPlan> =>
        api.post(`${BASE}/plans/${id}/reopen`, payload),

    carryOverPlan: (
        id: string,
        payload: { revision: number; sourcePlanId?: string }
    ): Promise<{
        plan: ProductionPlan;
        importedCount: number;
        importedQuantity: number;
        skippedCount: number;
        sourceProductionDate: string;
    }> => api.post(`${BASE}/plans/${id}/carry-over`, payload),

    submitDay: (dayId: string, note?: string): Promise<ProductionDay> =>
        api.post(`${BASE}/days/${dayId}/submit`, { note }),

    lockDay: (dayId: string, note?: string): Promise<ProductionDay> => api.post(`${BASE}/days/${dayId}/lock`, { note }),

    reopenDay: (dayId: string, note: string): Promise<ProductionDay> =>
        api.post(`${BASE}/days/${dayId}/reopen`, { note }),

    exportDay: (dayId: string): Promise<Blob> => api.get(`${BASE}/days/${dayId}/export`, { responseType: 'blob' }),

    updateTimeSlots: (dayId: string, timeSlots: ProductionTimeSlot[]): Promise<ProductionDay> =>
        api.patch(`${BASE}/days/${dayId}/time-slots`, { timeSlots }),

    applyScheduleTemplate: (dayId: string): Promise<ProductionDay> =>
        api.post(`${BASE}/days/${dayId}/apply-schedule-template`),

    // Biên chế chuyền của riêng một ngày — không đụng danh mục chuyền chung.
    addDayLine: (dayId: string, lineId: string): Promise<ProductionDay> =>
        api.post(`${BASE}/days/${dayId}/lines`, { lineId }),

    syncDayLineMetadata: (dayId: string): Promise<ProductionDay> =>
        api.post(`${BASE}/days/${dayId}/lines/sync-catalog`),

    removeDayLine: (dayId: string, lineId: string): Promise<ProductionDay> =>
        api.delete(`${BASE}/days/${dayId}/lines/${lineId}`),

    configureLine: (
        dayId: string,
        lineId: string,
        payload: ConfigureProductionLinePayload
    ): Promise<ProductionLineRecord> => api.put(`${BASE}/days/${dayId}/lines/${lineId}`, payload),

    createRun: (
        dayId: string,
        lineId: string,
        payload: { itemId: string; quotaQuantity: number; startedSlotKey: string; hourlyQuota?: number }
    ): Promise<ProductionLineRecord> => api.post(`${BASE}/days/${dayId}/lines/${lineId}/runs`, payload),

    configureOperationTracks: (
        dayId: string,
        lineId: string,
        payload: { runId: string; enabled: boolean; operations: ProductionOperationConfigPayload[] }
    ): Promise<ProductionLineRecord> => api.put(`${BASE}/days/${dayId}/lines/${lineId}/operation-tracks`, payload),

    correctLineSetup: (
        dayId: string,
        lineId: string,
        payload: { itemId: string; quotaQuantity: number; reason: string; confirmed: true; hourlyQuota?: number }
    ): Promise<ProductionLineRecord> => api.post(`${BASE}/days/${dayId}/lines/${lineId}/correct-setup`, payload),

    deleteRun: (dayId: string, lineId: string, runId: string): Promise<ProductionLineRecord> =>
        api.delete(`${BASE}/days/${dayId}/lines/${lineId}/runs/${runId}`),

    saveEntry: (
        dayId: string,
        lineId: string,
        slotKey: string,
        payload: SaveProductionEntryPayload
    ): Promise<ProductionLineRecord> =>
        api.put(`${BASE}/days/${dayId}/lines/${lineId}/entries/${encodeURIComponent(slotKey)}`, payload),

    deleteEntry: (dayId: string, lineId: string, entryId: string): Promise<ProductionLineRecord> =>
        api.delete(`${BASE}/days/${dayId}/lines/${lineId}/entries/${entryId}`),

    saveOperationEntries: (
        dayId: string,
        lineId: string,
        slotKey: string,
        entries: SaveProductionOperationEntryPayload[]
    ): Promise<ProductionLineRecord> =>
        api.put(`${BASE}/days/${dayId}/lines/${lineId}/operation-entries/${encodeURIComponent(slotKey)}`, {
            entries,
        }),

    deleteOperationEntry: (dayId: string, lineId: string, entryId: string): Promise<ProductionLineRecord> =>
        api.delete(`${BASE}/days/${dayId}/lines/${lineId}/operation-entries/${entryId}`),

    saveQcEntry: (
        dayId: string,
        lineId: string,
        slotKey: string,
        payload: SaveProductionQcEntryPayload
    ): Promise<ProductionLineRecord> =>
        api.put(`${BASE}/days/${dayId}/lines/${lineId}/qc-entries/${encodeURIComponent(slotKey)}`, payload),

    deleteQcEntry: (dayId: string, lineId: string, entryId: string): Promise<ProductionLineRecord> =>
        api.delete(`${BASE}/days/${dayId}/lines/${lineId}/qc-entries/${entryId}`),

    saveQcRecord: (
        dayId: string,
        lineId: string,
        slotKey: string,
        payload: SaveProductionQcRecordPayload
    ): Promise<ProductionLineRecord> =>
        api.put(`${BASE}/days/${dayId}/lines/${lineId}/qc-records/${encodeURIComponent(slotKey)}`, payload),

    deleteQcRecord: (dayId: string, lineId: string, slotKey: string): Promise<ProductionLineRecord> =>
        api.delete(`${BASE}/days/${dayId}/lines/${lineId}/qc-records/${encodeURIComponent(slotKey)}`),
};
