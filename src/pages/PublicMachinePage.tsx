import React from 'react';
import { Card, Result, Skeleton, Tag } from 'antd';
import {
    BarcodeOutlined,
    BuildOutlined,
    EnvironmentOutlined,
    QrcodeOutlined,
    SafetyCertificateOutlined,
} from '@ant-design/icons';
import { useParams } from 'react-router-dom';
import { usePublicMachine } from '../core/hooks/usePublicMachine';
import type { AssetStatus } from '../core/types';

const statusMeta: Record<AssetStatus, { label: string; className: string }> = {
    active: { label: 'Hoạt động', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
    maintenance: { label: 'Bảo trì', className: 'border-amber-200 bg-amber-50 text-amber-700' },
    broken: { label: 'Hỏng', className: 'border-rose-200 bg-rose-50 text-rose-700' },
    borrowing: { label: 'Đang mượn', className: 'border-indigo-200 bg-indigo-50 text-indigo-700' },
    storage: { label: 'Lưu kho', className: 'border-slate-200 bg-slate-100 text-slate-700' },
    returned_to_partner: { label: 'Đã trả đối tác', className: 'border-slate-200 bg-slate-100 text-slate-600' },
};

const PublicMachinePage: React.FC = () => {
    const { publicId = '' } = useParams();
    const { data, isLoading, isError, error } = usePublicMachine(publicId);

    if (isLoading) {
        return (
            <div className='min-h-screen bg-[#f4f7f9] px-4 py-6 sm:px-6'>
                <div className='mx-auto flex w-full max-w-md flex-col gap-4'>
                    <Skeleton active paragraph={{ rows: 8 }} className='rounded-3xl bg-white p-6 shadow-sm' />
                </div>
            </div>
        );
    }

    if (isError || !data) {
        const message =
            typeof error === 'object' && error && 'message' in error && typeof error.message === 'string'
                ? error.message
                : 'Không tìm thấy máy cho mã QR này.';

        return (
            <div className='min-h-screen bg-[#f4f7f9] px-4 py-6 sm:px-6'>
                <div className='mx-auto w-full max-w-md'>
                    <Card className='overflow-hidden rounded-3xl border-slate-200 shadow-sm'>
                        <Result status='404' title='Không tìm thấy thiết bị' subTitle={message} />
                    </Card>
                </div>
            </div>
        );
    }

    const status = statusMeta[data.status];

    return (
        <div className='min-h-screen bg-[#f4f7f9] selection:bg-blue-100'>
            {/* ── HEADER CÔNG TY ── */}
            <div className='sticky top-0 z-10 border-b border-slate-200 bg-white/90 px-4 py-3 shadow-sm backdrop-blur-md sm:px-6'>
                <div className='mx-auto flex max-w-md items-center gap-3'>
                    <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white shadow-sm'>
                        <img
                            src='https://res.cloudinary.com/dn0kgs7mi/image/upload/v1777042068/461879796_122098397930558026_2620600354798656289_n_zi0tf9.jpg'
                            alt='Hải Đăng Logo'
                            className='h-8 w-8 rounded-md object-cover'
                        />
                    </div>
                    <div className='flex flex-col'>
                        <span className='text-[10px] font-bold tracking-wider text-slate-500 uppercase'>
                            Công ty TNHH May Xuất Khẩu
                        </span>
                        <span className='text-sm font-black tracking-wide text-blue-700 uppercase'>Hải Đăng</span>
                    </div>
                </div>
            </div>

            {/* ── NỘI DUNG CHÍNH ── */}
            <div className='px-4 py-6 sm:px-6 sm:py-8'>
                <div className='mx-auto flex w-full max-w-md flex-col gap-6'>
                    <div className='overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm'>
                        {/* Box Tên Máy & Trạng Thái */}
                        <div className='border-b border-slate-100 p-6'>
                            <div className='mb-4 flex items-start justify-between gap-4'>
                                <div className='flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5'>
                                    <QrcodeOutlined className='text-blue-600' />
                                    <span className='text-[10px] font-bold tracking-wider text-blue-700 uppercase'>
                                        Thông tin thiết bị
                                    </span>
                                </div>
                                <Tag
                                    className={`m-0 rounded-full border px-3 py-1 text-sm font-bold ${status.className}`}
                                >
                                    {status.label}
                                </Tag>
                            </div>
                            <h1 className='mb-2 text-2xl leading-snug font-extrabold text-slate-900'>{data.name}</h1>
                            <p className='font-mono text-sm font-medium text-slate-500'>ID: {data.publicId}</p>
                        </div>

                        {/* Danh sách thông số */}
                        <div className='flex flex-col'>
                            {/* Mã máy */}
                            <div className='flex items-center gap-4 border-b border-slate-100 p-5 transition-colors hover:bg-slate-50'>
                                <div className='flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600'>
                                    <BarcodeOutlined className='text-xl' />
                                </div>
                                <div className='flex flex-col'>
                                    <span className='text-[11px] font-bold tracking-wider text-slate-500 uppercase'>
                                        Mã máy
                                    </span>
                                    <span className='font-mono text-base font-bold text-slate-900'>
                                        {data.machineCode || '-'}
                                    </span>
                                </div>
                            </div>

                            {/* Serial Number */}
                            <div className='flex items-center gap-4 border-b border-slate-100 p-5 transition-colors hover:bg-slate-50'>
                                <div className='flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-600'>
                                    <SafetyCertificateOutlined className='text-xl' />
                                </div>
                                <div className='flex flex-col'>
                                    <span className='text-[11px] font-bold tracking-wider text-slate-500 uppercase'>
                                        Serial Number
                                    </span>
                                    <span className='font-mono text-base font-medium text-slate-800'>
                                        {data.serialNumber || '-'}
                                    </span>
                                </div>
                            </div>

                            {/* Model */}
                            <div className='flex items-center gap-4 border-b border-slate-100 p-5 transition-colors hover:bg-slate-50'>
                                <div className='flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-600'>
                                    <BuildOutlined className='text-xl' />
                                </div>
                                <div className='flex flex-col'>
                                    <span className='text-[11px] font-bold tracking-wider text-slate-500 uppercase'>
                                        Model
                                    </span>
                                    <span className='text-base font-medium text-slate-800'>{data.model || '-'}</span>
                                </div>
                            </div>

                            {/* Vị trí */}
                            <div className='flex items-center gap-4 p-5 transition-colors hover:bg-slate-50'>
                                <div className='flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600'>
                                    <EnvironmentOutlined className='text-xl' />
                                </div>
                                <div className='flex flex-col'>
                                    <span className='text-[11px] font-bold tracking-wider text-slate-500 uppercase'>
                                        Vị trí / Cơ sở
                                    </span>
                                    <span className='text-base font-medium text-slate-800'>
                                        {data.facility?.name || 'Chưa gán'}
                                    </span>
                                    {data.facility?.code && (
                                        <span className='text-sm text-slate-500'>Mã cơ sở: {data.facility.code}</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className='mt-2 text-center'>
                        <p className='text-xs font-medium text-slate-400'>Hệ thống Quản lý Thiết bị & Tài sản</p>
                        <p className='mt-1 text-[10px] font-bold tracking-widest text-slate-400 uppercase'>
                            Hải Đăng Garment © 2026
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PublicMachinePage;
