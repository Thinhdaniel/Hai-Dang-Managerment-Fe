import { Breadcrumb } from 'antd';
import { Link } from 'react-router-dom';
import usePageMeta from './usePageMeta';

const AppBreadcrumb = () => {
    const meta = usePageMeta();

    const items = meta.breadcrumbs.map((title, index) => {
        const isLast = index === meta.breadcrumbs.length - 1;
        const href = index === 0 ? '/dashboard' : undefined;

        return {
            title: isLast || !href ? <span>{title}</span> : <Link to={href}>{title}</Link>,
        };
    });

    return <Breadcrumb className='page-breadcrumb' items={items} />;
};

export default AppBreadcrumb;
