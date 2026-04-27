import React, { lazy, useMemo, useState } from 'react';
import { App, Button, Input, Table, Tooltip, type TableColumnsType } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined, SearchOutlined, TagsOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import ConfirmAction from '../components/shared/ConfirmAction';
import LazyBoundary from '../components/shared/LazyBoundary';
import PageHeader from '../components/shared/PageHeader';
import { useAuth } from '../core/contexts/AuthContext';
import { hasManagerAccess } from '../core/lib/permissions';
import { normalizeSearchTerm } from '../core/lib/search';
import { brandService } from '../core/services';
import type { Brand } from '../core/types';

const BrandFormModal = lazy(() => import('../components/BrandFormModal'));

const BrandList: React.FC = () => {
    const queryClient = useQueryClient();
    const { role } = useAuth();
    const { message } = App.useApp();
    const [search, setSearch] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
    const canManageBrands = hasManagerAccess(role);

    const { data: brands = [], isLoading } = useQuery({
        queryKey: ['brands', search],
        queryFn: () => brandService.getAll(search ? { search } : undefined),
    });

    const { data: allBrands = [] } = useQuery({
        queryKey: ['brands'],
        queryFn: () => brandService.getAll(),
    });

    const createMutation = useMutation({
        mutationFn: brandService.create,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['brands'] });
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: { name: string; description?: string } }) =>
            brandService.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['brands'] });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: brandService.delete,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['brands'] });
        },
    });

    const stats = useMemo(
        () => ({
            total: brands.length,
            withDescription: brands.filter((brand) => brand.description?.trim()).length,
        }),
        [brands]
    );

    const handleSearch = () => setSearch(normalizeSearchTerm(searchInput));

    const handleReset = () => {
        setSearch('');
        setSearchInput('');
    };

    const handleOpenCreate = () => {
        setEditingBrand(null);
        setIsModalOpen(true);
    };

    const handleOpenEdit = (brand: Brand) => {
        setEditingBrand(brand);
        setIsModalOpen(true);
    };

    const handleDelete = async (id: string) => {
        await deleteMutation.mutateAsync(id);
        message.success('Đã xóa nhãn hiệu');
    };

    const handleSubmit = async (values: { name: string; description?: string }) => {
        if (editingBrand) {
            await updateMutation.mutateAsync({ id: editingBrand.id, data: values });
            return;
        }

        await createMutation.mutateAsync(values);
    };

    const columns: TableColumnsType<Brand> = [
        {
            title: 'NHÃN HIỆU',
            dataIndex: 'name',
            key: 'name',
            render: (value: string) => <span className='font-semibold text-slate-800'>{value}</span>,
        },
        {
            title: 'MÔ TẢ',
            dataIndex: 'description',
            key: 'description',
            render: (value?: string) => <span className='text-slate-600'>{value || '-'}</span>,
        },
        {
            title: 'NGÀY TẠO',
            dataIndex: 'createdAt',
            key: 'createdAt',
            width: 160,
            render: (value: string) => <span className='text-slate-600'>{dayjs(value).format('DD/MM/YYYY')}</span>,
        },
    ];

    if (canManageBrands) {
        columns.push({
            title: 'THAO TÁC',
            key: 'action',
            width: 120,
            align: 'right',
            render: (_value, record) => (
                <div className='flex items-center justify-end gap-2'>
                    <Tooltip title='Chỉnh sửa'>
                        <Button
                            type='text'
                            icon={<EditOutlined />}
                            className='flex h-8 w-8 items-center justify-center rounded-md bg-amber-50 text-amber-600 hover:bg-amber-100 hover:text-amber-700'
                            onClick={() => handleOpenEdit(record)}
                        />
                    </Tooltip>
                    <ConfirmAction
                        title='Xóa nhãn hiệu'
                        description={`Nhãn hiệu “${record.name}” sẽ bị xóa mềm khỏi hệ thống.`}
                        okLabel='Xóa'
                        onConfirm={() => handleDelete(record.id)}
                    >
                        <Tooltip title='Xóa mềm'>
                            <Button
                                type='text'
                                danger
                                icon={<DeleteOutlined />}
                                className='flex h-8 w-8 items-center justify-center rounded-md bg-rose-50 text-rose-600 hover:bg-rose-100 hover:text-rose-700'
                            />
                        </Tooltip>
                    </ConfirmAction>
                </div>
            ),
        });
    }

    return (
        <div className='flex w-full max-w-full flex-col gap-6 overflow-hidden'>
            <PageHeader
                title='Quản Lý Nhãn Hiệu'
                subtitle='Danh mục nhãn hiệu dùng chung cho màn hình quản lý máy và form thiết bị.'
                actions={
                    canManageBrands ? (
                        <Button
                            type='primary'
                            icon={<PlusOutlined />}
                            onClick={handleOpenCreate}
                            className='rounded-lg border-none bg-blue-600 font-medium shadow-sm hover:bg-blue-700'
                        >
                            Add Brand
                        </Button>
                    ) : undefined
                }
            />

            <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
                <div className='rounded-xl border border-slate-200 bg-white p-5 shadow-sm'>
                    <div className='mb-1 text-xs font-bold uppercase tracking-wider text-slate-500'>Tổng nhãn hiệu</div>
                    <div className='flex items-center justify-between'>
                        <div className='text-3xl font-bold text-slate-800'>{stats.total}</div>
                        <div className='flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-2xl text-blue-600'>
                            <TagsOutlined />
                        </div>
                    </div>
                </div>
                <div className='rounded-xl border border-slate-200 bg-white p-5 shadow-sm'>
                    <div className='mb-1 text-xs font-bold uppercase tracking-wider text-slate-500'>Có mô tả</div>
                    <div className='text-3xl font-bold text-slate-800'>{stats.withDescription}</div>
                </div>
            </div>

            <div className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm'>
                <div className='flex flex-col gap-4 lg:flex-row'>
                    <div className='flex-1'>
                        <Input
                            prefix={<SearchOutlined className='text-slate-400' />}
                            placeholder='Tìm theo tên nhãn hiệu hoặc mô tả...'
                            value={searchInput}
                            onChange={(event) => setSearchInput(event.target.value)}
                            onPressEnter={handleSearch}
                            allowClear
                            size='large'
                            className='w-full rounded-lg'
                        />
                    </div>
                    <div className='flex w-full gap-2 lg:w-auto'>
                        <Button
                            type='primary'
                            icon={<SearchOutlined />}
                            onClick={handleSearch}
                            size='large'
                            className='flex-1 rounded-lg border-none bg-blue-600 font-medium shadow-sm hover:bg-blue-700 lg:flex-none'
                        >
                            Tìm kiếm
                        </Button>
                        <Button
                            icon={<ReloadOutlined />}
                            onClick={handleReset}
                            size='large'
                            className='flex-1 rounded-lg font-medium text-slate-600 hover:text-slate-800 lg:flex-none'
                        >
                            Làm mới
                        </Button>
                    </div>
                </div>
            </div>

            <div className='overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm'>
                <div className='[&_.ant-table]:!bg-white [&_.ant-table-row:hover_td]:!bg-slate-50/80 [&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!text-[12px] [&_.ant-table-thead_th]:!font-bold [&_.ant-table-thead_th]:!tracking-wider [&_.ant-table-thead_th]:!text-slate-500'>
                    <Table<Brand>
                        rowKey='id'
                        columns={columns}
                        dataSource={brands}
                        loading={isLoading}
                        pagination={{
                            pageSize: 10,
                            showSizeChanger: false,
                            showTotal: (total) => (
                                <span className='font-medium text-slate-500'>Tổng số {total} nhãn hiệu</span>
                            ),
                            className: '!m-0 border-t border-slate-100 !px-5 !py-4',
                        }}
                        scroll={{ x: 900 }}
                    />
                </div>
            </div>

            {isModalOpen ? (
                <LazyBoundary mode='overlay'>
                    <BrandFormModal
                        open={isModalOpen}
                        onClose={() => setIsModalOpen(false)}
                        onSubmit={handleSubmit}
                        initialValues={editingBrand}
                        brands={allBrands}
                    />
                </LazyBoundary>
            ) : null}
        </div>
    );
};

export default BrandList;
