import React from 'react';
import { Modal, Tabs, Row, Col, Typography, Badge, Button, Descriptions, Timeline, Tag, Space, Divider } from 'antd';
import { QrcodeOutlined, EditOutlined, ToolOutlined, SwapOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

interface MachineDetailModalProps {
    open: boolean;
    onClose: () => void;
    machineData?: any;
}

const MachineDetailModal: React.FC<MachineDetailModalProps> = ({ open, onClose, machineData }) => {
    if (!machineData) return null;

    const renderStatus = (status: string) => {
        const colors: any = {
            active: 'success',
            maintenance: 'warning',
            broken: 'error',
            borrowing: 'purple',
            storage: 'default',
        };
        const labels: any = {
            active: 'Đang hoạt động',
            maintenance: 'Đang bảo trì',
            broken: 'Lỗi',
            borrowing: 'Đang mượn',
            storage: 'Tồn kho',
        };
        return <Badge status={colors[status]} text={labels[status]} />;
    };

    const overviewTab = (
        <Row gutter={24}>
            <Col span={14}>
                <Title level={5}>Thông tin cơ bản</Title>
                <Descriptions column={1} labelStyle={{ width: 120, color: '#8c8c8c' }} size='small'>
                    <Descriptions.Item label='Loại máy'>{machineData.type}</Descriptions.Item>
                    <Descriptions.Item label='Nhãn hiệu'>Fanuc (Sample)</Descriptions.Item>
                    <Descriptions.Item label='Năm sản xuất'>2020</Descriptions.Item>
                    <Descriptions.Item label='Cơ sở hiện tại'>{machineData.plant}</Descriptions.Item>
                    <Descriptions.Item label='Phòng/Khu vực'>Xưởng A - Khu 3</Descriptions.Item>
                    <Descriptions.Item label='Ngày nhập kho'>15/01/2024</Descriptions.Item>
                    <Descriptions.Item label='Giá trị'>2,500,000,000 VNĐ</Descriptions.Item>
                </Descriptions>

                <Divider style={{ margin: '16px 0' }} />

                <Title level={5}>Trạng thái</Title>
                <div style={{ background: '#f5f5f5', padding: 16, borderRadius: 8 }}>
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: 8,
                        }}
                    >
                        {renderStatus(machineData.status)}
                        <Button size='small'>Đổi trạng thái</Button>
                    </div>
                    <Text type='secondary' style={{ fontSize: 13 }}>
                        Ghi chú: Máy hoạt động bình thường, bảo trì định kỳ tháng 5/2024
                    </Text>
                </div>
            </Col>

            <Col span={10}>
                <div
                    style={{
                        height: 180,
                        background: 'linear-gradient(135deg, #e6f4ff 0%, #bae0ff 100%)',
                        borderRadius: 8,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: 16,
                        border: '1px solid #91caff',
                    }}
                >
                    <ToolOutlined style={{ fontSize: 48, color: '#1890ff', opacity: 0.5 }} />
                </div>

                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        marginBottom: 16,
                    }}
                >
                    <Title level={5} style={{ margin: 0 }}>
                        Thông số kỹ thuật
                    </Title>
                    <div style={{ textAlign: 'center' }}>
                        <div
                            style={{
                                width: 48,
                                height: 48,
                                background: '#fff',
                                border: '1px solid #d9d9d9',
                                borderRadius: 4,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <QrcodeOutlined style={{ fontSize: 24 }} />
                        </div>
                        <Text type='secondary' style={{ fontSize: 10 }}>
                            Scan QR
                        </Text>
                    </div>
                </div>

                <Descriptions column={1} size='small' colon={false}>
                    <Descriptions.Item label='Công suất'>
                        <b>15 kW</b>
                    </Descriptions.Item>
                    <Descriptions.Item label='Tốc độ trục chính'>
                        <b>8000 RPM</b>
                    </Descriptions.Item>
                    <Descriptions.Item label='Hành trình X/Y/Z'>
                        <b>800/500/600mm</b>
                    </Descriptions.Item>
                </Descriptions>
            </Col>
        </Row>
    );

    const maintenanceTab = (
        <div style={{ padding: '0 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
                <Title level={5} style={{ margin: 0 }}>
                    Lịch sử bảo trì
                </Title>
                <Button type='primary' size='small'>
                    Thêm ghi chú
                </Button>
            </div>
            <Timeline>
                <Timeline.Item color='orange'>
                    <Text strong>15/03/2024</Text> <Tag color='warning'>Bảo trì định kỳ</Tag>
                    <br />
                    <Text type='secondary'>Thay dầu bôi trơn, kiểm tra trục chính</Text>
                </Timeline.Item>
                <Timeline.Item color='red'>
                    <Text strong>12/01/2024</Text> <Tag color='error'>Sửa chữa khẩn</Tag>
                    <br />
                    <Text type='secondary'>Lỗi servo motor, đã thay mới</Text>
                </Timeline.Item>
                <Timeline.Item color='orange'>
                    <Text strong>05/10/2023</Text> <Tag color='warning'>Bảo trì định kỳ</Tag>
                    <br />
                    <Text type='secondary'>Bảo trì tổng quát, vệ sinh buồng máy</Text>
                </Timeline.Item>
                <Timeline.Item color='green'>
                    <Text strong>15/01/2023</Text> <Tag color='success'>Nhập máy mới</Tag>
                    <br />
                    <Text type='secondary'>Lắp đặt và chạy thử nghiệm thành công</Text>
                </Timeline.Item>
            </Timeline>
        </div>
    );

    const transferTab = (
        <div style={{ textAlign: 'center', padding: 40 }}>
            <SwapOutlined style={{ fontSize: 48, color: '#d9d9d9', marginBottom: 16 }} />
            <br />
            <Text type='secondary'>Chưa có lịch sử điều chuyển cho thiết bị này</Text>
        </div>
    );

    return (
        <Modal
            title={
                <div
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 32 }}
                >
                    <Space>
                        <Title level={4} style={{ margin: 0 }}>
                            {machineData.name}
                        </Title>
                        {renderStatus(machineData.status)}
                    </Space>
                    <Space>
                        <Button icon={<EditOutlined />}>Sửa</Button>
                        <Button icon={<QrcodeOutlined />}>QR Code</Button>
                    </Space>
                </div>
            }
            open={open}
            onCancel={onClose}
            footer={null}
            width={900}
            style={{ top: 40 }}
            bodyStyle={{ padding: '0 24px 24px 24px' }}
            closeIcon={<span style={{ fontSize: 16 }}>✕</span>}
        >
            <div style={{ marginBottom: 16 }}>
                <Text type='secondary' style={{ fontFamily: 'monospace', color: '#1890ff', marginRight: 16 }}>
                    {machineData.code}
                </Text>
                <Text type='secondary'>Serial: {machineData.serial}</Text>
            </div>

            <Tabs
                defaultActiveKey='1'
                items={[
                    { key: '1', label: 'Tổng quan', children: overviewTab },
                    { key: '2', label: 'Bảo trì', children: maintenanceTab },
                    { key: '3', label: 'Điều chuyển', children: transferTab },
                    {
                        key: '4',
                        label: 'Mượn/Trả',
                        children: (
                            <div style={{ padding: 40, textAlign: 'center' }}>
                                <Text type='secondary'>Đang phát triển</Text>
                            </div>
                        ),
                    },
                ]}
            />
        </Modal>
    );
};

export default MachineDetailModal;
