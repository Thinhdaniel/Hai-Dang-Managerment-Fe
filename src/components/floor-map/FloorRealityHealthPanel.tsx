import React, { useMemo } from 'react';
import { Empty, Progress, Spin } from 'antd';
import {
    CheckCircleOutlined,
    ClockCircleOutlined,
    DisconnectOutlined,
    EnvironmentOutlined,
    QuestionCircleOutlined,
} from '@ant-design/icons';
import type { FloorRealityHealth, FloorRealityStatus } from '../../core/types';

export type FloorRealityFilter = 'all' | FloorRealityStatus;

type Props = {
    health?: FloorRealityHealth;
    loading?: boolean;
    filter: FloorRealityFilter;
    onFilterChange: (filter: FloorRealityFilter) => void;
    onSelectMachine: (assetId: string) => void;
};

export const REALITY_META: Record<
    FloorRealityStatus,
    { label: string; shortLabel: string; color: string; background: string; icon: React.ReactNode }
> = {
    verified: {
        label: 'Đúng vị trí',
        shortLabel: 'Đã xác minh',
        color: '#059669',
        background: '#ecfdf5',
        icon: <CheckCircleOutlined />,
    },
    drift: {
        label: 'Sai vùng',
        shortLabel: 'Sai vùng',
        color: '#dc2626',
        background: '#fef2f2',
        icon: <DisconnectOutlined />,
    },
    unplaced: {
        label: 'Đã thấy, chưa lên sơ đồ',
        shortLabel: 'Chưa xếp',
        color: '#d97706',
        background: '#fffbeb',
        icon: <EnvironmentOutlined />,
    },
    stale: {
        label: 'Bằng chứng đã cũ',
        shortLabel: 'Dữ liệu cũ',
        color: '#7c3aed',
        background: '#f5f3ff',
        icon: <ClockCircleOutlined />,
    },
    unverified: {
        label: 'Chưa xác minh',
        shortLabel: 'Chưa xác minh',
        color: '#64748b',
        background: '#f8fafc',
        icon: <QuestionCircleOutlined />,
    },
};

const FILTERS: FloorRealityFilter[] = ['all', 'drift', 'unplaced', 'stale', 'unverified', 'verified'];

const FloorRealityHealthPanel: React.FC<Props> = ({ health, loading, filter, onFilterChange, onSelectMachine }) => {
    const anomalies = useMemo(
        () =>
            (health?.machines ?? [])
                .filter((machine) => machine.status !== 'verified')
                .filter((machine) => filter === 'all' || machine.status === filter)
                .sort((left, right) => left.score - right.score),
        [filter, health?.machines]
    );
    const zones = useMemo(
        () => [...(health?.zones ?? [])].sort((left, right) => left.score - right.score),
        [health?.zones]
    );

    if (loading)
        return (
            <div className='flex min-h-40 items-center justify-center'>
                <Spin />
            </div>
        );
    if (!health) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Chưa có dữ liệu Reality Health' />;

    return (
        <div>
            <div className='flex items-center gap-4'>
                <Progress
                    type='circle'
                    percent={health.score}
                    size={76}
                    strokeWidth={9}
                    strokeColor={health.score >= 80 ? '#059669' : health.score >= 55 ? '#d97706' : '#dc2626'}
                    format={(value) => <span className='text-base font-black'>{value}</span>}
                />
                <div className='min-w-0'>
                    <div className='text-sm font-bold text-slate-900'>Độ tin cậy sơ đồ</div>
                    <div className='mt-1 text-xs leading-5 text-slate-500'>
                        Đối chiếu {health.total} máy với bằng chứng kiểm kê. Quá {health.staleDays} ngày được xem là cũ.
                    </div>
                </div>
            </div>

            <div className='mt-4 grid grid-cols-2 gap-2'>
                {FILTERS.map((item) => {
                    const active = filter === item;
                    const count = item === 'all' ? health.total : health.counts[item];
                    const meta = item === 'all' ? null : REALITY_META[item];
                    return (
                        <button
                            type='button'
                            key={item}
                            onClick={() => onFilterChange(item)}
                            className={`flex min-h-11 items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                                active
                                    ? 'border-cyan-400 bg-cyan-50 ring-2 ring-cyan-100'
                                    : 'border-slate-200 bg-white hover:border-slate-300'
                            }`}
                        >
                            <span style={{ color: meta?.color ?? '#0891b2' }}>
                                {meta?.icon ?? <EnvironmentOutlined />}
                            </span>
                            <span className='min-w-0 flex-1 truncate text-xs font-semibold text-slate-600'>
                                {meta?.shortLabel ?? 'Tất cả'}
                            </span>
                            <span className='text-sm font-black text-slate-900'>{count}</span>
                        </button>
                    );
                })}
            </div>

            <div className='mt-5'>
                <div className='mb-2 text-xs font-bold tracking-wide text-slate-400 uppercase'>Vùng cần chú ý</div>
                <div className='space-y-1.5'>
                    {zones.slice(0, 5).map((zone) => (
                        <div key={zone.zoneId} className='rounded-lg border border-slate-200 bg-white px-3 py-2'>
                            <div className='flex items-center justify-between gap-2'>
                                <span className='truncate text-xs font-bold text-slate-700'>{zone.zoneName}</span>
                                <span
                                    className={`text-xs font-black ${zone.score >= 80 ? 'text-emerald-600' : zone.score >= 55 ? 'text-amber-600' : 'text-red-600'}`}
                                >
                                    {zone.score}%
                                </span>
                            </div>
                            <div className='mt-1 text-[11px] text-slate-400'>
                                {zone.counts.drift} sai vùng · {zone.counts.unplaced} chưa xếp · {zone.counts.stale} cũ
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {anomalies.length ? (
                <div className='mt-5'>
                    <div className='mb-2 text-xs font-bold tracking-wide text-slate-400 uppercase'>
                        Bất thường ưu tiên
                    </div>
                    <div className='max-h-56 space-y-1 overflow-y-auto'>
                        {anomalies.slice(0, 20).map((machine) => {
                            const meta = REALITY_META[machine.status];
                            return (
                                <button
                                    type='button'
                                    key={machine.assetId}
                                    onClick={() => onSelectMachine(machine.assetId)}
                                    className='flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-slate-50'
                                >
                                    <span
                                        className='flex h-7 w-7 shrink-0 items-center justify-center rounded-md'
                                        style={{ color: meta.color, background: meta.background }}
                                    >
                                        {meta.icon}
                                    </span>
                                    <span className='min-w-0 flex-1'>
                                        <span className='block truncate text-xs font-bold text-slate-700'>
                                            {machine.machineCode}
                                        </span>
                                        <span className='block truncate text-[11px] text-slate-400'>{meta.label}</span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            ) : null}
        </div>
    );
};

export default FloorRealityHealthPanel;
