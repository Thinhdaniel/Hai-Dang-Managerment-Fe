import React, { useEffect, useState } from 'react';
import { Alert, App, Button, Drawer, Empty, Spin, Tag, Typography } from 'antd';
import { CheckCircleOutlined, ReloadOutlined, ThunderboltOutlined, WarningOutlined } from '@ant-design/icons';
import {
    aiChatSummaryService,
    type AiChatSummaryActionItem,
    type AiChatSummaryResponse,
} from '../../core/services/ai-help.service';

const { Text, Title } = Typography;

type ChatAiSummaryDrawerProps = {
    open: boolean;
    conversationId?: string | null;
    title?: string;
    onClose: () => void;
};

const providerLabel = (provider?: string) => {
    if (!provider || provider === 'fallback') return 'Fallback nội bộ';
    if (provider === '9router') return '9Router';
    if (provider === 'openrouter') return 'OpenRouter';
    if (provider === 'ollama') return 'Ollama local';
    return provider;
};

const priorityMeta: Record<NonNullable<AiChatSummaryActionItem['priority']>, { label: string; color: string }> = {
    low: { label: 'Thấp', color: 'default' },
    medium: { label: 'Vừa', color: 'blue' },
    high: { label: 'Cao', color: 'red' },
};

const SummaryList = ({ title, items }: { title: string; items: string[] }) => {
    if (!items.length) return null;

    return (
        <section className='rounded-2xl border border-slate-100 bg-white p-4 shadow-sm'>
            <div className='mb-3 text-[12px] font-black tracking-wide text-slate-500 uppercase'>{title}</div>
            <div className='space-y-2'>
                {items.map((item, index) => (
                    <div key={`${title}-${index}`} className='flex gap-2 text-[13px] leading-5 text-slate-700'>
                        <CheckCircleOutlined className='mt-1 shrink-0 text-blue-500' />
                        <span>{item}</span>
                    </div>
                ))}
            </div>
        </section>
    );
};

const ActionItems = ({ items }: { items: AiChatSummaryActionItem[] }) => {
    if (!items.length) return null;

    return (
        <section className='rounded-2xl border border-blue-100 bg-blue-50/50 p-4 shadow-sm'>
            <div className='mb-3 text-[12px] font-black tracking-wide text-blue-700 uppercase'>Việc cần làm</div>
            <div className='space-y-3'>
                {items.map((item, index) => {
                    const priority = item.priority ? priorityMeta[item.priority] : undefined;
                    return (
                        <div key={`${item.task}-${index}`} className='rounded-xl border border-white bg-white p-3'>
                            <div className='text-[13px] leading-5 font-bold text-slate-900'>{item.task}</div>
                            <div className='mt-2 flex flex-wrap gap-2'>
                                {item.owner ? <Tag className='!m-0'>Phụ trách: {item.owner}</Tag> : null}
                                {item.dueDate ? <Tag className='!m-0'>Hạn: {item.dueDate}</Tag> : null}
                                {priority ? (
                                    <Tag color={priority.color} className='!m-0'>
                                        {priority.label}
                                    </Tag>
                                ) : null}
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
};

const ChatAiSummaryDrawer: React.FC<ChatAiSummaryDrawerProps> = ({ open, conversationId, title, onClose }) => {
    const { message } = App.useApp();
    const [loading, setLoading] = useState(false);
    const [summary, setSummary] = useState<AiChatSummaryResponse | null>(null);

    const loadSummary = React.useCallback(async () => {
        if (!conversationId) return;
        setLoading(true);
        try {
            const result = await aiChatSummaryService.summarize(conversationId, 80);
            setSummary(result);
        } catch (error: any) {
            message.error(error?.message || 'Không tóm tắt được hội thoại');
        } finally {
            setLoading(false);
        }
    }, [conversationId, message]);

    useEffect(() => {
        if (!open) return;
        setSummary(null);
        void loadSummary();
    }, [loadSummary, open]);

    return (
        <Drawer
            open={open}
            onClose={onClose}
            width={460}
            placement='right'
            title={null}
            destroyOnHidden
            styles={{ body: { padding: 0 } }}
        >
            <div className='flex h-full flex-col bg-slate-50'>
                <div className='border-b border-slate-200 bg-white p-5'>
                    <div className='flex items-start justify-between gap-3'>
                        <div className='min-w-0'>
                            <div className='mb-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-[11px] font-black tracking-wide text-blue-700 uppercase'>
                                <ThunderboltOutlined /> AI Summary
                            </div>
                            <Title level={4} className='!m-0 !text-[18px] !font-black !text-slate-950'>
                                {title || summary?.conversationTitle || 'Tóm tắt hội thoại'}
                            </Title>
                            <Text className='mt-1 block text-xs font-semibold text-slate-500'>
                                {summary
                                    ? `${summary.messageCount} tin nhắn gần nhất · ${providerLabel(summary.provider)}`
                                    : 'Đang đọc các trao đổi gần nhất'}
                            </Text>
                        </div>
                        <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void loadSummary()} />
                    </div>
                </div>

                <div className='min-h-0 flex-1 overflow-auto p-4'>
                    <Spin spinning={loading}>
                        {!loading && !summary ? (
                            <Empty description='Chưa có dữ liệu tóm tắt' />
                        ) : summary ? (
                            <div className='space-y-4'>
                                {summary.usedFallback ? (
                                    <Alert
                                        type='warning'
                                        showIcon
                                        icon={<WarningOutlined />}
                                        message='AI provider chưa khả dụng'
                                        description='Hệ thống đang dùng tóm tắt dự phòng từ các tin nhắn gần nhất.'
                                        className='!rounded-2xl'
                                    />
                                ) : null}

                                <section className='rounded-2xl border border-slate-100 bg-white p-4 shadow-sm'>
                                    <div className='mb-2 text-[12px] font-black tracking-wide text-slate-500 uppercase'>
                                        Tóm tắt nhanh
                                    </div>
                                    <p className='m-0 text-[14px] leading-6 text-slate-800'>{summary.summary}</p>
                                </section>

                                <ActionItems items={summary.actionItems} />
                                <SummaryList title='Quyết định đã chốt' items={summary.decisions} />
                                <SummaryList title='Bước tiếp theo' items={summary.nextSteps} />
                                <SummaryList title='Câu hỏi còn mở' items={summary.openQuestions} />
                                <SummaryList title='Rủi ro cần chú ý' items={summary.risks} />
                            </div>
                        ) : (
                            <div className='h-32' />
                        )}
                    </Spin>
                </div>
            </div>
        </Drawer>
    );
};

export default ChatAiSummaryDrawer;
