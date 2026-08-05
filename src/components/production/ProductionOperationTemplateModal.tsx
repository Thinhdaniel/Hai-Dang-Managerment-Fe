import { ApartmentOutlined, SaveOutlined } from '@ant-design/icons';
import { App, Button, Empty, InputNumber, Modal, Select, Switch } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { productionService } from '../../core/services/production.service';
import type {
    ProductionItem,
    ProductionOperation,
    ProductionOperationConfigPayload,
} from '../../core/types/production';

type Props = {
    open: boolean;
    item?: ProductionItem | null;
    operations: ProductionOperation[];
    onClose: () => void;
    onSaved: (item: ProductionItem) => void | Promise<void>;
};

const ProductionOperationTemplateModal = ({ open, item, operations, onClose, onSaved }: Props) => {
    const { message } = App.useApp();
    const [configs, setConfigs] = useState<ProductionOperationConfigPayload[]>([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open || !item) return;
        setConfigs(
            (item.operationTemplates || []).map((template, index) => ({
                operationId: template.operationId,
                hourlyQuota: template.hourlyQuota,
                required: template.required,
                sortOrder: template.sortOrder ?? index,
            }))
        );
    }, [item, open]);

    const operationById = useMemo(
        () => new Map(operations.map((operation) => [operation.id, operation])),
        [operations]
    );
    const selectedIds = configs.map((config) => config.operationId);

    const changeSelection = (ids: string[]) => {
        const currentById = new Map(configs.map((config) => [config.operationId, config]));
        setConfigs(
            ids.map(
                (operationId, index): ProductionOperationConfigPayload =>
                    currentById.get(operationId) || {
                        operationId,
                        hourlyQuota: 0,
                        required: true,
                        sortOrder: index,
                    }
            )
        );
    };

    const updateConfig = (operationId: string, patch: Partial<ProductionOperationConfigPayload>) => {
        setConfigs((current) =>
            current.map((config, index) =>
                config.operationId === operationId ? { ...config, ...patch, sortOrder: index } : config
            )
        );
    };

    const save = async () => {
        if (!item) return;
        setSaving(true);
        try {
            const updated = await productionService.updateItemOperations(
                item.id,
                configs.map((config, index) => ({ ...config, sortOrder: index }))
            );
            await onSaved(updated);
            message.success('Đã lưu template công đoạn');
            onClose();
        } catch (error) {
            message.error(error instanceof Error ? error.message : 'Không thể lưu template công đoạn');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            open={open}
            onCancel={onClose}
            title={
                <span className='production-operation-modal__title'>
                    <ApartmentOutlined /> Công đoạn trọng yếu · {item?.code || ''}
                </span>
            }
            width={720}
            className='production-operation-modal'
            footer={[
                <Button key='cancel' onClick={onClose}>
                    Đóng
                </Button>,
                <Button key='save' type='primary' icon={<SaveOutlined />} loading={saving} onClick={save}>
                    Lưu template
                </Button>,
            ]}
            destroyOnHidden
        >
            <p className='production-operation-modal__help'>
                Template chỉ là gợi ý mặc định. Khi tổ bắt đầu mã hàng, hệ thống chụp lại danh sách và mức khoán để lịch
                sử không bị đổi theo danh mục.
            </p>
            <Select
                mode='multiple'
                value={selectedIds}
                onChange={changeSelection}
                options={operations
                    .filter((operation) => operation.isActive || selectedIds.includes(operation.id))
                    .map((operation) => ({
                        value: operation.id,
                        label: `${operation.code} · ${operation.name}`,
                    }))}
                placeholder='Chọn các công đoạn cần theo dõi'
                className='w-full'
                maxTagCount='responsive'
            />

            <div className='production-operation-template-list'>
                {configs.length ? (
                    configs.map((config, index) => {
                        const operation = operationById.get(config.operationId);
                        return (
                            <div className='production-operation-template-row' key={config.operationId}>
                                <span className='production-operation-template-row__index'>{index + 1}</span>
                                <div className='production-operation-template-row__identity'>
                                    <strong>{operation?.name || 'Công đoạn không còn trong danh mục'}</strong>
                                    <small>
                                        {operation?.code || config.operationId} · {operation?.unit || 'SP'}
                                    </small>
                                </div>
                                <label>
                                    <span>Khoán/giờ</span>
                                    <InputNumber
                                        min={0}
                                        max={10_000_000}
                                        precision={0}
                                        controls={false}
                                        value={config.hourlyQuota}
                                        onChange={(value) =>
                                            updateConfig(config.operationId, { hourlyQuota: Number(value || 0) })
                                        }
                                    />
                                </label>
                                <label className='production-operation-template-row__required'>
                                    <span>Bắt buộc báo</span>
                                    <Switch
                                        checked={config.required}
                                        onChange={(required) => updateConfig(config.operationId, { required })}
                                    />
                                </label>
                            </div>
                        );
                    })
                ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Mã hàng chưa theo dõi công đoạn' />
                )}
            </div>
        </Modal>
    );
};

export default ProductionOperationTemplateModal;
