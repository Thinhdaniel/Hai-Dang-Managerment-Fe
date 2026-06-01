import React, { useState } from 'react';
import { Button, DatePicker, Modal, Space, Typography, App } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { inventoryService } from '../core/services/material.service';

const { RangePicker } = DatePicker;
const { Text } = Typography;

interface Props {
    open: boolean;
    plantId: string;
    onClose: () => void;
}

const ModalExportHistory: React.FC<Props> = ({ open, plantId, onClose }) => {
    const { message } = App.useApp();
    const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().startOf('month'), dayjs().endOf('day')]);

    const handleExport = () => {
        if (!range[0] || !range[1]) {
            message.error('Vui lòng chọn kỳ báo cáo');
            return;
        }
        inventoryService.exportHistory({
            plantId,
            startDate: range[0].startOf('day').toISOString(),
            endDate: range[1].endOf('day').toISOString(),
        });
        onClose();
    };

    return (
        <Modal
            open={open}
            title='Chọn kỳ xuất báo cáo'
            width={420}
            onCancel={onClose}
            footer={
                <Space>
                    <Button onClick={onClose}>Huỷ</Button>
                    <Button type='primary' onClick={handleExport}>
                        Xuất Excel
                    </Button>
                </Space>
            }
            destroyOnClose
        >
            <Space orientation='vertical' style={{ width: '100%' }} size={12}>
                <div>
                    <Text strong>
                        Kỳ báo cáo <Text type='danger'>*</Text>
                    </Text>
                    <div style={{ marginTop: 4 }}>
                        <RangePicker
                            style={{ width: '100%' }}
                            value={range}
                            onChange={(val) => {
                                if (val?.[0] && val?.[1]) {
                                    setRange([val[0], val[1]]);
                                }
                            }}
                            format='DD/MM/YYYY'
                        />
                    </div>
                </div>
            </Space>
        </Modal>
    );
};

export default ModalExportHistory;
