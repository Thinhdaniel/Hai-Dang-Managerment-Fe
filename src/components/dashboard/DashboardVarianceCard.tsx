import React, { useState } from 'react';
import { Card, Segmented, Spin, Tag } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, LineChartOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { varianceService, type VarianceMetric, type VariancePeriod } from '../../core/services/variance.service';

const METRICS: { label: string; value: VarianceMetric }[] = [
    { label: 'Tổng chi phí', value: 'total_cost' },
    { label: 'Sửa ngoài', value: 'repair_cost' },
    { label: 'Cấp phát', value: 'distribution_cost' },
    { label: 'Phiếu bảo trì', value: 'maintenance_tickets' },
];

const DashboardVarianceCard: React.FC = () => {
    const [metric, setMetric] = useState<VarianceMetric>('total_cost');
    const [period, setPeriod] = useState<VariancePeriod>('month');

    const { data, isFetching } = useQuery({
        queryKey: ['variance', metric, period],
        queryFn: () => varianceService.explain(metric, period),
        staleTime: 5 * 60_000,
    });

    const fmt = (v: number) => (data?.isCost ? `${Math.round(v).toLocaleString('vi-VN')}đ` : `${v}`);
    const up = (data?.deltaPct ?? 0) >= 0;
    const maxDelta = Math.max(1, ...(data?.drivers ?? []).map((d) => Math.abs(d.delta)));

    return (
        <Card
            className='rounded-2xl'
            styles={{ body: { padding: 18 } }}
            title={
                <div className='flex items-center gap-2'>
                    <span className='flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white'>
                        <LineChartOutlined />
                    </span>
                    <span className='font-bold text-slate-900'>Phân tích biến động</span>
                </div>
            }
            extra={
                <Segmented
                    size='small'
                    value={period}
                    onChange={(v) => setPeriod(v as VariancePeriod)}
                    options={[
                        { label: 'Tuần', value: 'week' },
                        { label: 'Tháng', value: 'month' },
                    ]}
                />
            }
        >
            <Segmented
                size='small'
                block
                value={metric}
                onChange={(v) => setMetric(v as VarianceMetric)}
                options={METRICS}
                className='mb-3'
            />

            {isFetching && !data ? (
                <div className='flex h-28 items-center justify-center'>
                    <Spin />
                </div>
            ) : data ? (
                <div className='space-y-3'>
                    <div className='flex items-end gap-3'>
                        <div>
                            <div className='text-[11px] text-slate-400'>{data.metricLabel} kỳ này</div>
                            <div className='text-xl font-bold text-slate-900'>{fmt(data.current)}</div>
                        </div>
                        <Tag
                            color={up ? 'red' : 'green'}
                            className='!m-0 !mb-1 !rounded-full'
                            icon={up ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                        >
                            {up ? '+' : ''}
                            {data.deltaPct}%
                        </Tag>
                        <div className='mb-1 text-[11px] text-slate-400'>kỳ trước {fmt(data.previous)}</div>
                        {isFetching ? <Spin size='small' /> : null}
                    </div>

                    <p className='m-0 rounded-xl bg-slate-50 px-3 py-2 text-[13px] leading-relaxed text-slate-700'>
                        {data.explanation}
                    </p>

                    {data.drivers.length ? (
                        <div className='space-y-1.5'>
                            <div className='text-[11px] font-semibold tracking-wide text-slate-400 uppercase'>
                                Yếu tố đóng góp chính
                            </div>
                            {data.drivers.map((d) => {
                                const pos = d.delta >= 0;
                                return (
                                    <div key={d.label} className='flex items-center gap-2 text-[12.5px]'>
                                        <span className='w-28 shrink-0 truncate text-slate-600'>{d.label}</span>
                                        <div className='h-2 flex-1 rounded-full bg-slate-100'>
                                            <div
                                                className={`h-2 rounded-full ${pos ? 'bg-rose-400' : 'bg-emerald-400'}`}
                                                style={{ width: `${(Math.abs(d.delta) / maxDelta) * 100}%` }}
                                            />
                                        </div>
                                        <span
                                            className={`w-24 shrink-0 text-right font-medium ${pos ? 'text-rose-600' : 'text-emerald-600'}`}
                                        >
                                            {pos ? '+' : ''}
                                            {fmt(d.delta)}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    ) : null}

                    {data.provider === 'fallback' ? (
                        <div className='text-right text-[10.5px] text-slate-400'>
                            AI tạm nghỉ — giải thích theo số liệu
                        </div>
                    ) : null}
                </div>
            ) : (
                <div className='py-6 text-center text-sm text-slate-400'>Chưa có dữ liệu để phân tích</div>
            )}
        </Card>
    );
};

export default DashboardVarianceCard;
