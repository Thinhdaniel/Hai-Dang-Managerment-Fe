import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, App, Button, Card, InputNumber, Result, Select, Skeleton, Switch, Typography } from 'antd';
import {
    ArrowLeftOutlined,
    CheckCircleOutlined,
    DownloadOutlined,
    PrinterOutlined,
    SaveOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { qrLabelService } from '../core/services/qr-label.service';
import BrandQr from '../components/BrandQr';
import { AssetOwnershipType, QrLabelStatus, type QrLabel } from '../core/types';

const { Text } = Typography;

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const STORAGE_KEY = 'hai-dang-qr-print-template-v1';
const QR_TEXT_HEIGHT_MM = 2.6;
const QR_TEXT_GAP_MM = 0.35;
const QR_BRAND_HEIGHT_MM = 2.8;
const QR_DETAIL_HEIGHT_MM = 2.5;
// Quiet zone: viền trắng tối thiểu quanh QR để máy quét đọc ổn định, không để mã sát mép tem
const QR_QUIET_ZONE_MM = 0.8;
const CARD_BORDER_COLOR: [number, number, number] = [29, 78, 216];
const CARD_BORDER_WIDTH_MM = 0.3;
const CARD_BORDER_RADIUS_MM = 1.6;
const CROP_MARK_LENGTH_MM = 3.2;
const CROP_MARK_OFFSET_MM = 0.35;
const CUT_BORDER_WIDTH_MM = 0.25;

type PrintStyle = 'qr_only' | 'branded_compact' | 'branded_full';
type CutMode = 'none' | 'border' | 'crop_marks';
type RgbTuple = [number, number, number];
type OwnershipBadgeKey = AssetOwnershipType | 'unassigned';

type PrintTemplate = {
    preset: string;
    printStyle: PrintStyle;
    cutMode: CutMode;
    columns: number;
    rows: number;
    marginTop: number;
    marginLeft: number;
    labelWidth: number;
    labelHeight: number;
    gapX: number;
    gapY: number;
    qrSize: number;
    safePadding: number;
    showCode: boolean;
};

const presets: Record<string, Omit<PrintTemplate, 'preset'>> = {
    '4x8': {
        printStyle: 'branded_compact',
        cutMode: 'crop_marks',
        columns: 4,
        rows: 8,
        marginTop: 8,
        marginLeft: 8,
        labelWidth: 45,
        labelHeight: 33,
        gapX: 4,
        gapY: 3,
        qrSize: 24.5,
        safePadding: 1.5,
        showCode: true,
    },
    '3x8': {
        printStyle: 'branded_compact',
        cutMode: 'crop_marks',
        columns: 3,
        rows: 8,
        marginTop: 8,
        marginLeft: 7,
        labelWidth: 64,
        labelHeight: 33,
        gapX: 2,
        gapY: 3,
        qrSize: 25.5,
        safePadding: 1.8,
        showCode: true,
    },
    '5x10': {
        printStyle: 'branded_compact',
        cutMode: 'crop_marks',
        columns: 5,
        rows: 10,
        marginTop: 7,
        marginLeft: 7,
        labelWidth: 36,
        labelHeight: 25,
        gapX: 3,
        gapY: 3,
        qrSize: 18,
        safePadding: 1.3,
        showCode: true,
    },
};

const defaultTemplate: PrintTemplate = {
    preset: '4x8',
    ...presets['4x8'],
};

const getQrUrl = (publicId: string) => new URL(`/qr/${publicId}`, window.location.origin).toString();

const ownershipMeta: Record<
    OwnershipBadgeKey,
    { label: string; pdfLabel: string; color: RgbTuple; bg: RgbTuple; border: RgbTuple }
> = {
    [AssetOwnershipType.OWNED]: {
        label: 'HẢI ĐĂNG',
        pdfLabel: 'HAI DANG',
        color: [29, 78, 216],
        bg: [239, 246, 255],
        border: [191, 219, 254],
    },
    [AssetOwnershipType.PARTNER_BORROWED]: {
        label: 'MƯỢN',
        pdfLabel: 'MUON',
        color: [126, 34, 206],
        bg: [250, 245, 255],
        border: [221, 214, 254],
    },
    [AssetOwnershipType.RENTAL]: {
        label: 'THUÊ',
        pdfLabel: 'THUE',
        color: [180, 83, 9],
        bg: [255, 251, 235],
        border: [253, 230, 138],
    },
    unassigned: {
        label: 'QR TRẮNG',
        pdfLabel: 'QR TRANG',
        color: [71, 85, 105],
        bg: [248, 250, 252],
        border: [203, 213, 225],
    },
};

const rgbToCss = ([r, g, b]: RgbTuple) => `rgb(${r}, ${g}, ${b})`;

const getOwnershipMeta = (label: QrLabel) =>
    ownershipMeta[(label.asset?.ownershipType ?? 'unassigned') as OwnershipBadgeKey] ?? ownershipMeta.unassigned;

const getOwnershipStyle = (label: QrLabel) => {
    const ownership = getOwnershipMeta(label);
    return {
        '--qr-label-badge-color': rgbToCss(ownership.color),
        '--qr-label-badge-bg': rgbToCss(ownership.bg),
        '--qr-label-badge-border': rgbToCss(ownership.border),
    } as React.CSSProperties;
};

const getLabelPrimaryText = (label: QrLabel) => label.asset?.machineCode || label.publicId;

const getLabelDetailText = (label: QrLabel) => {
    if (label.asset?.name) return label.asset.name;
    if (label.status === QrLabelStatus.UNUSED) return 'Chưa kích hoạt';
    return 'Tem QR máy';
};

const loadTemplate = (): PrintTemplate => {
    if (typeof window === 'undefined') return defaultTemplate;

    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return defaultTemplate;
        const parsed = JSON.parse(raw);
        const migrated = {
            ...parsed,
            cutMode: parsed.cutMode ?? (parsed.showCutLines ? 'border' : 'none'),
            printStyle: parsed.printStyle ?? 'branded_compact',
            safePadding: parsed.safePadding ?? 1.2,
        };
        delete migrated.showCutLines;
        return { ...defaultTemplate, ...migrated, preset: 'custom' };
    } catch {
        return defaultTemplate;
    }
};

const chunkLabels = (labels: QrLabel[], size: number) => {
    const pages: QrLabel[][] = [];
    for (let i = 0; i < labels.length; i += size) {
        pages.push(labels.slice(i, i + size));
    }
    return pages.length ? pages : [[]];
};

const numberControlProps = {
    size: 'small' as const,
    controls: true,
    className: 'w-full',
};

const SettingNumber = ({
    label,
    value,
    min,
    max,
    step = 1,
    onChange,
}: {
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    onChange: (value: number) => void;
}) => (
    <label className='qr-print-setting'>
        <span>{label}</span>
        <InputNumber
            {...numberControlProps}
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(next) => onChange(Number(next ?? value))}
        />
    </label>
);

const QrBatchPrintPage: React.FC = () => {
    const { id = '' } = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { message } = App.useApp();
    const [template, setTemplate] = useState<PrintTemplate>(() => loadTemplate());
    // Mặc định chỉ in tem CHƯA DÙNG: in lại lô đã gán mà kéo cả tem đã dán sẽ đẻ ra bản
    // trùng vật lý (2 tem cùng mã), dán nhầm lên máy khác là hỏng truy xuất.
    const [onlyUnused, setOnlyUnused] = useState(true);
    const qrRefs = useRef<Record<string, HTMLDivElement | null>>({});

    const { data, isLoading, isError } = useQuery({
        queryKey: ['qr-label-batch', id],
        queryFn: () => qrLabelService.getBatchById(id),
        enabled: Boolean(id),
    });

    const allLabels = data?.labels ?? [];
    const unusedLabelCount = allLabels.filter((label) => label.status === QrLabelStatus.UNUSED).length;
    const assignedLabelCount = allLabels.filter((label) => label.status === QrLabelStatus.ASSIGNED).length;
    const printLabels = useMemo(
        () => (onlyUnused ? allLabels.filter((label) => label.status === QrLabelStatus.UNUSED) : allLabels),
        [allLabels, onlyUnused]
    );

    const markPrintedMutation = useMutation({
        mutationFn: () => qrLabelService.markBatchPrinted(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['qr-label-batch', id] });
            queryClient.invalidateQueries({ queryKey: ['qr-label-batches'] });
            message.success('Đã đánh dấu lô tem đã in');
        },
    });

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(template));
    }, [template]);

    const labelsPerPage = Math.max(1, template.columns * template.rows);
    const pages = useMemo(() => chunkLabels(printLabels, labelsPerPage), [printLabels, labelsPerPage]);

    const usedWidth =
        template.marginLeft + template.columns * template.labelWidth + (template.columns - 1) * template.gapX;
    const usedHeight = template.marginTop + template.rows * template.labelHeight + (template.rows - 1) * template.gapY;
    const layoutFits = usedWidth <= A4_WIDTH_MM && usedHeight <= A4_HEIGHT_MM;
    const hasBrand = template.printStyle !== 'qr_only';
    const hasDetail = template.printStyle === 'branded_full';
    const brandReserve = hasBrand ? QR_BRAND_HEIGHT_MM + QR_TEXT_GAP_MM : 0;
    const codeReserve = template.showCode ? QR_TEXT_HEIGHT_MM + QR_TEXT_GAP_MM : 0;
    const detailReserve = hasDetail ? QR_DETAIL_HEIGHT_MM + QR_TEXT_GAP_MM : 0;
    const availableWidth = Math.max(4, template.labelWidth - template.safePadding * 2 - QR_QUIET_ZONE_MM * 2);
    const availableHeight = Math.max(
        4,
        template.labelHeight - template.safePadding * 2 - brandReserve - codeReserve - detailReserve
    );
    const maxQrSize = Math.max(4, Math.min(availableWidth, availableHeight));
    const qrVisualSize = Math.min(template.qrSize, maxQrSize);
    const isQrSizeClamped = qrVisualSize < template.qrSize;
    // ~20px/mm ≈ 508 DPI để QR in ra sắc nét, không vỡ khi phóng vào PDF
    const canvasSize = Math.max(512, Math.round(qrVisualSize * 20));
    const cropMarkLength = Math.max(
        1.2,
        Math.min(
            CROP_MARK_LENGTH_MM,
            Math.max(0.8, template.gapX - CROP_MARK_OFFSET_MM),
            Math.max(0.8, template.gapY - CROP_MARK_OFFSET_MM),
            Math.max(0.8, template.marginLeft - CROP_MARK_OFFSET_MM),
            Math.max(0.8, template.marginTop - CROP_MARK_OFFSET_MM)
        )
    );
    const cutLineClass =
        template.cutMode === 'border'
            ? 'qr-print-label--cut-border'
            : template.cutMode === 'crop_marks'
              ? 'qr-print-label--crop-marks'
              : '';

    const updateTemplate = (patch: Partial<PrintTemplate>) => {
        setTemplate((prev) => ({ ...prev, ...patch, preset: patch.preset ?? 'custom' }));
    };

    const applyPreset = (preset: string) => {
        if (preset === 'custom') {
            setTemplate((prev) => ({ ...prev, preset: 'custom' }));
            return;
        }

        setTemplate({ preset, ...presets[preset] });
    };

    const pageStyle = {
        '--qr-template-columns': String(template.columns),
        '--qr-template-rows': String(template.rows),
        '--qr-template-margin-top': `${template.marginTop}mm`,
        '--qr-template-margin-left': `${template.marginLeft}mm`,
        '--qr-template-label-width': `${template.labelWidth}mm`,
        '--qr-template-label-height': `${template.labelHeight}mm`,
        '--qr-template-gap-x': `${template.gapX}mm`,
        '--qr-template-gap-y': `${template.gapY}mm`,
        '--qr-template-code-size': `${qrVisualSize}mm`,
        '--qr-template-code-gap': `${template.showCode ? QR_TEXT_GAP_MM : 0}mm`,
        '--qr-template-safe-padding': `${template.safePadding}mm`,
        '--qr-template-header-height': `${QR_BRAND_HEIGHT_MM}mm`,
        '--qr-template-code-height': `${QR_TEXT_HEIGHT_MM}mm`,
        '--qr-template-detail-height': `${QR_DETAIL_HEIGHT_MM}mm`,
        '--qr-template-crop-size': `${cropMarkLength}mm`,
        '--qr-template-crop-offset': `${CROP_MARK_OFFSET_MM}mm`,
        '--qr-template-crop-outset': `-${cropMarkLength + CROP_MARK_OFFSET_MM}mm`,
    } as React.CSSProperties;

    const drawCropMarks = (doc: any, x: number, y: number, width: number, height: number) => {
        const mark = Math.min(cropMarkLength, width / 5, height / 5);
        const offset = CROP_MARK_OFFSET_MM;

        doc.setDrawColor(51, 65, 85);
        doc.setLineWidth(0.25);
        doc.line(x - mark - offset, y - offset, x - offset, y - offset);
        doc.line(x - offset, y - mark - offset, x - offset, y - offset);
        doc.line(x + width + offset, y - offset, x + width + mark + offset, y - offset);
        doc.line(x + width + offset, y - mark - offset, x + width + offset, y - offset);
        doc.line(x - mark - offset, y + height + offset, x - offset, y + height + offset);
        doc.line(x - offset, y + height + offset, x - offset, y + height + mark + offset);
        doc.line(x + width + offset, y + height + offset, x + width + mark + offset, y + height + offset);
        doc.line(x + width + offset, y + height + offset, x + width + offset, y + height + mark + offset);
    };

    const drawLabelFrame = (doc: any, x: number, y: number) => {
        if (template.cutMode === 'none') return;

        if (template.cutMode === 'border') {
            // Tem branded đã có viền card bo góc làm đường cắt, không vẽ thêm dashed
            if (hasBrand) return;
            doc.setDrawColor(51, 65, 85);
            doc.setLineWidth(CUT_BORDER_WIDTH_MM);
            doc.setLineDashPattern?.([1.2, 0.8], 0);
            doc.rect(x, y, template.labelWidth, template.labelHeight);
            doc.setLineDashPattern?.([], 0);
            return;
        }

        drawCropMarks(doc, x, y, template.labelWidth, template.labelHeight);
    };

    const drawCardBorder = (doc: any, x: number, y: number) => {
        const inset = CARD_BORDER_WIDTH_MM / 2;
        doc.setDrawColor(CARD_BORDER_COLOR[0], CARD_BORDER_COLOR[1], CARD_BORDER_COLOR[2]);
        doc.setLineWidth(CARD_BORDER_WIDTH_MM);
        doc.roundedRect(
            x + inset,
            y + inset,
            template.labelWidth - CARD_BORDER_WIDTH_MM,
            template.labelHeight - CARD_BORDER_WIDTH_MM,
            CARD_BORDER_RADIUS_MM,
            CARD_BORDER_RADIUS_MM
        );
    };

    const handleDownloadPdf = async () => {
        if (!data || !printLabels.length) return;

        const { jsPDF } = await import('jspdf');
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });

        printLabels.forEach((label, index) => {
            if (index > 0 && index % labelsPerPage === 0) {
                doc.addPage('a4', 'portrait');
            }

            const slot = index % labelsPerPage;
            const col = slot % template.columns;
            const row = Math.floor(slot / template.columns);
            const x = template.marginLeft + col * (template.labelWidth + template.gapX);
            const y = template.marginTop + row * (template.labelHeight + template.gapY);
            const innerX = x + template.safePadding;
            const innerY = y + template.safePadding;
            const innerWidth = template.labelWidth - template.safePadding * 2;
            const innerHeight = template.labelHeight - template.safePadding * 2;
            let cursorY = innerY;
            const canvas = qrRefs.current[label.publicId]?.querySelector('canvas');
            const ownership = getOwnershipMeta(label);
            const primaryText = getLabelPrimaryText(label);
            const detailText = getLabelDetailText(label);

            drawLabelFrame(doc, x, y);

            if (hasBrand) {
                drawCardBorder(doc, x, y);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(6.2);
                const brandText = 'HAI DANG';
                const ownershipText = ownership.pdfLabel !== 'HAI DANG' ? ` · ${ownership.pdfLabel}` : '';
                const brandWidth = doc.getTextWidth(brandText);
                const totalWidth = brandWidth + (ownershipText ? doc.getTextWidth(ownershipText) : 0);
                const brandStartX = x + template.labelWidth / 2 - totalWidth / 2;
                const brandMidY = cursorY + QR_BRAND_HEIGHT_MM / 2 + 0.2;
                doc.setTextColor(CARD_BORDER_COLOR[0], CARD_BORDER_COLOR[1], CARD_BORDER_COLOR[2]);
                doc.text(brandText, brandStartX, brandMidY, { baseline: 'middle' });
                if (ownershipText) {
                    doc.setTextColor(ownership.color[0], ownership.color[1], ownership.color[2]);
                    doc.text(ownershipText, brandStartX + brandWidth, brandMidY, { baseline: 'middle' });
                }
                cursorY += QR_BRAND_HEIGHT_MM + QR_TEXT_GAP_MM;
            }

            const bottomReserve =
                (template.showCode ? QR_TEXT_HEIGHT_MM + QR_TEXT_GAP_MM : 0) +
                (hasDetail ? QR_DETAIL_HEIGHT_MM + QR_TEXT_GAP_MM : 0);
            const qrX = innerX + (innerWidth - qrVisualSize) / 2;
            const qrY = cursorY + Math.max(0, (innerHeight - (cursorY - innerY) - qrVisualSize - bottomReserve) / 2);

            if (canvas) {
                doc.addImage(
                    canvas.toDataURL('image/png'),
                    'PNG',
                    qrX,
                    qrY,
                    qrVisualSize,
                    qrVisualSize,
                    undefined,
                    'FAST'
                );
            }

            if (template.showCode) {
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(15, 23, 42);
                doc.setFontSize(6);
                doc.text(primaryText, x + template.labelWidth / 2, qrY + qrVisualSize + QR_TEXT_GAP_MM + 0.2, {
                    align: 'center',
                    baseline: 'top',
                    maxWidth: innerWidth,
                });
            }

            if (hasDetail) {
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(71, 85, 105);
                doc.setFontSize(4.6);
                doc.text(
                    detailText.slice(0, 34),
                    x + template.labelWidth / 2,
                    qrY + qrVisualSize + QR_TEXT_GAP_MM + QR_TEXT_HEIGHT_MM + QR_TEXT_GAP_MM + 0.1,
                    {
                        align: 'center',
                        baseline: 'top',
                        maxWidth: innerWidth,
                    }
                );
            }
        });

        doc.save(`${data.batch.code}-tem-qr.pdf`);
    };

    if (isLoading) {
        return <Skeleton active paragraph={{ rows: 10 }} className='rounded-xl bg-white p-6' />;
    }

    if (isError || !data) {
        return (
            <Result
                status='404'
                title='Không tìm thấy lô tem QR'
                extra={<Button onClick={() => navigate('/qr-labels')}>Quay lại</Button>}
            />
        );
    }

    return (
        <div className='qr-print-page flex flex-col gap-4'>
            <div className='qr-print-toolbar rounded-xl border border-slate-200 bg-white p-4 shadow-sm'>
                <div className='flex flex-col gap-4'>
                    <div className='flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
                        <div className='min-w-0'>
                            <Button
                                icon={<ArrowLeftOutlined />}
                                onClick={() => navigate('/qr-labels')}
                                className='mb-3'
                            >
                                Quay lại
                            </Button>
                            <h1 className='m-0 text-xl font-bold text-slate-900'>In lô tem {data.batch.code}</h1>
                            <Text type='secondary'>
                                {data.batch.quantity} tem · {unusedLabelCount} chưa dùng · {assignedLabelCount} đã gán
                                {' - '}
                                {data.batch.plant?.name || 'Không gán cơ sở'}{' '}
                                {data.batch.area ? `- ${data.batch.area}` : ''}
                            </Text>
                            <div className='mt-2 flex items-center gap-2'>
                                <Switch size='small' checked={onlyUnused} onChange={setOnlyUnused} />
                                <span className='text-sm font-medium text-slate-700'>
                                    Chỉ in tem chưa dùng ({unusedLabelCount})
                                </span>
                            </div>
                        </div>
                        <div className='flex flex-wrap gap-2'>
                            {!data.batch.printedAt ? (
                                <Button
                                    icon={<CheckCircleOutlined />}
                                    loading={markPrintedMutation.isPending}
                                    onClick={() => markPrintedMutation.mutate()}
                                >
                                    Đã in
                                </Button>
                            ) : null}
                            <Button icon={<PrinterOutlined />} onClick={() => window.print()}>
                                In / Save PDF
                            </Button>
                            <Button type='primary' icon={<DownloadOutlined />} onClick={handleDownloadPdf}>
                                Tải PDF A4
                            </Button>
                        </div>
                    </div>

                    {!onlyUnused && assignedLabelCount > 0 ? (
                        <Alert
                            type='warning'
                            showIcon
                            message={`Đang in CẢ ${assignedLabelCount} tem đã gán máy — sẽ tạo bản trùng của tem đang dán trên máy.`}
                            description='Chỉ tắt "Chỉ in tem chưa dùng" khi bạn thực sự cần in lại toàn bộ lô. Tuyệt đối không dán tem đã gán lên một máy khác — sẽ khiến hai máy chung một mã QR.'
                        />
                    ) : assignedLabelCount > 0 ? (
                        <Alert
                            type='info'
                            showIcon
                            message={`Lô này đã gán ${assignedLabelCount}/${data.batch.quantity} tem. Đang in ${printLabels.length} tem chưa dùng để tránh in trùng.`}
                        />
                    ) : null}

                    {onlyUnused && unusedLabelCount === 0 ? (
                        <Alert
                            type='warning'
                            showIcon
                            message='Lô này không còn tem chưa dùng để in.'
                            description='Tất cả tem trong lô đã được gán máy. Nếu cần thêm tem cho máy mới, hãy tạo lô mới.'
                        />
                    ) : null}

                    <Card size='small' className='qr-print-config-card'>
                        <div className='qr-print-config'>
                            <label className='qr-print-setting'>
                                <span>Mẫu giấy</span>
                                <Select
                                    size='small'
                                    value={template.preset}
                                    options={[
                                        { value: '4x8', label: 'A4 4 cột x 8 dòng' },
                                        { value: '3x8', label: 'A4 3 cột x 8 dòng' },
                                        { value: '5x10', label: 'A4 5 cột x 10 dòng' },
                                        { value: 'custom', label: 'Tùy chỉnh' },
                                    ]}
                                    onChange={applyPreset}
                                />
                            </label>
                            <label className='qr-print-setting'>
                                <span>Kiểu tem</span>
                                <Select
                                    size='small'
                                    value={template.printStyle}
                                    options={[
                                        { value: 'branded_compact', label: 'HAIDANG MS + mã' },
                                        { value: 'branded_full', label: 'HAIDANG MS + tên máy' },
                                        { value: 'qr_only', label: 'QR + mã' },
                                    ]}
                                    onChange={(printStyle: PrintStyle) => updateTemplate({ printStyle })}
                                />
                            </label>
                            <label className='qr-print-setting'>
                                <span>Đường cắt</span>
                                <Select
                                    size='small'
                                    value={template.cutMode}
                                    options={[
                                        { value: 'crop_marks', label: 'Dấu cắt ngoài' },
                                        { value: 'border', label: 'Viền nét đứt' },
                                        { value: 'none', label: 'Không in' },
                                    ]}
                                    onChange={(cutMode: CutMode) => updateTemplate({ cutMode })}
                                />
                            </label>
                            <SettingNumber
                                label='Cột'
                                value={template.columns}
                                min={1}
                                max={8}
                                onChange={(columns) => updateTemplate({ columns })}
                            />
                            <SettingNumber
                                label='Dòng'
                                value={template.rows}
                                min={1}
                                max={16}
                                onChange={(rows) => updateTemplate({ rows })}
                            />
                            <SettingNumber
                                label='Lề trái mm'
                                value={template.marginLeft}
                                min={0}
                                max={40}
                                step={0.5}
                                onChange={(marginLeft) => updateTemplate({ marginLeft })}
                            />
                            <SettingNumber
                                label='Lề trên mm'
                                value={template.marginTop}
                                min={0}
                                max={40}
                                step={0.5}
                                onChange={(marginTop) => updateTemplate({ marginTop })}
                            />
                            <SettingNumber
                                label='Rộng ô mm'
                                value={template.labelWidth}
                                min={10}
                                max={100}
                                step={0.5}
                                onChange={(labelWidth) => updateTemplate({ labelWidth })}
                            />
                            <SettingNumber
                                label='Cao ô mm'
                                value={template.labelHeight}
                                min={10}
                                max={80}
                                step={0.5}
                                onChange={(labelHeight) => updateTemplate({ labelHeight })}
                            />
                            <SettingNumber
                                label='Gap ngang mm'
                                value={template.gapX}
                                min={0}
                                max={20}
                                step={0.5}
                                onChange={(gapX) => updateTemplate({ gapX })}
                            />
                            <SettingNumber
                                label='Gap dọc mm'
                                value={template.gapY}
                                min={0}
                                max={20}
                                step={0.5}
                                onChange={(gapY) => updateTemplate({ gapY })}
                            />
                            <SettingNumber
                                label='QR mm'
                                value={template.qrSize}
                                min={8}
                                max={60}
                                step={0.5}
                                onChange={(qrSize) => updateTemplate({ qrSize })}
                            />
                            <SettingNumber
                                label='Padding mm'
                                value={template.safePadding}
                                min={0.5}
                                max={6}
                                step={0.1}
                                onChange={(safePadding) => updateTemplate({ safePadding })}
                            />
                            <label className='qr-print-switch'>
                                <span>Mã nhỏ</span>
                                <Switch
                                    size='small'
                                    checked={template.showCode}
                                    onChange={(showCode) => updateTemplate({ showCode })}
                                />
                            </label>
                        </div>
                        <div className='mt-3 flex flex-col gap-2 md:flex-row md:items-start md:justify-between'>
                            <div className='flex flex-col gap-1'>
                                <Text type='secondary' className='text-xs'>
                                    A4 dùng {usedWidth.toFixed(1)} / 210mm ngang, {usedHeight.toFixed(1)} / 297mm dọc.
                                    Mỗi trang in {labelsPerPage} tem.
                                </Text>
                                <Text type='secondary' className='text-xs'>
                                    Khi in từ trình duyệt: chọn A4, Scale 100%, tắt Fit to page nếu thấy lệch kích
                                    thước.
                                </Text>
                            </div>
                            <Button
                                size='small'
                                icon={<SaveOutlined />}
                                onClick={() => localStorage.setItem(STORAGE_KEY, JSON.stringify(template))}
                            >
                                Lưu cấu hình
                            </Button>
                        </div>
                    </Card>

                    {!layoutFits ? (
                        <Alert
                            type='warning'
                            showIcon
                            message='Cấu hình tem đang vượt khổ A4'
                            description='Giảm số cột/dòng, kích thước ô, khoảng cách hoặc lề trước khi tải PDF/in để tránh bị cắt mất tem.'
                        />
                    ) : null}

                    {isQrSizeClamped ? (
                        <Alert
                            type='warning'
                            showIcon
                            message='Kích thước QR đang lớn hơn ô tem'
                            description={`QR nhập ${template.qrSize}mm, hệ thống đang render ${qrVisualSize.toFixed(
                                1
                            )}mm để không tràn khỏi ô ${template.labelWidth}x${template.labelHeight}mm.`}
                        />
                    ) : null}
                </div>
            </div>

            <div className='qr-print-sheet'>
                {pages.map((pageLabels, pageIndex) => (
                    <section key={pageIndex} className='qr-print-paper' style={pageStyle}>
                        <div className='qr-print-grid'>
                            {pageLabels.map((label) => {
                                const ownership = getOwnershipMeta(label);

                                return (
                                    <article
                                        key={label.id}
                                        className={`qr-print-label qr-print-label--${template.printStyle} ${cutLineClass}`}
                                        style={getOwnershipStyle(label)}
                                    >
                                        {template.cutMode === 'crop_marks' ? (
                                            <>
                                                <span className='qr-print-crop qr-print-crop--tl' />
                                                <span className='qr-print-crop qr-print-crop--tr' />
                                                <span className='qr-print-crop qr-print-crop--bl' />
                                                <span className='qr-print-crop qr-print-crop--br' />
                                            </>
                                        ) : null}
                                        <div className='qr-print-label__content'>
                                            {template.printStyle !== 'qr_only' ? (
                                                <div className='qr-print-label__brand'>
                                                    <span>HẢI ĐĂNG</span>
                                                    {ownership.label !== 'HẢI ĐĂNG' ? (
                                                        <strong>· {ownership.label}</strong>
                                                    ) : null}
                                                </div>
                                            ) : null}
                                            <div
                                                ref={(node) => {
                                                    qrRefs.current[label.publicId] = node;
                                                }}
                                                className='qr-print-label__qr'
                                            >
                                                <BrandQr value={getQrUrl(label.publicId)} size={canvasSize} />
                                            </div>
                                            {template.showCode ? (
                                                <div className='qr-print-label__code'>{getLabelPrimaryText(label)}</div>
                                            ) : null}
                                            {template.printStyle === 'branded_full' ? (
                                                <div className='qr-print-label__detail'>
                                                    {getLabelDetailText(label)}
                                                </div>
                                            ) : null}
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    </section>
                ))}
            </div>
        </div>
    );
};

export default QrBatchPrintPage;
