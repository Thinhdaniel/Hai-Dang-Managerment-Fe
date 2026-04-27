import type { ReactNode } from 'react';
import { Card, Typography } from 'antd';

const { Text } = Typography;

type StatsCardProps = {
    title: string;
    value: ReactNode;
    accent?: string;
    icon?: ReactNode;
    caption?: ReactNode;
};

const StatsCard = ({ title, value, accent = '#1f7ae0', icon, caption }: StatsCardProps) => {
    return (
        <Card bordered={false} className='stats-card'>
            <div className='stats-card__bar' style={{ background: accent }} />
            <div className='stats-card__content'>
                <div>
                    <Text type='secondary' className='stats-card__title'>
                        {title}
                    </Text>
                    <div className='stats-card__value' style={{ color: accent }}>
                        {value}
                    </div>
                    {caption ? <div className='stats-card__caption'>{caption}</div> : null}
                </div>
                {icon ? (
                    <div className='stats-card__icon' style={{ color: accent, background: `${accent}14` }}>
                        {icon}
                    </div>
                ) : null}
            </div>
        </Card>
    );
};

export default StatsCard;
