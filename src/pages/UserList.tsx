import React, { lazy, useEffect, useMemo, useState } from 'react';
import { App, Avatar, Button, Input, Select, Table, Typography, type TableColumnsType } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import LazyBoundary from '../components/shared/LazyBoundary';
import PageHeader from '../components/shared/PageHeader';
import { USER_ROLE_LABEL } from '../core/constants';
import { useAuth } from '../core/contexts/AuthContext';
import { hasManagerAccess, isAdmin } from '../core/lib/permissions';
import { normalizeSearchTerm } from '../core/lib/search';
import { plantService, userService, type UserListApiResponse } from '../core/services';
import type { CreateUserPayload, PaginatedResponse, UpdateUserPayload, User, UserListParams } from '../core/types';

const UserFormModal = lazy(() => import('../components/UserFormModal'));

const { Text } = Typography;

// OKLCH role pills
const ROLE_PILL: Record<User['role'], { bg: string; text: string; label: string }> = {
    admin:   { bg: 'oklch(0.96 0.04 25)',  text: 'oklch(0.36 0.18 25)',  label: USER_ROLE_LABEL.admin },
    manager: { bg: 'oklch(0.95 0.05 255)', text: 'oklch(0.36 0.16 255)', label: USER_ROLE_LABEL.manager },
    staff:   { bg: 'oklch(0.96 0.04 145)', text: 'oklch(0.32 0.14 145)', label: USER_ROLE_LABEL.staff },
};

const PAGE_ANIM = `
@keyframes ul-up{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.ul-h{animation:ul-up .28s cubic-bezier(.22,1,.36,1) .04s both}
.ul-s{animation:ul-up .30s cubic-bezier(.22,1,.36,1) .12s both}
.ul-f{animation:ul-up .30s cubic-bezier(.22,1,.36,1) .18s both}
.ul-t{animation:ul-up .32s cubic-bezier(.22,1,.36,1) .24s both}
.ul-stat{transition:background-color 130ms cubic-bezier(.22,1,.36,1)}
.ul-stat:hover{background-color:oklch(0.975 0.005 250)}
@media(prefers-reduced-motion:reduce){.ul-h,.ul-s,.ul-f,.ul-t{animation:none}.ul-stat{transition:none}}
`;

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const SEARCH_DEBOUNCE_MS = 400;

type NormalizedUserListResponse = PaginatedResponse<User> & {
    statsSource: User[];
};

const createDefaultFilters = (): UserListParams => ({
    search: '',
    role: undefined,
    isActive: undefined,
    plantId: undefined,
});

const normalizePositiveNumber = (value: number | undefined, fallback: number) => {
    if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) {
        return fallback;
    }

    return value;
};

const normalizeUserListResponse = (
    response: UserListApiResponse,
    params: Pick<UserListParams, 'page' | 'limit'>
): NormalizedUserListResponse => {
    const page = normalizePositiveNumber(params.page, DEFAULT_PAGE);
    const limit = normalizePositiveNumber(params.limit, DEFAULT_LIMIT);

    if (Array.isArray(response)) {
        const total = response.length;
        const totalPages = total > 0 ? Math.ceil(total / limit) : 1;
        const safePage = Math.min(page, totalPages);
        const startIndex = (safePage - 1) * limit;

        return {
            data: response.slice(startIndex, startIndex + limit),
            total,
            page: safePage,
            limit,
            totalPages,
            statsSource: response,
        };
    }

    return {
        ...response,
        statsSource: response.data,
    };
};

const resolveErrorMessage = (error: unknown, fallbackMessage: string) => {
    if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
        return error.message;
    }

    return fallbackMessage;
};

const UserList: React.FC = () => {
    const queryClient = useQueryClient();
    const { message, modal } = App.useApp();
    const { role, user, setUser } = useAuth();
    const canViewUsers = hasManagerAccess(role);
    const canManageUsers = isAdmin(role);

    const [filters, setFilters] = useState<UserListParams>(() => createDefaultFilters());
    const [draftFilters, setDraftFilters] = useState<UserListParams>(() => createDefaultFilters());
    const [pagination, setPagination] = useState({ page: DEFAULT_PAGE, limit: DEFAULT_LIMIT });
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

    const queryParams = useMemo(
        () => ({
            ...filters,
            page: pagination.page,
            limit: pagination.limit,
        }),
        [filters, pagination.limit, pagination.page]
    );

    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            const normalizedSearch = normalizeSearchTerm(draftFilters.search);

            setPagination((current) =>
                current.page === DEFAULT_PAGE ? current : { ...current, page: DEFAULT_PAGE }
            );
            setFilters((current) =>
                current.search === normalizedSearch
                    ? current
                    : {
                          ...current,
                          search: normalizedSearch,
                      }
            );
        }, SEARCH_DEBOUNCE_MS);

        return () => window.clearTimeout(timeoutId);
    }, [draftFilters.search]);

    const { data: plants = [] } = useQuery({
        queryKey: ['plants'],
        queryFn: () => plantService.getAll(),
        enabled: canViewUsers,
    });

    const { data: userResponse, isLoading, isFetching } = useQuery({
        queryKey: ['users', queryParams],
        queryFn: async () => normalizeUserListResponse(await userService.getAll(queryParams), queryParams),
        enabled: canViewUsers,
        placeholderData: (previousData) => previousData,
    });

    const users = useMemo(() => userResponse?.data ?? [], [userResponse?.data]);

    const createUserMutation = useMutation({
        mutationFn: userService.create,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
        },
    });

    const updateUserMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: UpdateUserPayload }) => userService.update(id, data),
        onSuccess: (updatedUser, variables) => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
            if (user?.id === variables.id) {
                setUser(updatedUser);
            }
        },
    });

    const deleteUserMutation = useMutation({
        mutationFn: userService.delete,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
        },
    });

    const stats = useMemo(
        () =>
            (userResponse?.statsSource ?? []).reduce(
                (summary, userItem) => {
                    summary.total += 1;
                    summary[userItem.role] += 1;
                    return summary;
                },
                {
                    total: 0,
                    admin: 0,
                    manager: 0,
                    staff: 0,
                }
            ),
        [userResponse?.statsSource]
    );

    const handleApplyFilters = () => {
        setPagination((current) => ({ ...current, page: DEFAULT_PAGE }));
        setFilters({
            search: normalizeSearchTerm(draftFilters.search),
            role: draftFilters.role,
            isActive: draftFilters.isActive,
            plantId: draftFilters.plantId,
        });
    };

    const handleResetFilters = () => {
        const nextFilters = createDefaultFilters();
        setPagination({ page: DEFAULT_PAGE, limit: DEFAULT_LIMIT });
        setDraftFilters(nextFilters);
        setFilters(nextFilters);
    };

    const handleCreateUser = async (payload: CreateUserPayload) => {
        try {
            await createUserMutation.mutateAsync(payload);
            message.success('Tạo người dùng thành công');
            setIsCreateModalOpen(false);
        } catch (error) {
            message.error(resolveErrorMessage(error, 'Không thể tạo người dùng. Vui lòng thử lại.'));
        }
    };

    const handleOpenEdit = (selectedUser: User) => {
        setEditingUser(selectedUser);
    };

    const handleUpdateUser = async (payload: UpdateUserPayload) => {
        if (!editingUser) {
            return;
        }

        try {
            await updateUserMutation.mutateAsync({
                id: editingUser.id,
                data: payload,
            });
            message.success('Cập nhật người dùng thành công');
            setEditingUser(null);
        } catch (error) {
            message.error(resolveErrorMessage(error, 'Không thể cập nhật người dùng. Vui lòng thử lại.'));
        }
    };

    const handleDeleteUser = async (selectedUser: User) => {
        if (user?.id === selectedUser.id) {
            message.warning('Bạn không thể tự xóa tài khoản của chính mình.');
            return;
        }

        setDeletingUserId(selectedUser.id);

        try {
            await deleteUserMutation.mutateAsync(selectedUser.id);
            message.success('Xóa người dùng thành công');
        } catch (error) {
            message.error(resolveErrorMessage(error, 'Không thể xóa người dùng. Vui lòng thử lại.'));
            throw error;
        } finally {
            setDeletingUserId(null);
        }
    };

    const handleOpenDeleteConfirm = (selectedUser: User) => {
        if (user?.id === selectedUser.id) {
            message.warning('Bạn không thể tự xóa tài khoản của chính mình.');
            return;
        }

        modal.confirm({
            title: 'Xác nhận xóa người dùng',
            content: 'Are you sure you want to delete this user?',
            okText: 'Xóa người dùng',
            cancelText: 'Hủy',
            okButtonProps: { danger: true },
            centered: true,
            onOk: () => handleDeleteUser(selectedUser),
        });
    };

    if (!canViewUsers) {
        return <Navigate to='/dashboard' replace />;
    }

    const columns: TableColumnsType<User> = [
        {
            title: 'NGƯỜI DÙNG',
            key: 'user',
            render: (_value, record) => (
                <div className='flex items-center gap-3'>
                    <Avatar size='large' style={{ backgroundColor: record.isActive ? '#1f7ae0' : '#d9d9d9' }}>
                        {(record.name || record.email).charAt(0).toUpperCase()}
                    </Avatar>
                    <div className='min-w-0'>
                        <Text strong className='block truncate text-slate-800'>
                            {record.name}
                        </Text>
                        <Text type='secondary' className='block truncate text-xs'>
                            {record.email}
                        </Text>
                    </div>
                </div>
            ),
        },
        {
            title: 'CƠ SỞ',
            key: 'plant',
            render: (_value, record) => <Text>{record.plant?.name || '-'}</Text>,
        },
        {
            title: 'PHÂN QUYỀN',
            dataIndex: 'role',
            key: 'role',
            width: 140,
            render: (userRole: User['role']) => {
                const p = ROLE_PILL[userRole];
                return (
                    <span
                        className='inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold'
                        style={{ background: p.bg, color: p.text }}
                    >
                        {p.label}
                    </span>
                );
            },
        },
        {
            title: 'TRẠNG THÁI',
            dataIndex: 'isActive',
            key: 'isActive',
            width: 140,
            render: (isActive: boolean) => (
                <span
                    className='inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold'
                    style={isActive
                        ? { background: 'oklch(0.96 0.04 145)', color: 'oklch(0.32 0.14 145)' }
                        : { background: 'oklch(0.96 0.01 250)', color: 'oklch(0.52 0.04 250)' }}
                >
                    <span
                        className='h-1.5 w-1.5 rounded-full flex-shrink-0'
                        style={{ background: isActive ? 'oklch(0.52 0.18 145)' : 'oklch(0.64 0.04 250)' }}
                    />
                    {isActive ? 'Hoạt động' : 'Ngưng'}
                </span>
            ),
        },
    ];

    if (canManageUsers) {
        columns.push({
            title: 'HÀNH ĐỘNG',
            key: 'action',
            width: 200,
            align: 'right',
            render: (_value, record) => {
                const isCurrentUser = user?.id === record.id;

                return (
                    <div className='flex justify-end gap-1'>
                        <Button
                            type='text'
                            icon={<EditOutlined />}
                            onClick={() => handleOpenEdit(record)}
                            className='rounded-md text-blue-600 hover:!bg-blue-50 hover:!text-blue-700'
                        >
                            Sửa
                        </Button>
                        <Button
                            type='text'
                            danger
                            icon={<DeleteOutlined />}
                            disabled={isCurrentUser}
                            loading={deletingUserId === record.id}
                            onClick={() => handleOpenDeleteConfirm(record)}
                            className='rounded-md'
                            title={isCurrentUser ? 'Không thể xóa tài khoản của chính bạn' : undefined}
                        >
                            Xóa
                        </Button>
                    </div>
                );
            },
        });
    }

    return (
        <div className='flex w-full max-w-full flex-col gap-6 overflow-hidden'>
            <style>{PAGE_ANIM}</style>

            {/* Page header */}
            <div className='ul-h'>
                <PageHeader
                    title='Người Dùng Hệ Thống'
                    subtitle='Quản lý tài khoản, vai trò và trạng thái truy cập'
                    actions={
                        canManageUsers ? (
                            <Button
                                type='primary'
                                icon={<PlusOutlined />}
                                onClick={() => setIsCreateModalOpen(true)}
                                className='rounded-lg bg-blue-600 hover:!bg-blue-700'
                            >
                                Thêm người dùng
                            </Button>
                        ) : undefined
                    }
                />
            </div>

            {/* Stats count strip */}
            <div className='ul-s flex flex-wrap gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200'>
                {[
                    { label: 'Tổng tài khoản', value: stats.total, accent: 'oklch(0.18 0.012 250)' },
                    { label: 'Quản trị viên', value: stats.admin,   accent: 'oklch(0.44 0.16 25)'  },
                    { label: 'Quản lý',         value: stats.manager, accent: 'oklch(0.44 0.14 255)' },
                    { label: 'Nhân viên',        value: stats.staff,   accent: 'oklch(0.42 0.14 145)' },
                ].map(({ label, value, accent }) => (
                    <div key={label} className='ul-stat flex min-w-[110px] flex-1 flex-col gap-0.5 bg-white px-6 py-4'>
                        <span className='text-[11px] font-medium text-slate-400'>{label}</span>
                        <span className='text-base font-bold' style={{ color: accent }}>{value}</span>
                    </div>
                ))}
            </div>

            {/* Filter bar — no card wrapper */}
            <div className='ul-f flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center'>
                <div className='flex-1 min-w-[200px]'>
                    <Input
                        allowClear
                        prefix={<SearchOutlined className='text-slate-400' />}
                        placeholder='Tên hoặc email...'
                        value={draftFilters.search}
                        onChange={(event) =>
                            setDraftFilters((current) => ({ ...current, search: event.target.value }))
                        }
                        onPressEnter={handleApplyFilters}
                        className='rounded-lg'
                    />
                </div>
                <Select
                    placeholder='Vai trò'
                    className='min-w-[130px]'
                    allowClear
                    value={draftFilters.role}
                    onChange={(value) => setDraftFilters((current) => ({ ...current, role: value }))}
                    options={[
                        { value: 'admin',   label: USER_ROLE_LABEL.admin },
                        { value: 'manager', label: USER_ROLE_LABEL.manager },
                        { value: 'staff',   label: USER_ROLE_LABEL.staff },
                    ]}
                />
                <Select
                    placeholder='Cơ sở'
                    className='min-w-[160px]'
                    allowClear
                    value={draftFilters.plantId}
                    onChange={(value) => setDraftFilters((current) => ({ ...current, plantId: value }))}
                    options={plants.map((plant) => ({
                        value: plant.id,
                        label: plant.name,
                    }))}
                />
                <Select
                    placeholder='Trạng thái'
                    className='min-w-[140px]'
                    allowClear
                    value={draftFilters.isActive}
                    onChange={(value) => setDraftFilters((current) => ({ ...current, isActive: value }))}
                    options={[
                        { value: true,  label: 'Hoạt động' },
                        { value: false, label: 'Ngừng hoạt động' },
                    ]}
                />
                <div className='flex gap-2'>
                    <Button type='primary' onClick={handleApplyFilters} className='rounded-lg bg-blue-600 hover:!bg-blue-700'>
                        Lọc
                    </Button>
                    <Button icon={<ReloadOutlined />} onClick={handleResetFilters} className='rounded-lg text-slate-500'>
                        Làm mới
                    </Button>
                </div>
            </div>

            {/* Table — no card wrapper */}
            <div className='ul-t overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm'>
                <div className='[&_.ant-table]:!bg-white [&_.ant-table-row:hover_td]:!bg-blue-50/30 [&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!text-[11px] [&_.ant-table-thead_th]:!font-bold [&_.ant-table-thead_th]:!tracking-[0.07em] [&_.ant-table-thead_th]:!text-slate-400 [&_.ant-table-cell]:!transition-colors [&_.ant-table-cell]:!duration-100'>
                    <Table<User>
                        rowKey='id'
                        columns={columns}
                        dataSource={users}
                        loading={isLoading || isFetching}
                        size='small'
                        pagination={{
                            current: userResponse?.page ?? pagination.page,
                            pageSize: userResponse?.limit ?? pagination.limit,
                            total: userResponse?.total ?? 0,
                            showSizeChanger: true,
                            showTotal: (total, range) => (
                                <span className='text-sm text-slate-400'>
                                    {total > 0 ? `${range[0]}–${range[1]} / ${total} người dùng` : 'Không có kết quả'}
                                </span>
                            ),
                            onChange: (page, pageSize) => setPagination({ page, limit: pageSize }),
                            className: '!m-0 border-t border-slate-100 !px-5 !py-3',
                        }}
                        scroll={{ x: 760 }}
                    />
                </div>
            </div>

            {canManageUsers && isCreateModalOpen ? (
                <LazyBoundary mode='overlay'>
                    <UserFormModal
                        mode='create'
                        open={isCreateModalOpen}
                        plants={plants}
                        submitting={createUserMutation.isPending}
                        onClose={() => setIsCreateModalOpen(false)}
                        onSubmit={handleCreateUser}
                    />
                </LazyBoundary>
            ) : null}

            {canManageUsers && editingUser ? (
                <LazyBoundary mode='overlay'>
                    <UserFormModal
                        mode='edit'
                        open={Boolean(editingUser)}
                        initialValues={editingUser}
                        plants={plants}
                        isCurrentUser={user?.id === editingUser.id}
                        submitting={updateUserMutation.isPending}
                        onClose={() => setEditingUser(null)}
                        onSubmit={handleUpdateUser}
                    />
                </LazyBoundary>
            ) : null}
        </div>
    );
};

export default UserList;
