import { Spin } from 'antd';
import { Suspense, type PropsWithChildren } from 'react';
import PageLoader from './PageLoader';

interface LazyBoundaryProps extends PropsWithChildren {
    mode?: 'page' | 'overlay';
}

const overlayFallback = (
    <div className='fixed inset-0 z-[1100] flex items-center justify-center bg-slate-950/10 backdrop-blur-[1px]'>
        <div className='rounded-xl bg-white px-5 py-4 shadow-lg shadow-slate-900/10'>
            <Spin size='large' />
        </div>
    </div>
);

const LazyBoundary = ({ children, mode = 'page' }: LazyBoundaryProps) => {
    return <Suspense fallback={mode === 'overlay' ? overlayFallback : <PageLoader />}>{children}</Suspense>;
};

export default LazyBoundary;
