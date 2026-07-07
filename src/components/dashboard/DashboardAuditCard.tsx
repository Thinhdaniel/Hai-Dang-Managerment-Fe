import React, { useState } from 'react';
import { App, Button, Card, Empty, Spin, Tag } from 'antd';
import {
    BulbOutlined,
    CheckCircleOutlined,
    DownOutlined,
    ReloadOutlined,
    SafetyCertificateOutlined,
    UpOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { auditService } from '../../core/services/audit.service';
import type { AiAuditFinding } from '../../core/types';

const severityMeta: Record<AiAuditFinding['severity'], { label: string; color: string }> = {
    critical: { label: 'Nghiêm trọng', color: 'red' },
    warning: { label: 'Cảnh báo', color: 'orange' },
    info: { label: 'Lưu ý', color: 'default' },
};

const VISIBLE_COUNT = 5;

const DashboardAuditCard: React.FC = () => {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const [expanded, setExpanded] = useState(false);

    const { data: audit, isLoading } = useQuery({
        queryKey: ['ai-audit', 'latest'],
        queryFn: () => auditService.getLatest(),
        staleTime: 60_000,
    });

    const runMut = useMutation({
        mutationFn: () => auditService.run(),
        onSuccess: (doc) => {
            queryClient.setQueryData(['ai-audit', 'latest'], doc);
            message.success('Đã chạy kiểm toán xong');
        },
        onError: () => message.error('Không chạy được kiểm toán. Thử lại sau.'),
    });

    const findings = audit?.findings ?? [];
    const visibleFindings = expanded ? findings : findings.slice(0, VISIBLE_COUNT);
    const actionable = (audit?.stats?.critical ?? 0) + (audit?.stats?.warning ?? 0);

    return (
        <Card
            className='rounded-2xl'
            styles={{ body: { padding: 18 } }}
            title={
                <div className='flex items-center gap-2'>
                    <span className='flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 text-white'>
                        <SafetyCertificateOutlined />
                    </span>
                    <span className='font-bold text-slate-900'>Kiểm toán đêm</span>
                </div>
            }
            extra={
                <Button
                    size='small'
                    icon={<ReloadOutlined />}
                    loading={runMut.isPending}
                    onClick={() => runMut.mutate()}
                >
                    {audit ? 'Chạy lại' : 'Chạy ngay'}
                </Button>
            }
        >
            {isLoading ? (
                <div className='flex h-32 items-center justify-center'>
                    <Spin />
                </div>
            ) : !audit ? (
                <div className='py-6'>
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Chưa có phiên kiểm toán nào'>
                        <Button type='primary' loading={runMut.isPending} onClick={() => runMut.mutate()}>
                            Chạy kiểm toán đầu tiên
                        </Button>
                    </Empty>
                </div>
            ) : (
                <div className='space-y-3'>
                    <div className='flex flex-wrap items-center gap-2'>
                        <Tag color='blue' className='!m-0'>
                            {audit.runKey}
                        </Tag>
                        {audit.stats?.critical ? (
                            <Tag color='red' className='!m-0'>
                                {audit.stats.critical} nghiêm trọng
                            </Tag>
                        ) : null}
                        {audit.stats?.warning ? (
                            <Tag color='orange' className='!m-0'>
                                {audit.stats.warning} cảnh báo
                            </Tag>
                        ) : null}
                        {audit.stats?.info ? (
                            <Tag className='!m-0'>{audit.stats.info} lưu ý</Tag>
                        ) : null}
                        {runMut.isPending ? <Spin size='small' /> : null}
                    </div>

                    {audit.summary ? (
                        <p className='m-0 text-[13.5px] leading-relaxed whitespace-pre-wrap text-slate-700'>
                            {audit.summary}
                        </p>
                    ) : null}

                    {!findings.length ? (
                        <div className='flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-700'>
                            <CheckCircleOutlined />
                            Không phát hiện bất thường nào — hệ thống sạch.
                        </div>
                    ) : (
                        <div className='space-y-2'>
                            {visibleFindings.map((f, i) => (
                                <div
                                    key={i}
                                    className={`rounded-xl border px-3 py-2 ${
                                        f.severity === 'critical'
                                            ? 'border-rose-100 bg-rose-50'
                                            : f.severity === 'warning'
                                              ? 'border-amber-100 bg-amber-50'
                                              : 'border-slate-100 bg-slate-50'
                                    }`}
                                >
                                    <div className='flex items-start justify-between gap-2'>
                                        <span className='text-[13px] font-medium text-slate-800'>{f.title}</span>
                                        <Tag color={severityMeta[f.severity].color} className='!m-0 shrink-0'>
                                            {severityMeta[f.severity].label}
                                        </Tag>
                                    </div>
                                    {f.detail ? (
                                        <div className='mt-1 text-[12.5px] leading-relaxed text-slate-600'>
                                            {f.detail}
                                        </div>
                                    ) : null}
                                    {f.source === 'ai' ? (
                                        <div className='mt-1 text-[10.5px] text-slate-400'>🤖 AI phát hiện thêm</div>
                                    ) : null}
                                </div>
                            ))}
                            {findings.length > VISIBLE_COUNT ? (
                                <Button
                                    type='link'
                                    size='small'
                                    className='!px-0'
                                    icon={expanded ? <UpOutlined /> : <DownOutlined />}
                                    onClick={() => setExpanded((v) => !v)}
                                >
                                    {expanded ? 'Thu gọn' : `Xem thêm ${findings.length - VISIBLE_COUNT} phát hiện`}
                                </Button>
                            ) : null}
                        </div>
                    )}

                    {audit.recommendations?.length ? (
                        <div className='rounded-xl border border-amber-100 bg-amber-50 px-3 py-2'>
                            {audit.recommendations.map((r, i) => (
                                <div key={i} className='flex items-start gap-2 text-[13px] text-amber-800'>
                                    <BulbOutlined className='mt-0.5 shrink-0' />
                                    {r}
                                </div>
                            ))}
                        </div>
                    ) : null}

                    <div className='text-right text-[10.5px] text-slate-400'>
                        {actionable === 0 && findings.length > 0 ? 'Chỉ còn mục lưu ý · ' : ''}
                        🤖 {audit.provider === 'fallback' ? 'rule-check (AI tạm nghỉ)' : audit.model}
                        {audit.runAt ? ` · ${new Date(audit.runAt).toLocaleString('vi-VN')}` : ''}
                    </div>
                </div>
            )}
        </Card>
    );
};

export default DashboardAuditCard;
