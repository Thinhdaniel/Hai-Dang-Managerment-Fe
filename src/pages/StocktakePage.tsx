import React, { lazy, useEffect, useMemo, useState } from 'react';
import {
    Alert,
    App,
    Button,
    Card,
    Empty,
    Grid,
    Result,
    Segmented,
    Select,
    Statistic,
    Table,
    Tag,
    Typography,
    type TableColumnsType,
} from 'antd';
import {
    AuditOutlined,
    CheckCircleOutlined,
    DownloadOutlined,
    EnvironmentOutlined,
    FilePdfOutlined,
    QrcodeOutlined,
    ReloadOutlined,
    SaveOutlined,
    ScanOutlined,
    SwapOutlined,
    WarningOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import LazyBoundary from '../components/shared/LazyBoundary';
import PageHeader from '../components/shared/PageHeader';
import QrCameraScanner from '../components/QrCameraScanner';
import { useAuth } from '../core/contexts/AuthContext';
import { can } from '../core/lib/permissions';
import { resolveAssetByScan } from '../core/lib/qrScan';
import { recordQrScan } from '../core/lib/qrScanAudit';
import { ASSET_STATUS_LABEL, isReturnedToPartner } from '../core/constants';
import { assetService } from '../core/services/asset.service';
import { plantService } from '../core/services';
import { transferService } from '../core/services/transfer.service';
import { AssetStatus, type Asset, type CreateTransferPayload } from '../core/types';

const QrQuickUpdateModal = lazy(() => import('../components/QrQuickUpdateModal'));
const TransferModal = lazy(() => import('../components/transfer/TransferModal'));

const { Text } = Typography;
const { useBreakpoint } = Grid;

const ALL_AREAS = '__all__';
const EMPTY_AREA = '__empty__';

type StocktakeTab = 'missing' | 'anomalies' | 'present';
type ScanType = 'present' | 'wrong_area' | 'wrong_plant' | 'unknown';

type ScanRecord = {
    key: string;
    type: ScanType;
    rawValue: string;
    asset?: Asset;
    message: string;
    scannedAt: string;
};

const normalizeArea = (value?: string | null) => (value ?? '').trim();
const areaKey = (value?: string | null) => normalizeArea(value).toLowerCase();
const areaValue = (value?: string | null) => normalizeArea(value) || EMPTY_AREA;
const areaLabel = (value?: string | null) =>
    value === EMPTY_AREA ? 'Chưa gắn khu vực' : normalizeArea(value) || 'Tất cả';
const assetLocation = (asset: Asset) => `${asset.plant?.name || 'Chưa rõ cơ sở'} / ${asset.area || 'Chưa gắn khu vực'}`;
const formatTime = (value?: string) => (value ? new Date(value).toLocaleString('vi-VN') : '-');

const removeVietnameseMarks = (value: string) =>
    value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D');

const csvEscape = (value: unknown) => {
    const text = String(value ?? '');
    return `"${text.replace(/"/g, '""')}"`;
};

const scopeMatches = (asset: Asset, selectedArea: string) =>
    selectedArea === ALL_AREAS || areaKey(asset.area) === areaKey(selectedArea === EMPTY_AREA ? '' : selectedArea);

const StocktakePage: React.FC = () => {
    const screens = useBreakpoint();
    const isDesktop = Boolean(screens.lg);
    const { role, user } = useAuth();
    const canUseStocktake = can(role, 'stocktake');
    const { message } = App.useApp();
    const queryClient = useQueryClient();

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

    const { data: plants = [] } = useQuery({
        queryKey: ['plants'],
        queryFn: () => plantService.getAll(),
    });

    const plantAssetsQuery = useQuery({
        queryKey: ['stocktake-assets', selectedPlantId],
        queryFn: () => assetService.getAll({ plantId: selectedPlantId, page: 1, limit: 5000 }),
        enabled: Boolean(selectedPlantId),
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

    useEffect(() => {
        setSelectedArea(ALL_AREAS);
        setStarted(false);
        setExpectedAssets([]);
        setScanRecords([]);
    }, [selectedPlantId]);

    const handleAreaChange = (value: string) => {
        setSelectedArea(value);
        setStarted(false);
        setExpectedAssets([]);
        setScanRecords([]);
    };

    const selectedPlant = useMemo(
        () => plants.find((plant) => plant.id === selectedPlantId),
        [plants, selectedPlantId]
    );

    const plantAssets = useMemo(() => plantAssetsQuery.data?.data ?? [], [plantAssetsQuery.data?.data]);

    const areaOptions = useMemo(() => {
        const values = new Map<string, string>();
        plantAssets.forEach((asset) => {
            if (isReturnedToPartner(asset.status)) return;
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
    const scannedAssetIds = useMemo(
        () => new Set(scanRecords.map((record) => record.asset?.id).filter(Boolean)),
        [scanRecords]
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

    const appendRecord = (record: Omit<ScanRecord, 'key' | 'scannedAt'>) => {
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
            (asset) => !isReturnedToPartner(asset.status) && scopeMatches(asset, selectedArea)
        );

        setExpectedAssets(scopedAssets);
        setScanRecords([]);
        setStarted(true);
        setStartedAt(new Date().toISOString());
        setActiveTab('missing');
        message.success(`Bắt đầu kiểm kê ${scopedAssets.length} máy`);
    };

    const handleDetected = async (rawValue: string) => {
        if (!started) {
            message.warning('Bấm Bắt đầu trước khi quét kiểm kê');
            return;
        }
        if (resolving) return;

        setResolving(true);
        try {
            const { asset, ambiguous, publicId, labelId, source } = await resolveAssetByScan(rawValue);
            const logBase = {
                rawValue,
                publicId,
                labelId,
                action: 'stocktake' as const,
                source,
                metadata: { selectedPlantId, selectedArea },
            };

            if (!asset) {
                recordQrScan({
                    ...logBase,
                    result: ambiguous ? 'ambiguous' : 'not_found',
                });
                appendRecord({
                    type: 'unknown',
                    rawValue,
                    message: ambiguous ? 'Mã khớp nhiều máy' : 'Không xác định được máy',
                });
                setActiveTab('anomalies');
                message.warning(ambiguous ? 'Mã nhập vào khớp nhiều máy' : 'Không xác định được máy');
                return;
            }

            if (scannedAssetIds.has(asset.id)) {
                recordQrScan({
                    ...logBase,
                    assetId: asset.id,
                    result: 'duplicate',
                });
                message.info(`"${asset.name}" đã quét rồi`);
                return;
            }

            if (expectedMap.has(asset.id)) {
                recordQrScan({
                    ...logBase,
                    assetId: asset.id,
                    result: 'present',
                });
                appendRecord({ type: 'present', rawValue, asset, message: 'Có mặt trong phạm vi kiểm kê' });
                message.success(`Có mặt: ${asset.machineCode}`);
                return;
            }

            if (asset.plantId === selectedPlantId) {
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
                    message:
                        selectedArea === ALL_AREAS
                            ? 'Không thuộc danh sách kỳ vọng'
                            : `Sai khu vực, đang ở ${asset.area || 'chưa gắn khu vực'}`,
                });
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
            });
            setActiveTab('anomalies');
            message.error(`Sai vị trí: ${asset.machineCode}`);
        } finally {
            setResolving(false);
        }
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
        const missing = missingAssets.map((asset) => ({
            group: 'Thieu',
            code: asset.machineCode,
            name: asset.name,
            plant: asset.plant?.name ?? '',
            area: asset.area ?? '',
            status: ASSET_STATUS_LABEL[asset.status],
            note: 'Chua quet thay trong pham vi kiem ke',
            scannedAt: '',
        }));
        const anomalies = anomalyRecords.map((record) => ({
            group: 'Bat thuong',
            code: record.asset?.machineCode ?? record.rawValue,
            name: record.asset?.name ?? 'Khong xac dinh',
            plant: record.asset?.plant?.name ?? '',
            area: record.asset?.area ?? '',
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
            status: record.asset ? ASSET_STATUS_LABEL[record.asset.status] : '',
            note: record.message,
            scannedAt: formatTime(record.scannedAt),
        }));

        return [...missing, ...anomalies, ...present];
    }, [anomalyRecords, missingAssets, presentRecords]);

    const handleExportCsv = () => {
        const header = ['Nhom', 'Ma may', 'Ten may', 'Co so', 'Khu vuc', 'Trang thai', 'Ghi chu', 'Thoi gian quet'];
        const rows = exportRows.map((row) => [
            row.group,
            row.code,
            row.name,
            row.plant,
            row.area,
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
        y += 2;

        exportRows.forEach((row, index) => {
            writeLine(
                `${index + 1}. [${row.group}] ${row.code} - ${row.name} - ${row.plant}/${row.area} - ${row.note}`,
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

    const missingColumns: TableColumnsType<Asset> = [
        {
            title: 'Máy thiếu',
            render: (_value, record) => renderAssetSummary(record),
        },
        {
            title: 'Thao tác',
            width: 260,
            align: 'right',
            render: (_value, record) => (
                <div className='flex justify-end gap-2'>
                    <Button size='small' icon={<SaveOutlined />} onClick={() => setQuickAsset(record)}>
                        Đổi trạng thái
                    </Button>
                    <Button size='small' icon={<SwapOutlined />} onClick={() => setTransferTarget(record)}>
                        Tạo lệnh chuyển
                    </Button>
                </div>
            ),
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
            width: 300,
            align: 'right',
            render: (_value, record) =>
                record.asset ? (
                    <div className='flex justify-end gap-2'>
                        {record.type === 'wrong_area' && selectedArea !== ALL_AREAS ? (
                            <Button
                                size='small'
                                icon={<EnvironmentOutlined />}
                                onClick={() => handleUpdateAreaToScope(record.asset!)}
                            >
                                Cập nhật khu vực
                            </Button>
                        ) : null}
                        <Button size='small' icon={<SaveOutlined />} onClick={() => setQuickAsset(record.asset!)}>
                            Cập nhật nhanh
                        </Button>
                        <Button size='small' icon={<SwapOutlined />} onClick={() => setTransferTarget(record.asset!)}>
                            Tạo lệnh chuyển
                        </Button>
                    </div>
                ) : (
                    <Text type='secondary'>Không có máy để thao tác</Text>
                ),
        },
    ];

    const presentColumns: TableColumnsType<ScanRecord> = [
        {
            title: 'Có mặt',
            render: (_value, record) => (record.asset ? renderAssetSummary(record.asset) : null),
        },
        {
            title: 'Thời gian quét',
            width: 180,
            render: (_value, record) => <Text type='secondary'>{formatTime(record.scannedAt)}</Text>,
        },
    ];

    const activeData =
        activeTab === 'missing' ? missingAssets : activeTab === 'anomalies' ? anomalyRecords : presentRecords;

    const renderMobileList = () => {
        if (!activeData.length) {
            return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Chưa có dữ liệu trong nhóm này' />;
        }

        return (
            <div className='flex flex-col gap-3'>
                {activeTab === 'missing'
                    ? missingAssets.map((asset) => (
                          <Card key={asset.id} size='small' className='rounded-2xl'>
                              {renderAssetSummary(asset)}
                              <div className='mt-3 grid grid-cols-2 gap-2'>
                                  <Button icon={<SaveOutlined />} onClick={() => setQuickAsset(asset)}>
                                      Đổi trạng thái
                                  </Button>
                                  <Button icon={<SwapOutlined />} onClick={() => setTransferTarget(asset)}>
                                      Tạo lệnh chuyển
                                  </Button>
                              </div>
                          </Card>
                      ))
                    : activeTab === 'anomalies'
                      ? anomalyRecords.map((record) => (
                            <Card key={record.key} size='small' className='rounded-2xl'>
                                {record.asset ? renderAssetSummary(record.asset) : <Text code>{record.rawValue}</Text>}
                                <div className='mt-2 text-sm font-semibold text-amber-700'>{record.message}</div>
                                {record.asset ? (
                                    <div className='mt-3 grid grid-cols-1 gap-2'>
                                        {record.type === 'wrong_area' && selectedArea !== ALL_AREAS ? (
                                            <Button
                                                icon={<EnvironmentOutlined />}
                                                onClick={() => handleUpdateAreaToScope(record.asset!)}
                                            >
                                                Cập nhật khu vực về đây
                                            </Button>
                                        ) : null}
                                        <Button icon={<SaveOutlined />} onClick={() => setQuickAsset(record.asset!)}>
                                            Cập nhật nhanh
                                        </Button>
                                        <Button
                                            icon={<SwapOutlined />}
                                            onClick={() => setTransferTarget(record.asset!)}
                                        >
                                            Tạo lệnh điều chuyển
                                        </Button>
                                    </div>
                                ) : null}
                            </Card>
                        ))
                      : presentRecords.map((record) => (
                            <Card key={record.key} size='small' className='rounded-2xl'>
                                {record.asset ? renderAssetSummary(record.asset) : null}
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

    return (
        <div className='flex flex-col gap-5'>
            <PageHeader
                title='Kiểm kê QR'
                subtitle='Quét tem QR tại hiện trường để đối chiếu máy có mặt, thiếu và sai vị trí.'
                actions={
                    <div className='flex flex-wrap gap-2'>
                        <Button icon={<DownloadOutlined />} disabled={!started} onClick={handleExportCsv}>
                            Xuất CSV
                        </Button>
                        <Button icon={<FilePdfOutlined />} disabled={!started} onClick={handleExportPdf}>
                            Xuất PDF
                        </Button>
                    </div>
                }
            />

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
                        {started ? 'Bắt đầu lại' : 'Bắt đầu'}
                    </Button>
                </div>
                <Alert
                    className='mt-3 rounded-xl'
                    type='info'
                    showIcon
                    message='Kiểm kê đang đối chiếu trên thiết bị này'
                    description='Kết quả hiện tính client-side trong phiên làm việc. Nếu cần lưu lịch sử kiểm kê lâu dài, nên bổ sung backend ở giai đoạn sau.'
                />
            </Card>

            <div className='grid grid-cols-1 gap-4 lg:grid-cols-[420px_1fr]'>
                <div className='flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start'>
                    <Card className='rounded-2xl border-slate-200 shadow-sm' styles={{ body: { padding: 14 } }}>
                        <div className='mb-3 flex items-center justify-between'>
                            <div className='flex items-center gap-2 font-bold text-slate-900'>
                                <QrcodeOutlined className='text-blue-600' />
                                Quét kiểm kê
                            </div>
                            {started ? <Tag color='green'>Đang kiểm</Tag> : <Tag>Chưa bắt đầu</Tag>}
                        </div>
                        <QrCameraScanner active={started} onDetected={handleDetected} cooldownMs={1600} />
                    </Card>

                    <div className='grid grid-cols-2 gap-2'>
                        {[
                            { label: 'Cần kiểm', value: stats.expected, color: '#1d4ed8' },
                            { label: 'Đã quét', value: stats.scanned, color: '#0f172a' },
                            { label: 'Có mặt', value: stats.present, color: '#059669' },
                            { label: 'Thiếu', value: stats.missing, color: '#dc2626' },
                            { label: 'Bất thường', value: stats.anomalies, color: '#d97706' },
                        ].map((item) => (
                            <Card key={item.label} size='small' className='rounded-2xl border-slate-200'>
                                <Statistic
                                    title={<span className='text-xs font-bold text-slate-500'>{item.label}</span>}
                                    value={item.value}
                                    valueStyle={{ color: item.color, fontWeight: 800, fontSize: 22 }}
                                />
                            </Card>
                        ))}
                    </div>
                </div>

                <Card className='rounded-2xl border-slate-200 shadow-sm'>
                    <div className='mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between'>
                        <Segmented
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
                            description='Chọn phạm vi và bấm Bắt đầu để tạo danh sách máy kỳ vọng.'
                        />
                    ) : isDesktop ? (
                        activeTab === 'missing' ? (
                            <Table rowKey='id' size='small' columns={missingColumns} dataSource={missingAssets} />
                        ) : activeTab === 'anomalies' ? (
                            <Table rowKey='key' size='small' columns={anomalyColumns} dataSource={anomalyRecords} />
                        ) : (
                            <Table rowKey='key' size='small' columns={presentColumns} dataSource={presentRecords} />
                        )
                    ) : (
                        renderMobileList()
                    )}
                </Card>
            </div>

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
