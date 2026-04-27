import React from 'react';
import { Card, Table, Typography, Space, Button, Input, Select, Badge, Row, Col, Progress, Tag, Avatar } from 'antd';
import { SearchOutlined, PlusOutlined, AppstoreOutlined, ReloadOutlined, SwapOutlined } from '@ant-design/icons';
import PageHeader from '../components/shared/PageHeader';
import StatsCard from '../components/shared/StatsCard';

const { Text } = Typography;

const mockTableData = [
    {
        key: '1',
        name: 'Động cơ liền trục Juki',
        code: 'PRT-112',
        type: 'Phụ tùng',
        location: 'Khu A - Kệ 03 - Tầng 2',
        importDate: '10/04/2026',
        status: 'good',
        keeper: 'Nguyễn Kho',
    },
    {
        key: '2',
        name: 'Máy nén khí 50L (Dùng cho xưởng may)',
        code: 'MCH-088',
        type: 'Máy móc',
        location: 'Khu B - Kệ 01 - Tầng 1',
        importDate: '15/03/2026',
        status: 'maintenance',
        keeper: 'Trần Bãi',
    },
    {
        key: '3',
        name: 'Board mạch chính Jack E4S',
        code: 'PRT-205',
        type: 'Phụ tùng',
        location: 'Khu A - Kệ 05 - Tầng 3',
        importDate: '22/04/2026',
        status: 'good',
        keeper: 'Nguyễn Kho',
    },
    {
        key: '4',
        name: 'Máy cắt vải cầm tay cũ',
        code: 'MCH-045',
        type: 'Máy móc',
        location: 'Khu C - Hàng 2',
        importDate: '01/01/2025',
        status: 'broken',
        keeper: 'Lê Kho',
    },
];

const StorageList: React.FC = () => {
    const columns = [
        {
            title: 'Thiết bị / Phụ tùng',
            key: 'asset',
            render: (_value: unknown, record: (typeof mockTableData)[number]) => (
                <div>
                    <Text strong>{record.name}</Text>
                    <br />
                    <Text type='secondary' style={{ fontSize: 12, fontFamily: 'monospace' }}>
                        {record.code}
                    </Text>
                </div>
            ),
        },
        {
            title: 'Vị trí lưu trữ',
            dataIndex: 'location',
            key: 'location',
            render: (text: string) => (
                <Tag color='geekblue' icon={<AppstoreOutlined />} style={{ padding: '4px 8px', borderRadius: 4 }}>
                    {text}
                </Tag>
            ),
        },
        { title: 'Ngày nhập kho', dataIndex: 'importDate', key: 'importDate' },
        {
            title: 'Tình trạng',
            dataIndex: 'status',
            key: 'status',
            render: (status: string) => {
                const config: Record<string, { status: 'success' | 'warning' | 'error'; text: string }> = {
                    good: { status: 'success', text: 'Tốt / Sẵn sàng' },
                    maintenance: { status: 'warning', text: 'Cần bảo dưỡng' },
                    broken: { status: 'error', text: 'Hư hỏng / Chờ hủy' },
                };
                const currentStatus = config[status];
                return <Badge status={currentStatus.status} text={currentStatus.text} />;
            },
        },
        {
            title: 'Thủ kho phụ trách',
            dataIndex: 'keeper',
            key: 'keeper',
            render: (text: string) => (
                <Space>
                    <Avatar size='small' style={{ backgroundColor: '#1f7ae0' }}>
                        {text.charAt(0)}
                    </Avatar>
                    <Text>{text}</Text>
                </Space>
            ),
        },
        {
            title: 'Hành động',
            key: 'action',
            render: () => (
                <Space size='small'>
                    <Button type='text' icon={<SwapOutlined />} style={{ color: '#fa8c16' }} title='Chuyển vị trí' />
                    <Button type='text' style={{ color: '#1f7ae0' }}>
                        Chi tiết
                    </Button>
                    <Button type='primary' size='small' style={{ background: '#22a06b', borderColor: '#22a06b' }}>
                        Xuất kho
                    </Button>
                </Space>
            ),
        },
    ];

    return (
        <div>
            <PageHeader
                title='Kho Và Lưu Trữ'
                subtitle='Quản lý tồn kho thiết bị, phụ tùng và sức chứa kho bãi trong toàn hệ thống.'
                actions={
                    <Button
                        type='primary'
                        icon={<PlusOutlined />}
                        style={{ background: 'linear-gradient(135deg, #22a06b, #15803d)', border: 'none' }}
                    >
                        Tạo phiếu nhập / xuất kho
                    </Button>
                }
            />

            <Row gutter={[16, 16]}>
                <Col xs={24} sm={12} lg={6}>
                    <StatsCard title='Thiết bị trong kho' value={370} accent='#1f7ae0' />
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <StatsCard title='Chờ nhập kho' value={15} accent='#fa8c16' />
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <StatsCard title='Chờ xuất kho' value={8} accent='#7c3aed' />
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card bordered={false} className='surface-card'>
                        <div
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
                        >
                            <div>
                                <Text type='secondary'>Tỷ lệ lấp đầy kho</Text>
                                <div style={{ marginTop: 8 }}>
                                    <Text type='secondary'>
                                        Khu vực khả dụng: <Text strong>35%</Text>
                                    </Text>
                                </div>
                            </div>
                            <Progress type='circle' percent={65} size={60} strokeColor='#22a06b' />
                        </div>
                    </Card>
                </Col>
            </Row>

            <Card bordered={false} className='filter-surface'>
                <Row gutter={[16, 16]}>
                    <Col xs={24} md={6}>
                        <Input prefix={<SearchOutlined />} placeholder='Mã máy, vị trí lưu trữ...' />
                    </Col>
                    <Col xs={24} md={4}>
                        <Select placeholder='Loại thiết bị' style={{ width: '100%' }} allowClear>
                            <Select.Option value='machine'>Máy móc nguyên chiếc</Select.Option>
                            <Select.Option value='part'>Phụ tùng / Linh kiện</Select.Option>
                        </Select>
                    </Col>
                    <Col xs={24} md={4}>
                        <Select placeholder='Tình trạng' style={{ width: '100%' }} allowClear>
                            <Select.Option value='good'>Tốt / Sẵn sàng</Select.Option>
                            <Select.Option value='maintenance'>Cần bảo dưỡng</Select.Option>
                            <Select.Option value='broken'>Hư hỏng chờ hủy</Select.Option>
                        </Select>
                    </Col>
                    <Col xs={24} md={4}>
                        <Select placeholder='Vị trí kho' style={{ width: '100%' }} allowClear>
                            <Select.Option value='a'>Khu A</Select.Option>
                            <Select.Option value='b'>Khu B</Select.Option>
                            <Select.Option value='c'>Khu C</Select.Option>
                        </Select>
                    </Col>
                    <Col xs={24} md={6}>
                        <Space wrap>
                            <Button type='primary'>Lọc</Button>
                            <Button icon={<ReloadOutlined />}>Reset</Button>
                        </Space>
                    </Col>
                </Row>
            </Card>

            <Card bordered={false} className='table-surface'>
                <Table
                    columns={columns}
                    dataSource={mockTableData}
                    pagination={{ total: 370, defaultPageSize: 10 }}
                    scroll={{ x: 1000 }}
                />
            </Card>
        </div>
    );
};

export default StorageList;
