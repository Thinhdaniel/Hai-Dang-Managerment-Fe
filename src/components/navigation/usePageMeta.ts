import { PAGE_META, type PageMeta } from '../../core/constants/navigation';
import { useLocation } from 'react-router-dom';

const toRegex = (path: string) => new RegExp(`^${path.replace(/:[^/]+/g, '[^/]+').replace(/\//g, '\\/')}$`);

const fallbackMeta: PageMeta = {
    path: '*',
    title: 'Thiết Bị',
    subtitle: undefined,
    breadcrumbs: ['Dashboard'],
    searchPlaceholder: 'Tìm kiếm...',
};

const usePageMeta = () => {
    const { pathname } = useLocation();

    return PAGE_META.find((item) => toRegex(item.path).test(pathname)) ?? fallbackMeta;
};

export default usePageMeta;
