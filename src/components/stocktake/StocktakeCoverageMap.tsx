import React, { useMemo, useRef } from 'react';
import { Button, Empty, Modal, Progress, Tag } from 'antd';
import {
    CheckCircleFilled,
    ClockCircleOutlined,
    EnvironmentOutlined,
    PlayCircleOutlined,
    PrinterOutlined,
    ReloadOutlined,
} from '@ant-design/icons';
import BrandQr from '../BrandQr';
import type { StocktakeCoverageStatus, StocktakeCoverageZone } from '../../core/types';

export type RuntimeCoverageZone = StocktakeCoverageZone & { zoneId: string };

type StocktakeCoverageMapProps = {
    zones: RuntimeCoverageZone[];
    activeZoneId?: string | null;
    disabled?: boolean;
    onActivate: (zone: RuntimeCoverageZone) => void;
    onComplete: (zone: RuntimeCoverageZone) => void;
    onReopen: (zone: RuntimeCoverageZone) => void;
    onPrint: (zone: RuntimeCoverageZone) => void;
};

const STATUS_META: Record<
    StocktakeCoverageStatus,
    { label: string; border: string; background: string; color: string }
> = {
    pending: { label: 'Chưa đi', border: '#cbd5e1', background: '#f8fafc', color: '#475569' },
    in_progress: { label: 'Đang quét', border: '#0891b2', background: '#ecfeff', color: '#0e7490' },
    completed: { label: 'Đã hoàn tất', border: '#059669', background: '#ecfdf5', color: '#047857' },
    skipped: { label: 'Bỏ qua', border: '#d97706', background: '#fffbeb', color: '#b45309' },
};

const clamp = (value: number | undefined, min: number, max: number, fallback: number) =>
    Math.min(max, Math.max(min, typeof value === 'number' ? value : fallback));

const StocktakeCoverageMap: React.FC<StocktakeCoverageMapProps> = ({
    zones,
    activeZoneId,
    disabled,
    onActivate,
    onComplete,
    onReopen,
    onPrint,
}) => {
    const completedCount = zones.filter((zone) => zone.status === 'completed').length;
    const percent = zones.length ? Math.round((completedCount / zones.length) * 100) : 0;

    if (!zones.length) {
        return (
            <div className='rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6'>
                <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description='Cơ sở chưa có khu vực trên Sơ đồ xưởng. Kiểm kê vẫn dùng được nhưng chưa thể đo coverage.'
                />
            </div>
        );
    }

    return (
        <div className='space-y-3'>
            <div className='flex items-center justify-between gap-3'>
                <div>
                    <div className='text-sm font-bold text-slate-900'>Coverage xưởng</div>
                    <div className='mt-0.5 text-xs text-slate-500'>
                        {completedCount}/{zones.length} vùng đã xác nhận đi qua
                    </div>
                </div>
                <div className='w-28'>
                    <Progress percent={percent} size='small' strokeColor='#0891b2' />
                </div>
            </div>

            <div className='relative aspect-[16/10] min-h-[230px] overflow-hidden rounded-2xl border border-slate-200 bg-[linear-gradient(90deg,rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(rgba(148,163,184,0.12)_1px,transparent_1px)] bg-[size:20px_20px]'>
                <div className='absolute top-3 left-3 z-10 rounded-lg border border-white/80 bg-white/90 px-2.5 py-1.5 text-[10px] font-bold tracking-wide text-slate-500 uppercase shadow-sm backdrop-blur'>
                    <EnvironmentOutlined className='mr-1 text-cyan-600' /> Bản đồ coverage
                </div>
                {zones.map((zone) => {
                    const meta = STATUS_META[zone.status];
                    const isActive = zone.zoneId === activeZoneId;
                    const left = clamp(zone.x, 0, 96, 2);
                    const top = clamp(zone.y, 0, 94, 12);
                    const width = Math.min(clamp(zone.w, 8, 100, 24), 100 - left);
                    const height = Math.min(clamp(zone.h, 8, 100, 22), 100 - top);

                    return (
                        <button
                            type='button'
                            key={zone.zoneId}
                            disabled={disabled}
                            onClick={() => onActivate(zone)}
                            className={`group absolute overflow-hidden rounded-xl border-2 p-2 text-left shadow-sm transition-all duration-200 hover:z-20 hover:-translate-y-0.5 hover:shadow-md disabled:cursor-default ${
                                isActive ? 'z-20 ring-4 ring-cyan-200/70' : ''
                            }`}
                            style={{
                                left: `${left}%`,
                                top: `${top}%`,
                                width: `${width}%`,
                                height: `${height}%`,
                                minWidth: 72,
                                minHeight: 58,
                                borderColor: meta.border,
                                background: meta.background,
                                color: meta.color,
                            }}
                        >
                            <span className='block truncate text-xs font-black'>{zone.name}</span>
                            <span className='mt-1 block text-[10px] font-semibold opacity-80'>
                                {zone.scannedCount}/{zone.expectedCount} máy
                            </span>
                            {zone.status === 'completed' ? (
                                <CheckCircleFilled className='absolute right-2 bottom-2 text-emerald-600' />
                            ) : zone.status === 'in_progress' ? (
                                <span className='absolute right-2 bottom-2 h-2.5 w-2.5 animate-pulse rounded-full bg-cyan-500 shadow-[0_0_0_4px_rgba(6,182,212,0.18)]' />
                            ) : null}
                        </button>
                    );
                })}
            </div>

            <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
                {zones.map((zone) => {
                    const meta = STATUS_META[zone.status];
                    const isActive = zone.zoneId === activeZoneId;
                    return (
                        <div
                            key={zone.zoneId}
                            className={`rounded-xl border bg-white p-3 transition-colors ${
                                isActive ? 'border-cyan-300 ring-2 ring-cyan-100' : 'border-slate-200'
                            }`}
                        >
                            <div className='flex items-start justify-between gap-2'>
                                <div className='min-w-0'>
                                    <div className='truncate text-sm font-bold text-slate-900'>{zone.name}</div>
                                    <div className='mt-1 text-xs text-slate-500'>
                                        Đã thấy {zone.scannedCount}/{zone.expectedCount} máy kỳ vọng
                                    </div>
                                </div>
                                <Tag
                                    className='!m-0 shrink-0'
                                    style={{ color: meta.color, borderColor: meta.border, background: meta.background }}
                                >
                                    {meta.label}
                                </Tag>
                            </div>
                            <div className='mt-3 flex flex-wrap gap-2'>
                                {zone.status === 'completed' ? (
                                    <Button
                                        size='small'
                                        icon={<ReloadOutlined />}
                                        disabled={disabled}
                                        onClick={() => onReopen(zone)}
                                    >
                                        Mở lại
                                    </Button>
                                ) : (
                                    <Button
                                        size='small'
                                        type={isActive ? 'primary' : 'default'}
                                        icon={isActive ? <ClockCircleOutlined /> : <PlayCircleOutlined />}
                                        disabled={disabled}
                                        onClick={() => onActivate(zone)}
                                    >
                                        {isActive ? 'Đang quét vùng này' : 'Bắt đầu vùng'}
                                    </Button>
                                )}
                                {isActive && zone.status !== 'completed' ? (
                                    <Button
                                        size='small'
                                        type='primary'
                                        className='!bg-emerald-600 hover:!bg-emerald-700'
                                        icon={<CheckCircleFilled />}
                                        disabled={disabled}
                                        onClick={() => onComplete(zone)}
                                    >
                                        Hoàn tất vùng
                                    </Button>
                                ) : null}
                                <Button
                                    size='small'
                                    type='text'
                                    icon={<PrinterOutlined />}
                                    disabled={!zone.anchorCode}
                                    onClick={() => onPrint(zone)}
                                >
                                    QR vùng
                                </Button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

type ZoneAnchorModalProps = {
    zone: RuntimeCoverageZone | null;
    open: boolean;
    onClose: () => void;
};

export const ZoneAnchorModal: React.FC<ZoneAnchorModalProps> = ({ zone, open, onClose }) => {
    const qrContainerRef = useRef<HTMLDivElement | null>(null);
    const anchorUrl = useMemo(() => {
        if (!zone?.anchorCode) return '';
        return `${window.location.origin}/assets/stocktake?zone=${encodeURIComponent(zone.anchorCode)}`;
    }, [zone?.anchorCode]);

    const getCanvas = () => qrContainerRef.current?.querySelector('canvas') ?? null;

    const downloadPng = () => {
        const canvas = getCanvas();
        if (!canvas || !zone) return;
        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = `QR-VUNG-${zone.name.replace(/[^a-zA-Z0-9\u00C0-\u024F]+/g, '-')}.png`;
        link.click();
    };

    const printAnchor = () => {
        const canvas = getCanvas();
        if (!canvas || !zone) return;
        const popup = window.open('', '_blank', 'width=720,height=820');
        if (!popup) return;

        popup.document.title = `QR vùng ${zone.name}`;
        const style = popup.document.createElement('style');
        style.textContent = `
            @page { size: A4 portrait; margin: 12mm; }
            body { margin: 0; font-family: Arial, sans-serif; color: #0f172a; }
            .sheet { width: 186mm; min-height: 273mm; display: flex; align-items: flex-start; justify-content: center; }
            .label { box-sizing: border-box; width: 92mm; min-height: 112mm; margin-top: 8mm; padding: 8mm; border: 0.25mm dashed #94a3b8; text-align: center; }
            .brand { font-size: 12pt; font-weight: 800; letter-spacing: 1.5px; }
            .title { margin-top: 3mm; font-size: 18pt; font-weight: 800; }
            .subtitle { margin-top: 2mm; font-size: 10pt; color: #475569; }
            img { width: 68mm; height: 68mm; margin-top: 5mm; }
            .code { margin-top: 3mm; font-family: Consolas, monospace; font-size: 10pt; font-weight: 700; }
        `;
        popup.document.head.appendChild(style);
        const sheet = popup.document.createElement('div');
        sheet.className = 'sheet';
        const label = popup.document.createElement('div');
        label.className = 'label';
        const brand = popup.document.createElement('div');
        brand.className = 'brand';
        brand.textContent = 'HAIDANG MS · KHU VỰC KIỂM KÊ';
        const title = popup.document.createElement('div');
        title.className = 'title';
        title.textContent = zone.name;
        const subtitle = popup.document.createElement('div');
        subtitle.className = 'subtitle';
        subtitle.textContent = 'Quét mã này trước khi bắt đầu kiểm kê khu vực';
        const image = popup.document.createElement('img');
        image.src = canvas.toDataURL('image/png');
        const code = popup.document.createElement('div');
        code.className = 'code';
        code.textContent = zone.anchorCode || '';
        label.append(brand, title, subtitle, image, code);
        sheet.appendChild(label);
        popup.document.body.appendChild(sheet);
        popup.setTimeout(() => {
            popup.focus();
            popup.print();
        }, 250);
    };

    return (
        <Modal
            open={open}
            onCancel={onClose}
            title='QR anchor khu vực'
            footer={
                <div className='flex flex-wrap justify-end gap-2'>
                    <Button onClick={onClose}>Đóng</Button>
                    <Button onClick={downloadPng}>Tải PNG</Button>
                    <Button type='primary' icon={<PrinterOutlined />} onClick={printAnchor}>
                        In tem vùng
                    </Button>
                </div>
            }
            width={520}
        >
            {zone && anchorUrl ? (
                <div className='py-2 text-center'>
                    <div className='text-xs font-bold tracking-[0.18em] text-slate-400 uppercase'>HAIDANG MS</div>
                    <div className='mt-2 text-xl font-black text-slate-900'>{zone.name}</div>
                    <div
                        ref={qrContainerRef}
                        className='zone-anchor-qr mx-auto mt-4 w-fit rounded-2xl border border-slate-200 bg-white p-3 shadow-sm'
                    >
                        <BrandQr value={anchorUrl} size={900} />
                    </div>
                    <div className='mt-3 font-mono text-sm font-bold text-slate-700'>{zone.anchorCode}</div>
                    <div className='mt-2 text-xs leading-5 text-slate-500'>
                        Dán tại đầu dãy hoặc cửa khu vực, ở vị trí dễ thấy và đủ sáng. Mã vùng không thay đổi khi sửa
                        tên hoặc tọa độ trên sơ đồ.
                    </div>
                </div>
            ) : null}
        </Modal>
    );
};

export default StocktakeCoverageMap;
