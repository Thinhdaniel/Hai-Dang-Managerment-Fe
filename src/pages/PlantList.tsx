import React, { lazy, useMemo, useState } from 'react';
import { App, Button, Input, Table, Tooltip, type TableColumnsType } from 'antd';
import {
    ClusterOutlined,
    DeleteOutlined,
    EditOutlined,
    EnvironmentOutlined,
    PlusOutlined,
    ReloadOutlined,
    SearchOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import ConfirmAction from '../components/shared/ConfirmAction';
import LazyBoundary from '../components/shared/LazyBoundary';
import PageHeader from '../components/shared/PageHeader';
import StatsCard from '../components/shared/StatsCard';
import { useAuth } from '../core/contexts/AuthContext';
import { hasManagerAccess } from '../core/lib/permissions';
import { normalizeSearchTerm } from '../core/lib/search';
import { plantService } from '../core/services';
import type { Plant } from '../core/types';

const PlantFormModal = lazy(() => import('../components/PlantFormModal'));

const PlantList: React.FC = () => {
    const queryClient = useQueryClient();
    const { role } = useAuth();
    const { message } = App.useApp();
    const [search, setSearch] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingPlant, setEditingPlant] = useState<Plant | null>(null);
    const canManagePlants = hasManagerAccess(role);

    const { data: facilitiesResponse, isLoading } = useQuery({
        queryKey: ['plants', 'with-machine-count', search],
        queryFn: () => plantService.getWithMachineCount(search ? { search } : undefined),
    });

    const { data: allPlants = [] } = useQuery({
        queryKey: ['plants'],
        queryFn: () => plantService.getAll(),
    });

    const invalidateRelatedQueries = () => {
        queryClient.invalidateQueries({ queryKey: ['plants'] });
        queryClient.invalidateQueries({ queryKey: ['assets'] });
        queryClient.invalidateQueries({ queryKey: ['asset'] });
        queryClient.invalidateQueries({ queryKey: ['transfers'] });
    };

    const createMutation = useMutation({
        mutationFn: plantService.create,
        onSuccess: invalidateRelatedQueries,
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<Plant> }) => plantService.update(id, data),
        onSuccess: invalidateRelatedQueries,
    });

    const deleteMutation = useMutation({
        mutationFn: plantService.delete,
        onSuccess: invalidateRelatedQueries,
    });

    const plants = facilitiesResponse?.facilities ?? [];
    const summary = facilitiesResponse?.summary;

    const stats = useMemo(
        () => ({
            total: summary?.totalFacilities ?? plants.length,
            totalMachines: summary?.totalMachines ?? 0,
            unassignedMachines: summary?.unassignedMachines ?? 0,
        }),
        [plants.length, summary]
    );

    const handleSearch = () => setSearch(normalizeSearchTerm(searchInput));

    const handleReset = () => {
        setSearch('');
        setSearchInput('');
    };

    const handleOpenCreate = () => {
        setEditingPlant(null);
        setIsModalOpen(true);
    };

    const handleOpenEdit = (plant: Plant) => {
        setEditingPlant(plant);
        setIsModalOpen(true);
    };

    const handleDelete = async (id: string) => {
        await deleteMutation.mutateAsync(id);
        message.success('Đã xóa cơ sở');
    };

    const handleSubmit = async (values: { name: string; code: string; address?: string; phone?: string }) => {
        if (editingPlant) {
            await updateMutation.mutateAsync({ id: editingPlant.id, data: values });
            return;
        }

        await createMutation.mutateAsync(values);
    };

    const columns: TableColumnsType<Plant> = [
        {
            title: 'CƠ SỞ',
            dataIndex: 'name',
            key: 'name',
            render: (value: string, record) => (
                <div className='flex flex-col gap-0.5'>
                    <span className='text-[14px] font-semibold text-slate-800'>{value}</span>
                    <span className='font-mono text-xs font-medium text-slate-500'>{record.code}</span>
                </div>
            ),
        },
        {
            title: 'ĐỊA CHỈ',
            dataIndex: 'address',
            key: 'address',
            render: (value?: string) => (
                <div className='flex items-start gap-2 text-slate-600'>
                    <EnvironmentOutlined className='mt-0.5 text-slate-400' />
                    <span>{value || '-'}</span>
                </div>
            ),
        },
        {
            title: 'LIÊN HỆ',
            dataIndex: 'phone',
            key: 'phone',
            width: 150,
            render: (value?: string) => <span className='text-slate-600'>{value || '-'}</span>,
        },
        {
            title: 'MÁY ĐANG QUẢN LÝ',
            dataIndex: 'machineCount',
            key: 'machineCount',
            width: 170,
            render: (_value, record) => (
                <span className='inline-flex min-w-14 items-center justify-center rounded-lg bg-blue-50 px-3 py-1.5 text-sm font-bold text-blue-700'>
                    {record.machineCount ?? record.assetCount ?? 0}
                </span>
            ),
        },
        {
            title: 'NGÀY TẠO',
            dataIndex: 'createdAt',
            key: 'createdAt',
            width: 140,
            render: (value: string) => <span className='text-slate-600'>{dayjs(value).format('DD/MM/YYYY')}</span>,
        },
    ];

    if (canManagePlants) {
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
                        title='Xóa cơ sở'
                        description={`Cơ sở “${record.name}” sẽ bị xóa mềm khỏi hệ thống.`}
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
                title='Quản Lý Cơ Sở'
                subtitle='Danh mục cơ sở dùng chung cho máy, điều chuyển và các luồng vận hành trong toàn hệ thống.'
                actions={
                    canManagePlants ? (
                        <Button
                            type='primary'
                            icon={<PlusOutlined />}
                            onClick={handleOpenCreate}
                            className='rounded-lg border-none bg-blue-600 font-medium shadow-sm hover:bg-blue-700'
                        >
                            Thêm cơ sở
                        </Button>
                    ) : undefined
                }
            />

            <div className='grid grid-cols-1 gap-4 sm:grid-cols-3'>
                <StatsCard title='Tổng cơ sở' value={stats.total} icon={<ClusterOutlined />} accent='#1f7ae0' />
                <StatsCard title='Tổng máy' value={stats.totalMachines} icon={<ClusterOutlined />} accent='#22a06b' />
                <StatsCard title='Chưa gán cơ sở' value={stats.unassignedMachines} icon={<EnvironmentOutlined />} accent='#7c3aed' />
            </div>

            <div className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm'>
                <div className='flex flex-col gap-4 lg:flex-row'>
                    <div className='flex-1'>
                        <Input
                            prefix={<SearchOutlined className='text-slate-400' />}
                            placeholder='Tìm theo tên cơ sở, mã cơ sở hoặc địa chỉ...'
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
                    <Table<Plant>
                        rowKey='id'
                        columns={columns}
                        dataSource={plants}
                        loading={isLoading}
                        pagination={{
                            pageSize: 10,
                            showSizeChanger: false,
                            showTotal: (total) => (
                                <span className='font-medium text-slate-500'>Tổng số {total} cơ sở</span>
                            ),
                            className: '!m-0 border-t border-slate-100 !px-5 !py-4',
                        }}
                        scroll={{ x: 980 }}
                    />
                </div>
            </div>

            {isModalOpen ? (
                <LazyBoundary mode='overlay'>
                    <PlantFormModal
                        open={isModalOpen}
                        onClose={() => setIsModalOpen(false)}
                        onSubmit={handleSubmit}
                        initialValues={editingPlant}
                        plants={allPlants}
                    />
                </LazyBoundary>
            ) : null}
        </div>
    );
};

export default PlantList;
