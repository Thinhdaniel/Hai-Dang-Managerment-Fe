import { useEffect, useState } from 'react';
import { Select } from 'antd';
import { useInfiniteQuery } from '@tanstack/react-query';
import {
    materialCustodyService,
    type MaterialRecipient,
    type MaterialUsageCampaign,
} from '../../core/services/material-custody.service';

type Reference = MaterialRecipient | MaterialUsageCampaign;
type Props = {
    kind: 'recipient' | 'campaign';
    plantId?: string;
    value?: string;
    selectedLabel?: string;
    onChange?: (value?: string) => void;
    onRecipientSelect?: (recipient: MaterialRecipient) => void;
};

export default function CustodyReferenceSelect({
    kind,
    plantId,
    value,
    selectedLabel,
    onChange,
    onRecipientSelect,
}: Props) {
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [selected, setSelected] = useState<{ value: string; label: string }>();
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search), 250);
        return () => clearTimeout(timer);
    }, [search]);
    const query = useInfiniteQuery({
        queryKey: ['material-custody', 'reference-options', kind, plantId, debouncedSearch],
        initialPageParam: 1,
        queryFn: async ({ pageParam }) => {
            const params = { plantId, search: debouncedSearch, page: pageParam, limit: 50 };
            return kind === 'recipient'
                ? materialCustodyService.getRecipients({ ...params, isActive: true })
                : materialCustodyService.getCampaigns({ ...params, status: 'active' });
        },
        getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
        enabled: Boolean(plantId),
    });
    const rows: Reference[] = query.data?.pages.flatMap((page) => page.data as Reference[]) || [];
    const options = rows.map((row) => ({
        value: row.id,
        label:
            'employeeCode' in row
                ? `${row.employeeCode} · ${row.fullName}${row.lineName ? ` · ${row.lineName}` : ''}`
                : `${row.itemCode}${row.orderCode ? ` · ${row.orderCode}` : ''} · ${row.campaignCode}`,
    }));
    if (value && !options.some((option) => option.value === value))
        options.unshift({ value, label: selected?.value === value ? selected.label : selectedLabel || value });
    return (
        <Select
            className='w-full'
            showSearch
            allowClear
            filterOption={false}
            value={value}
            options={options}
            disabled={!plantId}
            loading={query.isFetching}
            onSearch={setSearch}
            placeholder={kind === 'recipient' ? 'Tìm mã CN, họ tên' : 'Tìm mã hàng, đợt sử dụng'}
            notFoundContent={
                query.isError ? 'Không tải được danh sách' : query.isFetching ? 'Đang tải...' : 'Không có kết quả'
            }
            onPopupScroll={(event) => {
                const el = event.currentTarget;
                if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40 && query.hasNextPage && !query.isFetching)
                    void query.fetchNextPage();
            }}
            onChange={(id) => {
                setSelected(options.find((option) => option.value === id));
                onChange?.(id);
                const row = rows.find((item) => item.id === id);
                if (row && 'employeeCode' in row) onRecipientSelect?.(row);
            }}
        />
    );
}
