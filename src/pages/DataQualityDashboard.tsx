import React, { useMemo, useState } from 'react';
import {
    Alert,
    Button,
    Card,
    Empty,
    Grid,
    List,
    Progress,
    Segmented,
    Skeleton,
    Space,
    Statistic,
    Tag,
    Tooltip,
    Typography,
} from 'antd';
import {
    AlertOutlined,
    AppstoreOutlined,
    AuditOutlined,
    CheckCircleOutlined,
    ClusterOutlined,
    DatabaseOutlined,
    ExclamationCircleOutlined,
    QrcodeOutlined,
    ReloadOutlined,
    TeamOutlined,
    ToolOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../core/contexts/AuthContext';
import { dataQualityService } from '../core/services/data-quality.service';
import type {
    DataQualityCategory,
    DataQualityCategoryKey,
    DataQualityCheck,
    DataQualitySeverity,
} from '../core/types';
import { isSuperAdmin } from '../core/lib/permissions';

const { Text, Title } = Typography;
const { useBreakpoint } = Grid;

const severityMeta: Record<
    DataQualitySeverity,
    { label: string; color: string; tone: string; icon: React.ReactNode; order: number }
> = {
    critical: {
        label: 'Nghiêm trọng',
        color: 'red',
        tone: 'text-red-700 bg-red-50 border-red-100',
        icon: <AlertOutlined />,
        order: 0,
    },
    warning: {
        label: 'Cần rà soát',
        color: 'gold',
        tone: 'text-amber-700 bg-amber-50 border-amber-100',
        icon: <ExclamationCircleOutlined />,
        order: 1,
    },
    info: {
        label: 'Khuyến nghị',
        color: 'blue',
        tone: 'text-blue-700 bg-blue-50 border-blue-100',
        icon: <AuditOutlined />,
        order: 2,
    },
};

const categoryMeta: Record<DataQualityCategoryKey, { icon: React.ReactNode; short: string; accent: string }> = {
    assets: { icon: <AppstoreOutlined />, short: 'Máy', accent: '#2563eb' },
    materials: { icon: <DatabaseOutlined />, short: 'Vật tư', accent: '#059669' },
    qr: { icon: <QrcodeOutlined />, short: 'QR', accent: '#7c3aed' },
    plants: { icon: <ClusterOutlined />, short: 'Cơ sở', accent: '#0f766e' },
    users: { icon: <TeamOutlined />, short: 'User', accent: '#d97706' },
    maintenance: { icon: <ToolOutlined />, short: 'Bảo trì', accent: '#dc2626' },
};

const scoreStatus = (score: number) => {
    if (score >= 85) return { status: 'success' as const, label: 'Ổn định', color: '#16a34a' };
    if (score >= 65) return { status: 'normal' as const, label: 'Cần dọn dữ liệu', color: '#d97706' };
    return { status: 'exception' as const, label: 'Rủi ro cao', color: '#dc2626' };
};

const formatNumber = (value?: number) => new Intl.NumberFormat('vi-VN').format(value ?? 0);

const formatDateTime = (value?: string) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    }).format(date);
};

const sortChecks = (checks: DataQualityCheck[]) =>
    [...checks].sort((a, b) => {
        const severityOrder = severityMeta[a.severity].order - severityMeta[b.severity].order;
        if (severityOrder !== 0) return severityOrder;
        return b.count - a.count;
    });

const DataQualityDashboard: React.FC = () => {
    const screens = useBreakpoint();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [selectedCategoryKey, setSelectedCategoryKey] = useState<DataQualityCategoryKey | 'all'>('all');

    const {
        data,
        isLoading,
        isFetching,
        refetch,
        dataUpdatedAt,
    } = useQuery({
        queryKey: ['data-quality', 'overview'],
        queryFn: dataQualityService.getOverview,
        enabled: isSuperAdmin(user?.role),
        staleTime: 60_000,
    });

    const categories = data?.categories ?? [];
    const selectedCategory = useMemo(
        () =>
            selectedCategoryKey === 'all'
                ? undefined
                : categories.find((category) => category.key === selectedCategoryKey),
        [categories, selectedCategoryKey]
    );
    const checks = useMemo(
        () => sortChecks(selectedCategory ? selectedCategory.checks : categories.flatMap((category) => category.checks)),
        [categories, selectedCategory]
    );
    const issueChecks = checks.filter((item) => item.count > 0);
    const score = data?.overallScore ?? 0;
    const scoreMeta = scoreStatus(score);
    const isMobile = !screens.md;

    if (!isSuperAdmin(user?.role)) {
        return <Navigate to='/dashboard' replace />;
    }

    return (
        <div className='flex w-full max-w-full flex-col gap-5 overflow-hidden'>
            <div className='rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm md:p-6'>
                <div className='flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between'>
                    <div className='min-w-0'>
                        <Tag color='red' className='mb-3 rounded-full px-3 py-1 text-xs font-bold'>
                            Super Admin Only
                        </Tag>
                        <Title level={2} className='!mb-2 !text-[26px] !font-black !text-slate-950 md:!text-[34px]'>
                            Data Quality Dashboard
                        </Title>
                        <Text className='block max-w-3xl text-sm leading-6 font-medium text-slate-500'>
                            Kiểm tra dữ liệu nền trước khi vận hành thật: máy, tem QR, vật tư, cơ sở, người dùng và
                            phiếu bảo trì. Mục tiêu là phát hiện dữ liệu thiếu/trùng/sai liên kết trước khi nó làm hỏng
                            báo cáo hoặc workflow QR.
                        </Text>
                    </div>
                    <Space wrap className='shrink-0'>
                        {dataUpdatedAt ? (
                            <Text className='text-xs font-semibold text-slate-400'>
                                Cập nhật: {formatDateTime(new Date(dataUpdatedAt).toISOString())}
                            </Text>
                        ) : null}
                        <Button icon={<ReloadOutlined />} loading={isFetching} onClick={() => void refetch()}>
                            Làm mới
                        </Button>
                    </Space>
                </div>
            </div>

            {isLoading ? (
                <Skeleton active paragraph={{ rows: 10 }} />
            ) : data ? (
                <>
                    <div className='grid grid-cols-1 gap-4 xl:grid-cols-[360px_1fr]'>
                        <Card className='rounded-[24px] border-slate-200 shadow-sm'>
                            <div className='flex flex-col items-center gap-3 text-center'>
                                <Progress
                                    type='dashboard'
                                    percent={score}
                                    size={168}
                                    strokeColor={scoreMeta.color}
                                    status={scoreMeta.status}
                                    format={(value) => (
                                        <span className='text-[34px] font-black text-slate-950'>{value}</span>
                                    )}
                                />
                                <div>
                                    <Text className='block text-base font-black text-slate-900'>{scoreMeta.label}</Text>
                                    <Text className='text-sm font-medium text-slate-500'>
                                        {formatNumber(data.summary.totalIssues)} vấn đề trên{' '}
                                        {formatNumber(data.summary.totalRecords)} bản ghi
                                    </Text>
                                </div>
                            </div>
                        </Card>

                        <div className='grid grid-cols-2 gap-3 lg:grid-cols-4'>
                            <Card className='rounded-[22px] border-red-100 bg-red-50/70 shadow-sm'>
                                <Statistic
                                    title={<span className='font-bold text-red-700'>Nghiêm trọng</span>}
                                    value={data.summary.criticalIssues}
                                    valueStyle={{ color: '#b91c1c', fontWeight: 900 }}
                                />
                            </Card>
                            <Card className='rounded-[22px] border-amber-100 bg-amber-50/70 shadow-sm'>
                                <Statistic
                                    title={<span className='font-bold text-amber-700'>Cần rà soát</span>}
                                    value={data.summary.warningIssues}
                                    valueStyle={{ color: '#b45309', fontWeight: 900 }}
                                />
                            </Card>
                            <Card className='rounded-[22px] border-blue-100 bg-blue-50/70 shadow-sm'>
                                <Statistic
                                    title={<span className='font-bold text-blue-700'>Khuyến nghị</span>}
                                    value={data.summary.infoIssues}
                                    valueStyle={{ color: '#1d4ed8', fontWeight: 900 }}
                                />
                            </Card>
                            <Card className='rounded-[22px] border-slate-200 bg-white shadow-sm'>
                                <Statistic
                                    title={<span className='font-bold text-slate-600'>Nhóm ảnh hưởng</span>}
                                    value={data.summary.affectedCategories}
                                    suffix={`/ ${categories.length}`}
                                    valueStyle={{ color: '#0f172a', fontWeight: 900 }}
                                />
                            </Card>
                        </div>
                    </div>

                    <div className='grid grid-cols-1 gap-4 lg:grid-cols-3 2xl:grid-cols-6'>
                        {categories.map((category) => {
                            const meta = categoryMeta[category.key];
                            const active = selectedCategoryKey === category.key;
                            return (
                                <button
                                    key={category.key}
                                    type='button'
                                    onClick={() => setSelectedCategoryKey(category.key)}
                                    className={`rounded-[22px] border bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${
                                        active ? 'border-blue-300 ring-2 ring-blue-100' : 'border-slate-200'
                                    }`}
                                >
                                    <div className='mb-3 flex items-center justify-between gap-3'>
                                        <span
                                            className='flex h-11 w-11 items-center justify-center rounded-2xl text-[20px] text-white'
                                            style={{ background: meta.accent }}
                                        >
                                            {meta.icon}
                                        </span>
                                        <Tag color={category.score >= 80 ? 'green' : category.score >= 60 ? 'gold' : 'red'}>
                                            {category.score}/100
                                        </Tag>
                                    </div>
                                    <Text className='block text-sm font-black text-slate-900'>{category.title}</Text>
                                    <Text className='mt-1 block text-xs font-semibold text-slate-500'>
                                        {formatNumber(category.issueCount)} vấn đề · {formatNumber(category.totalRecords)} bản ghi
                                    </Text>
                                </button>
                            );
                        })}
                    </div>

                    <Card className='rounded-[24px] border-slate-200 shadow-sm'>
                        <div className='mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between'>
                            <div>
                                <Title level={4} className='!mb-1 !font-black !text-slate-950'>
                                    Danh sách vấn đề cần xử lý
                                </Title>
                                <Text className='text-sm font-medium text-slate-500'>
                                    Ưu tiên xử lý nhóm nghiêm trọng trước khi rollout QR/kiểm kê diện rộng.
                                </Text>
                            </div>
                            <Segmented
                                value={selectedCategoryKey}
                                onChange={(value) => setSelectedCategoryKey(value as DataQualityCategoryKey | 'all')}
                                options={[
                                    { label: 'Tất cả', value: 'all' },
                                    ...categories.map((category) => ({
                                        label: isMobile ? categoryMeta[category.key].short : category.title,
                                        value: category.key,
                                    })),
                                ]}
                            />
                        </div>

                        {issueChecks.length ? (
                            <div className='grid grid-cols-1 gap-3 xl:grid-cols-2'>
                                {issueChecks.map((check) => {
                                    const meta = severityMeta[check.severity];
                                    return (
                                        <div key={check.key} className={`rounded-[20px] border p-4 ${meta.tone}`}>
                                            <div className='flex items-start justify-between gap-3'>
                                                <div className='min-w-0'>
                                                    <Space size={8} wrap>
                                                        <Tag color={meta.color} className='m-0 font-bold'>
                                                            {meta.icon} {meta.label}
                                                        </Tag>
                                                        <Tag className='m-0 font-bold'>{check.ratio}%</Tag>
                                                    </Space>
                                                    <Title level={5} className='!mt-3 !mb-1 !font-black !text-slate-950'>
                                                        {check.title}
                                                    </Title>
                                                    <Text className='block text-sm leading-5 font-medium text-slate-600'>
                                                        {check.description}
                                                    </Text>
                                                </div>
                                                <div className='shrink-0 text-right'>
                                                    <div className='text-3xl font-black text-slate-950'>
                                                        {formatNumber(check.count)}
                                                    </div>
                                                    <div className='text-[11px] font-bold text-slate-500 uppercase'>
                                                        bản ghi
                                                    </div>
                                                </div>
                                            </div>

                                            <Alert
                                                className='mt-3 rounded-xl border-0 bg-white/70'
                                                type={check.severity === 'critical' ? 'error' : check.severity === 'warning' ? 'warning' : 'info'}
                                                showIcon
                                                message={<span className='font-bold'>{check.action}</span>}
                                            />

                                            {check.records.length ? (
                                                <List
                                                    className='mt-3 rounded-2xl bg-white/80'
                                                    size='small'
                                                    dataSource={check.records}
                                                    renderItem={(record) => (
                                                        <List.Item
                                                            actions={[
                                                                record.path ? (
                                                                    <Button
                                                                        key='open'
                                                                        size='small'
                                                                        onClick={() => navigate(record.path!)}
                                                                    >
                                                                        Mở
                                                                    </Button>
                                                                ) : null,
                                                            ].filter(Boolean)}
                                                        >
                                                            <List.Item.Meta
                                                                avatar={<CheckCircleOutlined className='mt-1 text-slate-400' />}
                                                                title={
                                                                    <Tooltip title={record.label}>
                                                                        <span className='line-clamp-1 font-bold text-slate-900'>
                                                                            {record.label}
                                                                        </span>
                                                                    </Tooltip>
                                                                }
                                                                description={
                                                                    <span className='text-xs font-semibold text-slate-500'>
                                                                        {[record.code, record.meta].filter(Boolean).join(' · ') || record.id}
                                                                    </span>
                                                                }
                                                            />
                                                        </List.Item>
                                                    )}
                                                />
                                            ) : null}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <Empty description='Không có vấn đề dữ liệu trong nhóm này' />
                        )}
                    </Card>
                </>
            ) : (
                <Empty description='Không tải được dữ liệu chất lượng' />
            )}
        </div>
    );
};

export default DataQualityDashboard;
