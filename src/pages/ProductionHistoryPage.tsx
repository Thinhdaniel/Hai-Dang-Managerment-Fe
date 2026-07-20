import {
    CalendarOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
    DownloadOutlined,
    EyeOutlined,
    FileTextOutlined,
    LockOutlined,
    ReloadOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Alert,
    App,
    Button,
    DatePicker,
    Empty,
    Grid,
    Pagination,
    Progress,
    Select,
    Skeleton,
    Table,
    Tag,
    Typography,
    type TableColumnsType,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../core/contexts/AuthContext';
import { useSocket } from '../core/hooks/useSocket';
import { can, hasManagerAccess, isAdmin, isDirector } from '../core/lib/permissions';
import { plantService } from '../core/services/plant.service';
import { productionService } from '../core/services/production.service';
import type { ProductionDay, ProductionDayStatus } from '../core/types/production';

const { RangePicker } = DatePicker;
const { Text, Title } = Typography;

const number = (value = 0) => new Intl.NumberFormat('vi-VN').format(value);
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Không thể tải lịch sử');

const statusMeta: Record<ProductionDayStatus, { label: string; color: string; icon: React.ReactNode }> = {
    draft: { label: 'Đang nhập', color: 'gold', icon: <ClockCircleOutlined /> },
    submitted: { label: 'Chờ duyệt', color: 'blue', icon: <FileTextOutlined /> },
    locked: { label: 'Đã khóa sổ', color: 'green', icon: <LockOutlined /> },
};

const ProductionHistoryPage = () => {
    const screens = Grid.useBreakpoint();
    const isMobile = !screens.md;
    const navigate = useNavigate();
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const { user, role } = useAuth();
    const { socket } = useSocket();
    const [plantId, setPlantId] = useState(user?.plantId || '');
    const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().startOf('month'), dayjs()]);
    const [status, setStatus] = useState<ProductionDayStatus | undefined>();
    const [page, setPage] = useState(1);
    const [exportingId, setExportingId] = useState<string>();
    const canSwitchPlant = isAdmin(role) || isDirector(role);
    const canManage = can(role, 'production.manage');
    const canSeeFinancials = hasManagerAccess(role);

    const plantsQuery = useQuery({
        queryKey: ['plants'],
        queryFn: () => plantService.getAll(),
        staleTime: 5 * 60 * 1000,
    });

    useEffect(() => {
        if (plantId) return;
        const preferred = user?.plantId || plantsQuery.data?.[0]?.id;
        if (preferred) setPlantId(preferred);
    }, [plantId, plantsQuery.data, user?.plantId]);

    const historyQuery = useQuery({
        queryKey: [
            'production',
            'history',
            plantId,
            range[0].format('YYYY-MM-DD'),
            range[1].format('YYYY-MM-DD'),
            status || 'all',
            page,
        ],
        queryFn: () =>
            productionService.getDays({
                plantId,
                from: range[0].format('YYYY-MM-DD'),
                to: range[1].format('YYYY-MM-DD'),
                status,
                page,
                limit: 31,
            }),
        enabled: Boolean(plantId),
        staleTime: 30_000,
    });

    useEffect(() => {
        if (!socket) return;
        const handleUpdate = (payload: { plantId: string }) => {
            if (payload.plantId !== plantId) return;
            void queryClient.invalidateQueries({ queryKey: ['production', 'history', plantId] });
        };
        socket.on('production:updated', handleUpdate);
        return () => {
            socket.off('production:updated', handleUpdate);
        };
    }, [plantId, queryClient, socket]);

    const exportMutation = useMutation({
        mutationFn: ({ id }: { id: string; date: string }) => productionService.exportDay(id),
        onMutate: ({ id }) => setExportingId(id),
        onSuccess: (blob, variables) => {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `bao-cao-san-luong-${variables.date}.xlsx`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            message.success('Đã xuất báo cáo Excel');
        },
        onError: (error) => message.error(errorMessage(error)),
        onSettled: () => setExportingId(undefined),
    });

    const days = historyQuery.data?.data || [];
    const aggregate = useMemo(() => {
        const totalActual = days.reduce((sum, day) => sum + day.summary.totalActual, 0);
        const totalTarget = days.reduce((sum, day) => sum + day.summary.totalTarget, 0);
        return {
            totalActual,
            totalTarget,
            achievement: totalTarget > 0 ? (totalActual / totalTarget) * 100 : 0,
            locked: days.filter((day) => day.status === 'locked').length,
            amount: days.reduce((sum, day) => sum + day.summary.totalAmount, 0),
        };
    }, [days]);

    const openDay = (day: ProductionDay) => {
        navigate(`/production?plantId=${encodeURIComponent(day.plantId)}&date=${day.productionDate}`);
    };

    const columns: TableColumnsType<ProductionDay> = [
        {
            title: 'Ngày sản xuất',
            dataIndex: 'productionDate',
            width: 150,
            render: (value, day) => (
                <button type='button' className='production-history-date' onClick={() => openDay(day)}>
                    <CalendarOutlined />
                    <span>
                        <strong>{dayjs(value).format('DD/MM/YYYY')}</strong>
                        <small>{dayjs(value).format('dddd')}</small>
                    </span>
                </button>
            ),
        },
        {
            title: 'Trạng thái',
            dataIndex: 'status',
            width: 132,
            render: (value: ProductionDayStatus) => {
                const meta = statusMeta[value];
                return (
                    <Tag color={meta.color} icon={meta.icon}>
                        {meta.label}
                    </Tag>
                );
            },
        },
        {
            title: 'Sản lượng',
            key: 'output',
            width: 200,
            render: (_, day) => (
                <div className='production-history-output'>
                    <span>
                        <strong>{number(day.summary.totalActual)}</strong>
                        <small>/ {number(day.summary.totalTarget)} SP</small>
                    </span>
                    <Progress
                        percent={Math.min(100, Math.round(day.summary.achievementPercent))}
                        showInfo={false}
                        size='small'
                        strokeColor={day.summary.achievementPercent >= 95 ? '#168a52' : '#c87816'}
                    />
                </div>
            ),
        },
        {
            title: '% đạt',
            dataIndex: ['summary', 'achievementPercent'],
            width: 100,
            align: 'right',
            render: (value) => <strong>{Number(value || 0).toFixed(1)}%</strong>,
        },
        {
            title: 'Nhân sự',
            dataIndex: ['summary', 'totalWorkers'],
            width: 105,
            align: 'right',
            render: (value) => number(value),
        },
        ...(canSeeFinancials
            ? [
                  {
                      title: 'Giá trị',
                      dataIndex: ['summary', 'totalAmount'],
                      width: 150,
                      align: 'right' as const,
                      render: (value: number) => `${number(value)} đ`,
                  },
              ]
            : []),
        {
            title: 'Người chốt',
            key: 'actor',
            width: 165,
            render: (_, day) => (
                <div className='production-history-actor'>
                    <strong>{day.lockedBy?.name || day.submittedBy?.name || 'Chưa chốt'}</strong>
                    <small>
                        {day.lockedAt || day.submittedAt
                            ? dayjs(day.lockedAt || day.submittedAt).format('DD/MM HH:mm')
                            : '—'}
                    </small>
                </div>
            ),
        },
        {
            title: '',
            key: 'actions',
            fixed: 'right',
            width: canManage ? 104 : 50,
            render: (_, day) => (
                <div className='production-history-actions'>
                    <Button type='text' icon={<EyeOutlined />} onClick={() => openDay(day)} aria-label='Xem ngày' />
                    {canManage ? (
                        <Button
                            type='text'
                            icon={<DownloadOutlined />}
                            loading={exportingId === day.id}
                            onClick={() => exportMutation.mutate({ id: day.id, date: day.productionDate })}
                            aria-label='Xuất Excel'
                        />
                    ) : null}
                </div>
            ),
        },
    ];

    return (
        <div className='production-page production-history-page'>
            <section className='production-workbench-header'>
                <div className='production-workbench-title'>
                    <span className='production-kicker'>Sổ sản xuất</span>
                    <Title level={2}>Lịch sử & báo cáo</Title>
                    <Text type='secondary'>Tra cứu ngày đã nhập, trạng thái duyệt và xuất báo cáo chuẩn.</Text>
                </div>
                <div className='production-history-filters'>
                    <Select
                        value={plantId || undefined}
                        onChange={(value) => {
                            setPlantId(value);
                            setPage(1);
                        }}
                        disabled={!canSwitchPlant}
                        loading={plantsQuery.isLoading}
                        options={(plantsQuery.data || []).map((plant) => ({ value: plant.id, label: plant.name }))}
                        placeholder='Chọn cơ sở'
                    />
                    <RangePicker
                        value={range}
                        allowClear={false}
                        format='DD/MM/YYYY'
                        onChange={(value) => {
                            if (value?.[0] && value[1]) setRange([value[0], value[1]]);
                            setPage(1);
                        }}
                    />
                    <Select
                        value={status || 'all'}
                        onChange={(value) => {
                            setStatus(value === 'all' ? undefined : (value as ProductionDayStatus));
                            setPage(1);
                        }}
                        options={[
                            { value: 'all', label: 'Tất cả trạng thái' },
                            { value: 'draft', label: 'Đang nhập' },
                            { value: 'submitted', label: 'Chờ duyệt' },
                            { value: 'locked', label: 'Đã khóa sổ' },
                        ]}
                    />
                    <Button
                        icon={<ReloadOutlined />}
                        loading={historyQuery.isFetching}
                        onClick={() => historyQuery.refetch()}
                        aria-label='Tải lại'
                    />
                </div>
            </section>

            <section className='production-history-kpis'>
                <div>
                    <span>Số ngày</span>
                    <strong>{historyQuery.data?.total || 0}</strong>
                    <small>trong phạm vi lọc</small>
                </div>
                <div>
                    <span>Sản lượng</span>
                    <strong>{number(aggregate.totalActual)}</strong>
                    <small>SP trên trang hiện tại</small>
                </div>
                <div>
                    <span>Mức đạt</span>
                    <strong>{aggregate.achievement.toFixed(1)}%</strong>
                    <small>theo tổng khoán</small>
                </div>
                <div>
                    <span>Đã khóa sổ</span>
                    <strong>{aggregate.locked}</strong>
                    <small>{days.length} ngày đang hiển thị</small>
                </div>
                {canSeeFinancials ? (
                    <div>
                        <span>Giá trị sản lượng</span>
                        <strong>{number(aggregate.amount)} đ</strong>
                        <small>trang hiện tại</small>
                    </div>
                ) : null}
            </section>

            {historyQuery.isLoading ? (
                <section className='production-history-loading'>
                    <Skeleton active paragraph={{ rows: 8 }} />
                </section>
            ) : historyQuery.isError ? (
                <Alert
                    type='error'
                    showIcon
                    message='Không tải được lịch sử sản xuất'
                    description={errorMessage(historyQuery.error)}
                    action={<Button onClick={() => historyQuery.refetch()}>Thử lại</Button>}
                />
            ) : !days.length ? (
                <section className='production-history-empty'>
                    <Empty description='Chưa có ngày sản xuất trong phạm vi đã chọn' />
                </section>
            ) : isMobile ? (
                <section className='production-history-mobile-list'>
                    {days.map((day) => {
                        const meta = statusMeta[day.status];
                        return (
                            <article key={day.id} className={`production-history-card status-${day.status}`}>
                                <button type='button' onClick={() => openDay(day)}>
                                    <div className='production-history-card__heading'>
                                        <span>
                                            <strong>{dayjs(day.productionDate).format('DD')}</strong>
                                            <small>{dayjs(day.productionDate).format('MM/YYYY')}</small>
                                        </span>
                                        <div>
                                            <strong>{dayjs(day.productionDate).format('dddd')}</strong>
                                            <Tag color={meta.color} icon={meta.icon}>
                                                {meta.label}
                                            </Tag>
                                        </div>
                                        <EyeOutlined />
                                    </div>
                                    <div className='production-history-card__metrics'>
                                        <div>
                                            <small>Sản lượng</small>
                                            <strong>{number(day.summary.totalActual)} SP</strong>
                                        </div>
                                        <div>
                                            <small>Mức đạt</small>
                                            <strong>{day.summary.achievementPercent.toFixed(1)}%</strong>
                                        </div>
                                        <div>
                                            <small>Nhân sự</small>
                                            <strong>{number(day.summary.totalWorkers)}</strong>
                                        </div>
                                    </div>
                                    <Progress
                                        percent={Math.min(100, Math.round(day.summary.achievementPercent))}
                                        showInfo={false}
                                        size='small'
                                        strokeColor={day.summary.achievementPercent >= 95 ? '#168a52' : '#c87816'}
                                    />
                                </button>
                                <div className='production-history-card__footer'>
                                    <span>{day.lockedBy?.name || day.submittedBy?.name || 'Chưa gửi duyệt'}</span>
                                    {canManage ? (
                                        <Button
                                            icon={<DownloadOutlined />}
                                            loading={exportingId === day.id}
                                            onClick={() =>
                                                exportMutation.mutate({ id: day.id, date: day.productionDate })
                                            }
                                        >
                                            Excel
                                        </Button>
                                    ) : null}
                                </div>
                            </article>
                        );
                    })}
                </section>
            ) : (
                <section className='production-history-table'>
                    <Table<ProductionDay>
                        rowKey='id'
                        columns={columns}
                        dataSource={days}
                        pagination={false}
                        scroll={{ x: 970 }}
                    />
                </section>
            )}

            {(historyQuery.data?.totalPages || 1) > 1 ? (
                <Pagination
                    className='production-history-pagination'
                    current={page}
                    total={historyQuery.data?.total || 0}
                    pageSize={historyQuery.data?.limit || 31}
                    showSizeChanger={false}
                    onChange={setPage}
                />
            ) : null}

            {!historyQuery.isLoading && days.length ? (
                <div className='production-history-footnote'>
                    <CheckCircleOutlined /> Báo cáo Excel gồm báo cáo ngày, sổ nhập theo giờ, tổng hợp tháng, mã hàng và
                    danh mục.
                </div>
            ) : null}
        </div>
    );
};

export default ProductionHistoryPage;
