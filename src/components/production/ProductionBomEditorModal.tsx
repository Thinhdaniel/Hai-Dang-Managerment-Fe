import { CheckOutlined, DeleteOutlined, PlusOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import {
    Alert,
    Button,
    Checkbox,
    DatePicker,
    Form,
    Input,
    InputNumber,
    Modal,
    Select,
    Space,
    Tag,
    Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useEffect, useMemo } from 'react';
import type { Material } from '../../core/services/material.service';
import type { ProductionBom } from '../../core/types/production';

const { Text } = Typography;

type BomForm = {
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
};

type Props = {
    open: boolean;
    item?: { id: string; code: string; name?: string };
    draft?: ProductionBom;
    approved?: ProductionBom;
    materials: Material[];
    saving: boolean;
    approving: boolean;
    onClose: () => void;
    onSave: (value: BomForm) => void;
    onApprove: (bom: ProductionBom) => void;
};

const ProductionBomEditorModal = ({
    open,
    item,
    draft,
    approved,
    materials,
    saving,
    approving,
    onClose,
    onSave,
    onApprove,
}: Props) => {
    const [form] = Form.useForm<BomForm>();
    const source = draft || approved;
    const materialById = useMemo(() => new Map(materials.map((material) => [material.id, material])), [materials]);

    useEffect(() => {
        if (!open) return;
        form.setFieldsValue({
            effectiveFrom: source?.effectiveFrom ? dayjs(source.effectiveFrom) : undefined,
            note: source?.note,
            changeReason: draft
                ? 'Cập nhật định mức BOM'
                : approved
                  ? 'Tạo phiên bản BOM kế tiếp'
                  : 'Khai báo BOM ban đầu',
            lines: (source?.lines || []).map((line) => ({
                materialId: line.materialId,
                quantityPerUnit: line.quantityPerUnit,
                wastagePercent: line.wastagePercent,
                isRequired: line.isRequired,
                operationName: line.operationName,
                note: line.note,
            })),
        });
    }, [draft, form, open, source]);

    return (
        <Modal
            open={open}
            onCancel={onClose}
            width={1040}
            destroyOnHidden
            className='production-bom-modal'
            title={
                <div className='production-bom-modal__title'>
                    <span>
                        <strong>BOM mã {item?.code}</strong>
                        <small>{item?.name || 'Định mức nguyên phụ liệu'}</small>
                    </span>
                    {draft ? (
                        <Tag color='gold'>Nháp v{draft.version}</Tag>
                    ) : approved ? (
                        <Tag color='green'>Đã duyệt v{approved.version}</Tag>
                    ) : null}
                </div>
            }
            footer={
                <div className='production-bom-modal__footer'>
                    <Text type='secondary'>Lưu nháp trước, sau đó kiểm tra và duyệt để áp dụng cho đơn hàng.</Text>
                    <Space wrap>
                        <Button onClick={onClose}>Đóng</Button>
                        <Button loading={saving} onClick={() => form.submit()}>
                            Lưu BOM nháp
                        </Button>
                        <Button
                            type='primary'
                            icon={<SafetyCertificateOutlined />}
                            loading={approving}
                            disabled={!draft || saving}
                            onClick={() => draft && onApprove(draft)}
                        >
                            Duyệt phiên bản
                        </Button>
                    </Space>
                </div>
            }
        >
            <Alert
                showIcon
                type='info'
                message='BOM đã duyệt là căn cứ tính nhu cầu cho toàn bộ số lượng đơn'
                description='Mỗi vật tư chỉ khai báo một lần. Khi duyệt phiên bản mới, các reservation cũ của mã hàng sẽ được giải phóng để tránh dùng sai định mức.'
            />
            <Form<BomForm>
                form={form}
                layout='vertical'
                requiredMark={false}
                onFinish={(values) => onSave(values)}
                className='production-bom-form'
            >
                <div className='production-bom-form__meta'>
                    <Form.Item name='effectiveFrom' label='Hiệu lực từ ngày'>
                        <DatePicker
                            format='DD/MM/YYYY'
                            allowClear
                            disabledDate={(date) => date.startOf('day').isAfter(dayjs().startOf('day'))}
                        />
                    </Form.Item>
                    <Form.Item name='changeReason' label='Lý do cập nhật' rules={[{ required: true, min: 3 }]}>
                        <Input maxLength={500} />
                    </Form.Item>
                    <Form.Item name='note' label='Ghi chú phiên bản'>
                        <Input maxLength={500} />
                    </Form.Item>
                </div>

                <Form.List name='lines'>
                    {(fields, { add, remove }) => (
                        <div className='production-bom-lines'>
                            <div className='production-bom-lines__heading'>
                                <div>
                                    <strong>Danh sách nguyên phụ liệu</strong>
                                    <span>Định mức tính trên 1 sản phẩm hoàn thiện.</span>
                                </div>
                                <Button
                                    type='dashed'
                                    icon={<PlusOutlined />}
                                    onClick={() => add({ wastagePercent: 0, isRequired: true, quantityPerUnit: 1 })}
                                >
                                    Thêm vật tư
                                </Button>
                            </div>
                            {!fields.length ? (
                                <button
                                    type='button'
                                    className='production-bom-empty'
                                    onClick={() => add({ wastagePercent: 0, isRequired: true, quantityPerUnit: 1 })}
                                >
                                    <PlusOutlined />
                                    <span>Thêm dòng vật tư đầu tiên</span>
                                </button>
                            ) : null}
                            {fields.map((field, index) => {
                                const materialId = form.getFieldValue(['lines', field.name, 'materialId']);
                                const material = materialById.get(materialId);
                                return (
                                    <div className='production-bom-line' key={field.key}>
                                        <span className='production-bom-line__index'>{index + 1}</span>
                                        <Form.Item
                                            {...field}
                                            name={[field.name, 'materialId']}
                                            label='Vật tư'
                                            rules={[{ required: true, message: 'Chọn vật tư' }]}
                                        >
                                            <Select
                                                showSearch
                                                optionFilterProp='label'
                                                placeholder='Tìm theo mã hoặc tên'
                                                options={materials.map((row) => ({
                                                    value: row.id,
                                                    label: [row.code, row.name].filter(Boolean).join(' · '),
                                                    disabled: fields.some(
                                                        (candidate) =>
                                                            candidate.name !== field.name &&
                                                            form.getFieldValue([
                                                                'lines',
                                                                candidate.name,
                                                                'materialId',
                                                            ]) === row.id
                                                    ),
                                                }))}
                                            />
                                        </Form.Item>
                                        <Form.Item
                                            {...field}
                                            name={[field.name, 'quantityPerUnit']}
                                            label={`Định mức${material?.unit ? ` (${material.unit}/SP)` : ''}`}
                                            rules={[{ required: true, type: 'number', min: 0.000001 }]}
                                        >
                                            <InputNumber min={0.000001} precision={6} />
                                        </Form.Item>
                                        <Form.Item
                                            {...field}
                                            name={[field.name, 'wastagePercent']}
                                            label='Hao hụt (%)'
                                            rules={[{ required: true, type: 'number', min: 0, max: 100 }]}
                                        >
                                            <InputNumber min={0} max={100} precision={2} />
                                        </Form.Item>
                                        <Form.Item
                                            {...field}
                                            name={[field.name, 'operationName']}
                                            label='Công đoạn dùng'
                                        >
                                            <Input placeholder='Ví dụ: May thân' maxLength={160} />
                                        </Form.Item>
                                        <Form.Item
                                            {...field}
                                            name={[field.name, 'isRequired']}
                                            valuePropName='checked'
                                            label='Bắt buộc'
                                        >
                                            <Checkbox>
                                                <CheckOutlined /> Có
                                            </Checkbox>
                                        </Form.Item>
                                        <Button
                                            type='text'
                                            danger
                                            icon={<DeleteOutlined />}
                                            aria-label={`Xóa dòng ${index + 1}`}
                                            onClick={() => remove(field.name)}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </Form.List>
            </Form>
        </Modal>
    );
};

export default ProductionBomEditorModal;
