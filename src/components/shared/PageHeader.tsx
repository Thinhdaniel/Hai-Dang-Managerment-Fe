import type { ReactNode } from 'react';
import { Space, Typography } from 'antd';
import AppBreadcrumb from '../navigation/AppBreadcrumb';

const { Title, Text } = Typography;

type PageHeaderProps = {
    title: string;
    subtitle?: string;
    actions?: ReactNode;
    extra?: ReactNode;
};

const PageHeader = ({ title, subtitle, actions, extra }: PageHeaderProps) => {
    return (
        <div className='page-header-card'>
            <div className='page-header-card__main'>
                <Space direction='vertical' size={8} style={{ width: '100%' }}>
                    <AppBreadcrumb />
                    <div>
                        <Title level={3} className='page-header-card__title'>
                            {title}
                        </Title>
                        {subtitle ? (
                            <Text type='secondary' className='page-header-card__subtitle'>
                                {subtitle}
                            </Text>
                        ) : null}
                    </div>
                    {extra}
                </Space>
            </div>
            {actions ? <div className='page-header-card__actions'>{actions}</div> : null}
        </div>
    );
};

export default PageHeader;
