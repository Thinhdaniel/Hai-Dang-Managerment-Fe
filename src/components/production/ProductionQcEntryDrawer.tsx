import {
    CheckCircleFilled,
    CloseCircleFilled,
    DeleteOutlined,
    ExperimentOutlined,
    SaveOutlined,
} from '@ant-design/icons';
import { Alert, Button, Drawer, Input, InputNumber, Popconfirm, Typography } from 'antd';
import { useEffect, useState } from 'react';
import type {
    ProductionLineRecord,
    ProductionQcSlotValue,
    ProductionTimeSlot,
    SaveProductionQcEntryPayload,
} from '../../core/types/production';

const { TextArea } = Input;
const { Text } = Typography;

type Props = {
    open: boolean;
    mobile: boolean;
    line?: ProductionLineRecord;
    slot?: ProductionTimeSlot;
    value?: ProductionQcSlotValue;
    readOnly?: boolean;
    saving?: boolean;
    deleting?: boolean;
    onClose: () => void;
    onSave: (payload: SaveProductionQcEntryPayload) => void;
    onDelete: (entryId: string) => void;
};

const number = (value = 0) => new Intl.NumberFormat('vi-VN').format(Number(value || 0));

const ProductionQcEntryDrawer = ({
    open,
    mobile,
    line,
    slot,
    value,
    readOnly,
    saving,
    deleting,
    onClose,
    onSave,
    onDelete,
}: Props) => {
    const [passedQuantity, setPassedQuantity] = useState(0);
    const [defectQuantity, setDefectQuantity] = useState(0);
    const [note, setNote] = useState('');
    const run = line?.runs.find((item) => item.id === value?.runId);
    const existingEntry = line?.qcEntries.find(
        (entry) => entry.slotKey === slot?.key && (!value?.runId || entry.runId === value.runId)
    );

    useEffect(() => {
        if (!open) return;
        setPassedQuantity(Number(existingEntry?.passedQuantity || 0));
        setDefectQuantity(Number(existingEntry?.defectQuantity || 0));
        setNote(existingEntry?.note || '');
    }, [existingEntry, open]);

    const totalQuantity = passedQuantity + defectQuantity;
    const productionActual = Number(value?.productionActual || 0);
    const variance = totalQuantity - productionActual;
    const defectRate = totalQuantity > 0 ? (defectQuantity / totalQuantity) * 100 : 0;
    const canSave = Boolean(value?.runId && !readOnly && !saving && (totalQuantity > 0 || note.trim().length >= 3));

    const handleSave = () => {
        if (!value?.runId || !canSave) return;
        onSave({
            runId: value.runId,
            passedQuantity,
            defectQuantity,
            totalQuantity,
            note: note.trim() || undefined,
            expectedUpdatedAt: existingEntry?.updatedAt || null,
        });
    };

    return (
        <Drawer
            open={open}
            onClose={onClose}
            placement={mobile ? 'bottom' : 'right'}
            height={mobile ? 'min(88dvh, 720px)' : undefined}
            width={mobile ? undefined : 500}
            className='pd-qc-entry-drawer'
            title={
                <div className='pd-qc-entry-title'>
                    <span className='pd-qc-entry-title__icon'>
                        <ExperimentOutlined />
                    </span>
                    <span>
                        <strong>{line?.lineCode || 'Chọn chuyền'}</strong>
                        <small>
                            {slot?.label || 'Khung giờ'} · {run?.itemCode || 'Chưa có mã hàng'}
                        </small>
                    </span>
                </div>
            }
            footer={
                <div className='pd-qc-entry-footer'>
                    {existingEntry && !readOnly ? (
                        <Popconfirm
                            title='Xóa kết quả QC?'
                            description='Ô này sẽ trở lại trạng thái chưa kiểm.'
                            okText='Xóa'
                            cancelText='Giữ lại'
                            okButtonProps={{ danger: true, loading: deleting }}
                            onConfirm={() => onDelete(existingEntry.id)}
                        >
                            <Button danger icon={<DeleteOutlined />} loading={deleting} aria-label='Xóa kết quả QC' />
                        </Popconfirm>
                    ) : null}
                    <Button onClick={onClose}>Đóng</Button>
                    <Button
                        type='primary'
                        icon={<SaveOutlined />}
                        loading={saving}
                        disabled={!canSave}
                        onClick={handleSave}
                    >
                        Lưu kết quả
                    </Button>
                </div>
            }
            destroyOnHidden
        >
            <div className='pd-qc-entry-body'>
                <section className='pd-qc-entry-context'>
                    <div>
                        <span>Sản lượng tổ trưởng báo</span>
                        <strong>{number(productionActual)}</strong>
                    </div>
                    <div>
                        <span>Mã hàng</span>
                        <strong>{run?.itemCode || 'Chưa thiết lập'}</strong>
                    </div>
                </section>

                {readOnly ? (
                    <Alert type='info' showIcon message='Ngày đã gửi duyệt hoặc khóa sổ, chỉ có thể xem kết quả QC.' />
                ) : null}

                <section className='pd-qc-entry-fields' aria-label='Nhập kết quả kiểm tra chất lượng'>
                    <label className='pd-qc-number-field is-passed'>
                        <span>
                            <CheckCircleFilled /> Đạt
                        </span>
                        <InputNumber
                            min={0}
                            max={100000000}
                            precision={0}
                            controls={false}
                            value={passedQuantity}
                            onChange={(next) => setPassedQuantity(Math.max(0, Number(next || 0)))}
                            disabled={readOnly}
                            inputMode='numeric'
                            aria-label='Số lượng đạt'
                        />
                    </label>
                    <label className='pd-qc-number-field is-defect'>
                        <span>
                            <CloseCircleFilled /> Lỗi
                        </span>
                        <InputNumber
                            min={0}
                            max={100000000}
                            precision={0}
                            controls={false}
                            value={defectQuantity}
                            onChange={(next) => setDefectQuantity(Math.max(0, Number(next || 0)))}
                            disabled={readOnly}
                            inputMode='numeric'
                            aria-label='Số lượng lỗi'
                        />
                    </label>
                </section>

                <section className='pd-qc-total'>
                    <div>
                        <Text>Tổng kiểm</Text>
                        <strong>{number(totalQuantity)}</strong>
                        <small>Tự động bằng Đạt + Lỗi</small>
                    </div>
                    <div className={defectQuantity > 0 ? 'has-defect' : ''}>
                        <Text>Tỷ lệ lỗi</Text>
                        <strong>{defectRate.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%</strong>
                        <small>{defectQuantity ? `${number(defectQuantity)} sản phẩm lỗi` : 'Chưa ghi nhận lỗi'}</small>
                    </div>
                </section>

                {totalQuantity > 0 && variance !== 0 ? (
                    <Alert
                        type={Math.abs(variance) > Math.max(5, productionActual * 0.05) ? 'warning' : 'info'}
                        showIcon
                        message={
                            variance < 0
                                ? `Còn ${number(Math.abs(variance))} SP chưa kiểm`
                                : `QC nhiều hơn ${number(variance)} SP`
                        }
                        description='Đây là cảnh báo đối chiếu, hệ thống vẫn cho lưu vì QC có thể kiểm trễ hoặc gộp sản phẩm.'
                    />
                ) : null}

                <label className='pd-qc-note'>
                    <span>Ghi chú</span>
                    <TextArea
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        rows={3}
                        maxLength={500}
                        showCount
                        disabled={readOnly}
                        placeholder='Ví dụ: lỗi đường may, lệch màu, chờ kiểm lại...'
                    />
                    {totalQuantity === 0 && !readOnly ? <small>Cần ghi chú nếu lưu kết quả bằng 0.</small> : null}
                </label>
            </div>
        </Drawer>
    );
};

export default ProductionQcEntryDrawer;
