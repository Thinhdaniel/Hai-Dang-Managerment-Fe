import React, { useState } from 'react';
import { App, Button, Card, Empty, Segmented, Spin, Tag } from 'antd';
import { ArrowRightOutlined, BulbOutlined, ReloadOutlined, RobotOutlined, WarningFilled } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { digestService, type DigestPeriod } from '../../core/services/digest.service';

const DashboardDigestCard: React.FC = () => {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const [period, setPeriod] = useState<DigestPeriod>('week');

    const { data: digest, isLoading } = useQuery({
        queryKey: ['digest', 'latest', period],
        queryFn: () => digestService.getLatest(period),
        staleTime: 60_000,
    });

    const generateMut = useMutation({
        mutationFn: () => digestService.generate(period),
        onSuccess: (doc) => {
            queryClient.setQueryData(['digest', 'latest', period], doc);
            message.success('Đã tạo bản tin mới');
        },
        onError: () => message.error('Không tạo được bản tin. Thử lại sau.'),
    });

    return (
        <Card
            className='rounded-2xl'
            styles={{ body: { padding: 18 } }}
            title={
                <div className='flex items-center gap-2'>
                    <span className='flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white'>
                        <RobotOutlined />
                    </span>
                    <span className='font-bold text-slate-900'>Bản tin điều hành</span>
                </div>
            }
            extra={
                <div className='flex items-center gap-2'>
                    <Segmented
                        size='small'
                        value={period}
                        onChange={(v) => setPeriod(v as DigestPeriod)}
                        options={[
                            { label: 'Tuần', value: 'week' },
                            { label: 'Tháng', value: 'month' },
                        ]}
                    />
                    <Button
                        size='small'
                        icon={<ReloadOutlined />}
                        loading={generateMut.isPending}
                        onClick={() => generateMut.mutate()}
                    >
                        {digest ? 'Làm mới' : 'Tạo'}
                    </Button>
                    <Button
                        size='small'
                        type='text'
                        icon={<ArrowRightOutlined />}
                        aria-label='Mở bản tin điều hành'
                        onClick={() =>
                            navigate(
                                `/executive-digests${digest?._id ? `?digest=${encodeURIComponent(digest._id)}` : ''}`
                            )
                        }
                    />
                </div>
            }
        >
            {isLoading ? (
                <div className='flex h-32 items-center justify-center'>
                    <Spin />
                </div>
            ) : !digest ? (
                <div className='py-6'>
                    <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={`Chưa có bản tin ${period === 'week' ? 'tuần' : 'tháng'} này`}
                    >
                        <Button type='primary' loading={generateMut.isPending} onClick={() => generateMut.mutate()}>
                            Tạo bản tin
                        </Button>
                    </Empty>
                </div>
            ) : (
                <div className='space-y-3'>
                    <div className='flex items-center gap-2'>
                        <Tag color='blue' className='!m-0'>
                            {digest.periodLabel}
                        </Tag>
                        <Tag
                            color={
                                digest.status === 'published' ? 'green' : digest.status === 'approved' ? 'blue' : 'gold'
                            }
                            className='!m-0'
                        >
                            {digest.status === 'published'
                                ? 'Đã xuất bản'
                                : digest.status === 'approved'
                                  ? 'Đã duyệt'
                                  : 'Bản nháp'}
                        </Tag>
                        {generateMut.isPending ? <Spin size='small' /> : null}
                    </div>

                    <p className='m-0 text-[13.5px] leading-relaxed whitespace-pre-wrap text-slate-700'>
                        {digest.narrative}
                    </p>

                    {digest.highlights?.length ? (
                        <div className='space-y-1'>
                            {digest.highlights.map((h, i) => (
                                <div key={i} className='flex items-start gap-2 text-[13px] text-slate-600'>
                                    <span className='mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500' />
                                    {h}
                                </div>
                            ))}
                        </div>
                    ) : null}

                    {digest.alerts?.length ? (
                        <div className='rounded-xl border border-rose-100 bg-rose-50 px-3 py-2'>
                            {digest.alerts.map((a, i) => (
                                <div key={i} className='flex items-start gap-2 text-[13px] text-rose-700'>
                                    <WarningFilled className='mt-0.5 shrink-0' />
                                    {a}
                                </div>
                            ))}
                        </div>
                    ) : null}

                    {digest.recommendations?.length ? (
                        <div className='rounded-xl border border-amber-100 bg-amber-50 px-3 py-2'>
                            {digest.recommendations.map((r, i) => (
                                <div key={i} className='flex items-start gap-2 text-[13px] text-amber-800'>
                                    <BulbOutlined className='mt-0.5 shrink-0' />
                                    {r}
                                </div>
                            ))}
                        </div>
                    ) : null}

                    {digest.model ? (
                        <div className='text-right text-[10.5px] text-slate-400'>
                            🤖 {digest.provider === 'fallback' ? 'số liệu (AI tạm nghỉ)' : digest.model}
                            {digest.createdAt ? ` · ${new Date(digest.createdAt).toLocaleString('vi-VN')}` : ''}
                        </div>
                    ) : null}
                </div>
            )}
        </Card>
    );
};

export default DashboardDigestCard;
