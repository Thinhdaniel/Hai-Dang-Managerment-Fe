import React, { useMemo, useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import {
    Alert,
    App,
    Button,
    DatePicker,
    Descriptions,
    Drawer,
    Empty,
    Form,
    Input,
    InputNumber,
    Modal,
    Popconfirm,
    Progress,
    Segmented,
    Select,
    Space,
    Table,
    Tabs,
    Tag,
    Tooltip,
    Typography,
    type TableColumnsType,
} from 'antd';
import {
    CheckCircleOutlined,
    ClockCircleOutlined,
    DownloadOutlined,
    HistoryOutlined,
    InboxOutlined,
    PlusOutlined,
    ReloadOutlined,
    RetweetOutlined,
    RollbackOutlined,
    SearchOutlined,
    SwapOutlined,
    TeamOutlined,
    ToolOutlined,
    UploadOutlined,
    UserOutlined,
    WarningOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import PageHeader from '../components/shared/PageHeader';
import RecipientImportModal from '../components/material-custody/RecipientImportModal';
import { useAuth } from '../core/contexts/AuthContext';
import { isAdmin, isDirector } from '../core/lib/permissions';
import { plantService } from '../core/services';
import {
    materialCustodyService,
    type CustodyAssignmentStatus,
    type CustodyCampaignStatus,
    type CustodyHolderType,
    type CustodyResolution,
    type MaterialCustodyAssignment,
    type MaterialRecipient,
    type MaterialUsageCampaign,
    type ReusableMaterialStock,
} from '../core/services/material-custody.service';

const { Text } = Typography;
const fmt = (value?: number) => Number(value || 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
const money = (value?: number) => `${Math.round(Number(value || 0)).toLocaleString('vi-VN')} đ`;
const date = (value?: string) => (value ? dayjs(value).format('DD/MM/YYYY') : 'Chưa đặt');

const ASSIGNMENT_STATUS: Record<CustodyAssignmentStatus, { label: string; color: string }> = {
    active: { label: 'Đang giữ', color: 'blue' },
    partial: { label: 'Đã trả một phần', color: 'gold' },
    recall_due: { label: 'Chờ thu hồi', color: 'orange' },
    resolved: { label: 'Đã xử lý đủ', color: 'green' },
};

const CAMPAIGN_STATUS: Record<CustodyCampaignStatus, { label: string; color: string }> = {
    active: { label: 'Đang sử dụng', color: 'blue' },
    recalling: { label: 'Đang thu hồi', color: 'orange' },
    closed: { label: 'Đã đóng', color: 'green' },
};

const RESOLUTION_OPTIONS: { label: string; value: CustodyResolution }[] = [
    { label: 'Còn tốt', value: 'usable' },
    { label: 'Cần sửa', value: 'repair' },
    { label: 'Hỏng', value: 'damaged' },
    { label: 'Mất', value: 'lost' },
];

const sourceLabel = (source: MaterialCustodyAssignment['sourceType']) => {
    if (source === 'opening_balance') return 'Số dư đầu kỳ';
    if (source === 'reusable_pool') return 'Cấp lại';
    if (source === 'custody_transfer') return 'Chuyển giữ';
    return 'Cấp mới';
};

type TargetFormValues = {
    quantity: number;
    holderType: CustodyHolderType;
    recipientId?: string;
    holderName?: string;
    department?: string;
    lineName?: string;
    campaignId: string;
    dueAt?: Dayjs;
    note?: string;
};

type OpeningBalanceFormValues = TargetFormValues & {
    materialId: string;
    unitPrice?: number;
    issuedAt: Dayjs;
};

const MaterialCustodyPage: React.FC = () => {
    const { user, role } = useAuth();
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const canChoosePlant = isAdmin(role) || isDirector(role);
    const [plantId, setPlantId] = useState(user?.plantId || undefined);
    const [assignmentSearch, setAssignmentSearch] = useState('');
    const [assignmentStatus, setAssignmentStatus] = useState<CustodyAssignmentStatus | undefined>();
    const [assignmentPage, setAssignmentPage] = useState(1);
    const [campaignStatus, setCampaignStatus] = useState<CustodyCampaignStatus | undefined>();
    const [resolveTarget, setResolveTarget] = useState<MaterialCustodyAssignment | null>(null);
    const [transferTarget, setTransferTarget] = useState<MaterialCustodyAssignment | null>(null);
    const [reissueTarget, setReissueTarget] = useState<ReusableMaterialStock | null>(null);
    const [historyTarget, setHistoryTarget] = useState<MaterialCustodyAssignment | null>(null);
    const [recallTarget, setRecallTarget] = useState<MaterialUsageCampaign | null>(null);
    const [recipientTarget, setRecipientTarget] = useState<MaterialRecipient | null | undefined>();
    const [campaignModalOpen, setCampaignModalOpen] = useState(false);
    const [recipientImportOpen, setRecipientImportOpen] = useState(false);
    const [openingBalanceOpen, setOpeningBalanceOpen] = useState(false);
    const [resolveForm] = Form.useForm<{ quantity: number; resolution: CustodyResolution; note?: string }>();
    const [transferForm] = Form.useForm<TargetFormValues>();
    const [reissueForm] = Form.useForm<TargetFormValues>();
    const [openingBalanceForm] = Form.useForm<OpeningBalanceFormValues>();
    const [recipientForm] = Form.useForm();
    const [campaignForm] = Form.useForm();
    const [recallForm] = Form.useForm<{ dueAt: Dayjs; note?: string }>();
    const transferHolderType = Form.useWatch('holderType', transferForm) || 'employee';
    const reissueHolderType = Form.useWatch('holderType', reissueForm) || 'employee';
    const openingBalanceHolderType = Form.useWatch('holderType', openingBalanceForm) || 'employee';

    const effectivePlantId = plantId || user?.plantId;
    const invalidate = async () => {
        await queryClient.invalidateQueries({ queryKey: ['material-custody'] });
    };

    const plantsQuery = useQuery({
        queryKey: ['plants'],
        queryFn: () => plantService.getAll(),
        enabled: canChoosePlant,
    });
    const summaryQuery = useQuery({
        queryKey: ['material-custody', 'summary', effectivePlantId],
        queryFn: () => materialCustodyService.getSummary(effectivePlantId),
        enabled: Boolean(effectivePlantId),
    });
    const assignmentsQuery = useQuery({
        queryKey: [
            'material-custody',
            'assignments',
            effectivePlantId,
            assignmentSearch,
            assignmentStatus,
            assignmentPage,
        ],
        queryFn: () =>
            materialCustodyService.getAssignments({
                plantId: effectivePlantId,
                search: assignmentSearch || undefined,
                status: assignmentStatus,
                page: assignmentPage,
                limit: 15,
            }),
        enabled: Boolean(effectivePlantId),
    });
    const campaignsQuery = useQuery({
        queryKey: ['material-custody', 'campaigns', effectivePlantId, campaignStatus],
        queryFn: () =>
            materialCustodyService.getCampaigns({ plantId: effectivePlantId, status: campaignStatus, limit: 100 }),
        enabled: Boolean(effectivePlantId),
    });
    const activeCampaignsQuery = useQuery({
        queryKey: ['material-custody', 'campaigns', effectivePlantId, 'active-options'],
        queryFn: () => materialCustodyService.getCampaigns({ plantId: effectivePlantId, status: 'active', limit: 100 }),
        enabled: Boolean(effectivePlantId),
    });
    const recipientsQuery = useQuery({
        queryKey: ['material-custody', 'recipients', effectivePlantId],
        queryFn: () => materialCustodyService.getRecipients({ plantId: effectivePlantId, limit: 200 }),
        enabled: Boolean(effectivePlantId),
    });
    const reusableQuery = useQuery({
        queryKey: ['material-custody', 'reusable-stock', effectivePlantId],
        queryFn: () => materialCustodyService.getReusableStock(effectivePlantId),
        enabled: Boolean(effectivePlantId),
    });
    const trackedMaterialsQuery = useQuery({
        queryKey: ['material-custody', 'tracked-materials'],
        queryFn: () => materialCustodyService.getTrackedMaterials(),
    });
    const productionItemsQuery = useQuery({
        queryKey: ['material-custody', 'production-items', effectivePlantId],
        queryFn: () => materialCustodyService.getProductionItems(effectivePlantId),
        enabled: Boolean(effectivePlantId),
    });
    const historyQuery = useQuery({
        queryKey: ['material-custody', 'movements', historyTarget?.id],
        queryFn: () => materialCustodyService.getAssignmentMovements(historyTarget!.id),
        enabled: Boolean(historyTarget),
    });

    const summary = summaryQuery.data;
    const assignments = assignmentsQuery.data?.data || [];
    const campaigns = campaignsQuery.data?.data || [];
    const activeCampaigns = activeCampaignsQuery.data?.data || [];
    const recipients = recipientsQuery.data?.data || [];
    const activeRecipients = recipients.filter((item) => item.isActive);
    const reusableStock = reusableQuery.data || [];

    const campaignOptions = activeCampaigns.map((campaign) => ({
        value: campaign.id,
        label: `${campaign.itemCode}${campaign.orderCode ? ` · ${campaign.orderCode}` : ''} · ${campaign.campaignCode}`,
    }));
    const recipientOptions = activeRecipients.map((recipient) => ({
        value: recipient.id,
        label: `${recipient.employeeCode} · ${recipient.fullName}${recipient.lineName ? ` · ${recipient.lineName}` : ''}`,
    }));

    const resolveMutation = useMutation({
        mutationFn: (values: { quantity: number; resolution: CustodyResolution; note?: string }) =>
            materialCustodyService.resolveAssignment(resolveTarget!.id, values),
        onSuccess: async () => {
            await invalidate();
            message.success('Đã ghi nhận thu hồi và cập nhật sổ trách nhiệm');
            setResolveTarget(null);
            resolveForm.resetFields();
        },
        onError: (error: any) => message.error(error?.message || 'Không thể ghi nhận thu hồi'),
    });
    const transferMutation = useMutation({
        mutationFn: (values: TargetFormValues) =>
            materialCustodyService.transferAssignment(transferTarget!.id, {
                ...values,
                dueAt: values.dueAt?.toISOString(),
            }),
        onSuccess: async () => {
            await invalidate();
            message.success('Đã chuyển người giữ hoặc mã hàng, không phát sinh thêm chi phí');
            setTransferTarget(null);
            transferForm.resetFields();
        },
        onError: (error: any) => message.error(error?.message || 'Không thể chuyển vật tư'),
    });
    const reissueMutation = useMutation({
        mutationFn: (values: TargetFormValues) =>
            materialCustodyService.reissue({
                ...values,
                plantId: effectivePlantId,
                materialId: reissueTarget!.materialId,
                dueAt: values.dueAt?.toISOString(),
            }),
        onSuccess: async () => {
            await invalidate();
            message.success('Đã cấp lại từ kho tái sử dụng, chi phí không bị ghi nhận lần hai');
            setReissueTarget(null);
            reissueForm.resetFields();
        },
        onError: (error: any) => message.error(error?.message || 'Không thể cấp lại vật tư'),
    });
    const openingBalanceMutation = useMutation({
        mutationFn: (values: OpeningBalanceFormValues) =>
            materialCustodyService.createOpeningBalance({
                ...values,
                plantId: effectivePlantId,
                issuedAt: values.issuedAt.startOf('day').toISOString(),
                dueAt: values.dueAt?.endOf('day').toISOString(),
            }),
        onSuccess: async () => {
            await invalidate();
            message.success('Đã ghi nhận số dư đang giữ đầu kỳ, không trừ kho và không phát sinh chi phí');
            setOpeningBalanceOpen(false);
            openingBalanceForm.resetFields();
        },
        onError: (error: any) => message.error(error?.message || 'Không thể ghi nhận số dư đầu kỳ'),
    });
    const recipientMutation = useMutation({
        mutationFn: (values: any) =>
            recipientTarget
                ? materialCustodyService.updateRecipient(recipientTarget.id, values)
                : materialCustodyService.createRecipient({ ...values, plantId: effectivePlantId }),
        onSuccess: async () => {
            await invalidate();
            message.success(recipientTarget ? 'Đã cập nhật người nhận' : 'Đã thêm người nhận');
            setRecipientTarget(undefined);
            recipientForm.resetFields();
        },
        onError: (error: any) => message.error(error?.message || 'Không thể lưu người nhận'),
    });
    const campaignMutation = useMutation({
        mutationFn: (values: any) => {
            const selected = (productionItemsQuery.data || []).find((item) => item.id === values.productionItemId);
            return materialCustodyService.createCampaign({
                ...values,
                plantId: effectivePlantId,
                itemCode: selected?.code || values.itemCode,
                itemName: selected?.name || values.itemName,
                startedAt: values.startedAt?.toISOString(),
            });
        },
        onSuccess: async () => {
            await invalidate();
            message.success('Đã mở đợt sử dụng vật tư cho mã hàng');
            setCampaignModalOpen(false);
            campaignForm.resetFields();
        },
        onError: (error: any) => message.error(error?.message || 'Không thể mở đợt mã hàng'),
    });
    const recallMutation = useMutation({
        mutationFn: (values: { dueAt: Dayjs; note?: string }) =>
            materialCustodyService.openRecall(recallTarget!.id, {
                dueAt: values.dueAt.endOf('day').toISOString(),
                note: values.note,
            }),
        onSuccess: async () => {
            await invalidate();
            message.success('Đã mở đợt thu hồi và đánh dấu toàn bộ CCDC còn thiếu');
            setRecallTarget(null);
            recallForm.resetFields();
        },
        onError: (error: any) => message.error(error?.message || 'Không thể mở thu hồi'),
    });
    const closeCampaignMutation = useMutation({
        mutationFn: (id: string) => materialCustodyService.closeCampaign(id),
        onSuccess: async () => {
            await invalidate();
            message.success('Đã đóng đợt thu hồi');
        },
        onError: (error: any) => message.error(error?.message || 'Chưa thể đóng đợt thu hồi'),
    });
    const exportMutation = useMutation({
        mutationFn: () =>
            materialCustodyService.exportReport({
                plantId: effectivePlantId,
                search: assignmentSearch || undefined,
                status: assignmentStatus,
            }),
        onSuccess: (blob) => {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `bao-cao-ccdc-thu-hoi-${dayjs().format('YYYYMMDD')}.xlsx`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            message.success('Đã xuất báo cáo CCDC và thu hồi vật tư');
        },
        onError: (error: any) => message.error(error?.message || 'Không thể xuất báo cáo'),
    });

    const openResolve = (row: MaterialCustodyAssignment) => {
        setResolveTarget(row);
        resolveForm.setFieldsValue({ quantity: row.outstandingQuantity, resolution: 'usable' });
    };
    const openTransfer = (row: MaterialCustodyAssignment) => {
        setTransferTarget(row);
        transferForm.setFieldsValue({ quantity: row.outstandingQuantity, holderType: 'employee' });
    };
    const openReissue = (row: ReusableMaterialStock) => {
        setReissueTarget(row);
        reissueForm.setFieldsValue({ quantity: Math.min(1, row.availableQuantity), holderType: 'employee' });
    };
    const openRecipient = (row?: MaterialRecipient) => {
        setRecipientTarget(row || null);
        recipientForm.setFieldsValue(row || { isActive: true });
    };

    const assignmentColumns: TableColumnsType<MaterialCustodyAssignment> = [
        {
            title: 'Vật tư',
            key: 'material',
            width: 230,
            render: (_, row) => (
                <div>
                    <div className='font-semibold text-slate-800'>{row.materialName}</div>
                    <div className='mt-1 flex flex-wrap gap-1'>
                        {row.materialCode ? <Text code>{row.materialCode}</Text> : null}
                        <Tag className='!m-0'>{sourceLabel(row.sourceType)}</Tag>
                    </div>
                </div>
            ),
        },
        {
            title: 'Người / tổ đang giữ',
            key: 'holder',
            width: 220,
            render: (_, row) => (
                <div>
                    <div className='font-medium text-slate-800'>{row.holderName}</div>
                    <div className='text-xs text-slate-500'>
                        {[row.holderCode, row.department, row.lineName].filter(Boolean).join(' · ') || '-'}
                    </div>
                </div>
            ),
        },
        {
            title: 'Mã hàng',
            key: 'campaign',
            width: 150,
            render: (_, row) => (
                <div>
                    <Text code>{row.itemCode}</Text>
                    <div className='text-xs text-slate-500'>{row.orderCode || '-'}</div>
                </div>
            ),
        },
        {
            title: 'Đã cấp / Còn giữ',
            key: 'quantity',
            width: 160,
            render: (_, row) => {
                const returned = row.quantityIssued - row.outstandingQuantity;
                const percent = row.quantityIssued > 0 ? Math.round((returned / row.quantityIssued) * 100) : 0;
                return (
                    <div>
                        <b>{fmt(row.quantityIssued)}</b> /{' '}
                        <b className='text-orange-600'>
                            {fmt(row.outstandingQuantity)} {row.unit}
                        </b>
                        <Progress percent={percent} size='small' showInfo={false} />
                    </div>
                );
            },
        },
        {
            title: 'Hạn / Trạng thái',
            key: 'status',
            width: 155,
            render: (_, row) => (
                <div>
                    <Tag color={row.overdue ? 'red' : ASSIGNMENT_STATUS[row.status].color}>
                        {row.overdue ? 'Quá hạn' : ASSIGNMENT_STATUS[row.status].label}
                    </Tag>
                    <div className='text-xs text-slate-500'>{date(row.dueAt)}</div>
                </div>
            ),
        },
        {
            title: '',
            key: 'actions',
            fixed: 'right',
            width: 120,
            render: (_, row) => (
                <Space size={2}>
                    {row.outstandingQuantity > 0 ? (
                        <Tooltip title='Thu hồi / xử lý'>
                            <Button type='text' icon={<RollbackOutlined />} onClick={() => openResolve(row)} />
                        </Tooltip>
                    ) : null}
                    {row.outstandingQuantity > 0 ? (
                        <Tooltip title='Chuyển người giữ / mã hàng'>
                            <Button type='text' icon={<SwapOutlined />} onClick={() => openTransfer(row)} />
                        </Tooltip>
                    ) : null}
                    <Tooltip title='Lịch sử'>
                        <Button type='text' icon={<HistoryOutlined />} onClick={() => setHistoryTarget(row)} />
                    </Tooltip>
                </Space>
            ),
        },
    ];

    const campaignColumns: TableColumnsType<MaterialUsageCampaign> = [
        {
            title: 'Đợt',
            key: 'campaign',
            render: (_, row) => (
                <div>
                    <Text code>{row.campaignCode}</Text>
                    <div className='mt-1 font-semibold text-slate-800'>
                        {row.itemCode} {row.itemName ? `· ${row.itemName}` : ''}
                    </div>
                    <div className='text-xs text-slate-500'>{row.orderCode || 'Không có mã đơn'}</div>
                </div>
            ),
        },
        {
            title: 'Phạm vi',
            key: 'scope',
            width: 175,
            render: (_, row) => (
                <div>
                    <b>{row.holderCount}</b> người/tổ
                    <div className='text-xs text-slate-500'>{row.assignmentCount} dòng cấp phát</div>
                </div>
            ),
        },
        {
            title: 'Chưa thu',
            dataIndex: 'outstandingQuantity',
            width: 115,
            render: (value) => (
                <b className={Number(value) > 0 ? 'text-orange-600' : 'text-emerald-700'}>{fmt(value)}</b>
            ),
        },
        {
            title: 'Trạng thái',
            dataIndex: 'status',
            width: 130,
            render: (value: CustodyCampaignStatus) => (
                <Tag color={CAMPAIGN_STATUS[value].color}>{CAMPAIGN_STATUS[value].label}</Tag>
            ),
        },
        { title: 'Hạn thu', dataIndex: 'dueAt', width: 115, render: date },
        {
            title: '',
            key: 'actions',
            width: 150,
            render: (_, row) =>
                row.status === 'active' ? (
                    <Button
                        icon={<RetweetOutlined />}
                        onClick={() => {
                            setRecallTarget(row);
                            recallForm.setFieldsValue({ dueAt: dayjs().add(3, 'day') });
                        }}
                    >
                        Mở thu hồi
                    </Button>
                ) : row.status === 'recalling' ? (
                    <Popconfirm
                        title='Đóng đợt thu hồi?'
                        description='Chỉ đóng được khi mọi chênh lệch đã xử lý đủ.'
                        onConfirm={() => closeCampaignMutation.mutate(row.id)}
                    >
                        <Button type='primary' icon={<CheckCircleOutlined />}>
                            Đóng đợt
                        </Button>
                    </Popconfirm>
                ) : null,
        },
    ];

    const recipientColumns: TableColumnsType<MaterialRecipient> = [
        { title: 'Mã CN', dataIndex: 'employeeCode', width: 120, render: (value) => <Text code>{value}</Text> },
        { title: 'Họ tên', dataIndex: 'fullName', render: (value) => <b>{value}</b> },
        {
            title: 'Bộ phận',
            key: 'location',
            render: (_, row) => [row.department, row.lineName].filter(Boolean).join(' · ') || '-',
        },
        {
            title: 'Trạng thái',
            dataIndex: 'isActive',
            width: 120,
            render: (value) => <Tag color={value ? 'green' : 'default'}>{value ? 'Đang làm việc' : 'Đã nghỉ'}</Tag>,
        },
        {
            title: '',
            width: 80,
            render: (_, row) => (
                <Button type='link' onClick={() => openRecipient(row)}>
                    Sửa
                </Button>
            ),
        },
    ];

    const targetFields = (holderType: CustodyHolderType) => (
        <>
            <Form.Item name='holderType' label='Đối tượng giữ' rules={[{ required: true }]}>
                <Segmented
                    block
                    options={[
                        { label: 'Công nhân', value: 'employee' },
                        { label: 'Tổ / chuyền', value: 'team' },
                    ]}
                />
            </Form.Item>
            {holderType === 'employee' ? (
                <Form.Item
                    name='recipientId'
                    label='Công nhân nhận'
                    rules={[{ required: true, message: 'Chọn công nhân nhận' }]}
                >
                    <Select
                        showSearch
                        optionFilterProp='label'
                        options={recipientOptions}
                        placeholder='Mã CN · Họ tên'
                    />
                </Form.Item>
            ) : (
                <Form.Item
                    name='holderName'
                    label='Tên tổ / chuyền'
                    rules={[{ required: true, message: 'Nhập tổ/chuyền nhận' }]}
                >
                    <Input placeholder='Ví dụ: Chuyền CM1' />
                </Form.Item>
            )}
            <Form.Item name='campaignId' label='Đợt mã hàng' rules={[{ required: true, message: 'Chọn đợt mã hàng' }]}>
                <Select
                    showSearch
                    optionFilterProp='label'
                    options={campaignOptions}
                    placeholder='Chọn mã hàng đang sử dụng'
                />
            </Form.Item>
            <Form.Item name='dueAt' label='Hạn dự kiến trả'>
                <DatePicker className='w-full' format='DD/MM/YYYY' />
            </Form.Item>
            <Form.Item name='note' label='Ghi chú'>
                <Input.TextArea rows={2} />
            </Form.Item>
        </>
    );

    const assignmentTab = (
        <div className='space-y-4'>
            <div className='flex flex-col justify-between gap-3 lg:flex-row'>
                <div className='flex flex-col gap-3 sm:flex-row lg:flex-1'>
                    <Input.Search
                        allowClear
                        prefix={<SearchOutlined />}
                        placeholder='Tìm vật tư, công nhân, mã hàng...'
                        onSearch={(value) => {
                            setAssignmentSearch(value.trim());
                            setAssignmentPage(1);
                        }}
                        className='sm:max-w-md'
                    />
                    <Select
                        allowClear
                        placeholder='Mọi trạng thái'
                        value={assignmentStatus}
                        onChange={(value) => {
                            setAssignmentStatus(value);
                            setAssignmentPage(1);
                        }}
                        className='w-full sm:w-52'
                        options={Object.entries(ASSIGNMENT_STATUS).map(([value, item]) => ({
                            value,
                            label: item.label,
                        }))}
                    />
                </div>
                <Button
                    icon={<PlusOutlined />}
                    onClick={() => {
                        setOpeningBalanceOpen(true);
                        openingBalanceForm.setFieldsValue({
                            quantity: 1,
                            holderType: 'employee',
                            issuedAt: dayjs(),
                        } as OpeningBalanceFormValues);
                    }}
                >
                    Số dư đang giữ đầu kỳ
                </Button>
            </div>
            <div className='hidden md:block'>
                <Table
                    rowKey='id'
                    columns={assignmentColumns}
                    dataSource={assignments}
                    loading={assignmentsQuery.isLoading}
                    scroll={{ x: 1050 }}
                    pagination={{
                        current: assignmentsQuery.data?.page || assignmentPage,
                        pageSize: 15,
                        total: assignmentsQuery.data?.total || 0,
                        showSizeChanger: false,
                        onChange: setAssignmentPage,
                    }}
                />
            </div>
            <div className='space-y-3 md:hidden'>
                {assignments.map((row) => (
                    <div key={row.id} className='rounded-md border border-slate-200 bg-white p-4 shadow-sm'>
                        <div className='flex items-start justify-between gap-2'>
                            <div>
                                <div className='font-semibold text-slate-900'>{row.materialName}</div>
                                <div className='text-xs text-slate-500'>
                                    {row.holderName} · {row.itemCode}
                                </div>
                            </div>
                            <Tag color={row.overdue ? 'red' : ASSIGNMENT_STATUS[row.status].color}>
                                {row.overdue ? 'Quá hạn' : ASSIGNMENT_STATUS[row.status].label}
                            </Tag>
                        </div>
                        <div className='mt-3 grid grid-cols-2 gap-3 text-sm'>
                            <div>
                                <div className='text-xs text-slate-500'>Đã cấp</div>
                                <b>
                                    {fmt(row.quantityIssued)} {row.unit}
                                </b>
                            </div>
                            <div>
                                <div className='text-xs text-slate-500'>Còn giữ</div>
                                <b className='text-orange-600'>
                                    {fmt(row.outstandingQuantity)} {row.unit}
                                </b>
                            </div>
                        </div>
                        <div className='mt-3 flex gap-2'>
                            {row.outstandingQuantity > 0 ? (
                                <Button block icon={<RollbackOutlined />} onClick={() => openResolve(row)}>
                                    Thu hồi
                                </Button>
                            ) : null}
                            {row.outstandingQuantity > 0 ? (
                                <Button icon={<SwapOutlined />} onClick={() => openTransfer(row)} />
                            ) : null}
                            <Button icon={<HistoryOutlined />} onClick={() => setHistoryTarget(row)} />
                        </div>
                    </div>
                ))}
                {!assignments.length && !assignmentsQuery.isLoading ? (
                    <Empty description='Chưa có vật tư đang theo dõi' />
                ) : null}
            </div>
        </div>
    );

    const campaignTab = (
        <div className='space-y-4'>
            <div className='flex flex-col justify-between gap-3 sm:flex-row'>
                <Select
                    allowClear
                    placeholder='Mọi trạng thái'
                    value={campaignStatus}
                    onChange={setCampaignStatus}
                    className='w-full sm:w-52'
                    options={Object.entries(CAMPAIGN_STATUS).map(([value, item]) => ({ value, label: item.label }))}
                />
                <Button
                    type='primary'
                    icon={<PlusOutlined />}
                    onClick={() => {
                        setCampaignModalOpen(true);
                        campaignForm.setFieldsValue({ startedAt: dayjs() });
                    }}
                >
                    Mở đợt mã hàng
                </Button>
            </div>
            <Table
                rowKey='id'
                columns={campaignColumns}
                dataSource={campaigns}
                loading={campaignsQuery.isLoading}
                scroll={{ x: 850 }}
                pagination={false}
            />
        </div>
    );

    const reusableTab = (
        <div>
            <Alert
                showIcon
                type='info'
                className='mb-4'
                message='Kho này tách khỏi tồn mua mới. Cấp lại từ đây không ghi thêm chi phí cấp phát.'
            />
            <div className='grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3'>
                {reusableStock.map((row) => (
                    <div key={row.id} className='rounded-md border border-slate-200 bg-white p-4'>
                        <div className='flex items-start justify-between gap-2'>
                            <div>
                                <div className='font-semibold text-slate-900'>{row.materialName}</div>
                                <Text code>{row.materialCode || row.materialId}</Text>
                            </div>
                            <Button
                                type='primary'
                                disabled={row.availableQuantity <= 0}
                                onClick={() => openReissue(row)}
                            >
                                Cấp lại
                            </Button>
                        </div>
                        <div className='mt-4 grid grid-cols-3 divide-x divide-slate-200 text-center'>
                            <div>
                                <b className='text-lg text-emerald-700'>{fmt(row.availableQuantity)}</b>
                                <div className='text-xs text-slate-500'>Dùng được</div>
                            </div>
                            <div>
                                <b className='text-lg text-amber-600'>{fmt(row.repairQuantity)}</b>
                                <div className='text-xs text-slate-500'>Chờ sửa</div>
                            </div>
                            <div>
                                <b className='text-lg text-red-600'>{fmt(row.damagedQuantity)}</b>
                                <div className='text-xs text-slate-500'>Hỏng</div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            {!reusableStock.length && !reusableQuery.isLoading ? <Empty description='Chưa có vật tư thu hồi' /> : null}
        </div>
    );

    const recipientTab = (
        <div className='space-y-4'>
            <div className='flex flex-wrap justify-end gap-2'>
                <Button icon={<UploadOutlined />} onClick={() => setRecipientImportOpen(true)}>
                    Import Excel
                </Button>
                <Button type='primary' icon={<PlusOutlined />} onClick={() => openRecipient()}>
                    Thêm người nhận
                </Button>
            </div>
            <Table
                rowKey='id'
                columns={recipientColumns}
                dataSource={recipients}
                loading={recipientsQuery.isLoading}
                scroll={{ x: 680 }}
                pagination={false}
            />
        </div>
    );

    const statItems = [
        {
            label: 'Đang giữ',
            value: summary?.openAssignments,
            detail: `${summary?.activeHolderCount || 0} người / tổ`,
            icon: <ToolOutlined />,
            tone: 'text-blue-700 bg-blue-50',
        },
        {
            label: 'Quá hạn',
            value: summary?.overdueAssignments,
            detail: 'Cần thu hồi ngay',
            icon: <WarningOutlined />,
            tone: 'text-red-700 bg-red-50',
        },
        {
            label: 'Giá trị chưa thu',
            value: money(summary?.outstandingValue),
            detail: `${fmt(summary?.outstandingQuantity)} tổng số lượng`,
            icon: <ClockCircleOutlined />,
            tone: 'text-orange-700 bg-orange-50',
        },
        {
            label: 'Kho tái sử dụng',
            value: fmt(summary?.reusableAvailableQuantity),
            detail: `${summary?.reusableMaterialCount || 0} loại vật tư`,
            icon: <InboxOutlined />,
            tone: 'text-emerald-700 bg-emerald-50',
        },
        {
            label: 'Đợt thu hồi',
            value: summary?.recallingCampaigns,
            detail: `${summary?.activeCampaigns || 0} đợt đang dùng`,
            icon: <RetweetOutlined />,
            tone: 'text-violet-700 bg-violet-50',
        },
    ];

    return (
        <div className='space-y-4 pb-8'>
            <PageHeader
                title='CCDC & thu hồi'
                subtitle='Theo dõi vật tư tái sử dụng từ lúc cấp cho công nhân đến khi thu hồi theo mã hàng'
                actions={
                    <Space wrap>
                        {canChoosePlant ? (
                            <Select
                                value={effectivePlantId}
                                onChange={(value) => {
                                    setPlantId(value);
                                    setAssignmentPage(1);
                                }}
                                className='min-w-48'
                                options={(plantsQuery.data || []).map((plant) => ({
                                    value: plant.id,
                                    label: plant.name,
                                }))}
                            />
                        ) : null}
                        <Button
                            icon={<DownloadOutlined />}
                            loading={exportMutation.isPending}
                            onClick={() => exportMutation.mutate()}
                        >
                            Xuất Excel
                        </Button>
                        <Button icon={<ReloadOutlined />} onClick={() => void invalidate()}>
                            Làm mới
                        </Button>
                    </Space>
                }
            />
            <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5'>
                {statItems.map((item) => (
                    <div key={item.label} className='rounded-md border border-slate-200 bg-white p-4'>
                        <div className='flex items-center justify-between'>
                            <div className='text-xs font-semibold text-slate-500 uppercase'>{item.label}</div>
                            <div className={`flex h-8 w-8 items-center justify-center rounded-md ${item.tone}`}>
                                {item.icon}
                            </div>
                        </div>
                        <div className='mt-2 text-2xl font-bold text-slate-900'>{item.value ?? 0}</div>
                        <div className='mt-1 text-xs text-slate-500'>{item.detail}</div>
                    </div>
                ))}
            </div>
            <div className='rounded-md border border-slate-200 bg-white p-3 sm:p-5'>
                <Tabs
                    items={[
                        {
                            key: 'assignments',
                            label: (
                                <span>
                                    <ToolOutlined /> Sổ đang giữ
                                </span>
                            ),
                            children: assignmentTab,
                        },
                        {
                            key: 'campaigns',
                            label: (
                                <span>
                                    <RetweetOutlined /> Đợt mã hàng
                                </span>
                            ),
                            children: campaignTab,
                        },
                        {
                            key: 'reusable',
                            label: (
                                <span>
                                    <InboxOutlined /> Kho tái sử dụng
                                </span>
                            ),
                            children: reusableTab,
                        },
                        {
                            key: 'recipients',
                            label: (
                                <span>
                                    <TeamOutlined /> Người nhận
                                </span>
                            ),
                            children: recipientTab,
                        },
                    ]}
                />
            </div>

            <Modal
                title={`Thu hồi · ${resolveTarget?.materialName || ''}`}
                open={Boolean(resolveTarget)}
                onCancel={() => setResolveTarget(null)}
                onOk={() => resolveForm.submit()}
                confirmLoading={resolveMutation.isPending}
                okText='Ghi nhận'
            >
                {resolveTarget ? (
                    <Alert
                        className='mb-4'
                        showIcon
                        type='info'
                        message={`${resolveTarget.holderName} đang giữ ${fmt(resolveTarget.outstandingQuantity)} ${resolveTarget.unit} · Mã hàng ${resolveTarget.itemCode}`}
                    />
                ) : null}
                <Form form={resolveForm} layout='vertical' onFinish={(values) => resolveMutation.mutate(values)}>
                    <Form.Item name='quantity' label='Số lượng xử lý' rules={[{ required: true }]}>
                        <InputNumber min={0.000001} max={resolveTarget?.outstandingQuantity} className='w-full' />
                    </Form.Item>
                    <Form.Item name='resolution' label='Tình trạng' rules={[{ required: true }]}>
                        <Segmented block options={RESOLUTION_OPTIONS} />
                    </Form.Item>
                    <Form.Item name='note' label='Ghi chú / biên bản'>
                        <Input.TextArea rows={3} placeholder='Mô tả tình trạng hoặc lý do chênh lệch' />
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                title={`Chuyển vật tư · ${transferTarget?.materialName || ''}`}
                open={Boolean(transferTarget)}
                onCancel={() => setTransferTarget(null)}
                onOk={() => transferForm.submit()}
                confirmLoading={transferMutation.isPending}
                okText='Xác nhận chuyển'
            >
                <Alert
                    className='mb-4'
                    showIcon
                    type='warning'
                    message='Thao tác chuyển trách nhiệm trực tiếp, không trả kho và không ghi thêm chi phí.'
                />
                <Form form={transferForm} layout='vertical' onFinish={(values) => transferMutation.mutate(values)}>
                    <Form.Item
                        name='quantity'
                        label={`Số lượng chuyển (tối đa ${fmt(transferTarget?.outstandingQuantity)})`}
                        rules={[{ required: true }]}
                    >
                        <InputNumber min={0.000001} max={transferTarget?.outstandingQuantity} className='w-full' />
                    </Form.Item>
                    {targetFields(transferHolderType)}
                </Form>
            </Modal>

            <Modal
                title={`Cấp lại · ${reissueTarget?.materialName || ''}`}
                open={Boolean(reissueTarget)}
                onCancel={() => setReissueTarget(null)}
                onOk={() => reissueForm.submit()}
                confirmLoading={reissueMutation.isPending}
                okText='Xác nhận cấp lại'
            >
                <Alert
                    className='mb-4'
                    showIcon
                    type='success'
                    message={`Có thể cấp ${fmt(reissueTarget?.availableQuantity)} ${reissueTarget?.unit || ''} từ kho tái sử dụng.`}
                />
                <Form form={reissueForm} layout='vertical' onFinish={(values) => reissueMutation.mutate(values)}>
                    <Form.Item name='quantity' label='Số lượng cấp' rules={[{ required: true }]}>
                        <InputNumber min={0.000001} max={reissueTarget?.availableQuantity} className='w-full' />
                    </Form.Item>
                    {targetFields(reissueHolderType)}
                </Form>
            </Modal>

            <Modal
                title='Ghi nhận vật tư đang giữ đầu kỳ'
                open={openingBalanceOpen}
                onCancel={() => {
                    setOpeningBalanceOpen(false);
                    openingBalanceForm.resetFields();
                }}
                onOk={() => openingBalanceForm.submit()}
                confirmLoading={openingBalanceMutation.isPending}
                okText='Ghi nhận đầu kỳ'
                width={620}
                destroyOnHidden
            >
                <Alert
                    className='mb-4'
                    showIcon
                    type='info'
                    message='Dùng cho vật tư đã cấp trước khi áp dụng chức năng này.'
                    description='Bản ghi chỉ mở sổ trách nhiệm đang giữ; không trừ tồn kho, không tạo phiếu cấp phát và không ghi nhận lại chi phí.'
                />
                <Form
                    form={openingBalanceForm}
                    layout='vertical'
                    onFinish={(values) => openingBalanceMutation.mutate(values)}
                >
                    <Form.Item
                        name='materialId'
                        label='Vật tư tái sử dụng'
                        rules={[{ required: true, message: 'Chọn vật tư cần theo dõi' }]}
                    >
                        <Select
                            showSearch
                            optionFilterProp='label'
                            loading={trackedMaterialsQuery.isLoading}
                            placeholder='Chọn vật tư đã cấp trước đây'
                            options={(trackedMaterialsQuery.data || []).map((material) => ({
                                value: material.id,
                                label: `${material.code ? `${material.code} · ` : ''}${material.name} · ${material.unit}`,
                            }))}
                        />
                    </Form.Item>
                    <div className='grid grid-cols-1 gap-x-4 sm:grid-cols-3'>
                        <Form.Item
                            name='quantity'
                            label='Số lượng đang giữ'
                            rules={[{ required: true, message: 'Nhập số lượng' }]}
                        >
                            <InputNumber min={0.000001} className='w-full' />
                        </Form.Item>
                        <Form.Item name='unitPrice' label='Đơn giá tham chiếu'>
                            <InputNumber min={0} className='w-full' addonAfter='đ' />
                        </Form.Item>
                        <Form.Item
                            name='issuedAt'
                            label='Ngày đã cấp'
                            rules={[{ required: true, message: 'Chọn ngày đã cấp' }]}
                        >
                            <DatePicker
                                className='w-full'
                                format='DD/MM/YYYY'
                                disabledDate={(current) => Boolean(current && current.isAfter(dayjs(), 'day'))}
                            />
                        </Form.Item>
                    </div>
                    {targetFields(openingBalanceHolderType)}
                </Form>
            </Modal>

            <Modal
                title={recipientTarget ? 'Cập nhật người nhận' : 'Thêm người nhận'}
                open={recipientTarget !== undefined}
                onCancel={() => setRecipientTarget(undefined)}
                onOk={() => recipientForm.submit()}
                confirmLoading={recipientMutation.isPending}
                okText='Lưu'
            >
                <Form form={recipientForm} layout='vertical' onFinish={(values) => recipientMutation.mutate(values)}>
                    <div className='grid grid-cols-1 gap-x-4 sm:grid-cols-2'>
                        <Form.Item name='employeeCode' label='Mã công nhân' rules={[{ required: true }]}>
                            <Input prefix={<UserOutlined />} />
                        </Form.Item>
                        <Form.Item name='fullName' label='Họ tên' rules={[{ required: true }]}>
                            <Input />
                        </Form.Item>
                        <Form.Item name='department' label='Bộ phận'>
                            <Input />
                        </Form.Item>
                        <Form.Item name='lineName' label='Chuyền / tổ'>
                            <Input />
                        </Form.Item>
                        <Form.Item name='phone' label='Số điện thoại'>
                            <Input />
                        </Form.Item>
                        <Form.Item name='isActive' label='Trạng thái'>
                            <Segmented
                                block
                                options={[
                                    { label: 'Đang làm việc', value: true },
                                    { label: 'Đã nghỉ', value: false },
                                ]}
                            />
                        </Form.Item>
                    </div>
                </Form>
            </Modal>

            <Modal
                title='Mở đợt sử dụng vật tư'
                open={campaignModalOpen}
                onCancel={() => setCampaignModalOpen(false)}
                onOk={() => campaignForm.submit()}
                confirmLoading={campaignMutation.isPending}
                okText='Mở đợt'
            >
                <Form form={campaignForm} layout='vertical' onFinish={(values) => campaignMutation.mutate(values)}>
                    <Form.Item name='productionItemId' label='Mã hàng trong hệ thống'>
                        <Select
                            allowClear
                            showSearch
                            optionFilterProp='label'
                            placeholder='Chọn mã hàng nếu đã khai báo'
                            options={(productionItemsQuery.data || []).map((item) => ({
                                value: item.id,
                                label: `${item.code}${item.name ? ` · ${item.name}` : ''}`,
                            }))}
                        />
                    </Form.Item>
                    <Alert
                        className='mb-4'
                        type='info'
                        showIcon
                        message='Nếu mã hàng chưa có trong hệ thống sản xuất, có thể nhập tay bên dưới.'
                    />
                    <div className='grid grid-cols-1 gap-x-4 sm:grid-cols-2'>
                        <Form.Item name='itemCode' label='Mã hàng nhập tay'>
                            <Input />
                        </Form.Item>
                        <Form.Item name='orderCode' label='Mã đơn / lô'>
                            <Input />
                        </Form.Item>
                        <Form.Item name='itemName' label='Tên mã hàng'>
                            <Input />
                        </Form.Item>
                        <Form.Item name='startedAt' label='Ngày bắt đầu'>
                            <DatePicker className='w-full' format='DD/MM/YYYY' />
                        </Form.Item>
                    </div>
                    <Form.Item name='note' label='Ghi chú'>
                        <Input.TextArea rows={2} />
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                title={`Mở thu hồi · ${recallTarget?.itemCode || ''}`}
                open={Boolean(recallTarget)}
                onCancel={() => setRecallTarget(null)}
                onOk={() => recallForm.submit()}
                confirmLoading={recallMutation.isPending}
                okText='Mở thu hồi'
            >
                <Alert
                    className='mb-4'
                    type='warning'
                    showIcon
                    message={`Hệ thống sẽ đánh dấu ${recallTarget?.assignmentCount || 0} dòng cấp phát và gửi thông báo cho cấp quản lý.`}
                />
                <Form form={recallForm} layout='vertical' onFinish={(values) => recallMutation.mutate(values)}>
                    <Form.Item name='dueAt' label='Hạn phải thu hồi' rules={[{ required: true }]}>
                        <DatePicker className='w-full' format='DD/MM/YYYY' />
                    </Form.Item>
                    <Form.Item name='note' label='Yêu cầu thu hồi'>
                        <Input.TextArea rows={3} />
                    </Form.Item>
                </Form>
            </Modal>

            <Drawer
                title='Lịch sử trách nhiệm vật tư'
                open={Boolean(historyTarget)}
                onClose={() => setHistoryTarget(null)}
                width={560}
            >
                {historyTarget ? (
                    <Descriptions
                        size='small'
                        bordered
                        column={1}
                        items={[
                            { key: 'material', label: 'Vật tư', children: historyTarget.materialName },
                            { key: 'holder', label: 'Người giữ', children: historyTarget.holderName },
                            { key: 'campaign', label: 'Mã hàng', children: historyTarget.itemCode },
                            {
                                key: 'outstanding',
                                label: 'Còn giữ',
                                children: `${fmt(historyTarget.outstandingQuantity)} ${historyTarget.unit}`,
                            },
                        ]}
                    />
                ) : null}
                <div className='mt-5 space-y-3'>
                    {(historyQuery.data?.movements || []).map((movement) => (
                        <div key={movement.id} className='border-l-2 border-blue-500 pl-4'>
                            <div className='flex items-center justify-between gap-2'>
                                <b>
                                    {movement.type === 'issue'
                                        ? 'Cấp / nhận giữ'
                                        : movement.type === 'return'
                                          ? `Thu hồi · ${RESOLUTION_OPTIONS.find((item) => item.value === movement.resolution)?.label || ''}`
                                          : movement.type === 'loss'
                                            ? 'Ghi nhận mất'
                                            : movement.type === 'transfer_out'
                                              ? 'Chuyển trách nhiệm'
                                              : movement.type}
                                </b>
                                <span className='text-xs text-slate-500'>
                                    {dayjs(movement.occurredAt).format('DD/MM/YYYY HH:mm')}
                                </span>
                            </div>
                            <div className='text-sm text-slate-600'>
                                {fmt(movement.quantity)} {historyTarget?.unit}
                                {movement.note ? ` · ${movement.note}` : ''}
                            </div>
                        </div>
                    ))}
                </div>
            </Drawer>
            <RecipientImportModal
                open={recipientImportOpen}
                plantId={effectivePlantId}
                onClose={() => setRecipientImportOpen(false)}
                onSuccess={() => {
                    setRecipientImportOpen(false);
                    void invalidate();
                }}
            />
        </div>
    );
};

export default MaterialCustodyPage;
