import React, { useState } from 'react';
import { App, Button, Input, Tag, Tooltip } from 'antd';
import {
    BulbOutlined,
    CloseCircleOutlined,
    EnvironmentOutlined,
    RobotOutlined,
    SendOutlined,
    SwapOutlined,
    TagsOutlined,
    ThunderboltOutlined,
} from '@ant-design/icons';
import {
    aiAssetSearchService,
    type AiAssetSearchFilters,
    type AiAssetSearchResponse,
} from '../core/services/ai-help.service';

type AssetAiSearchBarProps = {
    onApply: (filters: AiAssetSearchFilters, result: AiAssetSearchResponse) => void;
    onReset: () => void;
};

const SUGGESTED_QUESTIONS = [
    'Máy nào đang để kho không sử dụng?',
    'Liệt kê các máy đang hỏng',
    'Máy đang bảo trì là những máy nào?',
    'Tìm máy tiện CNC',
    'Các máy đang mượn của đối tác',
    'Máy đang chờ điều chuyển đi',
];

const AssetAiSearchBar: React.FC<AssetAiSearchBarProps> = ({ onApply, onReset }) => {
    const { message } = App.useApp();
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<AiAssetSearchResponse | null>(null);

    const runSearch = async (rawQuery: string) => {
        const cleanQuery = rawQuery.trim();
        if (!cleanQuery || loading) return;

        try {
            setLoading(true);
            const response = await aiAssetSearchService.search(cleanQuery);
            setResult(response);
            onApply(response.filters, response);

            const hasFilter = Object.values(response.filters).some(Boolean);
            if (!hasFilter) {
                message.info(
                    'AI chưa xác định được bộ lọc cụ thể — thử hỏi rõ hơn về trạng thái, cơ sở hoặc loại máy.'
                );
            }
        } catch {
            message.error('Không gọi được AI tìm kiếm. Vui lòng thử lại hoặc dùng bộ lọc thủ công.');
        } finally {
            setLoading(false);
        }
    };

    const handleClear = () => {
        setQuery('');
        setResult(null);
        onReset();
    };

    const understoodChips = result
        ? [
              result.statusLabel
                  ? { icon: <ThunderboltOutlined />, color: 'geekblue', text: result.statusLabel }
                  : null,
              result.matchedPlantName
                  ? { icon: <EnvironmentOutlined />, color: 'cyan', text: result.matchedPlantName }
                  : null,
              result.matchedBrandName
                  ? { icon: <TagsOutlined />, color: 'purple', text: result.matchedBrandName }
                  : null,
              result.ownershipLabel ? { icon: <TagsOutlined />, color: 'gold', text: result.ownershipLabel } : null,
              result.filters.search
                  ? { icon: <BulbOutlined />, color: 'blue', text: `“${result.filters.search}”` }
                  : null,
          ].filter(Boolean)
        : [];

    return (
        <div className='overflow-hidden rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50/80 to-indigo-50/50 shadow-sm'>
            <div className='flex flex-col gap-3 px-4 py-3.5 sm:px-5'>
                <div className='flex items-center gap-2'>
                    <span className='flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white'>
                        <RobotOutlined />
                    </span>
                    <div className='min-w-0'>
                        <div className='flex items-center gap-2'>
                            <span className='text-[13px] font-bold text-slate-800'>Tìm kiếm thông minh bằng AI</span>
                            <Tag color='cyan' className='!m-0 !text-[10px]'>
                                qwen2.5
                            </Tag>
                        </div>
                        <div className='text-[11px] leading-4 text-slate-500'>
                            Hỏi tự nhiên: “máy nào không sử dụng”, “máy hỏng ở cơ sở 2”, “tìm máy tiện CNC”...
                        </div>
                    </div>
                </div>

                <Input
                    size='large'
                    allowClear
                    value={query}
                    disabled={loading}
                    prefix={<RobotOutlined className='text-blue-400' />}
                    placeholder='Nhập câu hỏi tìm máy bằng tiếng Việt rồi nhấn Enter...'
                    onChange={(event) => setQuery(event.target.value)}
                    onPressEnter={() => runSearch(query)}
                    className='rounded-lg'
                    suffix={
                        <Button
                            type='primary'
                            size='small'
                            icon={<SendOutlined />}
                            loading={loading}
                            onClick={() => runSearch(query)}
                            className='rounded-md bg-blue-600 hover:!bg-blue-700'
                        >
                            Hỏi AI
                        </Button>
                    }
                />

                {!result ? (
                    <div className='flex flex-wrap gap-1.5'>
                        {SUGGESTED_QUESTIONS.map((question) => (
                            <button
                                key={question}
                                type='button'
                                disabled={loading}
                                onClick={() => {
                                    setQuery(question);
                                    runSearch(question);
                                }}
                                className='rounded-full border border-blue-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-60'
                            >
                                {question}
                            </button>
                        ))}
                    </div>
                ) : null}

                {result ? (
                    <div className='rounded-lg border border-blue-100 bg-white px-3.5 py-3'>
                        <div className='flex items-start justify-between gap-3'>
                            <div className='flex min-w-0 items-start gap-2'>
                                <BulbOutlined className='mt-0.5 text-amber-500' />
                                <div className='min-w-0'>
                                    <div className='flex items-center gap-2'>
                                        <span className='text-[12px] font-bold text-slate-700'>AI đã hiểu</span>
                                        <Tag
                                            color={result.provider === 'fallback' ? 'default' : 'green'}
                                            className='!m-0 !text-[10px]'
                                        >
                                            {result.provider === 'fallback' ? 'Suy luận từ khóa' : result.provider}
                                        </Tag>
                                    </div>
                                    <p className='m-0 mt-0.5 text-[12px] leading-5 text-slate-600'>
                                        {result.explanation}
                                    </p>
                                </div>
                            </div>
                            <Tooltip title='Xóa lọc AI và đặt lại bộ lọc'>
                                <Button
                                    type='text'
                                    size='small'
                                    icon={<CloseCircleOutlined />}
                                    onClick={handleClear}
                                    className='shrink-0 text-slate-400 hover:text-rose-500'
                                >
                                    Xóa lọc AI
                                </Button>
                            </Tooltip>
                        </div>

                        {understoodChips.length ? (
                            <div className='mt-2.5 flex flex-wrap items-center gap-1.5'>
                                {understoodChips.map((chip) => (
                                    <Tag key={chip!.text} color={chip!.color} icon={chip!.icon} className='!m-0'>
                                        {chip!.text}
                                    </Tag>
                                ))}
                            </div>
                        ) : (
                            <div className='mt-2 text-[11px] text-slate-400'>
                                Chưa có bộ lọc cụ thể — đang hiển thị theo từ khóa bạn nhập.
                            </div>
                        )}

                        {result.intent === 'create_transfer' ? (
                            <div className='mt-2.5 flex items-center gap-2 rounded-md border border-sky-100 bg-sky-50 px-2.5 py-1.5 text-[11px] text-sky-700'>
                                <SwapOutlined />
                                <span>
                                    Bạn muốn điều chuyển máy — chọn máy trong bảng bên dưới rồi bấm nút{' '}
                                    <strong>Điều chuyển</strong>.
                                </span>
                            </div>
                        ) : null}
                    </div>
                ) : null}
            </div>
        </div>
    );
};

export default AssetAiSearchBar;
