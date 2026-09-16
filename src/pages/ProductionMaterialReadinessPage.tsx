import {
    CheckCircleOutlined,
    ClockCircleOutlined,
    DatabaseOutlined,
    EditOutlined,
    ExclamationCircleOutlined,
    LockOutlined,
    ReloadOutlined,
    SafetyCertificateOutlined,
    UnlockOutlined,
    WarningOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Alert,
    App,
    Button,
    Drawer,
    Empty,
    Input,
    Modal,
    Segmented,
    Select,
    Skeleton,
    Space,
    Table,
    Tag,
    Tooltip,
    Typography,
    type TableColumnsType,
} from 'antd';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { productionErrorMessage } from '../core/lib/production-error';
import ProductionBomEditorModal from '../components/production/ProductionBomEditorModal';
import { useAuth } from '../core/contexts/AuthContext';
import { useResponsive } from '../core/hooks/useResponsive';
import { useSocket } from '../core/hooks/useSocket';
import { isAdmin, isDirector } from '../core/lib/permissions';
import { materialService, type Material } from '../core/services/material.service';
import { plantService } from '../core/services/plant.service';
import { productionService } from '../core/services/production.service';
import type {
    ProductionBom,
    ProductionMaterialReadinessLine,
    ProductionMaterialReadinessOrder,
    ProductionMaterialReadinessStatus,
} from '../core/types/production';

const { Text, Title } = Typography;
const number = (value = 0) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 4 }).format(value);
const errorText = (error: unknown) => productionErrorMessage(error, 'Không thể xử lý dữ liệu vật tư');
const statusOptions = [
    { label: 'Tất cả', value: 'all' },
    { label: 'Đủ', value: 'ready' },
    { label: 'Thiếu một phần', value: 'partial' },
    { label: 'Thiếu', value: 'shortage' },
    { label: 'Chưa có BOM', value: 'unknown' },
];

const statusMeta: Record<
    ProductionMaterialReadinessStatus,
    { label: string; color: string; icon: React.ReactNode; description: string }
> = {
    ready: {
        label: 'Đủ khả dụng',
        color: 'green',
        icon: <CheckCircleOutlined />,
        description: 'Đủ theo tồn và ETA xác nhận',
    },
    partial: {
        label: 'Thiếu một phần',
        color: 'orange',
        icon: <ClockCircleOutlined />,
        description: 'Một phần nhu cầu chưa được bảo đảm',
    },
    shortage: { label: 'Thiếu vật tư', color: 'red', icon: <WarningOutlined />, description: 'Chưa đủ để vào chuyền' },
    unknown: {
        label: 'Chưa có BOM',
        color: 'default',
        icon: <DatabaseOutlined />,
        description: 'Chưa đủ dữ liệu để kết luận',
    },
};

const normalizeMaterials = (input: Awaited<ReturnType<typeof materialService.getAll>> | undefined): Material[] => {
    if (!input) return [];
    if (Array.isArray(input)) return input;
    return Array.isArray(input.data) ? input.data : [];
};

const ProductionMaterialReadinessPage = () => {
    const { message, modal } = App.useApp();
    const [searchParams, setSearchParams] = useSearchParams();
    const queryClient = useQueryClient();
    const { user, role } = useAuth();
    const { isCompact } = useResponsive();
    const { socket } = useSocket();
    const [plantId, setPlantId] = useState(searchParams.get('plantId') || user?.plantId || '');
    const [status, setStatus] = useState<'all' | ProductionMaterialReadinessStatus>('all');
    const [bomItem, setBomItem] = useState<{ id: string; code: string; name?: string }>();
    const [releaseOrder, setReleaseOrder] = useState<ProductionMaterialReadinessOrder>();
    const [releaseReason, setReleaseReason] = useState('Giải phóng tồn để điều chỉnh kế hoạch');
    const canSwitchPlant = isAdmin(role) || isDirector(role);

    const plantsQuery = useQuery({ queryKey: ['plants'], queryFn: () => plantService.getAll(), staleTime: 300_000 });
    useEffect(() => {
        if (plantId) return;
        const preferred = user?.plantId || plantsQuery.data?.[0]?.id;
        if (preferred) setPlantId(preferred);
    }, [plantId, plantsQuery.data, user?.plantId]);

    const readinessQuery = useQuery({
        queryKey: ['production', 'material-readiness', plantId, status],
        queryFn: () => productionService.getMaterialReadiness(plantId, status === 'all' ? undefined : status),
        enabled: Boolean(plantId),
        refetchInterval: 60_000,
    });
    const bomsQuery = useQuery({
        queryKey: ['production', 'boms', plantId],
        queryFn: () => productionService.getBoms(plantId),
        enabled: Boolean(plantId),
    });
    const materialsQuery = useQuery({
        queryKey: ['materials', 'production-bom-options'],
        queryFn: () => materialService.getAll({ isActive: true, page: 1, limit: 1000 }),
        staleTime: 300_000,
    });
    const report = readinessQuery.data;
    const selected = report?.items.find((row) => row.order.id === searchParams.get('orderId'));
    const setSelected = (row?: ProductionMaterialReadinessOrder) => {
        setSearchParams(
            (previous) => {
                const next = new URLSearchParams(previous);
                next.set('plantId', plantId);
                if (row) next.set('orderId', row.order.id);
                else next.delete('orderId');
                return next;
            },
            { replace: true }
        );
    };
    const materials = normalizeMaterials(materialsQuery.data);
    const boms = bomsQuery.data?.items || [];
    const draftBom = bomItem ? boms.find((bom) => bom.itemId === bomItem.id && bom.status === 'draft') : undefined;
    const approvedBom = bomItem
        ? boms.find((bom) => bom.itemId === bomItem.id && bom.status === 'approved')
        : undefined;

    useEffect(() => {
        if (!socket) return;
        const refresh = (payload: { plantId?: string }) => {
            if (!payload.plantId || payload.plantId === plantId) {
                void queryClient.invalidateQueries({ queryKey: ['production', 'material-readiness'] });
                void queryClient.invalidateQueries({ queryKey: ['production', 'boms'] });
            }
        };
        socket.on('production:material-updated', refresh);
        return () => {
            socket.off('production:material-updated', refresh);
        };
    }, [plantId, queryClient, socket]);

    const refresh = async () => {
        await Promise.all([readinessQuery.refetch(), bomsQuery.refetch()]);
        message.success('Đã đối chiếu lại tồn kho và đơn mua');
    };
    const invalidate = async () => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['production', 'material-readiness'] }),
            queryClient.invalidateQueries({ queryKey: ['production', 'boms'] }),
            queryClient.invalidateQueries({ queryKey: ['production', 'capacity'] }),
        ]);
    };

    const saveBomMutation = useMutation({
        mutationFn: (values: {
            effectiveFrom?: ReturnType<typeof dayjs>;
            note?: string;
            changeReason: string;
            lines: Array<{
                materialId: string;
                quantityPerUnit: number;
                wastagePercent: number;
                isRequired: boolean;
                operationName?: string;
                note?: string;
            }>;
        }) => {
            if (!bomItem) throw new Error('Chưa chọn mã hàng');
            return productionService.saveBomDraft(bomItem.id, {
                plantId,
                revision: draftBom?.revision || 0,
                effectiveFrom: values.effectiveFrom?.format('YYYY-MM-DD'),
                note: values.note,
                changeReason: values.changeReason,
                lines: values.lines,
            });
        },
        onSuccess: async () => {
            await invalidate();
            message.success('Đã lưu BOM nháp. Hãy rà lại trước khi duyệt');
        },
        onError: (error) => message.error(errorText(error)),
    });
    const approveBomMutation = useMutation({
        mutationFn: (bom: ProductionBom) =>
            productionService.approveBom(bom.id, bom.revision, 'Duyệt áp dụng cho kế hoạch sản xuất'),
        onSuccess: async () => {
            setBomItem(undefined);
            await invalidate();
            message.success('BOM đã được ban hành; reservation cũ đã được giải phóng để đối chiếu lại');
        },
        onError: (error) => message.error(errorText(error)),
    });
    const reserveMutation = useMutation({
        mutationFn: (orderId: string) => productionService.reserveOrderMaterials(orderId),
        onSuccess: async (row) => {
            setSelected(row);
            await invalidate();
            message.success(
                row.status === 'ready' ? 'Đã giữ đủ tồn cho đơn' : 'Đã giữ phần tồn khả dụng; đơn vẫn còn thiếu'
            );
        },
        onError: (error) => message.error(errorText(error)),
    });
    const releaseMutation = useMutation({
        mutationFn: ({ orderId, reason }: { orderId: string; reason: string }) =>
            productionService.releaseOrderMaterials(orderId, reason),
        onSuccess: async ({ readiness }) => {
            setSelected(readiness);
            setReleaseOrder(undefined);
            await invalidate();
            message.success('Đã giải phóng tồn vật tư');
        },
        onError: (error) => message.error(errorText(error)),
    });
    const snapshotMutation = useMutation({
        mutationFn: (orderId: string) => productionService.snapshotOrderMaterials(orderId),
        onSuccess: async () => {
            await invalidate();
            message.success('Đã chốt snapshot nguồn số liệu hiện tại');
        },
        onError: (error) => message.error(errorText(error)),
    });

    const openBom = (row: ProductionMaterialReadinessOrder) =>
        setBomItem({ id: row.order.itemId, code: row.order.itemCode, name: row.order.itemName });
    const summary = report?.summary;
    const rows = report?.items || [];

    const columns: TableColumnsType<ProductionMaterialReadinessOrder> = [
        {
            title: 'Đơn hàng / mã hàng',
            key: 'order',
            width: 230,
            render: (_, row) => (
                <button type='button' className='production-material-order-link' onClick={() => setSelected(row)}>
                    <strong>{row.order.code}</strong>
                    <span>
                        {row.order.itemCode} · {number(row.order.totalQuantity)} SP
                    </span>
                </button>
            ),
        },
        {
            title: 'Vào chuyền / hạn giao',
            key: 'dates',
            width: 170,
            render: (_, row) => (
                <div className='production-material-dates'>
                    <span>
                        {row.order.plannedStartDate
                            ? dayjs(row.order.plannedStartDate).format('DD/MM/YYYY')
                            : 'Chưa chốt vào chuyền'}
                    </span>
                    <small>Hạn {dayjs(row.order.dueDate).format('DD/MM/YYYY')}</small>
                </div>
            ),
        },
        {
            title: 'Readiness',
            key: 'status',
            width: 160,
            render: (_, row) => (
                <Tag color={statusMeta[row.status].color} icon={statusMeta[row.status].icon}>
                    {statusMeta[row.status].label}
                </Tag>
            ),
        },
        {
            title: 'Đối chiếu dòng',
            key: 'coverage',
            width: 170,
            render: (_, row) =>
                row.bom ? (
                    <div className='production-material-coverage'>
                        <strong>
                            {row.summary.readyLineCount}/{row.summary.requiredLineCount} dòng đủ
                        </strong>
                        <span className={row.summary.shortageLineCount ? 'is-danger' : ''}>
                            {row.summary.shortageLineCount
                                ? `${row.summary.shortageLineCount} dòng thiếu`
                                : `BOM v${row.bom.version}`}
                        </span>
                    </div>
                ) : (
                    <Text type='secondary'>Chưa thể tính</Text>
                ),
        },
        {
            title: 'Giữ tồn',
            key: 'reservation',
            width: 140,
            render: (_, row) =>
                row.reservationStatus === 'reserved' ? (
                    <Tag color='blue' icon={<LockOutlined />}>
                        Đã giữ đủ
                    </Tag>
                ) : row.reservationStatus === 'partial' ? (
                    <Tag color='orange'>Giữ một phần</Tag>
                ) : (
                    <Tag>Chưa giữ</Tag>
                ),
        },
        {
            title: '',
            key: 'actions',
            width: 210,
            fixed: 'right',
            render: (_, row) => (
                <Space>
                    <Button icon={<EditOutlined />} onClick={() => openBom(row)}>
                        BOM
                    </Button>
                    <Button
                        type='primary'
                        ghost
                        disabled={!row.bom}
                        loading={reserveMutation.isPending && reserveMutation.variables === row.order.id}
                        onClick={() => reserveMutation.mutate(row.order.id)}
                    >
                        Giữ tồn
                    </Button>
                </Space>
            ),
        },
    ];

    return (
        <div className='production-page production-material-page'>
            <header className='production-page-header production-material-header'>
                <div>
                    <Text className='production-eyebrow'>KẾ HOẠCH NGUYÊN PHỤ LIỆU</Text>
                    <Title level={2}>Readiness theo đơn hàng</Title>
                    <Text type='secondary'>
                        Đối chiếu BOM, tồn kho, phần đã giữ và hàng đang về trước khi xếp chuyền.
                    </Text>
                </div>
                <div className='production-material-controls'>
                    <Select
                        value={plantId || undefined}
                        onChange={(nextPlantId) => {
                            setPlantId(nextPlantId);
                            setSearchParams({ plantId: nextPlantId }, { replace: true });
                            setBomItem(undefined);
                            setReleaseOrder(undefined);
                        }}
                        disabled={!canSwitchPlant}
                        placeholder='Chọn cơ sở'
                        options={(plantsQuery.data || []).map((plant) => ({ value: plant.id, label: plant.name }))}
                    />
                    <Tooltip title='Đối chiếu lại dữ liệu mới nhất'>
                        <Button icon={<ReloadOutlined />} loading={readinessQuery.isFetching} onClick={refresh}>
                            Làm mới
                        </Button>
                    </Tooltip>
                </div>
            </header>

            <Alert
                className='production-material-policy'
                type='warning'
                showIcon
                message='PO chưa có ngày dự kiến giao không được tính là vật tư sẵn sàng'
                description='Số “đang về” dùng để theo dõi nguồn bổ sung. Chỉ tồn đã giữ hoặc nguồn có ETA được xác nhận mới đủ điều kiện đưa vào kế hoạch.'
            />

            {readinessQuery.isLoading ? (
                <Skeleton active paragraph={{ rows: 8 }} />
            ) : readinessQuery.isError ? (
                <Alert
                    type='error'
                    showIcon
                    message='Không tải được readiness nguyên phụ liệu'
                    description={errorText(readinessQuery.error)}
                    action={<Button onClick={() => readinessQuery.refetch()}>Thử lại</Button>}
                />
            ) : (
                <>
                    <section className='production-material-kpis'>
                        <div>
                            <span>Tổng đơn mở</span>
                            <strong>{summary?.orderCount || 0}</strong>
                            <small>Cần kiểm soát vật tư</small>
                        </div>
                        <div className='is-ready'>
                            <span>Đủ khả dụng</span>
                            <strong>{summary?.readyCount || 0}</strong>
                            <small>Sau đối chiếu tồn</small>
                        </div>
                        <div className='is-warning'>
                            <span>Thiếu một phần</span>
                            <strong>{summary?.partialCount || 0}</strong>
                            <small>Cần xử lý trước lịch</small>
                        </div>
                        <div className='is-danger'>
                            <span>Thiếu hoàn toàn</span>
                            <strong>{summary?.shortageCount || 0}</strong>
                            <small>{summary?.shortageLineCount || 0} dòng thiếu</small>
                        </div>
                        <div>
                            <span>Chưa có BOM</span>
                            <strong>{summary?.unknownCount || 0}</strong>
                            <small>Cần kỹ thuật khai báo</small>
                        </div>
                    </section>

                    <div className='production-material-filter'>
                        {isCompact ? (
                            <Select
                                aria-label='Trạng thái nguyên phụ liệu'
                                className='production-material-status'
                                value={status}
                                onChange={setStatus}
                                options={statusOptions}
                            />
                        ) : (
                            <Segmented
                                value={status}
                                onChange={(value) => setStatus(value as typeof status)}
                                options={statusOptions}
                            />
                        )}
                        <Text type='secondary'>
                            Cập nhật lúc {report?.asOf ? dayjs(report.asOf).format('HH:mm DD/MM/YYYY') : '--'}
                        </Text>
                    </div>

                    <section className='production-material-list'>
                        {!rows.length ? (
                            <Empty description='Không có đơn hàng trong trạng thái đã chọn' />
                        ) : isCompact ? (
                            <div className='production-material-cards'>
                                {rows.map((row) => (
                                    <article key={row.order.id} className={`production-material-card is-${row.status}`}>
                                        <header onClick={() => setSelected(row)}>
                                            <div>
                                                <strong>{row.order.code}</strong>
                                                <span>
                                                    {row.order.itemCode} · {number(row.order.totalQuantity)} SP
                                                </span>
                                            </div>
                                            <Tag color={statusMeta[row.status].color}>
                                                {statusMeta[row.status].label}
                                            </Tag>
                                        </header>
                                        <div className='production-material-card__facts'>
                                            <span>
                                                <small>Dòng đủ</small>
                                                <strong>
                                                    {row.summary.readyLineCount}/{row.summary.requiredLineCount || '--'}
                                                </strong>
                                            </span>
                                            <span>
                                                <small>Dòng thiếu</small>
                                                <strong className={row.summary.shortageLineCount ? 'is-danger' : ''}>
                                                    {row.summary.shortageLineCount}
                                                </strong>
                                            </span>
                                            <span>
                                                <small>Vào chuyền</small>
                                                <strong>
                                                    {row.order.plannedStartDate
                                                        ? dayjs(row.order.plannedStartDate).format('DD/MM')
                                                        : 'Chưa chốt'}
                                                </strong>
                                            </span>
                                        </div>
                                        <footer>
                                            <Button icon={<EditOutlined />} onClick={() => openBom(row)}>
                                                BOM
                                            </Button>
                                            <Button
                                                type='primary'
                                                ghost
                                                disabled={!row.bom}
                                                onClick={() => reserveMutation.mutate(row.order.id)}
                                            >
                                                {row.reservationStatus === 'reserved' ? 'Đối chiếu lại' : 'Giữ tồn'}
                                            </Button>
                                        </footer>
                                    </article>
                                ))}
                            </div>
                        ) : (
                            <Table
                                rowKey={(row) => row.order.id}
                                columns={columns}
                                dataSource={rows}
                                pagination={false}
                                scroll={{ x: 1080 }}
                            />
                        )}
                    </section>
                </>
            )}

            <Drawer
                open={Boolean(selected)}
                onClose={() => setSelected(undefined)}
                width={isCompact ? '100%' : 760}
                title={selected ? `Đối chiếu vật tư · ${selected.order.code}` : ''}
                className='production-material-drawer'
                extra={
                    selected ? (
                        <Tag color={statusMeta[selected.status].color}>{statusMeta[selected.status].label}</Tag>
                    ) : null
                }
            >
                {selected ? (
                    <div className='production-material-detail'>
                        <div className='production-material-detail__summary'>
                            <span>
                                <small>Mã hàng</small>
                                <strong>{selected.order.itemCode}</strong>
                            </span>
                            <span>
                                <small>Số lượng đơn</small>
                                <strong>{number(selected.order.totalQuantity)} SP</strong>
                            </span>
                            <span>
                                <small>BOM áp dụng</small>
                                <strong>{selected.bom ? `Phiên bản ${selected.bom.version}` : 'Chưa có'}</strong>
                            </span>
                            <span>
                                <small>Snapshot gần nhất</small>
                                <strong>
                                    {selected.latestSnapshot
                                        ? dayjs(selected.latestSnapshot.asOf).format('HH:mm DD/MM')
                                        : 'Chưa chốt'}
                                </strong>
                            </span>
                        </div>
                        {!selected.bom ? (
                            <Empty description='Mã hàng chưa có BOM được duyệt'>
                                <Button type='primary' icon={<EditOutlined />} onClick={() => openBom(selected)}>
                                    Khai báo BOM
                                </Button>
                            </Empty>
                        ) : (
                            <>
                                <div className='production-material-detail__actions'>
                                    <Button
                                        type='primary'
                                        icon={<LockOutlined />}
                                        loading={reserveMutation.isPending}
                                        onClick={() => reserveMutation.mutate(selected.order.id)}
                                    >
                                        Giữ tồn khả dụng
                                    </Button>
                                    <Button
                                        icon={<SafetyCertificateOutlined />}
                                        loading={snapshotMutation.isPending}
                                        onClick={() => snapshotMutation.mutate(selected.order.id)}
                                    >
                                        Chốt snapshot
                                    </Button>
                                    <Button icon={<EditOutlined />} onClick={() => openBom(selected)}>
                                        Sửa BOM
                                    </Button>
                                    <Button
                                        danger
                                        icon={<UnlockOutlined />}
                                        disabled={selected.reservationStatus === 'unreserved'}
                                        onClick={() => setReleaseOrder(selected)}
                                    >
                                        Giải phóng
                                    </Button>
                                </div>
                                <div className='production-material-detail__legend'>
                                    <span>
                                        <i className='is-stock' />
                                        Tồn vật lý
                                    </span>
                                    <span>
                                        <i className='is-own' />
                                        Giữ cho đơn này
                                    </span>
                                    <span>
                                        <i className='is-other' />
                                        Đơn khác đã giữ
                                    </span>
                                    <span>
                                        <i className='is-inbound' />
                                        PO đang về
                                    </span>
                                </div>
                                <div className='production-material-detail__lines'>
                                    {selected.lines.map((line: ProductionMaterialReadinessLine) => (
                                        <article key={line.materialId} className={`is-${line.status}`}>
                                            <header>
                                                <div>
                                                    <strong>{line.materialName}</strong>
                                                    <span>
                                                        {line.materialCode || 'Chưa có mã'} · {line.unit}
                                                        {line.operationName ? ` · ${line.operationName}` : ''}
                                                    </span>
                                                </div>
                                                <Tag
                                                    color={
                                                        line.status === 'ready'
                                                            ? 'green'
                                                            : line.status === 'partial'
                                                              ? 'orange'
                                                              : 'red'
                                                    }
                                                >
                                                    {line.status === 'ready'
                                                        ? 'Đủ'
                                                        : line.status === 'partial'
                                                          ? 'Thiếu một phần'
                                                          : 'Thiếu'}
                                                </Tag>
                                            </header>
                                            <div className='production-material-line-metrics'>
                                                <span>
                                                    <small>Nhu cầu</small>
                                                    <strong>{number(line.requiredQuantity)}</strong>
                                                </span>
                                                <span>
                                                    <small>Tồn kho</small>
                                                    <strong>{number(line.onHandQuantity)}</strong>
                                                </span>
                                                <span>
                                                    <small>Đã giữ đơn này</small>
                                                    <strong>{number(line.reservedForOrderQuantity)}</strong>
                                                </span>
                                                <span>
                                                    <small>Đơn khác giữ</small>
                                                    <strong>{number(line.reservedForOtherOrdersQuantity)}</strong>
                                                </span>
                                                <span>
                                                    <small>Đang về</small>
                                                    <strong>{number(line.inboundQuantity)}</strong>
                                                </span>
                                                <span className={line.shortageQuantity ? 'is-danger' : 'is-success'}>
                                                    <small>Còn thiếu</small>
                                                    <strong>{number(line.shortageQuantity)}</strong>
                                                </span>
                                            </div>
                                            {line.inboundSources.length ? (
                                                <div className='production-material-inbound'>
                                                    <ExclamationCircleOutlined />
                                                    <span>
                                                        {line.inboundSources
                                                            .map(
                                                                (source) =>
                                                                    `${source.purchaseOrderCode || 'PO'}: ${number(source.quantity)} ${line.unit}`
                                                            )
                                                            .join(' · ')}
                                                    </span>
                                                    <Tag>Chưa có ETA</Tag>
                                                </div>
                                            ) : null}
                                        </article>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                ) : null}
            </Drawer>

            <ProductionBomEditorModal
                open={Boolean(bomItem)}
                item={bomItem}
                draft={draftBom}
                approved={approvedBom}
                materials={materials}
                saving={saveBomMutation.isPending}
                approving={approveBomMutation.isPending}
                onClose={() => setBomItem(undefined)}
                onSave={(values) => saveBomMutation.mutate(values)}
                onApprove={(bom) =>
                    modal.confirm({
                        title: `Duyệt BOM v${bom.version}?`,
                        content:
                            'BOM này sẽ thay phiên bản hiện hành. Tồn đã giữ theo BOM cũ sẽ được giải phóng để đối chiếu lại.',
                        okText: 'Duyệt và áp dụng',
                        cancelText: 'Kiểm tra lại',
                        onOk: () => approveBomMutation.mutateAsync(bom),
                    })
                }
            />

            <Modal
                open={Boolean(releaseOrder)}
                title={`Giải phóng tồn · ${releaseOrder?.order.code || ''}`}
                okText='Xác nhận giải phóng'
                okButtonProps={{
                    danger: true,
                    loading: releaseMutation.isPending,
                    disabled: releaseReason.trim().length < 3,
                }}
                cancelText='Đóng'
                onCancel={() => setReleaseOrder(undefined)}
                onOk={() =>
                    releaseOrder &&
                    releaseMutation.mutate({ orderId: releaseOrder.order.id, reason: releaseReason.trim() })
                }
            >
                <Alert type='warning' showIcon message='Tồn sau khi giải phóng có thể được giữ cho đơn khác' />
                <label className='production-material-release-reason'>
                    <span>Lý do</span>
                    <Input.TextArea
                        rows={3}
                        value={releaseReason}
                        maxLength={500}
                        onChange={(event) => setReleaseReason(event.target.value)}
                    />
                </label>
            </Modal>
        </div>
    );
};

export default ProductionMaterialReadinessPage;
