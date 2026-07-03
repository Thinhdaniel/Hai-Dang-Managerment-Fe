import React from 'react';

// Render markdown tối giản cho narrative do AI sinh (##/### heading, **bold**, - / N. list).
// Không dùng thư viện markdown vì chỉ cần vài cú pháp cơ bản; React tự escape text nên an toàn XSS.
const renderInline = (text: string): React.ReactNode[] =>
    text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : <React.Fragment key={i}>{part}</React.Fragment>
    );

const MarkdownLite: React.FC<{ text: string; className?: string }> = ({ text, className }) => {
    const lines = (text || '').split('\n');
    const blocks: React.ReactNode[] = [];
    let listItems: React.ReactNode[] = [];
    let listOrdered = false;

    const flushList = (key: string) => {
        if (!listItems.length) return;
        blocks.push(
            listOrdered ? (
                <ol key={key} className='list-decimal space-y-0.5 pl-5'>
                    {listItems}
                </ol>
            ) : (
                <ul key={key} className='list-disc space-y-0.5 pl-5'>
                    {listItems}
                </ul>
            )
        );
        listItems = [];
    };

    lines.forEach((raw, idx) => {
        const line = raw.trimEnd();
        const headerMatch = line.match(/^(#{1,4})\s+(.*)$/);
        const bulletMatch = line.match(/^[-*]\s+(.*)$/);
        const numberedMatch = line.match(/^\d+\.\s+(.*)$/);

        if (headerMatch) {
            flushList(`list-${idx}`);
            const level = headerMatch[1].length;
            blocks.push(
                <div key={idx} className={level <= 2 ? 'mb-1 mt-3 text-[13px] font-bold text-slate-900 first:mt-0' : 'mb-1 mt-2 text-[12.5px] font-bold text-slate-800 first:mt-0'}>
                    {renderInline(headerMatch[2])}
                </div>
            );
            return;
        }
        if (bulletMatch) {
            listOrdered = false;
            listItems.push(<li key={idx}>{renderInline(bulletMatch[1])}</li>);
            return;
        }
        if (numberedMatch) {
            listOrdered = true;
            listItems.push(<li key={idx}>{renderInline(numberedMatch[1])}</li>);
            return;
        }
        flushList(`list-${idx}`);
        if (!line.trim()) return;
        blocks.push(
            <p key={idx} className='mb-1 last:mb-0'>
                {renderInline(line)}
            </p>
        );
    });
    flushList('list-end');

    return <div className={className}>{blocks}</div>;
};

export default MarkdownLite;
