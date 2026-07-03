import React, { useState } from 'react';
import { Alert, App, Button, Card, Empty, Input, Result, Spin, Tag, Typography } from 'antd';
import {
    ArrowLeftOutlined,
    AuditOutlined,
    BarChartOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
    ExclamationCircleOutlined,
    FileTextOutlined,
    FireOutlined,
    LinkOutlined,
    PrinterOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../components/shared/PageHeader';
import MarkdownLite from '../components/shared/MarkdownLite';
import {
    aiAnalyticsService,
    type IncidentReplayEvent,
    type IncidentReplayResult,
    type IncidentReplayWorkflowAction,
} from '../core/services/ai-help.service';

const { Text, Title } = Typography;

const domainLabel: Record<string, string> = {
    purchase: 'Mua hàng',
    distribution: 'Cấp phát',
    maintenance: 'Bảo trì',
    asset: 'Máy móc',
    mixed: 'Tổng hợp',
};

const severityMeta: Record<string, { label: string; tag: string; ring: string }> = {
    normal: { label: 'Ổn định', tag: 'green', ring: 'from-emerald-500 to-teal-500' },
    watch: { label: 'Cần theo dõi', tag: 'blue', ring: 'from-sky-500 to-cyan-500' },
    high: { label: 'Rủi ro cao', tag: 'orange', ring: 'from-amber-500 to-orange-500' },
    critical: { label: 'Nghiêm trọng', tag: 'red', ring: 'from-rose-500 to-red-600' },
};

const eventTone: Record<IncidentReplayEvent['severity'], string> = {
    info: 'border-sky-100 bg-sky-50 text-sky-700',
    success: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    warning: 'border-amber-100 bg-amber-50 text-amber-700',
    danger: 'border-rose-100 bg-rose-50 text-rose-700',
};

const priorityTone: Record<string, string> = {
    low: 'blue',
    medium: 'orange',
    high: 'red',
};

const workflowMeta: Record<string, { label: string; tag: string }> = {
    draft: { label: 'Nháp', tag: 'default' },
    reviewed: { label: 'Đã rà soát', tag: 'blue' },
    approved: { label: 'Đã phê duyệt', tag: 'green' },
    closed: { label: 'Đã đóng', tag: 'purple' },
};

const auditActionLabel: Record<string, string> = {
    created: 'Tạo hồ sơ',
    reviewed: 'Rà soát',
    approved: 'Phê duyệt',
    closed: 'Đóng hồ sơ',
    reopened: 'Mở lại',
    feedback: 'Phản hồi',
};

const fmtReplayValue = (value?: number, unit: 'vnd' | 'count' = 'vnd') => {
    const safe = Number(value || 0);
    return unit === 'vnd' ? `${Math.round(safe).toLocaleString('vi-VN')}đ` : safe.toLocaleString('vi-VN');
};

const fmtDate = (value?: string) => {
    const d = value ? new Date(value) : null;
    return d && !Number.isNaN(d.getTime()) ? d.toLocaleString('vi-VN') : '-';
};

const esc = (value?: string | number) =>
    String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

const buildCaseCode = (id?: string) => `IR-${new Date().getFullYear()}-${String(id || '').slice(-6).toUpperCase() || 'DRAFT'}`;

const printCaseFile = (result: IncidentReplayResult & { id?: string }) => {
    const caseCode = buildCaseCode(result.id || result.historyId);
    const html = `
        <html>
        <head>
            <title>${esc(caseCode)} - AI Incident Replay</title>
            <style>
                @page{size:A4;margin:14mm}
                body{font-family:Arial,sans-serif;color:#0f172a;margin:0;font-size:12px}
                .header{border-bottom:2px solid #0f172a;padding-bottom:10px;margin-bottom:12px;display:flex;justify-content:space-between;gap:16px}
                .brand{font-weight:800;font-size:16px;letter-spacing:.02em}
                .muted{color:#64748b}
                h1{font-size:18px;margin:4px 0}
                h2{font-size:13px;margin:14px 0 7px;text-transform:uppercase;letter-spacing:.05em}
                .box{border:1px solid #cbd5e1;border-radius:8px;padding:9px;margin:8px 0;break-inside:avoid}
                .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}
                .kpi{border:1px solid #e2e8f0;border-radius:8px;padding:8px;break-inside:avoid}
                .kpi b{display:block;font-size:14px;margin-top:4px}
                table{width:100%;border-collapse:collapse}
                th,td{border:1px solid #cbd5e1;padding:5px;vertical-align:top}
                th{background:#f1f5f9;text-align:left}
                .right{text-align:right}
                .badge{display:inline-block;border:1px solid #cbd5e1;border-radius:999px;padding:2px 7px;margin:2px;background:#f8fafc}
                .sign{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:18px}
                .sign div{height:70px;border-top:1px solid #94a3b8;text-align:center;padding-top:6px;color:#475569}
            </style>
        </head>
        <body>
            <div class="header">
                <div>
                    <div class="brand">HAI DANG MANAGEMENT SYSTEM</div>
                    <h1>Biên bản phân tích AI Incident Replay</h1>
                    <div class="muted">Mã hồ sơ: ${esc(caseCode)} · ${esc(result.periodLabel)} · ${esc(domainLabel[result.focus])}</div>
                </div>
                <div class="muted" style="text-align:right">
                    Score: <b>${esc(result.caseScore)}/100</b><br/>
                    Mức độ: <b>${esc(severityMeta[result.caseSeverity]?.label || result.caseSeverity)}</b><br/>
                    In lúc: ${esc(fmtDate(new Date().toISOString()))}
                </div>
            </div>

            <h2>Câu hỏi điều tra</h2>
            <div class="box">${esc(result.question)}</div>

            <h2>Tóm tắt kết luận</h2>
            <div class="box">${esc(result.narrative).replace(/\n/g, '<br/>')}</div>

            ${result.managerConclusion ? `<h2>Kết luận của quản lý (${esc(workflowMeta[result.workflowStatus || 'draft']?.label || '')})</h2><div class="box">${esc(result.managerConclusion).replace(/\n/g, '<br/>')}</div>` : ''}

            <h2>Chỉ số chính</h2>
            <div class="grid">
                ${(result.metrics || [])
                    .map(
                        (m) => `<div class="kpi"><span class="muted">${esc(m.label)}</span><b>${esc(fmtReplayValue(m.current, m.unit))}</b><span class="muted">Chênh ${esc(fmtReplayValue(m.delta, m.unit))} (${esc(m.deltaPct)}%)</span></div>`
                    )
                    .join('')}
            </div>

            <h2>Chuỗi nguyên nhân</h2>
            ${(result.rootCauseChains || [])
                .slice(0, 5)
                .map(
                    (c) => `<div class="box"><b>${esc(c.title)}</b><div class="muted">${esc(domainLabel[c.domain])} · tin cậy ${esc(c.confidence)}% · ${esc(fmtReplayValue(c.value, 'vnd'))}</div><ul>${c.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>`
                )
                .join('') || '<div class="box muted">Chưa đủ dữ liệu tạo chuỗi nguyên nhân.</div>'}

            <h2>Bằng chứng chứng từ</h2>
            <table>
                <thead><tr><th>Thời gian</th><th>Loại</th><th>Sự kiện</th><th class="right">Giá trị</th><th>Bằng chứng</th></tr></thead>
                <tbody>
                ${(result.events || [])
                    .slice(0, 24)
                    .map(
                        (e) => `<tr><td>${esc(fmtDate(e.at))}</td><td>${esc(domainLabel[e.type])}</td><td><b>${esc(e.title)}</b><br/><span class="muted">${esc(e.subtitle)}</span></td><td class="right">${esc(fmtReplayValue(e.value, 'vnd'))}</td><td>${(e.evidence || []).slice(0, 3).map((x) => `<span class="badge">${esc(x)}</span>`).join('')}</td></tr>`
                    )
                    .join('')}
                </tbody>
            </table>

            <h2>Hành động đề xuất</h2>
            ${(result.recommendations || [])
                .map((r) => `<div class="box"><b>${esc(r.title)}</b> <span class="badge">${esc(r.priority)}</span><div>${esc(r.description)}</div></div>`)
                .join('')}

            <div class="sign">
                <div>Người lập/kiểm tra</div>
                <div>Quản lý phê duyệt</div>
            </div>
        </body>
        </html>`;
    const win = window.open('', '_blank', 'width=960,height=760');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
};

const IncidentReplayCasePage: React.FC = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { message } = App.useApp();
    const queryClient = useQueryClient();

    const { data, isLoading, isError } = useQuery({
        queryKey: ['incident-replay-case', id],
        queryFn: async () => {
            const replay = await aiAnalyticsService.incidentReplayHistoryDetail(id || '');
            return { ...replay, historyId: replay.id };
        },
        enabled: Boolean(id),
    });

    const feedbackMut = useMutation({
        mutationFn: (rating: 'accurate' | 'wrong' | 'missing_data' | 'irrelevant') =>
            aiAnalyticsService.incidentReplayFeedback(id || '', { rating }),
        onSuccess: () => {
            message.success('Đã ghi nhận phản hồi');
            queryClient.invalidateQueries({ queryKey: ['incident-replay-case', id] });
            queryClient.invalidateQueries({ queryKey: ['incident-replay-history'] });
        },
        onError: () => message.error('Chưa ghi được phản hồi.'),
    });

    const [workflowNote, setWorkflowNote] = useState('');
    const workflowMut = useMutation({
        mutationFn: (action: IncidentReplayWorkflowAction) =>
            aiAnalyticsService.incidentReplayWorkflow(id || '', {
                action,
                note: workflowNote.trim() || undefined,
                conclusion: action === 'approve' || action === 'close' ? workflowNote.trim() || undefined : undefined,
            }),
        onSuccess: () => {
            message.success('Đã cập nhật luồng xử lý hồ sơ');
            setWorkflowNote('');
            queryClient.invalidateQueries({ queryKey: ['incident-replay-case', id] });
            queryClient.invalidateQueries({ queryKey: ['incident-replay-history'] });
        },
        onError: () => message.error('Chưa cập nhật được luồng xử lý.'),
    });

    if (isLoading) {
        return (
            <div className='flex min-h-[420px] items-center justify-center'>
                <Spin />
            </div>
        );
    }

    if (isError || !data) {
        return (
            <Result
                status='404'
                title='Không mở được hồ sơ Incident Replay'
                subTitle='Hồ sơ không tồn tại hoặc tài khoản hiện tại không có quyền xem.'
                extra={<Button onClick={() => navigate('/ai-analytics')}>Quay lại AI Analytics</Button>}
            />
        );
    }

    const caseCode = buildCaseCode(data.id || data.historyId);
    const meta = severityMeta[data.caseSeverity] || severityMeta.watch;
    const wf = workflowMeta[data.workflowStatus || 'draft'] || workflowMeta.draft;
    const workflowActions: { action: IncidentReplayWorkflowAction; label: string; primary?: boolean }[] =
        data.workflowStatus === 'closed'
            ? [{ action: 'reopen', label: 'Mở lại hồ sơ' }]
            : data.workflowStatus === 'approved'
              ? [{ action: 'close', label: 'Đóng hồ sơ', primary: true }]
              : data.workflowStatus === 'reviewed'
                ? [
                      { action: 'approve', label: 'Phê duyệt', primary: true },
                      { action: 'close', label: 'Đóng hồ sơ' },
                  ]
                : [{ action: 'review', label: 'Xác nhận đã rà soát', primary: true }];

    return (
        <div className='space-y-5'>
            <PageHeader
                title='Incident Case File'
                subtitle={`${caseCode} · ${data.periodLabel}`}
                actions={
                    <div className='flex flex-wrap gap-2'>
                        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/ai-analytics')}>
                            AI Analytics
                        </Button>
                        <Button icon={<PrinterOutlined />} onClick={() => printCaseFile(data)}>
                            In/PDF
                        </Button>
                    </div>
                }
            />

            <div className='relative overflow-hidden rounded-3xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm'>
                <div className={`absolute -right-16 -top-16 h-48 w-48 rounded-full bg-gradient-to-br ${meta.ring} opacity-30 blur-3xl`} />
                <div className='relative grid grid-cols-1 gap-4 lg:grid-cols-[1fr_240px]'>
                    <div>
                        <div className='flex flex-wrap items-center gap-2'>
                            <Tag color='cyan' className='!m-0 !rounded-full'>
                                V{data.version || 6}
                            </Tag>
                            <Tag color={meta.tag} className='!m-0 !rounded-full'>
                                {meta.label}
                            </Tag>
                            <Tag color={wf.tag} className='!m-0 !rounded-full'>
                                {wf.label}
                            </Tag>
                            <Tag className='!m-0 !rounded-full !border-white/20 !bg-white/10 !text-white'>
                                {domainLabel[data.focus]}
                            </Tag>
                        </div>
                        <Title level={3} className='!mt-4 !mb-2 !text-white'>
                            {data.question}
                        </Title>
                        <Text className='text-slate-300'>
                            Hồ sơ điều tra AI dựa trên dữ liệu mua hàng, cấp phát, bảo trì và hiện trạng máy. Các kết luận bên dưới luôn kèm chỉ số hoặc chứng từ để đối soát.
                        </Text>
                    </div>
                    <div className='rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur'>
                        <div className='text-[12px] font-semibold uppercase tracking-wide text-cyan-100'>Incident Score</div>
                        <div className='mt-3 flex items-end gap-2'>
                            <span className='text-5xl font-black'>{data.caseScore}</span>
                            <span className='pb-1 text-sm text-slate-300'>/100</span>
                        </div>
                        <div className='mt-3 text-[12px] text-slate-300'>Kỳ trước: {data.previousPeriodLabel}</div>
                        <div className='mt-1 text-[12px] text-slate-300'>Tạo lúc: {fmtDate(data.generatedAt || data.createdAt)}</div>
                    </div>
                </div>
            </div>

            {data.scope?.applied ? (
                <Alert
                    type='info'
                    showIcon
                    message='Phạm vi đã áp dụng'
                    description={
                        <div className='mt-1 flex flex-wrap gap-1.5'>
                            {data.scope.notes.map((note) => (
                                <Tag key={note} color='cyan' className='!m-0 !rounded-full'>
                                    {note}
                                </Tag>
                            ))}
                        </div>
                    }
                />
            ) : null}

            <div className='grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4'>
                {(data.metrics || []).map((metric) => {
                    const up = metric.delta > 0;
                    return (
                        <Card key={metric.key} className='rounded-2xl border-slate-200 shadow-sm'>
                            <div className='text-[12px] font-medium text-slate-500'>{metric.label}</div>
                            <div className='mt-1 text-2xl font-black text-slate-950'>{fmtReplayValue(metric.current, metric.unit)}</div>
                            <div className={`mt-1 text-[12px] font-semibold ${up ? 'text-rose-600' : metric.delta < 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
                                {up ? '+' : ''}{fmtReplayValue(metric.delta, metric.unit)} · {up ? '+' : ''}{metric.deltaPct}%
                            </div>
                            <div className='mt-1 text-[11px] text-slate-400'>Kỳ trước: {fmtReplayValue(metric.previous, metric.unit)}</div>
                        </Card>
                    );
                })}
            </div>

            <Card className='rounded-2xl border-slate-200 shadow-sm'>
                <div className='mb-3 flex flex-wrap items-center justify-between gap-2'>
                    <div className='flex items-center gap-2 text-sm font-bold text-slate-800'>
                        <CheckCircleOutlined className='text-emerald-500' /> Executive summary
                    </div>
                    <div className='flex flex-wrap gap-2'>
                        <Button size='small' loading={feedbackMut.isPending} onClick={() => feedbackMut.mutate('accurate')}>
                            Đúng
                        </Button>
                        <Button size='small' loading={feedbackMut.isPending} onClick={() => feedbackMut.mutate('wrong')}>
                            Sai
                        </Button>
                        <Button size='small' loading={feedbackMut.isPending} onClick={() => feedbackMut.mutate('missing_data')}>
                            Thiếu dữ liệu
                        </Button>
                    </div>
                </div>
                <div className='rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 leading-6 text-slate-700'>
                    <MarkdownLite text={data.narrative} className='text-[13px]' />
                </div>
            </Card>

            <Card className='rounded-2xl border-slate-200 shadow-sm'>
                <div className='mb-3 flex flex-wrap items-center justify-between gap-2'>
                    <div className='flex items-center gap-2 text-sm font-bold text-slate-800'>
                        <AuditOutlined className='text-indigo-500' /> Luồng xử lý hồ sơ
                        <Tag color={wf.tag} className='!m-0 !rounded-full'>
                            {wf.label}
                        </Tag>
                    </div>
                    <div className='flex flex-wrap gap-2'>
                        {workflowActions.map((item) => (
                            <Button
                                key={item.action}
                                size='small'
                                type={item.primary ? 'primary' : 'default'}
                                loading={workflowMut.isPending}
                                onClick={() => workflowMut.mutate(item.action)}
                            >
                                {item.label}
                            </Button>
                        ))}
                    </div>
                </div>
                <Input.TextArea
                    rows={2}
                    maxLength={3000}
                    placeholder='Ghi chú rà soát / kết luận của quản lý (đính kèm vào hành động bên trên)'
                    value={workflowNote}
                    onChange={(e) => setWorkflowNote(e.target.value)}
                />
                {data.managerConclusion ? (
                    <div className='mt-3 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3'>
                        <div className='text-[11px] font-bold uppercase tracking-wide text-emerald-700'>Kết luận của quản lý</div>
                        <div className='mt-1 leading-6 text-slate-700'>
                            <MarkdownLite text={data.managerConclusion} className='text-[13px]' />
                        </div>
                    </div>
                ) : null}
                {data.auditTrail?.length ? (
                    <div className='mt-3 space-y-1.5 border-t border-slate-100 pt-3'>
                        {[...data.auditTrail].reverse().map((entry, idx) => (
                            <div key={`${entry.action}-${entry.at || idx}`} className='flex flex-wrap items-baseline gap-2 text-[12px] text-slate-600'>
                                <span className='font-semibold text-slate-800'>{auditActionLabel[entry.action] || entry.action}</span>
                                <span className='text-slate-400'>{entry.userName || '-'}</span>
                                <span className='text-slate-400'>{fmtDate(entry.at)}</span>
                                {entry.note ? <span className='min-w-0 flex-1 truncate text-slate-500'>· {entry.note}</span> : null}
                            </div>
                        ))}
                    </div>
                ) : null}
            </Card>

            {data.flags?.length ? (
                <Alert
                    showIcon
                    type='warning'
                    message='Điểm kiểm tra bắt buộc'
                    description={
                        <div className='mt-1 flex flex-wrap gap-1.5'>
                            {data.flags.map((flag) => (
                                <Tag key={flag} color='orange' className='!m-0 !rounded-full'>
                                    {flag}
                                </Tag>
                            ))}
                        </div>
                    }
                />
            ) : null}

            <div className='grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]'>
                <Card className='rounded-2xl border-slate-200 shadow-sm' title={<span><FireOutlined className='text-rose-500' /> Chuỗi nguyên nhân</span>}>
                    {data.rootCauseChains?.length ? (
                        <div className='space-y-3'>
                            {data.rootCauseChains.slice(0, 5).map((chain, idx) => (
                                <div key={`${chain.title}-${idx}`} className='rounded-xl border border-slate-100 bg-slate-50 p-3'>
                                    <div className='flex flex-wrap items-start justify-between gap-2'>
                                        <div>
                                            <div className='font-bold text-slate-900'>{chain.title}</div>
                                            <div className='mt-1 text-[11px] text-slate-500'>
                                                {domainLabel[chain.domain]} · tin cậy {chain.confidence}%
                                            </div>
                                        </div>
                                        <Tag color={chain.severity === 'danger' ? 'red' : chain.severity === 'warning' ? 'orange' : 'blue'} className='!m-0 !rounded-full'>
                                            {fmtReplayValue(chain.value, 'vnd')}
                                        </Tag>
                                    </div>
                                    <div className='mt-3 space-y-1.5'>
                                        {chain.steps.map((step, stepIdx) => (
                                            <div key={`${step}-${stepIdx}`} className='flex gap-2 text-[12px] leading-5 text-slate-600'>
                                                <span className='mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-bold text-slate-500'>
                                                    {stepIdx + 1}
                                                </span>
                                                <span>{step}</span>
                                            </div>
                                        ))}
                                    </div>
                                    {chain.evidence?.length ? (
                                        <div className='mt-3 flex flex-wrap gap-1 border-t border-slate-200 pt-2'>
                                            {chain.evidence.slice(0, 4).map((line) => (
                                                <Tag key={line} className='!m-0 !rounded-full !text-[11px]'>
                                                    {line}
                                                </Tag>
                                            ))}
                                        </div>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Chưa đủ dữ liệu tạo chuỗi nguyên nhân' />
                    )}
                </Card>

                <Card className='rounded-2xl border-slate-200 shadow-sm' title={<span><ExclamationCircleOutlined className='text-amber-500' /> Anomaly radar</span>}>
                    {data.anomalies?.length ? (
                        <div className='space-y-2'>
                            {data.anomalies.slice(0, 7).map((anomaly, idx) => (
                                <div key={`${anomaly.title}-${idx}`} className={`rounded-xl border p-3 ${eventTone[anomaly.severity]}`}>
                                    <div className='flex items-start justify-between gap-2'>
                                        <div className='font-bold'>{anomaly.title}</div>
                                        <span className='rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-bold'>score {Math.round(anomaly.score)}</span>
                                    </div>
                                    <div className='mt-1 text-[12px] leading-5'>{anomaly.description}</div>
                                    {anomaly.evidence?.length ? <div className='mt-1 text-[11px] opacity-80'>{anomaly.evidence[0]}</div> : null}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Chưa phát hiện anomaly rõ' />
                    )}
                </Card>
            </div>

            <Card className='rounded-2xl border-slate-200 shadow-sm' title={<span><BarChartOutlined className='text-blue-500' /> Breakdown so với kỳ trước</span>}>
                {data.breakdowns?.length ? (
                    <div className='grid grid-cols-1 gap-4 xl:grid-cols-2'>
                        {data.breakdowns.slice(0, 4).map((group) => (
                            <div key={group.key} className='rounded-xl border border-slate-100 bg-slate-50 p-3'>
                                <div className='mb-2 flex items-center justify-between gap-2'>
                                    <div>
                                        <div className='text-[13px] font-bold text-slate-900'>{group.title}</div>
                                        <div className='text-[11px] text-slate-500'>Tổng {fmtReplayValue(group.total, 'vnd')}</div>
                                    </div>
                                    <Tag className='!m-0 !rounded-full'>{domainLabel[group.domain]}</Tag>
                                </div>
                                <div className='space-y-2'>
                                    {group.rows.slice(0, 8).map((row) => (
                                        <div key={row.label} className='rounded-lg bg-white px-3 py-2'>
                                            <div className='flex items-center justify-between gap-2'>
                                                <div className='min-w-0 truncate text-[12px] font-semibold text-slate-700'>{row.label}</div>
                                                <div className='text-[12px] font-bold text-slate-900'>{fmtReplayValue(row.value, 'vnd')}</div>
                                            </div>
                                            <div className='mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-500'>
                                                <span>{row.sharePct}% nhóm · {row.count} dòng</span>
                                                <span className={row.delta > 0 ? 'font-semibold text-rose-600' : row.delta < 0 ? 'font-semibold text-emerald-600' : ''}>
                                                    {row.delta > 0 ? '+' : ''}{fmtReplayValue(row.delta, 'vnd')} · {row.delta > 0 ? '+' : ''}{row.deltaPct}%
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Không có breakdown' />
                )}
            </Card>

            <div className='grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]'>
                <Card className='rounded-2xl border-slate-200 shadow-sm' title={<span><FileTextOutlined className='text-indigo-500' /> Hành động đề xuất</span>}>
                    {data.recommendations?.length ? (
                        <div className='space-y-2'>
                            {data.recommendations.map((rec) => (
                                <div key={rec.title} className='rounded-xl border border-slate-100 bg-slate-50 p-3'>
                                    <div className='flex items-start justify-between gap-2'>
                                        <div className='font-bold text-slate-900'>{rec.title}</div>
                                        <Tag color={priorityTone[rec.priority]} className='!m-0 !rounded-full'>{rec.priority}</Tag>
                                    </div>
                                    <div className='mt-2 text-[12px] leading-5 text-slate-600'>{rec.description}</div>
                                    {rec.route ? (
                                        <Button size='small' type='link' className='!px-0' icon={<LinkOutlined />} onClick={() => navigate(rec.route!)}>
                                            Mở module liên quan
                                        </Button>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Chưa có hành động đề xuất' />
                    )}
                </Card>

                <Card className='rounded-2xl border-slate-200 shadow-sm' title={<span><ClockCircleOutlined className='text-cyan-600' /> Evidence ledger</span>}>
                    {data.events?.length ? (
                        <div className='max-h-[620px] space-y-2 overflow-auto pr-1'>
                            {data.events.map((event) => (
                                <div
                                    key={`${event.type}-${event.id}`}
                                    className={`rounded-xl border border-slate-100 bg-white p-3 shadow-sm ${event.route ? 'cursor-pointer transition hover:border-cyan-200 hover:shadow-md' : ''}`}
                                    onClick={() => event.route && navigate(event.route)}
                                >
                                    <div className='flex flex-wrap items-start justify-between gap-2'>
                                        <div className='min-w-0'>
                                            <div className='flex flex-wrap items-center gap-2'>
                                                <span className='font-bold text-slate-800'>{event.title}</span>
                                                <span className={`rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${eventTone[event.severity]}`}>
                                                    {domainLabel[event.type]}
                                                </span>
                                            </div>
                                            <div className='mt-1 text-[12px] text-slate-500'>{event.subtitle}</div>
                                        </div>
                                        <div className='text-right'>
                                            <div className='text-[12px] font-bold text-slate-900'>{fmtReplayValue(event.value, 'vnd')}</div>
                                            <div className='text-[11px] text-slate-400'>{fmtDate(event.at)}</div>
                                        </div>
                                    </div>
                                    {event.evidence?.length ? (
                                        <div className='mt-2 flex flex-wrap gap-1'>
                                            {event.evidence.slice(0, 5).map((line) => (
                                                <Tag key={line} className='!m-0 !rounded-full !text-[11px]'>
                                                    {line}
                                                </Tag>
                                            ))}
                                        </div>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Không có chứng từ trong kỳ' />
                    )}
                </Card>
            </div>
        </div>
    );
};

export default IncidentReplayCasePage;
