import { useMemo, useState } from 'react';
import { Button, Drawer, Empty, FloatButton, Input, Tag, Typography } from 'antd';
import {
    BookOutlined,
    BulbOutlined,
    CheckCircleOutlined,
    CloseOutlined,
    FileSearchOutlined,
    LoadingOutlined,
    MessageOutlined,
    QuestionCircleOutlined,
    SendOutlined,
} from '@ant-design/icons';
import { useLocation } from 'react-router-dom';
import { aiHelpService } from '../../core/services/ai-help.service';
import {
    getRouteHelpTopics,
    getTopicById,
    searchHelpTopics,
    type HelpCategory,
    type HelpTopic,
} from '../../core/help/helpKnowledge';

const { Text, Title } = Typography;
const { Search } = Input;

type AssistantMessage = {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    topics?: HelpTopic[];
    provider?: 'ollama' | 'fallback' | 'local';
    isPending?: boolean;
};

const categoryMeta: Record<HelpCategory, { label: string; color: string }> = {
    machine: { label: 'Máy móc', color: 'blue' },
    material: { label: 'Vật tư', color: 'green' },
    report: { label: 'Báo cáo', color: 'purple' },
    admin: { label: 'Phân quyền', color: 'gold' },
    general: { label: 'Chung', color: 'default' },
};

const suggestedQuestions = [
    'Máy không có serial hoặc model thì nhập sao?',
    'Cách điều chuyển nhiều máy?',
    'Đồng bộ tồn kho vật tư ban đầu như thế nào?',
    'Đề xuất mua khác đề xuất cấp vật tư thế nào?',
    'Báo cáo vật tư lấy số liệu từ đâu?',
];

const createMessageId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const toAiContextTopic = (topic: HelpTopic) => ({
    title: topic.title,
    summary: topic.summary,
    category: topic.category,
    steps: topic.steps,
    notes: topic.notes,
});

const providerLabel = (message: AssistantMessage) => {
    if (message.isPending) return 'Đang xử lý';
    if (message.provider === 'ollama') return 'AI local';
    return 'Hướng dẫn nội bộ';
};

const providerColor = (message: AssistantMessage) => {
    if (message.isPending) return 'processing';
    if (message.provider === 'ollama') return 'cyan';
    return 'default';
};

const TopicDetail = ({ topic, onClose }: { topic: HelpTopic; onClose: () => void }) => {
    const meta = categoryMeta[topic.category];

    return (
        <section className='rounded-2xl border border-slate-200 bg-white shadow-sm'>
            <div className='flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3'>
                <div className='min-w-0'>
                    <Tag color={meta.color} className='mb-2'>
                        {meta.label}
                    </Tag>
                    <Title level={5} className='!mb-1 !text-[15px] !leading-6 !text-slate-900'>
                        {topic.title}
                    </Title>
                    <Text className='text-[13px] leading-6 text-slate-600'>{topic.summary}</Text>
                </div>
                <Button type='text' size='small' icon={<CloseOutlined />} onClick={onClose} />
            </div>

            <div className='space-y-4 px-4 py-4'>
                <div>
                    <div className='mb-2 flex items-center gap-2 text-[12px] font-bold uppercase tracking-wide text-slate-500'>
                        <FileSearchOutlined />
                        Quy trình thao tác
                    </div>
                    <ol className='m-0 list-decimal space-y-2 pl-4 text-[13px] leading-6 text-slate-700'>
                        {topic.steps.map((step) => (
                            <li key={step}>{step}</li>
                        ))}
                    </ol>
                </div>

                {topic.notes?.length ? (
                    <div className='rounded-xl border border-amber-100 bg-amber-50 px-3 py-3'>
                        <div className='mb-2 flex items-center gap-2 text-[12px] font-bold uppercase tracking-wide text-amber-700'>
                            <BulbOutlined />
                            Lưu ý nghiệp vụ
                        </div>
                        <ul className='m-0 list-disc space-y-1.5 pl-4 text-[13px] leading-6 text-amber-900'>
                            {topic.notes.map((note) => (
                                <li key={note}>{note}</li>
                            ))}
                        </ul>
                    </div>
                ) : null}
            </div>
        </section>
    );
};

const TopicChips = ({
    topics,
    onSelect,
    tone = 'default',
}: {
    topics: HelpTopic[];
    onSelect: (topic: HelpTopic) => void;
    tone?: 'default' | 'compact';
}) => (
    <div className='flex flex-wrap gap-2'>
        {topics.map((topic) => {
            const meta = categoryMeta[topic.category];

            return (
                <button
                    key={topic.id}
                    type='button'
                    onClick={() => onSelect(topic)}
                    className={`rounded-full border text-left font-medium transition-colors ${
                        tone === 'compact'
                            ? 'border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700'
                            : 'border-slate-200 bg-white px-3 py-1.5 text-[12px] text-slate-700 shadow-sm hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700'
                    }`}
                    title={`${meta.label}: ${topic.title}`}
                >
                    {topic.title}
                </button>
            );
        })}
    </div>
);

const AssistantBubble = ({
    message,
    onSelectTopic,
}: {
    message: AssistantMessage;
    onSelectTopic: (topic: HelpTopic) => void;
}) => {
    const isUser = message.role === 'user';

    if (isUser) {
        return (
            <div className='flex justify-end'>
                <div className='max-w-[82%] rounded-2xl rounded-tr-md bg-blue-600 px-4 py-3 text-[13px] leading-6 text-white shadow-sm'>
                    <p className='m-0 whitespace-pre-line'>{message.text}</p>
                </div>
            </div>
        );
    }

    return (
        <div className='flex items-start gap-3'>
            <div className='mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-600'>
                {message.isPending ? <LoadingOutlined /> : <MessageOutlined />}
            </div>
            <div className='min-w-0 flex-1 rounded-2xl rounded-tl-md border border-slate-200 bg-white shadow-sm'>
                <div className='flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-2.5'>
                    <div className='flex min-w-0 items-center gap-2'>
                        <Text className='text-[13px] font-bold text-slate-900'>Trợ lý vận hành</Text>
                        <Tag color={providerColor(message)} className='!m-0'>
                            {providerLabel(message)}
                        </Tag>
                    </div>
                    {!message.isPending && message.provider === 'ollama' ? (
                        <CheckCircleOutlined className='text-emerald-500' />
                    ) : null}
                </div>

                <div className='px-4 py-3'>
                    <p className='m-0 whitespace-pre-line text-[13px] leading-6 text-slate-700'>{message.text}</p>

                    {!message.isPending && message.provider === 'ollama' && message.topics?.length ? (
                        <div className='mt-4 border-t border-slate-100 pt-3'>
                            <div className='mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400'>
                                Tài liệu tham chiếu
                            </div>
                            <TopicChips topics={message.topics.slice(0, 3)} onSelect={onSelectTopic} tone='compact' />
                        </div>
                    ) : null}

                    {!message.isPending && message.provider !== 'ollama' && message.topics?.length ? (
                        <div className='mt-4 space-y-2 border-t border-slate-100 pt-3'>
                            <div className='text-[11px] font-bold uppercase tracking-wide text-slate-400'>
                                Hướng dẫn phù hợp
                            </div>
                            {message.topics.map((topic) => {
                                const meta = categoryMeta[topic.category];

                                return (
                                    <button
                                        key={topic.id}
                                        type='button'
                                        className='block w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-left transition-colors hover:border-blue-200 hover:bg-blue-50'
                                        onClick={() => onSelectTopic(topic)}
                                    >
                                        <Tag color={meta.color} className='mb-1'>
                                            {meta.label}
                                        </Tag>
                                        <div className='text-[13px] font-bold text-slate-900'>{topic.title}</div>
                                        <div className='mt-1 line-clamp-2 text-[12px] leading-5 text-slate-500'>
                                            {topic.summary}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
};

const HelpAssistant = () => {
    const { pathname } = useLocation();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
    const [messages, setMessages] = useState<AssistantMessage[]>([]);
    const [asking, setAsking] = useState(false);

    const routeTopics = useMemo(() => getRouteHelpTopics(pathname, 5), [pathname]);
    const selectedTopic = selectedTopicId ? getTopicById(selectedTopicId) : null;

    const handleAsk = async (rawQuery: string) => {
        const cleanQuery = rawQuery.trim();
        if (!cleanQuery || asking) return;

        const topics = searchHelpTopics(cleanQuery, pathname, 4);
        const fallbackText = topics.length
            ? 'Mình tìm thấy các hướng dẫn phù hợp. Chọn một mục để xem đầy đủ thao tác và lưu ý nghiệp vụ.'
            : 'Chưa có hướng dẫn khớp chính xác. Thử hỏi theo tên màn hình hoặc nghiệp vụ như điều chuyển máy, tồn kho, đề xuất mua, cấp phát hoặc báo cáo vật tư.';
        const pendingId = createMessageId();

        setMessages((current) => [
            ...current,
            {
                id: createMessageId(),
                role: 'user',
                text: cleanQuery,
            },
            {
                id: pendingId,
                role: 'assistant',
                text: 'Đang phân tích câu hỏi và đối chiếu với hướng dẫn nội bộ...',
                provider: 'ollama',
                isPending: true,
            },
        ]);

        setSelectedTopicId(null);
        setQuery('');

        try {
            setAsking(true);
            const response = await aiHelpService.ask({
                question: cleanQuery,
                route: pathname,
                contextTopics: topics.slice(0, 3).map(toAiContextTopic),
            });

            setMessages((current) =>
                current.map((message) =>
                    message.id === pendingId
                        ? {
                              ...message,
                              text: response.answer || fallbackText,
                              topics,
                              provider: response.usedFallback ? 'fallback' : 'ollama',
                              isPending: false,
                          }
                        : message
                )
            );
        } catch (error) {
            setMessages((current) =>
                current.map((message) =>
                    message.id === pendingId
                        ? {
                              ...message,
                              text: fallbackText,
                              topics,
                              provider: 'local',
                              isPending: false,
                          }
                        : message
                )
            );
        } finally {
            setAsking(false);
        }
    };

    const handlePickTopic = (topic: HelpTopic) => {
        setSelectedTopicId(topic.id);
    };

    const clearConversation = () => {
        setMessages([]);
        setSelectedTopicId(null);
        setQuery('');
    };

    return (
        <>
            <FloatButton
                type='primary'
                icon={<QuestionCircleOutlined />}
                tooltip='Trợ lý hướng dẫn'
                onClick={() => setOpen(true)}
                style={{ right: 28, bottom: 28 }}
            />

            <Drawer
                open={open}
                onClose={() => setOpen(false)}
                size={640}
                placement='right'
                destroyOnHidden
                closable={false}
                title={
                    <div className='flex items-center gap-3'>
                        <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-600'>
                            <BookOutlined />
                        </div>
                        <div className='min-w-0'>
                            <div className='flex items-center gap-2'>
                                <span className='truncate text-[15px] font-bold text-slate-950'>Trợ lý hướng dẫn nội bộ</span>
                                <Tag color='cyan' className='!m-0'>
                                    Ollama local
                                </Tag>
                            </div>
                            <div className='mt-0.5 text-[12px] font-medium text-slate-500'>
                                Hỗ trợ thao tác máy móc, vật tư, cấp phát và báo cáo
                            </div>
                        </div>
                    </div>
                }
                extra={<Button type='text' icon={<CloseOutlined />} onClick={() => setOpen(false)} />}
                styles={{
                    body: { padding: 0, background: '#f8fafc' },
                    header: { borderBottom: '1px solid #e2e8f0', padding: '14px 18px' },
                }}
            >
                <div className='flex h-full min-h-0 flex-col'>
                    <div className='flex-1 overflow-y-auto px-5 py-5'>
                        <section className='rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm'>
                            <div className='flex items-start justify-between gap-3'>
                                <div>
                                    <div className='text-[13px] font-bold text-slate-900'>Ngữ cảnh màn hình</div>
                                    <div className='mt-1 text-[12px] leading-5 text-slate-500'>
                                        Trợ lý ưu tiên các hướng dẫn liên quan đến trang bạn đang mở.
                                    </div>
                                </div>
                                <Tag color='blue' className='!m-0 font-mono'>
                                    {pathname}
                                </Tag>
                            </div>
                            <div className='mt-3'>
                                <TopicChips topics={routeTopics} onSelect={handlePickTopic} />
                            </div>
                        </section>

                        <section className='mt-5 space-y-4'>
                            {messages.length === 0 ? (
                                <div className='rounded-2xl border border-slate-200 bg-white p-5 shadow-sm'>
                                    <Empty
                                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                                        description='Hỏi bằng tiếng Việt tự nhiên, trợ lý sẽ trả lời theo tài liệu nội bộ và ngữ cảnh màn hình.'
                                    />
                                    <div className='mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2'>
                                        {suggestedQuestions.map((question) => (
                                            <button
                                                key={question}
                                                type='button'
                                                className='min-h-[48px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-[13px] font-medium leading-5 text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700'
                                                onClick={() => handleAsk(question)}
                                            >
                                                {question}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ) : null}

                            {messages.map((message) => (
                                <AssistantBubble key={message.id} message={message} onSelectTopic={handlePickTopic} />
                            ))}
                        </section>

                        {selectedTopic ? (
                            <div className='mt-5'>
                                <TopicDetail topic={selectedTopic} onClose={() => setSelectedTopicId(null)} />
                            </div>
                        ) : null}
                    </div>

                    <div className='border-t border-slate-200 bg-white px-5 py-4'>
                        <Search
                            value={query}
                            allowClear
                            enterButton={<SendOutlined />}
                            loading={asking}
                            placeholder='Hỏi ví dụ: cách nhận hàng vật tư, báo cáo chi phí, điều chuyển máy...'
                            onChange={(event) => setQuery(event.target.value)}
                            onSearch={handleAsk}
                            size='large'
                            className='[&_.ant-input-group-addon_button]:!bg-blue-600'
                        />
                        <div className='mt-2 flex items-center justify-between gap-3'>
                            <Text className='text-[11px] leading-5 text-slate-400'>
                                AI local trả lời từ hướng dẫn nội bộ. Nếu Ollama lỗi, hệ thống tự dùng fallback.
                            </Text>
                            <Button type='link' size='small' onClick={clearConversation} className='!px-0'>
                                Xóa hội thoại
                            </Button>
                        </div>
                    </div>
                </div>
            </Drawer>
        </>
    );
};

export default HelpAssistant;

