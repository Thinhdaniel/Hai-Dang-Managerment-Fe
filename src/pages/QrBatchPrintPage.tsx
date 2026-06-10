import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, App, Button, Card, InputNumber, QRCode, Result, Select, Skeleton, Switch, Typography } from 'antd';
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
import type { QrLabel } from '../core/types';

const { Text } = Typography;

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const STORAGE_KEY = 'hai-dang-qr-print-template-v1';
const QR_TEXT_HEIGHT_MM = 3.2;
const QR_TEXT_GAP_MM = 0.8;

type PrintTemplate = {
    preset: string;
    columns: number;
    rows: number;
    marginTop: number;
    marginLeft: number;
    labelWidth: number;
    labelHeight: number;
    gapX: number;
    gapY: number;
    qrSize: number;
    showCode: boolean;
    showCutLines: boolean;
};

const presets: Record<string, Omit<PrintTemplate, 'preset'>> = {
    '4x8': {
        columns: 4,
        rows: 8,
        marginTop: 8,
        marginLeft: 8,
        labelWidth: 46,
        labelHeight: 33,
        gapX: 4,
        gapY: 3,
        qrSize: 24,
        showCode: true,
        showCutLines: true,
    },
    '3x8': {
        columns: 3,
        rows: 8,
        marginTop: 8,
        marginLeft: 7,
        labelWidth: 64,
        labelHeight: 33,
        gapX: 2,
        gapY: 3,
        qrSize: 25,
        showCode: true,
        showCutLines: true,
    },
    '5x10': {
        columns: 5,
        rows: 10,
        marginTop: 7,
        marginLeft: 7,
        labelWidth: 36,
        labelHeight: 25,
        gapX: 3,
        gapY: 3,
        qrSize: 19,
        showCode: true,
        showCutLines: true,
    },
};

const defaultTemplate: PrintTemplate = {
    preset: '4x8',
    ...presets['4x8'],
};

const getQrUrl = (publicId: string) => new URL(`/qr/${publicId}`, window.location.origin).toString();

const loadTemplate = (): PrintTemplate => {
    if (typeof window === 'undefined') return defaultTemplate;

    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return defaultTemplate;
        return { ...defaultTemplate, ...JSON.parse(raw), preset: 'custom' };
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
    const qrRefs = useRef<Record<string, HTMLDivElement | null>>({});

    const { data, isLoading, isError } = useQuery({
        queryKey: ['qr-label-batch', id],
        queryFn: () => qrLabelService.getBatchById(id),
        enabled: Boolean(id),
    });

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
    const pages = useMemo(() => chunkLabels(data?.labels ?? [], labelsPerPage), [data?.labels, labelsPerPage]);

    const usedWidth =
        template.marginLeft + template.columns * template.labelWidth + (template.columns - 1) * template.gapX;
    const usedHeight = template.marginTop + template.rows * template.labelHeight + (template.rows - 1) * template.gapY;
    const layoutFits = usedWidth <= A4_WIDTH_MM && usedHeight <= A4_HEIGHT_MM;
    const qrVerticalReserve = template.showCode ? QR_TEXT_HEIGHT_MM + QR_TEXT_GAP_MM : 0;
    const maxQrSize = Math.max(4, Math.min(template.labelWidth, template.labelHeight - qrVerticalReserve));
    const qrVisualSize = Math.min(template.qrSize, maxQrSize);
    const isQrSizeClamped = qrVisualSize < template.qrSize;
    const canvasSize = Math.max(160, Math.round(qrVisualSize * 10));

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
    } as React.CSSProperties;

    const handleDownloadPdf = async () => {
        if (!data?.labels.length) return;

        const { jsPDF } = await import('jspdf');
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });

        data.labels.forEach((label, index) => {
            if (index > 0 && index % labelsPerPage === 0) {
                doc.addPage('a4', 'portrait');
            }

            const slot = index % labelsPerPage;
            const col = slot % template.columns;
            const row = Math.floor(slot / template.columns);
            const x = template.marginLeft + col * (template.labelWidth + template.gapX);
            const y = template.marginTop + row * (template.labelHeight + template.gapY);
            const codeHeight = template.showCode ? QR_TEXT_HEIGHT_MM + QR_TEXT_GAP_MM : 0;
            const qrX = x + (template.labelWidth - qrVisualSize) / 2;
            const qrY = y + Math.max(0, (template.labelHeight - qrVisualSize - codeHeight) / 2);
            const canvas = qrRefs.current[label.publicId]?.querySelector('canvas');

            if (template.showCutLines) {
                doc.setDrawColor(205, 213, 225);
                doc.setLineWidth(0.1);
                doc.rect(x, y, template.labelWidth, template.labelHeight);
            }

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
                doc.setFontSize(5.5);
                doc.text(label.publicId, x + template.labelWidth / 2, qrY + qrVisualSize + QR_TEXT_GAP_MM + 1.2, {
                    align: 'center',
                    baseline: 'top',
                });
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
                                {data.batch.quantity} tem - {data.batch.plant?.name || 'Không gán cơ sở'}{' '}
                                {data.batch.area ? `- ${data.batch.area}` : ''}
                            </Text>
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
                            <label className='qr-print-switch'>
                                <span>Mã nhỏ</span>
                                <Switch
                                    size='small'
                                    checked={template.showCode}
                                    onChange={(showCode) => updateTemplate({ showCode })}
                                />
                            </label>
                            <label className='qr-print-switch'>
                                <span>Đường cắt</span>
                                <Switch
                                    size='small'
                                    checked={template.showCutLines}
                                    onChange={(showCutLines) => updateTemplate({ showCutLines })}
                                />
                            </label>
                        </div>
                        <div className='mt-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between'>
                            <Text type='secondary' className='text-xs'>
                                A4 dùng {usedWidth.toFixed(1)} / 210mm ngang, {usedHeight.toFixed(1)} / 297mm dọc. Mỗi
                                trang in {labelsPerPage} tem.
                            </Text>
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
                            {pageLabels.map((label) => (
                                <article
                                    key={label.id}
                                    className={`qr-print-label ${template.showCutLines ? 'qr-print-label--cut' : ''}`}
                                >
                                    <div
                                        ref={(node) => {
                                            qrRefs.current[label.publicId] = node;
                                        }}
                                        className='qr-print-label__qr'
                                    >
                                        <QRCode
                                            value={getQrUrl(label.publicId)}
                                            size={canvasSize}
                                            type='canvas'
                                            bordered={false}
                                        />
                                    </div>
                                    {template.showCode ? (
                                        <div className='qr-print-label__code'>{label.publicId}</div>
                                    ) : null}
                                </article>
                            ))}
                        </div>
                    </section>
                ))}
            </div>
        </div>
    );
};

export default QrBatchPrintPage;
