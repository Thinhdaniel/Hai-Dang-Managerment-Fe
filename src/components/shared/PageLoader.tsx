import { Skeleton, Space } from 'antd';

const PageLoader = () => {
    return (
        <div className='page-loader'>
            <Space orientation='vertical' size={18} style={{ width: '100%' }}>
                <Skeleton.Input active block style={{ height: 18, width: 180 }} />
                <Skeleton.Input active block style={{ height: 92, width: '100%' }} />
                <Skeleton.Input active block style={{ height: 72, width: '100%' }} />
                <Skeleton active paragraph={{ rows: 8 }} />
            </Space>
        </div>
    );
};

export default PageLoader;
