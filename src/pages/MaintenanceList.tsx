import React, { useState } from 'react';
import {
    Card,
    Table,
    Typography,
    Space,
    Button,
    Input,
    Select,
    Badge,
    Row,
    Col,
    DatePicker,
    Avatar,
    Tag,
    Tabs,
    Tooltip,
} from 'antd';
import {
    SearchOutlined,
    ReloadOutlined,
    PlusOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
    WarningOutlined,
    SyncOutlined,
    EyeOutlined,
    EditOutlined,
    CheckOutlined,
} from '@ant-design/icons';
import PageHeader from '../components/shared/PageHeader';
import ConfirmAction from '../components/shared/ConfirmAction';
import StatsCard from '../components/shared/StatsCard';

const { Text } = Typography;
const { RangePicker } = DatePicker;

const mockTableData = [
    {
        key: '1',
        code: 'MNT-24-001',
        assetName: 'Máy may 1 kim điện tử Juki',
        type: 'Định kỳ',
        technician: 'Nguyễn Văn A',
        startDate: '20/04/2026',
        endDate: '22/04/2026',
        status: 'in_progress',
        priority: 'Trung bình',
    },
    {
        key: '2',
        code: 'MNT-24-002',
        assetName: 'Máy vắt sổ Jack',
        type: 'Khẩn cấp',
        technician: 'Trần Thị B',
        startDate: '23/04/2026',
        endDate: '23/04/2026',
        status: 'pending',
        priority: 'Cao',
    },
    {
        key: '3',
        code: 'MNT-24-003',
        assetName: 'Máy cắt vòng',
        type: 'Sửa chữa',
        technician: 'Lê Văn C',
        startDate: '18/04/2026',
        endDate: '19/04/2026',
        status: 'completed',
        priority: 'Cao',
    },
    {
        key: '4',
        code: 'MNT-24-004',
        assetName: 'Máy đính bọ Juki',
        type: 'Định kỳ',
        technician: 'Phạm Văn D',
        startDate: '15/04/2026',
        endDate: '17/04/2026',
        status: 'overdue',
        priority: 'Trung bình',
    },
];

const MaintenanceList: React.FC = () => {
    const [activeTab, setActiveTab] = useState('list');

    const columns = [
        {
            title: 'Mã phiếu',
            dataIndex: 'code',
            key: 'code',
            render: (text: string) => (
                <Text strong style={{ color: '#1f7ae0' }}>
                    {text}
                </Text>
            ),
        },
        {
            title: 'Thiết bị',
            dataIndex: 'assetName',
            key: 'assetName',
            render: (text: string) => <Text strong>{text}</Text>,
        },
        {
            title: 'Loại',
            dataIndex: 'type',
            key: 'type',
            render: (type: string) => {
                let color = 'default';
                if (type === 'Khẩn cấp' || type === 'Sửa chữa') color = 'error';
                if (type === 'Định kỳ') color = 'warning';
                return <Tag color={color}>{type}</Tag>;
            },
        },
        {
            title: 'Kỹ thuật viên',
            dataIndex: 'technician',
            key: 'technician',
            render: (text: string) => (
                <Space>
                    <Avatar size='small' style={{ backgroundColor: '#87d068' }}>
                        {text.charAt(0)}
                    </Avatar>
                    <Text>{text}</Text>
                </Space>
            ),
        },
        {
            title: 'Thời gian',
            key: 'time',
            render: (_value: unknown, record: (typeof mockTableData)[number]) => (
                <div style={{ fontSize: 13 }}>
                    <div>
                        <Text type='secondary'>Bắt đầu:</Text> {record.startDate}
                    </div>
                    <div>
                        <Text type='secondary'>Dự kiến:</Text> {record.endDate}
                    </div>
                </div>
            ),
        },
        {
            title: 'Trạng thái',
            dataIndex: 'status',
            key: 'status',
            render: (status: string) => {
                const config: Record<string, { status: 'processing' | 'default' | 'success' | 'error'; text: string }> =
                    {
                        in_progress: { status: 'processing', text: 'Đang thực hiện' },
                        pending: { status: 'default', text: 'Chờ duyệt/phân công' },
                        completed: { status: 'success', text: 'Hoàn thành' },
                        overdue: { status: 'error', text: 'Quá hạn' },
                    };
                const currentStatus = config[status];
                return <Badge status={currentStatus.status} text={currentStatus.text} />;
            },
        },
        {
            title: 'Ưu tiên',
            dataIndex: 'priority',
            key: 'priority',
            render: (priority: string) => {
                const color = priority === 'Cao' ? '#ef4444' : priority === 'Trung bình' ? '#f59e0b' : '#22a06b';
                return (
                    <Text strong style={{ color }}>
                        {priority}
                    </Text>
                );
            },
        },
        {
            title: 'Hành động',
            key: 'action',
            render: (_value: unknown, record: (typeof mockTableData)[number]) => (
                <Space size='small'>
                    <Tooltip title='Xem chi tiết'>
                        <Button type='text' icon={<EyeOutlined />} style={{ color: '#1f7ae0' }} />
                    </Tooltip>
                    <Tooltip title='Chỉnh sửa'>
                        <Button type='text' icon={<EditOutlined />} />
                    </Tooltip>
                    {record.status === 'in_progress' ? (
                        <ConfirmAction
                            intent='primary'
                            title='Hoàn tất phiếu bảo trì'
                            description={`Xác nhận hoàn tất phiếu “${record.code}”? Trạng thái sẽ chuyển thành Hoàn thành.`}
                            okLabel='Hoàn tất'
                            onConfirm={() => {}}
                        >
                            <Tooltip title='Hoàn tất'>
                                <Button type='text' icon={<CheckOutlined />} style={{ color: '#22a06b' }} />
                            </Tooltip>
                        </ConfirmAction>
                    ) : null}
                </Space>
            ),
        },
    ];

    return (
        <div>
            <PageHeader
                title='Lịch Trình Bảo Trì'
                subtitle='Quản lý các hoạt động bảo dưỡng, sửa chữa và ưu tiên xử lý sự cố theo thời gian thực.'
                actions={
                    <Button
                        type='primary'
                        icon={<PlusOutlined />}
                        style={{ background: 'linear-gradient(135deg, #fa8c16, #d97706)', border: 'none' }}
                    >
                        Tạo phiếu bảo trì
                    </Button>
                }
            />

            <Row gutter={[16, 16]}>
                <Col xs={24} sm={12} lg={6}>
                    <StatsCard title='Đang thực hiện' value={28} icon={<SyncOutlined spin />} accent='#fa8c16' />
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <StatsCard title='Chờ duyệt' value={15} icon={<ClockCircleOutlined />} accent='#1f7ae0' />
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <StatsCard
                        title='Đã hoàn thành'
                        value={142}
                        icon={<CheckCircleOutlined />}
                        accent='#22a06b'
                        caption='Trong tháng này'
                    />
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <StatsCard title='Quá hạn' value={3} icon={<WarningOutlined />} accent='#ef4444' />
                </Col>
            </Row>

            <Card bordered={false} className='filter-surface'>
                <Row gutter={[16, 16]} align='middle'>
                    <Col xs={24} md={6}>
                        <RangePicker
                            style={{ width: '100%' }}
                            placeholder={['Từ ngày', 'Đến ngày']}
                            format='DD/MM/YYYY'
                        />
                    </Col>
                    <Col xs={24} md={5}>
                        <Select placeholder='Loại bảo trì' style={{ width: '100%' }} allowClear>
                            <Select.Option value='periodic'>Định kỳ</Select.Option>
                            <Select.Option value='emergency'>Khẩn cấp</Select.Option>
                            <Select.Option value='inspection'>Kiểm tra</Select.Option>
                        </Select>
                    </Col>
                    <Col xs={24} md={5}>
                        <Select placeholder='Trạng thái' style={{ width: '100%' }} allowClear>
                            <Select.Option value='pending'>Chờ xử lý</Select.Option>
                            <Select.Option value='in_progress'>Đang thực hiện</Select.Option>
                            <Select.Option value='completed'>Hoàn thành</Select.Option>
                            <Select.Option value='overdue'>Quá hạn</Select.Option>
                        </Select>
                    </Col>
                    <Col xs={24} md={8}>
                        <Space.Compact style={{ width: '100%' }}>
                            <Input prefix={<SearchOutlined />} placeholder='Tìm theo tên máy, mã phiếu...' />
                            <Button type='primary'>Lọc</Button>
                            <Button icon={<ReloadOutlined />} />
                        </Space.Compact>
                    </Col>
                </Row>
            </Card>

            <Card bordered={false} className='table-surface'>
                <Tabs
                    activeKey={activeTab}
                    onChange={setActiveTab}
                    items={[
                        { key: 'list', label: 'Danh sách' },
                        { key: 'kanban', label: 'Kanban' },
                        { key: 'calendar', label: 'Lịch' },
                    ]}
                    style={{ padding: '0 20px' }}
                />

                {activeTab === 'list' ? (
                    <Table
                        columns={columns}
                        dataSource={mockTableData}
                        pagination={{ total: 45, defaultPageSize: 10, showSizeChanger: true }}
                    />
                ) : (
                    <div style={{ padding: 40, textAlign: 'center' }}>
                        <Text type='secondary'>Tính năng đang được phát triển</Text>
                    </div>
                )}
            </Card>
        </div>
    );
};

export default MaintenanceList;
