import React, { lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    App,
    Button,
    Card,
    Dropdown,
    Empty,
    Grid,
    Modal,
    Result,
    Segmented,
    Select,
    Table,
    Tag,
    Typography,
    type TableColumnsType,
} from 'antd';
import {
    AuditOutlined,
    DownloadOutlined,
    EnvironmentOutlined,
    FilePdfOutlined,
    MoreOutlined,
    QrcodeOutlined,
    ReloadOutlined,
    SaveOutlined,
    ScanOutlined,
    SwapOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import LazyBoundary from '../components/shared/LazyBoundary';
import PageHeader from '../components/shared/PageHeader';
import QrCameraScanner from '../components/QrCameraScanner';
import QrSweepScanner, { type QrSweepTelemetry } from '../components/QrSweepScanner';
import StocktakeCoverageMap, {
    ZoneAnchorModal,
    type RuntimeCoverageZone,
} from '../components/stocktake/StocktakeCoverageMap';
import StocktakePositionProposalPanel from '../components/stocktake/StocktakePositionProposalPanel';
import { useAuth } from '../core/contexts/AuthContext';
import { can, hasDirectorAccess } from '../core/lib/permissions';
import { resolveAssetByScan } from '../core/lib/qrScan';
import { recordQrScan } from '../core/lib/qrScanAudit';
import { getCurrentCoords } from '../core/lib/geolocation';
import { evaluateScanLocation } from '../core/lib/locationMismatch';
import { ASSET_STATUS_LABEL, isAssetClosedLifecycle } from '../core/constants';
import { assetService } from '../core/services/asset.service';
import { floorMapService } from '../core/services/floor-map.service';
import { plantService, stocktakeService } from '../core/services';
import { transferService } from '../core/services/transfer.service';
import {
    type Asset,
    type CreateStocktakeSessionPayload,
    type CreateTransferPayload,
    type StocktakeSession,
    type StocktakeSessionItem,
    type StocktakePositionProposal,
} from '../core/types';

const QrQuickUpdateModal = lazy(() => import('../components/QrQuickUpdateModal'));
const TransferModal = lazy(() => import('../components/transfer/TransferModal'));

const { Text } = Typography;
const { useBreakpoint } = Grid;

const ALL_AREAS = '__all__';
const EMPTY_AREA = '__empty__';
const INITIAL_SWEEP_TELEMETRY: QrSweepTelemetry = {
    engine: 'zxing',
    framesProcessed: 0,
    detections: 0,
    uniqueDetected: 0,
};

type StocktakeTab = 'missing' | 'anomalies' | 'present';
type StocktakeScanMode = 'single' | 'sweep';
type ScanType = 'present' | 'wrong_area' | 'wrong_plant' | 'unknown';
type FeedbackKind = ScanType | 'duplicate';

type ScanRecord = {
    key: string;
    type: ScanType;
    rawValue: string;
    asset?: Asset;
    message: string;
    gpsNote?: string;
    scannedAt: string;
    coverageZoneId?: string;
    coverageZoneName?: string;
};

type QueuedScan = {
    rawValue: string;
    coverageZoneId?: string;
    coverageZoneName?: string;
};

type ScanFeedback = {
    kind: FeedbackKind;
    code: string;
    note: string;
    at: number;
};

const FLASH_META: Record<FeedbackKind, { label: string; cls: string }> = {
    present: { label: 'Có mặt', cls: 'stocktake-flash--present' },
    wrong_area: { label: 'Sai khu vực', cls: 'stocktake-flash--wrong_area' },
    wrong_plant: { label: 'Sai cơ sở', cls: 'stocktake-flash--wrong_plant' },
    unknown: { label: 'Không rõ mã', cls: 'stocktake-flash--unknown' },
    duplicate: { label: 'Đã quét rồi', cls: 'stocktake-flash--duplicate' },
};

const normalizeArea = (value?: string | null) => (value ?? '').trim();
const areaKey = (value?: string | null) => normalizeArea(value).toLowerCase();
const areaValue = (value?: string | null) => normalizeArea(value) || EMPTY_AREA;
const areaLabel = (value?: string | null) =>
    value === EMPTY_AREA
        ? 'Chưa gắn khu vực'
        : value === ALL_AREAS
          ? 'Tất cả khu vực'
          : normalizeArea(value) || 'Tất cả';
const assetLocation = (asset: Asset) => `${asset.plant?.name || 'Chưa rõ cơ sở'} / ${asset.area || 'Chưa gắn khu vực'}`;
const formatTime = (value?: string) => (value ? new Date(value).toLocaleString('vi-VN') : '-');
const formatClock = (value?: string | null) =>
    value ? new Date(value).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '-';

const removeVietnameseMarks = (value: string) =>
    value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');

const csvEscape = (value: unknown) => {
    const text = String(value ?? '');
    return `"${text.replace(/"/g, '""')}"`;
};

const extractZoneAnchorCode = (rawValue: string) => {
    const value = rawValue.trim();
    try {
        const url = new URL(value);
        const queryCode = url.searchParams.get('zone');
        if (queryCode) return queryCode.trim().toUpperCase();
        const pathMatch = url.pathname.match(/\/stocktake\/zone\/([^/]+)/i);
        if (pathMatch?.[1]) return decodeURIComponent(pathMatch[1]).trim().toUpperCase();
    } catch {
        // Chap nhan ma anchor tho khi nhap tay.
    }
    const rawMatch = value.match(/^(?:HD-ZONE:)?(ZN-[A-Z0-9_-]{6,32})$/i);
    return rawMatch?.[1]?.toUpperCase();
};

const scopeMatches = (asset: Asset, selectedArea: string) =>
    selectedArea === ALL_AREAS || areaKey(asset.area) === areaKey(selectedArea === EMPTY_AREA ? '' : selectedArea);

const pointInsideCoverageZone = (point: { x: number; y: number } | null | undefined, zone: RuntimeCoverageZone) =>
    Boolean(
        point &&
        point.x >= (zone.x ?? 0) &&
        point.x <= (zone.x ?? 0) + (zone.w ?? 0) &&
        point.y >= (zone.y ?? 0) &&
        point.y <= (zone.y ?? 0) + (zone.h ?? 0)
    );

const buildAvailablePositionSlots = (
    zone: RuntimeCoverageZone,
    requiredCount: number,
    occupied: Array<{ x: number; y: number }>
) => {
    const x = zone.x ?? 0;
    const y = zone.y ?? 0;
    const width = zone.w ?? 0;
    const height = zone.h ?? 0;
    if (!width || !height || !requiredCount) return [];

    const targetSlots = Math.max(24, (occupied.length + requiredCount) * 4);
    const aspect = Math.max(0.35, width / Math.max(height, 1));
    const columns = Math.max(2, Math.ceil(Math.sqrt(targetSlots * aspect)));
    const rows = Math.max(2, Math.ceil(targetSlots / columns));
    const cellWidth = width / columns;
    const cellHeight = height / rows;
    const clearance = Math.max(0.35, Math.min(cellWidth, cellHeight) * 0.55);
    const candidates: Array<{ x: number; y: number }> = [];

    for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
            const slot = {
                x: Number((x + cellWidth * (column + 0.5)).toFixed(3)),
                y: Number((y + cellHeight * (row + 0.5)).toFixed(3)),
            };
            const overlaps = occupied.some((point) => Math.hypot(point.x - slot.x, point.y - slot.y) < clearance);
            if (!overlaps) candidates.push(slot);
        }
    }

    return candidates.slice(0, requiredCount);
};

const StocktakePage: React.FC = () => {
    const screens = useBreakpoint();
    const isDesktop = Boolean(screens.lg);
    const { role, user } = useAuth();
    const canUseStocktake = can(role, 'stocktake');
    const canReviewPositions = hasDirectorAccess(role);
    const { message, modal } = App.useApp();
    const queryClient = useQueryClient();
    const [searchParams, setSearchParams] = useSearchParams();
    const requestedZoneAnchor = searchParams.get('zone')?.trim().toUpperCase() || '';

    const [selectedPlantId, setSelectedPlantId] = useState(user?.plantId ?? '');
    const [selectedArea, setSelectedArea] = useState<string>(ALL_AREAS);
    const [expectedAssets, setExpectedAssets] = useState<Asset[]>([]);
    const [scanRecords, setScanRecords] = useState<ScanRecord[]>([]);
    const [started, setStarted] = useState(false);
    const [startedAt, setStartedAt] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<StocktakeTab>('missing');
    const [resolving, setResolving] = useState(false);
    const [quickAsset, setQuickAsset] = useState<Asset | null>(null);
    const [transferTarget, setTransferTarget] = useState<Asset | null>(null);
    const [savedSessionId, setSavedSessionId] = useState<string | null>(null);
    const [historyDetail, setHistoryDetail] = useState<StocktakeSession | null>(null);
    const [lastScan, setLastScan] = useState<ScanFeedback | null>(null);
    const [scanMode, setScanMode] = useState<StocktakeScanMode>('single');
    const [sweepTelemetry, setSweepTelemetry] = useState<QrSweepTelemetry>(INITIAL_SWEEP_TELEMETRY);
    const [queuedScanCount, setQueuedScanCount] = useState(0);
    const [duplicateScanCount, setDuplicateScanCount] = useState(0);
    const [coverageZones, setCoverageZones] = useState<RuntimeCoverageZone[]>([]);
    const [activeCoverageZoneId, setActiveCoverageZoneId] = useState<string | null>(null);
    const [anchorPrintZone, setAnchorPrintZone] = useState<RuntimeCoverageZone | null>(null);
    const scanQueueRef = useRef<QueuedScan[]>([]);
    const pendingRawValuesRef = useRef(new Set<string>());
    const scannedAssetIdsRef = useRef(new Set<string>());
    const processingQueueRef = useRef(false);
    const processScanQueueRef = useRef<() => Promise<void>>(async () => undefined);
    const scanGenerationRef = useRef(0);
    const coverageWarningShownRef = useRef(false);
    const expectedCoverageZoneByAssetRef = useRef(new Map<string, { zoneId: string; zoneName: string }>());
    // Mobile: đang kiểm thì thu khối chọn phạm vi thành 1 dòng, bấm "Đổi phạm vi" mới mở lại.
    const [scopeEditing, setScopeEditing] = useState(false);

    const { data: plants = [] } = useQuery({
        queryKey: ['plants'],
        queryFn: () => plantService.getAll(),
    });

    const plantAssetsQuery = useQuery({
        queryKey: ['stocktake-assets', selectedPlantId],
        queryFn: () => assetService.getAll({ plantId: selectedPlantId, page: 1, limit: 5000 }),
        enabled: Boolean(selectedPlantId),
    });

    const stocktakeHistoryQuery = useQuery({
        queryKey: ['stocktake-history', selectedPlantId],
        queryFn: () => stocktakeService.getAll({ plantId: selectedPlantId, page: 1, limit: 5 }),
        enabled: Boolean(selectedPlantId),
    });

    const floorMapQuery = useQuery({
        queryKey: ['floor-map', selectedPlantId],
        queryFn: () => floorMapService.getMap(selectedPlantId),
        enabled: Boolean(selectedPlantId),
    });

    const requestedZoneQuery = useQuery({
        queryKey: ['floor-zone-anchor', requestedZoneAnchor],
        queryFn: () => floorMapService.resolveZoneAnchor(requestedZoneAnchor),
        enabled: Boolean(requestedZoneAnchor),
        retry: false,
    });

    const createTransferMutation = useMutation({
        mutationFn: transferService.create,
        onSuccess: (_transfer, payload) => {
            queryClient.invalidateQueries({ queryKey: ['transfers'] });
            [...(payload.assetIds ?? []), payload.assetId]
                .filter(Boolean)
                .forEach((assetId) => queryClient.invalidateQueries({ queryKey: ['asset', assetId] }));
            queryClient.invalidateQueries({ queryKey: ['assets'] });
            message.success('Đã tạo lệnh điều chuyển');
            setTransferTarget(null);
        },
    });

    const saveStocktakeMutation = useMutation({
        mutationFn: stocktakeService.create,
        onSuccess: (session) => {
            setSavedSessionId(session.id);
            queryClient.invalidateQueries({ queryKey: ['stocktake-history'] });
            message.success('Đã lưu lịch sử kiểm kê');
        },
    });

    const reviewPositionMutation = useMutation({
        mutationFn: ({
            sessionId,
            action,
            assetIds,
        }: {
            sessionId: string;
            action: 'approve' | 'reject';
            assetIds: string[];
        }) => stocktakeService.reviewPositionProposals(sessionId, { action, assetIds }),
        onSuccess: (result) => {
            setHistoryDetail(result.session);
            queryClient.invalidateQueries({ queryKey: ['stocktake-history'] });
            queryClient.invalidateQueries({ queryKey: ['floor-map'] });
            queryClient.invalidateQueries({ queryKey: ['floor-map-reality'] });
            queryClient.invalidateQueries({ queryKey: ['assets'] });
            const { approved, rejected, conflicts } = result.summary;
            if (conflicts) {
                message.warning(
                    `Đã áp dụng ${approved}, từ chối ${rejected}; ${conflicts} máy có xung đột cần kiểm tra`
                );
            } else {
                message.success(approved ? `Đã cập nhật vị trí cho ${approved} máy` : `Đã từ chối ${rejected} đề xuất`);
            }
        },
    });

    const resetScanRuntime = useCallback(() => {
        scanGenerationRef.current += 1;
        scanQueueRef.current = [];
        pendingRawValuesRef.current.clear();
        scannedAssetIdsRef.current.clear();
        expectedCoverageZoneByAssetRef.current.clear();
        processingQueueRef.current = false;
        coverageWarningShownRef.current = false;
        setQueuedScanCount(0);
        setDuplicateScanCount(0);
        setResolving(false);
        setSweepTelemetry(INITIAL_SWEEP_TELEMETRY);
        setCoverageZones([]);
        setActiveCoverageZoneId(null);
    }, []);

    useEffect(() => {
        setSelectedArea(ALL_AREAS);
        setStarted(false);
        setExpectedAssets([]);
        setScanRecords([]);
        setSavedSessionId(null);
        setLastScan(null);
        resetScanRuntime();
    }, [resetScanRuntime, selectedPlantId]);

    useEffect(() => {
        const resolved = requestedZoneQuery.data;
        if (!resolved) return;
        if (started && selectedPlantId && resolved.plant.id !== selectedPlantId) {
            message.error(`QR vùng thuộc ${resolved.plant.name}, không khớp phiên kiểm kê đang mở`);
            return;
        }
        if (resolved.plant.id !== selectedPlantId) {
            setSelectedPlantId(resolved.plant.id);
        }
        setSelectedArea(ALL_AREAS);
    }, [message, requestedZoneQuery.data, selectedPlantId, started]);

    useEffect(() => {
        if (!requestedZoneAnchor || !requestedZoneQuery.isError) return;
        message.error('QR khu vực không hợp lệ hoặc khu vực đã bị xóa');
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('zone');
        setSearchParams(nextParams, { replace: true });
    }, [message, requestedZoneAnchor, requestedZoneQuery.isError, searchParams, setSearchParams]);

    const handleAreaChange = (value: string) => {
        setSelectedArea(value);
        setStarted(false);
        setExpectedAssets([]);
        setScanRecords([]);
        setSavedSessionId(null);
        setLastScan(null);
        resetScanRuntime();
    };

    const selectedPlant = useMemo(
        () => plants.find((plant) => plant.id === selectedPlantId),
        [plants, selectedPlantId]
    );

    const plantAssets = useMemo(() => plantAssetsQuery.data?.data ?? [], [plantAssetsQuery.data?.data]);

    const areaOptions = useMemo(() => {
        const values = new Map<string, string>();
        plantAssets.forEach((asset) => {
            if (isAssetClosedLifecycle(asset.status)) return;
            const value = areaValue(asset.area);
            values.set(value.toLowerCase(), value);
        });

        return [
            { value: ALL_AREAS, label: 'Tất cả khu vực' },
            ...Array.from(values.values())
                .sort((a, b) => areaLabel(a).localeCompare(areaLabel(b), 'vi'))
                .map((value) => ({ value, label: areaLabel(value) })),
        ];
    }, [plantAssets]);

    const expectedMap = useMemo(() => new Map(expectedAssets.map((asset) => [asset.id, asset])), [expectedAssets]);
    const presentRecords = useMemo(() => scanRecords.filter((record) => record.type === 'present'), [scanRecords]);
    const anomalyRecords = useMemo(() => scanRecords.filter((record) => record.type !== 'present'), [scanRecords]);
    const presentIdSet = useMemo(
        () => new Set(presentRecords.map((record) => record.asset?.id).filter(Boolean)),
        [presentRecords]
    );
    const missingAssets = useMemo(
        () => expectedAssets.filter((asset) => !presentIdSet.has(asset.id)),
        [expectedAssets, presentIdSet]
    );

    const stats = {
        expected: expectedAssets.length,
        scanned: scanRecords.length,
        present: presentRecords.length,
        missing: missingAssets.length,
        anomalies: anomalyRecords.length,
    };
    const presentPct = stats.expected ? Math.round((stats.present / stats.expected) * 100) : 0;
    const coverageCompletedCount = coverageZones.filter((zone) => zone.status === 'completed').length;
    const coveragePercent = coverageZones.length
        ? Math.round((coverageCompletedCount / coverageZones.length) * 100)
        : 0;
    const activeCoverageZone = coverageZones.find((zone) => zone.zoneId === activeCoverageZoneId);

    const flashFeedback = (kind: FeedbackKind, code: string, note: string) =>
        setLastScan({ kind, code, note, at: Date.now() });

    const appendRecord = (record: Omit<ScanRecord, 'key' | 'scannedAt'>) => {
        setSavedSessionId(null);
        setScanRecords((current) => [
            {
                ...record,
                key: `${Date.now()}-${current.length}`,
                scannedAt: new Date().toISOString(),
            },
            ...current,
        ]);
    };

    const handleStart = async () => {
        if (!selectedPlantId) {
            message.warning('Chọn cơ sở trước khi bắt đầu kiểm kê');
            return;
        }

        const response = plantAssetsQuery.data ?? (await plantAssetsQuery.refetch()).data;
        const scopedAssets = (response?.data ?? []).filter(
            (asset) => !isAssetClosedLifecycle(asset.status) && scopeMatches(asset, selectedArea)
        );
        const floorMapResponse = floorMapQuery.data ?? (await floorMapQuery.refetch()).data;
        const expectedIds = new Set(scopedAssets.map((asset) => asset.id));
        const scopedFloorZones = (floorMapResponse?.zones ?? []).filter(
            (zone) => selectedArea === ALL_AREAS || areaKey(zone.name) === areaKey(areaLabel(selectedArea))
        );
        const expectedByZone = new Map(scopedFloorZones.map((zone) => [zone.id, 0]));
        const expectedCoverageByAsset = new Map<string, { zoneId: string; zoneName: string }>();
        (floorMapResponse?.machines ?? []).forEach((machine) => {
            if (!expectedIds.has(machine.id)) return;

            const spatialZone = machine.floorPos
                ? scopedFloorZones
                      .filter(
                          (zone) =>
                              machine.floorPos!.x >= zone.x &&
                              machine.floorPos!.x <= zone.x + zone.w &&
                              machine.floorPos!.y >= zone.y &&
                              machine.floorPos!.y <= zone.y + zone.h
                      )
                      .sort((a, b) => a.w * a.h - b.w * b.h)[0]
                : undefined;
            const assignedZone =
                spatialZone ?? scopedFloorZones.find((zone) => areaKey(zone.name) === areaKey(machine.area));
            if (assignedZone) {
                expectedByZone.set(assignedZone.id, (expectedByZone.get(assignedZone.id) ?? 0) + 1);
                expectedCoverageByAsset.set(machine.id, { zoneId: assignedZone.id, zoneName: assignedZone.name });
            }
        });
        const nextCoverageZones: RuntimeCoverageZone[] = scopedFloorZones.map((zone) => {
            return {
                zoneId: zone.id,
                name: zone.name,
                anchorCode: zone.anchorCode,
                x: zone.x,
                y: zone.y,
                w: zone.w,
                h: zone.h,
                status: 'pending',
                expectedCount: expectedByZone.get(zone.id) ?? 0,
                scannedCount: 0,
            };
        });
        const requestedZone = nextCoverageZones.find((zone) => zone.anchorCode?.toUpperCase() === requestedZoneAnchor);
        const initialZone = requestedZone ?? (nextCoverageZones.length === 1 ? nextCoverageZones[0] : undefined);
        if (initialZone) {
            initialZone.status = 'in_progress';
            initialZone.activationSource = requestedZone ? 'anchor' : 'auto';
            initialZone.startedAt = new Date().toISOString();
        }

        resetScanRuntime();
        expectedCoverageZoneByAssetRef.current = expectedCoverageByAsset;
        setExpectedAssets(scopedAssets);
        setCoverageZones(nextCoverageZones);
        setActiveCoverageZoneId(initialZone?.zoneId ?? null);
        setScanRecords([]);
        setStarted(true);
        setStartedAt(new Date().toISOString());
        setSavedSessionId(null);
        setActiveTab('missing');
        setLastScan(null);
        setScopeEditing(false);
        if (requestedZoneAnchor && initialZone) {
            const nextParams = new URLSearchParams(searchParams);
            nextParams.delete('zone');
            setSearchParams(nextParams, { replace: true });
        }
        message.success(`Bắt đầu kiểm kê ${scopedAssets.length} máy`);
    };

    const activateCoverageZone = (
        zone: RuntimeCoverageZone,
        activationSource: RuntimeCoverageZone['activationSource'] = 'manual'
    ) => {
        if (!started) {
            message.warning('Bắt đầu phiên kiểm kê trước khi chọn vùng');
            return;
        }
        if (zone.status === 'completed') {
            message.info(`Vùng "${zone.name}" đã hoàn tất. Bấm Mở lại nếu cần quét bổ sung.`);
            return;
        }
        const now = new Date().toISOString();
        setCoverageZones((current) =>
            current.map((item) =>
                item.zoneId === zone.zoneId
                    ? {
                          ...item,
                          status: 'in_progress',
                          activationSource,
                          startedAt: item.startedAt ?? now,
                      }
                    : item
            )
        );
        setActiveCoverageZoneId(zone.zoneId);
        coverageWarningShownRef.current = false;
        setSavedSessionId(null);
        message.success(`Đang kiểm kê vùng: ${zone.name}`);
    };

    const applyCompleteCoverageZone = (zone: RuntimeCoverageZone) => {
        const now = new Date().toISOString();
        setCoverageZones((current) =>
            current.map((item) =>
                item.zoneId === zone.zoneId ? { ...item, status: 'completed', completedAt: now } : item
            )
        );
        setActiveCoverageZoneId((current) => (current === zone.zoneId ? null : current));
        setSavedSessionId(null);
        message.success(`Đã xác nhận đi hết vùng: ${zone.name}`);
    };

    const completeCoverageZone = (zone: RuntimeCoverageZone) => {
        if (processingQueueRef.current || scanQueueRef.current.length > 0) {
            message.warning('Đợi xử lý hết QR trong hàng đợi trước khi hoàn tất vùng');
            return;
        }
        if (zone.scannedCount < zone.expectedCount) {
            modal.confirm({
                title: `Vùng ${zone.name} còn ${zone.expectedCount - zone.scannedCount} máy chưa thấy`,
                content:
                    'Chỉ xác nhận hoàn tất nếu bạn đã đi hết vùng và các máy chưa thấy thực sự có khả năng bị thiếu. Coverage dùng để phân biệt thiếu máy với chưa kiểm tra tới.',
                okText: 'Đã đi hết vùng',
                cancelText: 'Quét tiếp',
                okButtonProps: { danger: true },
                onOk: () => applyCompleteCoverageZone(zone),
            });
            return;
        }
        applyCompleteCoverageZone(zone);
    };

    const reopenCoverageZone = (zone: RuntimeCoverageZone) => {
        const now = new Date().toISOString();
        setCoverageZones((current) =>
            current.map((item) =>
                item.zoneId === zone.zoneId
                    ? {
                          ...item,
                          status: 'in_progress',
                          activationSource: 'manual',
                          startedAt: item.startedAt ?? now,
                          completedAt: undefined,
                      }
                    : item
            )
        );
        setActiveCoverageZoneId(zone.zoneId);
        setSavedSessionId(null);
    };

    const activateZoneByAnchor = (anchorCode: string) => {
        const zone = coverageZones.find((item) => item.anchorCode?.toUpperCase() === anchorCode.toUpperCase());
        if (!zone) {
            message.warning('QR vùng không thuộc phạm vi kiểm kê hiện tại');
            return;
        }
        activateCoverageZone(zone, 'anchor');
        flashFeedback('present', zone.anchorCode || anchorCode, `Đã vào vùng ${zone.name}`);
    };

    const resolveDetectedValue = async (queuedScan: QueuedScan, generation: number) => {
        const { rawValue, coverageZoneId, coverageZoneName } = queuedScan;
        const coverageFields = { coverageZoneId, coverageZoneName };
        setResolving(true);
        try {
            const { asset, ambiguous, publicId, labelId, source, inactiveLabelStatus } =
                await resolveAssetByScan(rawValue);
            if (generation !== scanGenerationRef.current) return;
            const logBase = {
                rawValue,
                publicId,
                labelId,
                action: 'stocktake' as const,
                source,
                metadata: { selectedPlantId, selectedArea, coverageZoneId, coverageZoneName },
            };

            if (!asset) {
                const inactiveMsg = inactiveLabelStatus
                    ? 'Tem QR này đã bị thay thế/thu hồi — dùng tem mới đang dán trên máy'
                    : '';
                const unknownMsg = inactiveMsg || (ambiguous ? 'Mã khớp nhiều máy' : 'Không xác định được máy');
                recordQrScan({
                    ...logBase,
                    result: ambiguous ? 'ambiguous' : 'not_found',
                });
                appendRecord({
                    type: 'unknown',
                    rawValue,
                    message: unknownMsg,
                    ...coverageFields,
                });
                flashFeedback('unknown', rawValue.length > 28 ? `${rawValue.slice(0, 28)}…` : rawValue, unknownMsg);
                setActiveTab('anomalies');
                message.warning(unknownMsg);
                return;
            }

            if (scannedAssetIdsRef.current.has(asset.id)) {
                setDuplicateScanCount((current) => current + 1);
                recordQrScan({
                    ...logBase,
                    assetId: asset.id,
                    result: 'duplicate',
                });
                flashFeedback('duplicate', asset.machineCode, `"${asset.name}" đã điểm danh trong phiên này`);
                message.info(`"${asset.name}" đã quét rồi`);
                return;
            }

            // Danh dau ngay khi resolve xong, khong doi React render de ngan hai ma trong queue cung ghi mot may.
            scannedAssetIdsRef.current.add(asset.id);
            if (coverageZoneId) {
                setCoverageZones((current) =>
                    current.map((zone) =>
                        zone.zoneId === coverageZoneId ? { ...zone, scannedCount: zone.scannedCount + 1 } : zone
                    )
                );
            }

            // Đối chiếu GPS: cơ sở gần nhất theo định vị vs cơ sở hệ thống của máy.
            const coords = await getCurrentCoords();
            if (generation !== scanGenerationRef.current) return;
            const loc = evaluateScanLocation({
                coords,
                plants,
                officialPlantId: asset.plant?.id ?? asset.plantId,
            });
            const gpsNote = loc.mismatch
                ? `GPS: máy đang ở ${loc.nearestPlant?.name || 'cơ sở khác'}${
                      typeof loc.distanceM === 'number' ? ` (~${loc.distanceM}m)` : ''
                  }`
                : undefined;

            const expectedCoverageZone = expectedCoverageZoneByAssetRef.current.get(asset.id);
            if (
                expectedMap.has(asset.id) &&
                coverageZoneId &&
                expectedCoverageZone &&
                expectedCoverageZone.zoneId !== coverageZoneId
            ) {
                const coverageMessage = `Phát hiện tại ${coverageZoneName || 'vùng đang quét'}, sơ đồ kỳ vọng ${expectedCoverageZone.zoneName}`;
                recordQrScan({
                    ...logBase,
                    assetId: asset.id,
                    result: 'wrong_area',
                    metadata: {
                        ...logBase.metadata,
                        expectedCoverageZoneId: expectedCoverageZone.zoneId,
                        expectedCoverageZoneName: expectedCoverageZone.zoneName,
                    },
                });
                appendRecord({
                    type: 'wrong_area',
                    rawValue,
                    asset,
                    message: coverageMessage,
                    gpsNote,
                    ...coverageFields,
                });
                flashFeedback('wrong_area', asset.machineCode, coverageMessage);
                setActiveTab('anomalies');
                message.warning(`Sai vùng coverage: ${asset.machineCode}`);
                return;
            }

            if (expectedMap.has(asset.id)) {
                recordQrScan({
                    ...logBase,
                    assetId: asset.id,
                    result: 'present',
                });
                appendRecord({
                    type: 'present',
                    rawValue,
                    asset,
                    message: 'Có mặt trong phạm vi kiểm kê',
                    gpsNote,
                    ...coverageFields,
                });
                flashFeedback('present', asset.machineCode, gpsNote ? `${asset.name} — ${gpsNote}` : asset.name);
                if (gpsNote) {
                    setActiveTab('anomalies');
                    message.warning(`Có mặt nhưng GPS lệch: ${asset.machineCode}`);
                } else {
                    message.success(`Có mặt: ${asset.machineCode}`);
                }
                return;
            }

            if (asset.plantId === selectedPlantId) {
                const areaMsg =
                    selectedArea === ALL_AREAS
                        ? 'Không thuộc danh sách kỳ vọng'
                        : `Sai khu vực, đang ở ${asset.area || 'chưa gắn khu vực'}`;
                recordQrScan({
                    ...logBase,
                    assetId: asset.id,
                    result: 'wrong_area',
                    metadata: { selectedPlantId, selectedArea, currentArea: asset.area },
                });
                appendRecord({
                    type: 'wrong_area',
                    rawValue,
                    asset,
                    message: areaMsg,
                    gpsNote,
                    ...coverageFields,
                });
                flashFeedback('wrong_area', asset.machineCode, areaMsg);
                setActiveTab('anomalies');
                message.warning(`Sai khu vực: ${asset.machineCode}`);
                return;
            }

            recordQrScan({
                ...logBase,
                assetId: asset.id,
                result: 'wrong_plant',
                metadata: { selectedPlantId, selectedArea, currentPlantId: asset.plantId },
            });
            appendRecord({
                type: 'wrong_plant',
                rawValue,
                asset,
                message: `Sai cơ sở, đang thuộc ${asset.plant?.name || 'cơ sở khác'}`,
                gpsNote,
                ...coverageFields,
            });
            flashFeedback('wrong_plant', asset.machineCode, `Đang thuộc ${asset.plant?.name || 'cơ sở khác'}`);
            setActiveTab('anomalies');
            message.error(`Sai vị trí: ${asset.machineCode}`);
        } finally {
            setResolving(false);
        }
    };

    processScanQueueRef.current = async () => {
        if (processingQueueRef.current) return;
        processingQueueRef.current = true;
        const generation = scanGenerationRef.current;

        try {
            while (generation === scanGenerationRef.current && scanQueueRef.current.length > 0) {
                const queuedScan = scanQueueRef.current.shift();
                setQueuedScanCount(scanQueueRef.current.length);
                if (!queuedScan) continue;

                try {
                    await resolveDetectedValue(queuedScan, generation);
                } catch (error) {
                    message.error(error instanceof Error ? error.message : 'Không xử lý được mã vừa quét');
                } finally {
                    pendingRawValuesRef.current.delete(queuedScan.rawValue);
                }
            }
        } finally {
            if (generation === scanGenerationRef.current) {
                processingQueueRef.current = false;
                setResolving(false);
            }
        }
    };

    const handleDetected = (rawValue: string) => {
        if (!started) {
            message.warning('Bấm Bắt đầu trước khi quét kiểm kê');
            return;
        }

        const value = rawValue.trim();
        if (!value) return;
        const zoneAnchorCode = extractZoneAnchorCode(value);
        if (zoneAnchorCode) {
            activateZoneByAnchor(zoneAnchorCode);
            return;
        }
        if (pendingRawValuesRef.current.has(value)) return;

        if (coverageZones.length && !activeCoverageZone && !coverageWarningShownRef.current) {
            coverageWarningShownRef.current = true;
            message.warning(
                'Chưa chọn vùng coverage. Máy vẫn được ghi nhận nhưng chưa có bằng chứng đã đi qua vùng nào.'
            );
        }

        pendingRawValuesRef.current.add(value);
        scanQueueRef.current.push({
            rawValue: value,
            coverageZoneId: activeCoverageZone?.zoneId,
            coverageZoneName: activeCoverageZone?.name,
        });
        setQueuedScanCount(scanQueueRef.current.length);
        void processScanQueueRef.current();
    };

    const handleUpdateAreaToScope = async (asset: Asset) => {
        if (asset.plantId !== selectedPlantId) {
            message.warning('Máy thuộc cơ sở khác, nên tạo lệnh điều chuyển thay vì sửa khu vực trực tiếp');
            return;
        }
        if (selectedArea === ALL_AREAS) {
            message.warning('Chọn một khu vực cụ thể trước khi cập nhật khu vực');
            return;
        }

        const nextArea = selectedArea === EMPTY_AREA ? '' : selectedArea;
        const updated = await assetService.update(asset.id, { area: nextArea });
        setScanRecords((current) =>
            current.map((record) => (record.asset?.id === asset.id ? { ...record, asset: updated } : record))
        );
        setExpectedAssets((current) => current.map((item) => (item.id === asset.id ? updated : item)));
        queryClient.invalidateQueries({ queryKey: ['assets'] });
        queryClient.invalidateQueries({ queryKey: ['asset', asset.id] });
        message.success(`Đã cập nhật khu vực "${asset.name}"`);
    };

    const handleTransferSubmit = async (payload: CreateTransferPayload) => {
        await createTransferMutation.mutateAsync(payload);
    };

    const exportRows = useMemo(() => {
        const missing = missingAssets.map((asset) => {
            const expectedCoverage = expectedCoverageZoneByAssetRef.current.get(asset.id);
            return {
                group: 'Thieu',
                code: asset.machineCode,
                name: asset.name,
                plant: asset.plant?.name ?? '',
                area: asset.area ?? '',
                coverage: expectedCoverage?.zoneName ?? '',
                status: ASSET_STATUS_LABEL[asset.status],
                note: 'Chua quet thay trong pham vi kiem ke',
                scannedAt: '',
            };
        });
        const anomalies = anomalyRecords.map((record) => ({
            group: 'Bat thuong',
            code: record.asset?.machineCode ?? record.rawValue,
            name: record.asset?.name ?? 'Khong xac dinh',
            plant: record.asset?.plant?.name ?? '',
            area: record.asset?.area ?? '',
            coverage: record.coverageZoneName ?? '',
            status: record.asset ? ASSET_STATUS_LABEL[record.asset.status] : '',
            note: record.message,
            scannedAt: formatTime(record.scannedAt),
        }));
        const present = presentRecords.map((record) => ({
            group: 'Co mat',
            code: record.asset?.machineCode ?? '',
            name: record.asset?.name ?? '',
            plant: record.asset?.plant?.name ?? '',
            area: record.asset?.area ?? '',
            coverage: record.coverageZoneName ?? '',
            status: record.asset ? ASSET_STATUS_LABEL[record.asset.status] : '',
            note: record.message,
            scannedAt: formatTime(record.scannedAt),
        }));

        return [...missing, ...anomalies, ...present];
    }, [anomalyRecords, missingAssets, presentRecords]);

    const buildAssetSessionItem = (
        type: StocktakeSessionItem['type'],
        asset: Asset,
        messageText: string,
        scannedAt?: string,
        gpsNote?: string,
        rawValue?: string,
        coverageZoneId?: string,
        coverageZoneName?: string
    ): StocktakeSessionItem => ({
        type,
        assetId: asset.id,
        rawValue,
        machineCode: asset.machineCode,
        name: asset.name,
        plantName: asset.plant?.name,
        area: asset.area,
        status: ASSET_STATUS_LABEL[asset.status] || asset.status,
        message: messageText,
        gpsNote,
        scannedAt,
        coverageZoneId,
        coverageZoneName,
    });

    const stocktakeSessionItems = useMemo<StocktakeSessionItem[]>(() => {
        const missing = missingAssets.map((asset) => {
            const expectedCoverage = expectedCoverageZoneByAssetRef.current.get(asset.id);
            return buildAssetSessionItem(
                'missing',
                asset,
                'Chưa quét thấy trong phạm vi kiểm kê',
                undefined,
                undefined,
                undefined,
                expectedCoverage?.zoneId,
                expectedCoverage?.zoneName
            );
        });
        const anomalies = anomalyRecords.map((record) =>
            record.asset
                ? buildAssetSessionItem(
                      record.type,
                      record.asset,
                      record.message,
                      record.scannedAt,
                      record.gpsNote,
                      record.rawValue,
                      record.coverageZoneId,
                      record.coverageZoneName
                  )
                : {
                      type: 'unknown' as const,
                      rawValue: record.rawValue,
                      message: record.message,
                      gpsNote: record.gpsNote,
                      scannedAt: record.scannedAt,
                      coverageZoneId: record.coverageZoneId,
                      coverageZoneName: record.coverageZoneName,
                  }
        );
        const present = presentRecords.map((record) =>
            record.asset
                ? buildAssetSessionItem(
                      'present',
                      record.asset,
                      record.message,
                      record.scannedAt,
                      record.gpsNote,
                      record.rawValue,
                      record.coverageZoneId,
                      record.coverageZoneName
                  )
                : {
                      type: 'present' as const,
                      rawValue: record.rawValue,
                      message: record.message,
                      gpsNote: record.gpsNote,
                      scannedAt: record.scannedAt,
                      coverageZoneId: record.coverageZoneId,
                      coverageZoneName: record.coverageZoneName,
                  }
        );

        return [...missing, ...anomalies, ...present];
    }, [anomalyRecords, missingAssets, presentRecords]);

    const positionProposals = useMemo<StocktakePositionProposal[]>(() => {
        const completedZones = coverageZones.filter((zone) => zone.status === 'completed');
        const floorMachines = floorMapQuery.data?.machines ?? [];
        const floorMachineById = new Map(floorMachines.map((machine) => [machine.id, machine]));
        const proposals: StocktakePositionProposal[] = [];

        completedZones.forEach((zone) => {
            const occupied = floorMachines
                .map((machine) => machine.floorPos)
                .filter((position): position is { x: number; y: number } => pointInsideCoverageZone(position, zone));
            const seen = new Set<string>();
            const candidates = [...scanRecords]
                .filter(
                    (record) =>
                        record.asset &&
                        record.asset.plantId === selectedPlantId &&
                        record.coverageZoneId === zone.zoneId
                )
                .sort((left, right) => new Date(left.scannedAt).getTime() - new Date(right.scannedAt).getTime())
                .filter((record) => {
                    if (!record.asset || seen.has(record.asset.id)) return false;
                    seen.add(record.asset.id);
                    const mappedPosition = floorMachineById.get(record.asset.id)?.floorPos;
                    const currentPosition =
                        record.asset.floorPos !== undefined ? record.asset.floorPos : mappedPosition;
                    return !pointInsideCoverageZone(currentPosition, zone);
                });
            const slots = buildAvailablePositionSlots(zone, candidates.length, occupied);
            const confidence =
                zone.activationSource === 'anchor' ? 0.92 : zone.activationSource === 'manual' ? 0.78 : 0.68;

            candidates.forEach((record, index) => {
                const asset = record.asset;
                const slot = slots[index];
                if (!asset || !slot) return;
                const mappedPosition = floorMachineById.get(asset.id)?.floorPos;
                const currentPosition = asset.floorPos !== undefined ? asset.floorPos : mappedPosition;
                proposals.push({
                    assetId: asset.id,
                    machineCode: asset.machineCode,
                    name: asset.name,
                    zoneId: zone.zoneId,
                    zoneName: zone.name,
                    currentX: currentPosition?.x,
                    currentY: currentPosition?.y,
                    proposedX: slot.x,
                    proposedY: slot.y,
                    assetUpdatedAt: asset.updatedAt,
                    scannedAt: record.scannedAt,
                    confidence,
                    basis: 'scan_order',
                    status: 'pending',
                });
            });
        });

        return proposals;
    }, [coverageZones, floorMapQuery.data?.machines, scanRecords, selectedPlantId]);

    const handleSaveHistory = async () => {
        if (!started || !startedAt || !selectedPlantId) {
            message.warning('Bắt đầu kiểm kê trước khi lưu lịch sử');
            return;
        }
        if (processingQueueRef.current || scanQueueRef.current.length > 0) {
            message.warning('Đợi hệ thống xử lý hết các mã trong hàng đợi rồi lưu lịch sử');
            return;
        }

        const payload: CreateStocktakeSessionPayload = {
            plantId: selectedPlantId,
            plantName: selectedPlant?.name,
            area: selectedArea,
            areaLabel: areaLabel(selectedArea),
            captureMode: scanMode,
            scannerEngine: scanMode === 'sweep' ? sweepTelemetry.engine : 'zxing',
            detectedCodeCount:
                scanMode === 'sweep'
                    ? Math.max(sweepTelemetry.uniqueDetected, stats.scanned)
                    : stats.scanned + duplicateScanCount,
            duplicateScanCount,
            coveragePercent,
            coverageCompletedCount,
            coverageZones,
            positionProposals,
            startedAt,
            finishedAt: new Date().toISOString(),
            expectedCount: stats.expected,
            scannedCount: stats.scanned,
            presentCount: stats.present,
            missingCount: stats.missing,
            anomalyCount: stats.anomalies,
            items: stocktakeSessionItems,
        };
        const persist = () => saveStocktakeMutation.mutateAsync(payload);

        if (coverageZones.length && coveragePercent < 100) {
            modal.confirm({
                title: `Coverage mới đạt ${coveragePercent}%`,
                content:
                    'Phiên vẫn có thể lưu để làm bản nháp hiện trường, nhưng danh sách máy thiếu chưa đủ độ tin cậy vì còn vùng chưa xác nhận đi hết.',
                okText: 'Vẫn lưu phiên',
                cancelText: 'Tiếp tục kiểm kê',
                onOk: persist,
            });
            return;
        }

        await persist();
    };

    const handleReviewPositionProposals = (action: 'approve' | 'reject', assetIds: string[]) => {
        if (!historyDetail || !assetIds.length) return;
        modal.confirm({
            title:
                action === 'approve'
                    ? `Duyệt vị trí cho ${assetIds.length} máy?`
                    : `Từ chối ${assetIds.length} đề xuất?`,
            content:
                action === 'approve'
                    ? 'Backend sẽ kiểm tra lại cơ sở, tọa độ và thời điểm cập nhật của từng máy. Máy có dữ liệu mới hơn sẽ bị giữ lại ở trạng thái xung đột, không bị ghi đè.'
                    : 'Các đề xuất bị từ chối vẫn được giữ trong lịch sử kiểm kê để truy vết.',
            okText: action === 'approve' ? 'Duyệt và cập nhật' : 'Xác nhận từ chối',
            cancelText: 'Hủy',
            okButtonProps: action === 'reject' ? { danger: true } : undefined,
            onOk: () =>
                reviewPositionMutation.mutateAsync({
                    sessionId: historyDetail.id,
                    action,
                    assetIds,
                }),
        });
    };

    const handleExportCsv = () => {
        const header = [
            'Nhom',
            'Ma may',
            'Ten may',
            'Co so',
            'Khu vuc ho so',
            'Vung coverage',
            'Trang thai',
            'Ghi chu',
            'Thoi gian quet',
        ];
        const rows = exportRows.map((row) => [
            row.group,
            row.code,
            row.name,
            row.plant,
            row.area,
            row.coverage,
            row.status,
            row.note,
            row.scannedAt,
        ]);
        const csv = [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\r\n');
        const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `kiem-ke-qr-${selectedPlant?.code || 'co-so'}-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    };

    const handleExportPdf = async () => {
        const { jsPDF } = await import('jspdf');
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
        const marginX = 12;
        let y = 14;

        const writeLine = (text: string, size = 9, bold = false) => {
            if (y > 282) {
                doc.addPage('a4', 'portrait');
                y = 14;
            }
            doc.setFont('helvetica', bold ? 'bold' : 'normal');
            doc.setFontSize(size);
            doc.text(removeVietnameseMarks(text).slice(0, 115), marginX, y);
            y += size > 10 ? 7 : 5.2;
        };

        writeLine('Bao cao kiem ke QR', 14, true);
        writeLine(`Co so: ${selectedPlant?.name || '-'}`);
        writeLine(`Khu vuc: ${areaLabel(selectedArea)} | Nguoi kiem: ${user?.name || '-'}`);
        writeLine(
            `Bat dau: ${formatTime(startedAt ?? undefined)} | Xuat bao cao: ${new Date().toLocaleString('vi-VN')}`
        );
        writeLine(
            `Can kiem: ${stats.expected} | Da quet: ${stats.scanned} | Co mat: ${stats.present} | Thieu: ${stats.missing} | Bat thuong: ${stats.anomalies}`,
            9,
            true
        );
        if (coverageZones.length) {
            writeLine(
                `Coverage: ${coveragePercent}% | Vung hoan tat: ${coverageCompletedCount}/${coverageZones.length}`,
                9,
                true
            );
        }
        y += 2;

        exportRows.forEach((row, index) => {
            writeLine(
                `${index + 1}. [${row.group}] ${row.code} - ${row.name} - ${row.plant}/${row.area} - Coverage: ${row.coverage || '-'} - ${row.note}`,
                8
            );
        });

        doc.save(`kiem-ke-qr-${selectedPlant?.code || 'co-so'}-${new Date().toISOString().slice(0, 10)}.pdf`);
    };

    const renderAssetSummary = (asset: Asset) => (
        <div className='min-w-0'>
            <div className='truncate text-sm font-bold text-slate-900'>{asset.name}</div>
            <div className='mt-1 flex flex-wrap items-center gap-1.5'>
                <Tag color='blue' className='!m-0 font-mono'>
                    {asset.machineCode}
                </Tag>
                <Tag className='!m-0'>{ASSET_STATUS_LABEL[asset.status]}</Tag>
            </div>
            <div className='mt-1 text-xs text-slate-500'>{assetLocation(asset)}</div>
        </div>
    );

    // Thao tác theo chuẩn bảng: 1 nút chính + menu ⋯ cho phần còn lại.
    const renderMissingActions = (asset: Asset, block = false) => (
        <div className={block ? 'flex gap-2' : 'flex justify-end gap-1.5'}>
            <Button
                size={block ? 'middle' : 'small'}
                className={block ? 'flex-1' : undefined}
                icon={<SaveOutlined />}
                onClick={() => setQuickAsset(asset)}
            >
                Đổi trạng thái
            </Button>
            <Dropdown
                menu={{
                    items: [{ key: 'transfer', icon: <SwapOutlined />, label: 'Tạo lệnh điều chuyển' }],
                    onClick: ({ key }) => {
                        if (key === 'transfer') setTransferTarget(asset);
                    },
                }}
                trigger={['click']}
            >
                <Button size={block ? 'middle' : 'small'} icon={<MoreOutlined />} aria-label='Thao tác khác' />
            </Dropdown>
        </div>
    );

    const renderAnomalyActions = (record: ScanRecord, block = false) => {
        if (!record.asset) return <Text type='secondary'>Không có máy để thao tác</Text>;
        const asset = record.asset;
        const canFixArea = record.type === 'wrong_area' && selectedArea !== ALL_AREAS;

        const menuItems = [
            ...(canFixArea ? [{ key: 'quick', icon: <SaveOutlined />, label: 'Cập nhật nhanh' }] : []),
            { key: 'transfer', icon: <SwapOutlined />, label: 'Tạo lệnh điều chuyển' },
        ];

        return (
            <div className={block ? 'flex gap-2' : 'flex justify-end gap-1.5'}>
                {canFixArea ? (
                    <Button
                        size={block ? 'middle' : 'small'}
                        className={block ? 'flex-1' : undefined}
                        icon={<EnvironmentOutlined />}
                        onClick={() => handleUpdateAreaToScope(asset)}
                    >
                        Cập nhật khu vực
                    </Button>
                ) : (
                    <Button
                        size={block ? 'middle' : 'small'}
                        className={block ? 'flex-1' : undefined}
                        icon={<SaveOutlined />}
                        onClick={() => setQuickAsset(asset)}
                    >
                        Cập nhật nhanh
                    </Button>
                )}
                <Dropdown
                    menu={{
                        items: menuItems,
                        onClick: ({ key }) => {
                            if (key === 'transfer') setTransferTarget(asset);
                            if (key === 'quick') setQuickAsset(asset);
                        },
                    }}
                    trigger={['click']}
                >
                    <Button size={block ? 'middle' : 'small'} icon={<MoreOutlined />} aria-label='Thao tác khác' />
                </Dropdown>
            </div>
        );
    };

    const missingColumns: TableColumnsType<Asset> = [
        {
            title: 'Máy chưa điểm danh',
            render: (_value, record) => renderAssetSummary(record),
        },
        {
            title: 'Thao tác',
            width: 210,
            align: 'right',
            render: (_value, record) => renderMissingActions(record),
        },
    ];

    const anomalyColumns: TableColumnsType<ScanRecord> = [
        {
            title: 'Bất thường',
            render: (_value, record) =>
                record.asset ? (
                    <div>
                        {renderAssetSummary(record.asset)}
                        <div className='mt-1 text-xs font-semibold text-amber-700'>{record.message}</div>
                        {record.gpsNote ? (
                            <div className='text-xs font-semibold text-rose-600'>📍 {record.gpsNote}</div>
                        ) : null}
                    </div>
                ) : (
                    <div>
                        <div className='font-mono text-sm font-bold text-slate-900'>{record.rawValue}</div>
                        <div className='text-xs font-semibold text-rose-600'>{record.message}</div>
                    </div>
                ),
        },
        {
            title: 'Thao tác',
            width: 220,
            align: 'right',
            render: (_value, record) => renderAnomalyActions(record),
        },
    ];

    const presentColumns: TableColumnsType<ScanRecord> = [
        {
            title: 'Có mặt',
            render: (_value, record) =>
                record.asset ? (
                    <div>
                        {renderAssetSummary(record.asset)}
                        {record.gpsNote ? (
                            <div className='mt-1 text-xs font-semibold text-rose-600'>📍 {record.gpsNote}</div>
                        ) : null}
                    </div>
                ) : null,
        },
        {
            title: 'Thời gian quét',
            width: 180,
            render: (_value, record) => <Text type='secondary'>{formatTime(record.scannedAt)}</Text>,
        },
    ];

    const activeData =
        activeTab === 'missing' ? missingAssets : activeTab === 'anomalies' ? anomalyRecords : presentRecords;

    const emptyTabText: Record<StocktakeTab, string> = {
        missing: stats.expected
            ? 'Không còn máy thiếu — tất cả máy trong phạm vi đã điểm danh.'
            : 'Phạm vi này không có máy nào cần kiểm.',
        anomalies: 'Chưa ghi nhận bất thường nào trong phiên này.',
        present: 'Chưa quét thấy máy nào — đưa tem QR vào khung ngắm để bắt đầu.',
    };

    const historyItemColumns: TableColumnsType<StocktakeSessionItem> = [
        {
            title: 'Nhóm',
            dataIndex: 'type',
            width: 130,
            render: (type: StocktakeSessionItem['type']) => {
                const labelMap: Record<StocktakeSessionItem['type'], string> = {
                    missing: 'Thiếu',
                    present: 'Có mặt',
                    wrong_area: 'Sai khu vực',
                    wrong_plant: 'Sai cơ sở',
                    unknown: 'Không rõ',
                };
                const colorMap: Record<StocktakeSessionItem['type'], string> = {
                    missing: 'red',
                    present: 'green',
                    wrong_area: 'orange',
                    wrong_plant: 'volcano',
                    unknown: 'default',
                };
                return <Tag color={colorMap[type]}>{labelMap[type]}</Tag>;
            },
        },
        {
            title: 'Máy',
            render: (_value, record) => (
                <div>
                    <div className='font-semibold text-slate-900'>{record.name || 'Không xác định'}</div>
                    <div className='font-mono text-xs text-slate-500'>
                        {record.machineCode || record.rawValue || '-'}
                    </div>
                </div>
            ),
        },
        {
            title: 'Vị trí',
            width: 190,
            render: (_value, record) => (
                <span className='text-sm text-slate-600'>
                    {record.plantName || '-'} / {record.area || 'Chưa gắn khu vực'}
                </span>
            ),
        },
        {
            title: 'Coverage',
            dataIndex: 'coverageZoneName',
            width: 140,
            render: (value?: string) => value || <span className='text-slate-400'>Chưa gắn vùng</span>,
        },
        {
            title: 'Ghi chú',
            dataIndex: 'message',
            render: (value, record) => (
                <div className='text-sm text-slate-700'>
                    {value || '-'}
                    {record.gpsNote ? (
                        <div className='text-xs font-semibold text-rose-600'>{record.gpsNote}</div>
                    ) : null}
                </div>
            ),
        },
        {
            title: 'Quét lúc',
            dataIndex: 'scannedAt',
            width: 155,
            render: (value) => <Text type='secondary'>{formatTime(value)}</Text>,
        },
    ];

    const renderMobileList = () => {
        if (!activeData.length) {
            return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyTabText[activeTab]} />;
        }

        return (
            <div className='flex flex-col gap-3'>
                {activeTab === 'missing'
                    ? missingAssets.map((asset) => (
                          <Card key={asset.id} size='small' className='rounded-2xl'>
                              {renderAssetSummary(asset)}
                              <div className='mt-3'>{renderMissingActions(asset, true)}</div>
                          </Card>
                      ))
                    : activeTab === 'anomalies'
                      ? anomalyRecords.map((record) => (
                            <Card key={record.key} size='small' className='rounded-2xl'>
                                {record.asset ? renderAssetSummary(record.asset) : <Text code>{record.rawValue}</Text>}
                                <div className='mt-2 text-sm font-semibold text-amber-700'>{record.message}</div>
                                {record.gpsNote ? (
                                    <div className='mt-1 text-xs font-semibold text-rose-600'>📍 {record.gpsNote}</div>
                                ) : null}
                                {record.asset ? <div className='mt-3'>{renderAnomalyActions(record, true)}</div> : null}
                            </Card>
                        ))
                      : presentRecords.map((record) => (
                            <Card key={record.key} size='small' className='rounded-2xl'>
                                {record.asset ? renderAssetSummary(record.asset) : null}
                                {record.gpsNote ? (
                                    <div className='mt-1 text-xs font-semibold text-rose-600'>📍 {record.gpsNote}</div>
                                ) : null}
                                <div className='mt-2 text-xs text-slate-500'>{formatTime(record.scannedAt)}</div>
                            </Card>
                        ))}
            </div>
        );
    };

    if (!canUseStocktake) {
        return (
            <Result
                status='403'
                title='Không có quyền kiểm kê QR'
                subTitle='Chức năng này chỉ dành cho quản trị viên hoặc quản lý.'
            />
        );
    }

    // ===== Các khối dùng chung giữa desktop / mobile =====

    const rollCallMeter = (
        <div className='stocktake-meter'>
            <div>
                <div className='stocktake-meter__count'>
                    {stats.present}
                    <small>/{stats.expected}</small>
                </div>
                <div className='text-[11px] font-bold tracking-wide text-slate-400 uppercase'>máy có mặt</div>
            </div>
            <div className='stocktake-meter__bar'>
                <div className='stocktake-meter__fill' style={{ width: `${presentPct}%` }} />
                <div className='stocktake-meter__ticks' />
            </div>
            <div className='flex flex-wrap items-center gap-1.5'>
                <button
                    type='button'
                    className='stocktake-chip stocktake-chip--missing'
                    onClick={() => setActiveTab('missing')}
                >
                    Thiếu {stats.missing}
                </button>
                <button
                    type='button'
                    className='stocktake-chip stocktake-chip--anomaly'
                    onClick={() => setActiveTab('anomalies')}
                >
                    Bất thường {stats.anomalies}
                </button>
                <span className='stocktake-chip stocktake-chip--muted'>Đã quét {stats.scanned}</span>
            </div>
        </div>
    );

    const scanFeedback = started ? (
        lastScan ? (
            <div key={lastScan.at} className={`stocktake-flash stocktake-flash--in ${FLASH_META[lastScan.kind].cls}`}>
                <div className='stocktake-flash__label'>{FLASH_META[lastScan.kind].label}</div>
                <div className='stocktake-flash__code'>{lastScan.code}</div>
                {lastScan.note ? <div className='stocktake-flash__note'>{lastScan.note}</div> : null}
            </div>
        ) : (
            <div className='rounded-xl border border-dashed border-slate-200 px-3 py-2.5 text-xs text-slate-400'>
                Chưa quét máy nào trong phiên này — đưa tem QR vào khung ngắm.
            </div>
        )
    ) : null;

    const showSetupCard = isDesktop || !started || scopeEditing;

    const setupCard = showSetupCard ? (
        <Card className='rounded-2xl border-slate-200 shadow-sm'>
            <div className='grid grid-cols-1 gap-3 lg:grid-cols-[minmax(220px,1fr)_minmax(180px,0.7fr)_auto] lg:items-end'>
                <label className='block'>
                    <Text className='mb-2 block text-sm font-bold text-slate-800'>Cơ sở kiểm kê</Text>
                    <Select
                        showSearch
                        value={selectedPlantId || undefined}
                        placeholder='Chọn cơ sở'
                        optionFilterProp='label'
                        options={plants.map((plant) => ({ value: plant.id, label: plant.name }))}
                        onChange={setSelectedPlantId}
                        className='w-full'
                    />
                </label>
                <label className='block'>
                    <Text className='mb-2 block text-sm font-bold text-slate-800'>Khu vực</Text>
                    <Select
                        value={selectedArea}
                        options={areaOptions}
                        loading={plantAssetsQuery.isFetching}
                        onChange={handleAreaChange}
                        className='w-full'
                    />
                </label>
                <Button
                    type='primary'
                    size='large'
                    icon={started ? <ReloadOutlined /> : <AuditOutlined />}
                    loading={plantAssetsQuery.isFetching}
                    onClick={handleStart}
                >
                    {started ? 'Quét lại từ đầu' : 'Bắt đầu kiểm kê'}
                </Button>
            </div>
            <div className='mt-3 text-xs text-slate-400'>
                Kết quả đối chiếu nằm trên thiết bị này — bấm “Lưu lịch sử” khi điểm danh xong.
            </div>
        </Card>
    ) : (
        <Card
            size='small'
            className='rounded-2xl border-slate-200 shadow-sm'
            styles={{ body: { padding: '10px 14px' } }}
        >
            <div className='flex items-center justify-between gap-3'>
                <div className='min-w-0'>
                    <div className='truncate text-sm font-bold text-slate-900'>
                        {selectedPlant?.name || 'Chưa chọn cơ sở'}
                    </div>
                    <div className='truncate text-xs text-slate-500'>
                        {areaLabel(selectedArea)} · bắt đầu {formatClock(startedAt)}
                    </div>
                </div>
                <Button size='small' onClick={() => setScopeEditing(true)}>
                    Đổi phạm vi
                </Button>
            </div>
        </Card>
    );

    const scannerCard = (
        <Card className='rounded-2xl border-slate-200 shadow-sm' styles={{ body: { padding: 14 } }}>
            <div className='mb-3 flex items-center justify-between'>
                <div className='flex items-center gap-2 font-bold text-slate-900'>
                    <QrcodeOutlined className='text-blue-600' />
                    Quét kiểm kê
                </div>
                <div className='flex items-center gap-1.5'>
                    {queuedScanCount > 0 || resolving ? (
                        <Tag color='processing' className='!m-0'>
                            Đang xử lý {queuedScanCount + (resolving ? 1 : 0)}
                        </Tag>
                    ) : null}
                    {started ? (
                        <Tag color='green' className='!m-0'>
                            Đang kiểm
                        </Tag>
                    ) : (
                        <Tag className='!m-0'>Chưa bắt đầu</Tag>
                    )}
                </div>
            </div>
            <Segmented
                block
                className='mb-3'
                value={scanMode}
                onChange={(value) => setScanMode(value as StocktakeScanMode)}
                options={[
                    { value: 'single', label: 'Quét từng tem', icon: <QrcodeOutlined /> },
                    { value: 'sweep', label: 'Đi một vòng', icon: <ScanOutlined /> },
                ]}
            />
            {started && coverageZones.length ? (
                <div
                    className={`mb-3 rounded-xl border px-3 py-2.5 ${
                        activeCoverageZone
                            ? 'border-cyan-200 bg-cyan-50 text-cyan-900'
                            : 'border-amber-200 bg-amber-50 text-amber-900'
                    }`}
                >
                    <div className='text-[10px] font-bold tracking-wide uppercase opacity-70'>Vùng hiện tại</div>
                    <div className='mt-1 flex items-center justify-between gap-2 text-sm font-bold'>
                        <span className='truncate'>{activeCoverageZone?.name || 'Chưa chọn vùng coverage'}</span>
                        <span className='shrink-0 text-xs'>
                            {coverageCompletedCount}/{coverageZones.length} vùng
                        </span>
                    </div>
                </div>
            ) : null}
            {scanMode === 'sweep' ? (
                <>
                    <QrSweepScanner
                        active={started}
                        onDetected={handleDetected}
                        onTelemetryChange={setSweepTelemetry}
                    />
                    <div className='mt-2 rounded-xl border border-cyan-100 bg-cyan-50/70 px-3 py-2 text-xs leading-5 text-cyan-900'>
                        Camera nhận mã liên tục và đưa vào hàng đợi. Trên iPhone hệ thống tự dùng chế độ ZXing tương
                        thích; thiết bị có Barcode Detector sẽ nhận được nhiều QR trong cùng khung hình.
                    </div>
                </>
            ) : (
                <QrCameraScanner active={started} onDetected={handleDetected} cooldownMs={1600} />
            )}
            {scanFeedback ? <div className='mt-3'>{scanFeedback}</div> : null}
            {!isDesktop && started ? <div className='mt-3 border-t border-slate-100 pt-3'>{rollCallMeter}</div> : null}
        </Card>
    );

    const coverageCard = started ? (
        <Card className='rounded-2xl border-slate-200 shadow-sm' styles={{ body: { padding: 16 } }}>
            <StocktakeCoverageMap
                zones={coverageZones}
                activeZoneId={activeCoverageZoneId}
                disabled={resolving || queuedScanCount > 0}
                onActivate={activateCoverageZone}
                onComplete={completeCoverageZone}
                onReopen={reopenCoverageZone}
                onPrint={setAnchorPrintZone}
            />
            {positionProposals.length ? (
                <div className='mt-3 flex items-start gap-2 rounded-xl border border-cyan-100 bg-cyan-50 px-3 py-2 text-xs leading-5 text-cyan-900'>
                    <EnvironmentOutlined className='mt-0.5 text-cyan-700' />
                    <span>
                        Đã tạo nháp <strong>{positionProposals.length} đề xuất vị trí</strong> từ thứ tự quét. Đề xuất
                        chỉ xuất hiện trong lịch sử sau khi lưu và chưa làm thay đổi sơ đồ.
                    </span>
                </div>
            ) : null}
        </Card>
    ) : null;

    const historyCard = (
        <Card
            className='rounded-2xl border-slate-200 shadow-sm'
            title={<span className='text-sm font-bold text-slate-900'>Lịch sử gần đây</span>}
            styles={{ body: { padding: 12 } }}
        >
            {stocktakeHistoryQuery.isFetching ? (
                <Text type='secondary'>Đang tải lịch sử...</Text>
            ) : stocktakeHistoryQuery.data?.data?.length ? (
                <div className='flex flex-col gap-2'>
                    {stocktakeHistoryQuery.data.data.map((session) => (
                        <div key={session.id} className='rounded-xl border border-slate-100 bg-slate-50 px-3 py-2'>
                            <div className='flex items-center justify-between gap-2'>
                                <span className='truncate text-sm font-bold text-slate-900'>
                                    {session.areaLabel || areaLabel(session.area)}
                                </span>
                                <Tag color={session.anomalyCount ? 'orange' : 'green'} className='!m-0'>
                                    {session.anomalyCount} bất thường
                                </Tag>
                            </div>
                            <div className='mt-1 text-xs text-slate-500'>
                                {formatTime(session.createdAt)} · {session.createdByName || 'Không rõ người lưu'}
                            </div>
                            <div className='mt-1 text-[11px] font-semibold text-slate-400'>
                                {session.captureMode === 'sweep' ? 'Đi một vòng' : 'Quét từng tem'}
                                {session.captureMode === 'sweep'
                                    ? ` · ${session.detectedCodeCount ?? session.scannedCount} mã nhận diện`
                                    : ''}
                                {session.coverageZones?.length ? ` · Coverage ${session.coveragePercent ?? 0}%` : ''}
                            </div>
                            <div className='mt-2 grid grid-cols-3 gap-1 text-center text-xs'>
                                <div className='rounded-lg bg-white px-2 py-1'>
                                    <b>{session.presentCount}</b>
                                    <span className='ml-1 text-slate-500'>có</span>
                                </div>
                                <div className='rounded-lg bg-white px-2 py-1'>
                                    <b>{session.missingCount}</b>
                                    <span className='ml-1 text-slate-500'>thiếu</span>
                                </div>
                                <div className='rounded-lg bg-white px-2 py-1'>
                                    <b>{session.scannedCount}</b>
                                    <span className='ml-1 text-slate-500'>quét</span>
                                </div>
                            </div>
                            <Button size='small' className='mt-2 w-full' onClick={() => setHistoryDetail(session)}>
                                Xem chi tiết
                            </Button>
                        </div>
                    ))}
                </div>
            ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Chưa có lịch sử kiểm kê' />
            )}
        </Card>
    );

    const resultsCard = (
        <Card className='rounded-2xl border-slate-200 shadow-sm'>
            {isDesktop && started ? <div className='mb-4 border-b border-slate-100 pb-4'>{rollCallMeter}</div> : null}
            <div className='mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between'>
                <Segmented
                    block={!isDesktop}
                    value={activeTab}
                    onChange={(value) => setActiveTab(value as StocktakeTab)}
                    options={[
                        { value: 'missing', label: `Thiếu (${stats.missing})` },
                        { value: 'anomalies', label: `Bất thường (${stats.anomalies})` },
                        { value: 'present', label: `Có mặt (${stats.present})` },
                    ]}
                />
                <Text type='secondary' className='text-xs'>
                    {selectedPlant?.name || 'Chưa chọn cơ sở'} · {areaLabel(selectedArea)}
                </Text>
            </div>

            {!started ? (
                <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description='Chưa có phiên điểm danh — chọn cơ sở, khu vực rồi bấm “Bắt đầu kiểm kê”.'
                />
            ) : isDesktop ? (
                activeTab === 'missing' ? (
                    <Table
                        rowKey='id'
                        size='small'
                        rowClassName={() => 'stocktake-row--missing'}
                        locale={{ emptyText: emptyTabText.missing }}
                        columns={missingColumns}
                        dataSource={missingAssets}
                    />
                ) : activeTab === 'anomalies' ? (
                    <Table
                        rowKey='key'
                        size='small'
                        rowClassName={() => 'stocktake-row--anomaly'}
                        locale={{ emptyText: emptyTabText.anomalies }}
                        columns={anomalyColumns}
                        dataSource={anomalyRecords}
                    />
                ) : (
                    <Table
                        rowKey='key'
                        size='small'
                        rowClassName={() => 'stocktake-row--present'}
                        locale={{ emptyText: emptyTabText.present }}
                        columns={presentColumns}
                        dataSource={presentRecords}
                    />
                )
            ) : (
                renderMobileList()
            )}
        </Card>
    );

    return (
        <div className='flex flex-col gap-5'>
            <PageHeader
                title='Kiểm kê QR'
                subtitle='Điểm danh máy tại hiện trường bằng tem QR — thấy ngay máy thiếu, máy sai chỗ.'
                actions={
                    <div className='flex flex-wrap gap-2'>
                        <Button
                            type={savedSessionId ? 'default' : 'primary'}
                            icon={<SaveOutlined />}
                            disabled={!started || Boolean(savedSessionId)}
                            loading={saveStocktakeMutation.isPending}
                            onClick={handleSaveHistory}
                        >
                            {savedSessionId ? 'Đã lưu lịch sử' : 'Lưu lịch sử'}
                        </Button>
                        <Button icon={<DownloadOutlined />} disabled={!started} onClick={handleExportCsv}>
                            Xuất CSV
                        </Button>
                        <Button icon={<FilePdfOutlined />} disabled={!started} onClick={handleExportPdf}>
                            Xuất PDF
                        </Button>
                    </div>
                }
            />

            {setupCard}

            <div className='grid grid-cols-1 gap-4 lg:grid-cols-[400px_1fr]'>
                <div className='flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start'>
                    {scannerCard}
                    {isDesktop ? historyCard : null}
                </div>

                <div className='flex flex-col gap-4'>
                    {coverageCard}
                    {resultsCard}
                    {!isDesktop && started ? (
                        <Button
                            block
                            size='large'
                            type={savedSessionId ? 'default' : 'primary'}
                            icon={<SaveOutlined />}
                            disabled={Boolean(savedSessionId)}
                            loading={saveStocktakeMutation.isPending}
                            onClick={handleSaveHistory}
                        >
                            {savedSessionId ? 'Đã lưu lịch sử kiểm kê' : 'Lưu lịch sử kiểm kê'}
                        </Button>
                    ) : null}
                    {!isDesktop ? historyCard : null}
                </div>
            </div>

            <ZoneAnchorModal
                zone={anchorPrintZone}
                open={Boolean(anchorPrintZone)}
                onClose={() => setAnchorPrintZone(null)}
            />

            <Modal
                open={Boolean(historyDetail)}
                width={960}
                title='Chi tiết lịch sử kiểm kê'
                footer={null}
                destroyOnHidden
                onCancel={() => setHistoryDetail(null)}
            >
                {historyDetail ? (
                    <div className='flex flex-col gap-4'>
                        <div className='rounded-2xl border border-slate-200 bg-slate-50 p-4'>
                            <div className='text-base font-bold text-slate-900'>
                                {historyDetail.plantName || historyDetail.plant?.name || '-'} ·{' '}
                                {historyDetail.areaLabel || areaLabel(historyDetail.area)}
                            </div>
                            <div className='mt-1 text-sm text-slate-500'>
                                Lưu lúc {formatTime(historyDetail.createdAt)} bởi{' '}
                                {historyDetail.createdByName || 'Không rõ người lưu'}
                            </div>
                            <div className='mt-2 flex flex-wrap gap-2'>
                                <Tag color={historyDetail.captureMode === 'sweep' ? 'cyan' : 'blue'} className='!m-0'>
                                    {historyDetail.captureMode === 'sweep' ? 'Đi một vòng' : 'Quét từng tem'}
                                </Tag>
                                {historyDetail.captureMode === 'sweep' ? (
                                    <Tag className='!m-0'>
                                        {historyDetail.detectedCodeCount ?? historyDetail.scannedCount} mã nhận diện ·{' '}
                                        {historyDetail.duplicateScanCount ?? 0} trùng
                                    </Tag>
                                ) : null}
                                {historyDetail.coverageZones?.length ? (
                                    <Tag
                                        color={historyDetail.coveragePercent === 100 ? 'green' : 'orange'}
                                        className='!m-0'
                                    >
                                        Coverage {historyDetail.coveragePercent ?? 0}% ·{' '}
                                        {historyDetail.coverageCompletedCount ?? 0}/{historyDetail.coverageZones.length}{' '}
                                        vùng
                                    </Tag>
                                ) : null}
                            </div>
                            <div className='mt-3 grid grid-cols-2 gap-2 md:grid-cols-5'>
                                {[
                                    ['Cần kiểm', historyDetail.expectedCount],
                                    ['Đã quét', historyDetail.scannedCount],
                                    ['Có mặt', historyDetail.presentCount],
                                    ['Thiếu', historyDetail.missingCount],
                                    ['Bất thường', historyDetail.anomalyCount],
                                ].map(([label, value]) => (
                                    <div key={label} className='rounded-xl bg-white px-3 py-2 text-center'>
                                        <div className='text-lg font-black text-slate-900'>{value}</div>
                                        <div className='text-xs font-semibold text-slate-500'>{label}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <StocktakePositionProposalPanel
                            proposals={historyDetail.positionProposals ?? []}
                            canReview={canReviewPositions}
                            loading={reviewPositionMutation.isPending}
                            onReview={handleReviewPositionProposals}
                        />
                        <Table<StocktakeSessionItem>
                            size='small'
                            rowKey={(record, index) => `${record.assetId || record.rawValue || 'row'}-${index}`}
                            columns={historyItemColumns}
                            dataSource={historyDetail.items}
                            pagination={{ pageSize: 8, showSizeChanger: false }}
                            scroll={{ x: 760 }}
                        />
                    </div>
                ) : null}
            </Modal>

            {quickAsset ? (
                <LazyBoundary mode='overlay'>
                    <QrQuickUpdateModal
                        open={Boolean(quickAsset)}
                        asset={quickAsset}
                        onClose={() => setQuickAsset(null)}
                        onUpdated={(asset) => {
                            setQuickAsset(asset);
                            setExpectedAssets((current) =>
                                current.map((item) => (item.id === asset.id ? asset : item))
                            );
                            setScanRecords((current) =>
                                current.map((record) => (record.asset?.id === asset.id ? { ...record, asset } : record))
                            );
                        }}
                    />
                </LazyBoundary>
            ) : null}

            {transferTarget ? (
                <LazyBoundary mode='overlay'>
                    <TransferModal
                        open={Boolean(transferTarget)}
                        asset={transferTarget}
                        assets={[transferTarget]}
                        plants={plants}
                        submitting={createTransferMutation.isPending}
                        onClose={() => setTransferTarget(null)}
                        onSubmit={handleTransferSubmit}
                    />
                </LazyBoundary>
            ) : null}
        </div>
    );
};

export default StocktakePage;
