import React, { useMemo, useState } from 'react';
import {
    App,
    Button,
    Card,
    Checkbox,
    Collapse,
    DatePicker,
    Form,
    Input,
    InputNumber,
    Result,
    Select,
    Skeleton,
    Tabs,
    Typography,
} from 'antd';
import { ArrowLeftOutlined, LinkOutlined, QrcodeOutlined, SaveOutlined } from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useNavigate, useParams } from 'react-router-dom';
import { ASSET_OWNERSHIP_OPTIONS, ASSET_STATUS_LABEL } from '../core/constants';
import { hasManagerAccess } from '../core/lib/permissions';
import { assetService } from '../core/services/asset.service';
import { brandService, plantService } from '../core/services';
import { qrLabelService } from '../core/services/qr-label.service';
import { useAuth } from '../core/contexts/AuthContext';
import { AssetOwnershipType, AssetStatus, QrLabelStatus, type ActivateMachineQrPayload } from '../core/types';

const { Text } = Typography;

type AssetFormValues = {
    name: string;
    machineCode?: string;
    serial?: string;
    type: string;
    model: string;
    brandId: string;
    plantId: string;
    area?: string;
    status: AssetStatus;
    ownershipType: AssetOwnershipType;
    purchaseDate?: ReturnType<typeof dayjs>;
    purchasePrice?: number;
    specificationsText?: string;
    note?: string;
};

type LinkFormValues = {
    assetId: string;
    replaceExistingPublicId?: boolean;
};

const statusOptions = Object.entries(ASSET_STATUS_LABEL).map(([value, label]) => ({ value, label }));

const QrActivateMachinePage: React.FC = () => {
    const { publicId = '' } = useParams();
    const navigate = useNavigate();
    const { message } = App.useApp();
    const { role } = useAuth();
    const [assetForm] = Form.useForm<AssetFormValues>();
    const [linkForm] = Form.useForm<LinkFormValues>();
    const [assetSearch, setAssetSearch] = useState('');
    // Kiểm kê: mặc định chỉ tìm máy trong cơ sở của tem (giảm nhiễu, bớt chọn nhầm),
    // cho phép mở rộng toàn bộ cơ sở khi máy bị lệch vị trí.
    const [scopeToPlant, setScopeToPlant] = useState(true);
    const canManage = hasManagerAccess(role);

    const { data: qrData, isLoading: isLoadingQr } = useQuery({
        queryKey: ['internal-qr', publicId],
        queryFn: () => qrLabelService.resolveInternal(publicId),
        enabled: Boolean(publicId),
        retry: false,
    });

    const { data: plants = [] } = useQuery({
        queryKey: ['plants'],
        queryFn: () => plantService.getAll(),
    });

    const { data: brands = [] } = useQuery({
        queryKey: ['brands'],
        queryFn: () => brandService.getAll(),
    });

    const plannedPlantId = qrData?.label?.plannedPlantId;
    const plannedPlantName = qrData?.label?.plannedPlant?.name;
    const scopedPlantId = scopeToPlant ? plannedPlantId : undefined;

    const { data: assetOptionsResponse, isFetching: isSearchingAssets } = useQuery({
        queryKey: ['assets', 'qr-link-options', assetSearch, scopedPlantId ?? 'all'],
        queryFn: () =>
            assetService.getAll({
                search: assetSearch.trim() || undefined,
                plantId: scopedPlantId,
                page: 1,
                limit: 20,
            }),
    });

    const plantOptions = useMemo(
        () =>
            plants.map((plant) => ({
                value: plant.id,
                label: plant.code ? `${plant.name} (${plant.code})` : plant.name,
            })),
        [plants]
    );

    const brandOptions = useMemo(() => brands.map((brand) => ({ value: brand.id, label: brand.name })), [brands]);

    const assetOptions = useMemo(
        () =>
            (assetOptionsResponse?.data ?? []).map((asset) => {
                // Làm giàu nhãn để phân biệt các máy trùng tên: cơ sở · khu vực · serial.
                const detail = [asset.plant?.name, asset.area, asset.serial ? `SN ${asset.serial}` : '']
                    .filter(Boolean)
                    .join(' · ');
                return {
                    value: asset.id,
                    label: `${asset.machineCode} - ${asset.name}${detail ? ` · ${detail}` : ''}${asset.publicId ? ' • đã có QR' : ''}`,
                    asset,
                };
            }),
        [assetOptionsResponse]
    );

    const activateMutation = useMutation({
        mutationFn: (payload: ActivateMachineQrPayload) => qrLabelService.activateMachine(publicId, payload),
        onSuccess: ({ asset }) => {
            message.success('Đã kích hoạt tem và tạo hồ sơ máy');
            navigate(`/assets/${asset.id}`);
        },
    });

    const linkMutation = useMutation({
        mutationFn: (payload: LinkFormValues) => qrLabelService.linkAsset(publicId, payload),
        onSuccess: ({ asset }) => {
            message.success('Đã gán tem QR vào máy');
            navigate(`/assets/${asset.id}`);
        },
    });

    const handleCreateAsset = async () => {
        const values = await assetForm.validateFields();
        let specifications: Record<string, string | number> | undefined;

        if (values.specificationsText?.trim()) {
            try {
                specifications = JSON.parse(values.specificationsText);
            } catch {
                assetForm.setFields([
                    {
                        name: 'specificationsText',
                        errors: ['Thông số kỹ thuật phải là JSON hợp lệ'],
                    },
                ]);
                return;
            }
        }

        activateMutation.mutate({
            asset: {
                name: values.name.trim(),
                machineCode: values.machineCode?.trim() || undefined,
                serial: values.serial?.trim() || '',
                type: values.type.trim(),
                model: values.model.trim(),
                brandId: values.brandId,
                plantId: values.plantId,
                area: values.area?.trim(),
                status: values.status,
                ownershipType: values.ownershipType,
                purchaseDate: values.purchaseDate ? values.purchaseDate.format('YYYY-MM-DD') : undefined,
                purchasePrice: values.purchasePrice,
                specifications,
                note: values.note?.trim(),
            },
        });
    };

    const handleLinkAsset = async () => {
        const values = await linkForm.validateFields();
        linkMutation.mutate(values);
    };

    if (isLoadingQr) {
        return <Skeleton active paragraph={{ rows: 10 }} className='rounded-xl bg-white p-6' />;
    }

    if (!canManage) {
        return (
            <Result
                status='403'
                title='Không có quyền kích hoạt tem QR'
                subTitle='Chỉ Admin hoặc Manager được thao tác.'
            />
        );
    }

    if (!qrData || qrData.status !== QrLabelStatus.UNUSED || !qrData.canActivate) {
        return (
            <Result
                status='info'
                title='Tem QR không thể kích hoạt'
                subTitle='Tem này đã được gán, bị hủy hoặc không phải tem máy.'
                extra={<Button onClick={() => navigate(`/qr/${publicId}`)}>Quay lại QR</Button>}
            />
        );
    }

    return (
        <div className='flex w-full max-w-full flex-col gap-6 overflow-hidden'>
            <div className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm'>
                <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/qr/${publicId}`)} className='mb-4'>
                    Quay lại QR
                </Button>
                <div className='flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
                    <div>
                        <div className='flex items-center gap-2 text-sm font-bold tracking-wide text-blue-700 uppercase'>
                            <QrcodeOutlined />
                            Kích hoạt tem máy
                        </div>
                        <h1 className='m-0 mt-1 font-mono text-2xl font-black text-slate-900'>{publicId}</h1>
                        <Text type='secondary'>
                            Tạo hồ sơ máy mới từ tem trắng hoặc gán tem này vào một máy đã có trong hệ thống.
                        </Text>
                    </div>
                    <div className='rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800'>
                        {qrData.label?.plannedPlant?.name || 'Chưa gán cơ sở'}{' '}
                        {qrData.label?.plannedArea ? `- ${qrData.label.plannedArea}` : ''}
                    </div>
                </div>
            </div>

            <Tabs
                defaultActiveKey='link'
                items={[
                    {
                        key: 'create',
                        label: 'Tạo máy mới',
                        children: (
                            <Card className='rounded-xl border-slate-200 shadow-sm'>
                                <Form
                                    form={assetForm}
                                    layout='vertical'
                                    size='large'
                                    requiredMark='optional'
                                    initialValues={{
                                        status: AssetStatus.ACTIVE,
                                        ownershipType: AssetOwnershipType.OWNED,
                                        plantId: qrData.label?.plannedPlantId,
                                        area: qrData.label?.plannedArea,
                                    }}
                                >
                                    {/* Trường lõi — đủ để gán nhanh tại hiện trường */}
                                    <div className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
                                        <Form.Item
                                            name='name'
                                            label='Tên máy'
                                            rules={[{ required: true, whitespace: true, message: 'Nhập tên máy' }]}
                                        >
                                            <Input allowClear placeholder='Ví dụ: Máy may 1 kim điện tử Juki' />
                                        </Form.Item>
                                        <Form.Item
                                            name='type'
                                            label='Loại máy'
                                            rules={[{ required: true, whitespace: true, message: 'Nhập loại máy' }]}
                                        >
                                            <Input allowClear placeholder='Ví dụ: Máy may 1 kim' />
                                        </Form.Item>
                                        <Form.Item
                                            name='brandId'
                                            label='Nhãn hiệu'
                                            rules={[{ required: true, message: 'Chọn nhãn hiệu' }]}
                                        >
                                            <Select
                                                allowClear
                                                showSearch={{ optionFilterProp: 'label' }}
                                                options={brandOptions}
                                                placeholder='Chọn nhãn hiệu'
                                            />
                                        </Form.Item>
                                        <Form.Item
                                            name='model'
                                            label='Model'
                                            rules={[{ required: true, whitespace: true, message: 'Nhập model' }]}
                                        >
                                            <Input allowClear placeholder='Ví dụ: Juki DDL-8000A' />
                                        </Form.Item>
                                        <Form.Item
                                            name='plantId'
                                            label='Cơ sở'
                                            rules={[{ required: true, message: 'Chọn cơ sở' }]}
                                        >
                                            <Select
                                                allowClear
                                                showSearch={{ optionFilterProp: 'label' }}
                                                options={plantOptions}
                                                placeholder='Chọn cơ sở'
                                            />
                                        </Form.Item>
                                        <Form.Item name='area' label='Khu vực / xưởng'>
                                            <Input allowClear placeholder='Ví dụ: Xưởng May 1 - Chuyền 02' />
                                        </Form.Item>
                                        <Form.Item
                                            name='machineCode'
                                            label='Mã máy'
                                            extra='Để trống sẽ tự sinh mã thông minh theo loại/nhãn hiệu.'
                                        >
                                            <Input allowClear placeholder='Để trống = tự sinh mã' />
                                        </Form.Item>
                                    </div>

                                    {/* Thông tin thêm — gập lại để hiện trường thao tác nhanh */}
                                    <Collapse
                                        ghost
                                        className='mt-1'
                                        items={[
                                            {
                                                key: 'more',
                                                label: 'Thông tin thêm (tùy chọn)',
                                                children: (
                                                    <div className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
                                                        <Form.Item name='serial' label='Serial'>
                                                            <Input allowClear placeholder='Nhập serial nếu có' />
                                                        </Form.Item>
                                                        <Form.Item name='status' label='Trạng thái'>
                                                            <Select options={statusOptions} />
                                                        </Form.Item>
                                                        <Form.Item name='ownershipType' label='Nguồn gốc máy'>
                                                            <Select options={ASSET_OWNERSHIP_OPTIONS} />
                                                        </Form.Item>
                                                        <Form.Item name='purchaseDate' label='Ngày nhập / mua'>
                                                            <DatePicker className='w-full' format='DD/MM/YYYY' />
                                                        </Form.Item>
                                                        <Form.Item name='purchasePrice' label='Giá trị'>
                                                            <InputNumber<number>
                                                                className='w-full'
                                                                min={0}
                                                                formatter={(value) =>
                                                                    `${value ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                                                                }
                                                                parser={(value) =>
                                                                    Number(String(value ?? '').replace(/,/g, ''))
                                                                }
                                                            />
                                                        </Form.Item>
                                                        <Form.Item
                                                            name='specificationsText'
                                                            label='Thông số kỹ thuật (JSON)'
                                                            className='lg:col-span-2'
                                                        >
                                                            <Input.TextArea
                                                                rows={4}
                                                                placeholder='{"tocDo": "5000 mũi/phút", "congSuat": 15}'
                                                            />
                                                        </Form.Item>
                                                        <Form.Item name='note' label='Ghi chú' className='lg:col-span-2'>
                                                            <Input.TextArea
                                                                rows={3}
                                                                placeholder='Ghi chú hiện trạng, phụ kiện, lưu ý vận hành...'
                                                            />
                                                        </Form.Item>
                                                    </div>
                                                ),
                                            },
                                        ]}
                                    />
                                    <div className='mt-4 flex justify-end'>
                                        <Button
                                            type='primary'
                                            icon={<SaveOutlined />}
                                            loading={activateMutation.isPending}
                                            onClick={handleCreateAsset}
                                        >
                                            Kích hoạt và tạo máy
                                        </Button>
                                    </div>
                                </Form>
                            </Card>
                        ),
                    },
                    {
                        key: 'link',
                        label: 'Gán vào máy đã có',
                        children: (
                            <Card className='rounded-xl border-slate-200 shadow-sm'>
                                <Form form={linkForm} layout='vertical' size='large'>
                                    {plannedPlantId && (
                                        <div className='mb-3 flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2'>
                                            <Checkbox
                                                checked={scopeToPlant}
                                                onChange={(e) => setScopeToPlant(e.target.checked)}
                                            >
                                                Chỉ tìm máy trong{' '}
                                                <Text strong>{plannedPlantName || 'cơ sở của tem'}</Text>
                                            </Checkbox>
                                            {!scopeToPlant && (
                                                <Text type='secondary' className='text-xs'>
                                                    Đang tìm toàn bộ cơ sở
                                                </Text>
                                            )}
                                        </div>
                                    )}
                                    <Form.Item
                                        name='assetId'
                                        label='Chọn máy (gõ mã / tên / serial)'
                                        rules={[{ required: true, message: 'Chọn máy cần gán tem' }]}
                                    >
                                        <Select
                                            showSearch
                                            filterOption={false}
                                            onSearch={setAssetSearch}
                                            loading={isSearchingAssets}
                                            options={assetOptions}
                                            placeholder='Tìm theo mã máy, tên máy, serial...'
                                            notFoundContent={
                                                isSearchingAssets
                                                    ? 'Đang tìm…'
                                                    : assetSearch
                                                      ? 'Không thấy máy — thử bỏ lọc cơ sở hoặc gõ serial.'
                                                      : 'Gõ để tìm máy'
                                            }
                                        />
                                    </Form.Item>
                                    <Form.Item name='replaceExistingPublicId' valuePropName='checked'>
                                        <Checkbox>Cho phép thay QR cũ nếu máy đã có publicId</Checkbox>
                                    </Form.Item>
                                    <div className='rounded-lg border border-amber-100 bg-amber-50 p-3 text-sm text-amber-800'>
                                        Chỉ bật lựa chọn này khi xác nhận tem cũ đã hỏng, mất hoặc cần thay thế. Hệ
                                        thống sẽ gán publicId mới cho máy.
                                    </div>
                                    <div className='mt-4 flex justify-end'>
                                        <Button
                                            type='primary'
                                            icon={<LinkOutlined />}
                                            loading={linkMutation.isPending}
                                            onClick={handleLinkAsset}
                                        >
                                            Gán tem vào máy
                                        </Button>
                                    </div>
                                </Form>
                            </Card>
                        ),
                    },
                ]}
            />
        </div>
    );
};

export default QrActivateMachinePage;
