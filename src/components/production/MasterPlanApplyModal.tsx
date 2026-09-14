import {
    CalendarOutlined,
    CheckCircleFilled,
    ExclamationCircleFilled,
    SafetyCertificateOutlined,
} from '@ant-design/icons';
import { Alert, Button, Modal, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import type { ProductionMasterPlanPreview } from '../../core/types/production';

const { Text } = Typography;
const number = (value = 0) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(value);

type Props = {
    open: boolean;
    preview: ProductionMasterPlanPreview | null;
    applying: boolean;
    onClose: () => void;
    onApplyReady: () => void;
    onOpenPlan: (date: string) => void;
};

const MasterPlanApplyModal = ({ open, preview, applying, onClose, onApplyReady, onOpenPlan }: Props) => {
    const summary = preview?.summary;
    return (
        <Modal
            open={open}
            width={860}
            title={
                <div className='production-master-review__title'>
                    <SafetyCertificateOutlined />
                    <div>
                        <strong>Kiểm tra trước khi tạo kế hoạch nháp</strong>
                        <span>Đối chiếu lại đơn hàng, trạng thái ngày và khung giờ tại thời điểm hiện tại</span>
                    </div>
                </div>
            }
            className='production-master-review-modal'
            onCancel={onClose}
            footer={
                <div className='production-master-review__footer'>
                    <Text type='secondary'>Không có kế hoạch nào được ban hành tự động.</Text>
                    <div>
                        <Button onClick={onClose}>Đóng</Button>
                        <Button
                            type='primary'
                            loading={applying}
                            disabled={!summary?.readyCount}
                            onClick={onApplyReady}
                        >
                            Tạo {summary?.readyCount || 0} phân bổ sẵn sàng
                        </Button>
                    </div>
                </div>
            }
        >
            {preview ? (
                <div className='production-master-review'>
                    <div className='production-master-review__summary'>
                        <span>
                            <small>Đã chọn</small>
                            <strong>{summary?.selectedCount}</strong>
                        </span>
                        <span className='is-ready'>
                            <small>Sẵn sàng</small>
                            <strong>{summary?.readyCount}</strong>
                        </span>
                        <span className={summary?.blockedCount ? 'is-blocked' : ''}>
                            <small>Cần xử lý</small>
                            <strong>{summary?.blockedCount}</strong>
                        </span>
                        <span>
                            <small>Sản lượng sẽ xếp</small>
                            <strong>{number(summary?.readyQuantity)} SP</strong>
                        </span>
                        <span>
                            <small>Số ngày ảnh hưởng</small>
                            <strong>{summary?.affectedDayCount}</strong>
                        </span>
                    </div>
                    {summary?.blockedCount ? (
                        <Alert
                            type='warning'
                            showIcon
                            message='Các dòng bị chặn sẽ không được ghi'
                            description='Hệ thống chỉ áp dụng các dòng sẵn sàng. Dòng bị chặn cần mở kế hoạch ngày hoặc điều chỉnh thủ công.'
                        />
                    ) : (
                        <Alert
                            type='success'
                            showIcon
                            message='Phương án hợp lệ với dữ liệu hiện tại'
                            description='Sau khi tạo, người phụ trách vẫn phải kiểm tra và ban hành từng kế hoạch ngày.'
                        />
                    )}
                    <div className='production-master-review__list'>
                        {preview.rows.map((row) => (
                            <article key={row.key} className={`is-${row.status}`}>
                                <div className='production-master-review__status'>
                                    {row.status === 'ready' ? <CheckCircleFilled /> : <ExclamationCircleFilled />}
                                </div>
                                <div className='production-master-review__identity'>
                                    <strong>{row.orderCode || 'Đơn không còn tồn tại'}</strong>
                                    <span>
                                        {row.itemCode || 'Không rõ mã hàng'} · {row.lineCode || 'Không rõ chuyền'}
                                    </span>
                                </div>
                                <div className='production-master-review__schedule'>
                                    <strong>
                                        <CalendarOutlined /> {dayjs(row.date).format('DD/MM/YYYY')}
                                    </strong>
                                    <span>
                                        {row.startSlotKey && row.endSlotKey
                                            ? `${row.startSlotKey} → ${row.endSlotKey}`
                                            : 'Chưa xác định khung giờ'}
                                    </span>
                                </div>
                                <div className='production-master-review__quantity'>
                                    <strong>{number(row.quantity)} SP</strong>
                                    <span>{number(row.hourlyQuota)} SP/giờ</span>
                                </div>
                                <div className='production-master-review__message'>
                                    <Tag color={row.status === 'ready' ? 'green' : 'red'}>
                                        {row.status === 'ready'
                                            ? row.willCreatePlan
                                                ? 'Tạo ngày mới'
                                                : 'Bổ sung nháp'
                                            : 'Bị chặn'}
                                    </Tag>
                                    <span>{row.message}</span>
                                    {row.status === 'blocked' ? (
                                        <Button type='link' size='small' onClick={() => onOpenPlan(row.date)}>
                                            Mở kế hoạch ngày
                                        </Button>
                                    ) : null}
                                </div>
                            </article>
                        ))}
                    </div>
                </div>
            ) : null}
        </Modal>
    );
};

export default MasterPlanApplyModal;
