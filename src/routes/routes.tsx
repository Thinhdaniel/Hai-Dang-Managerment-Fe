import { lazy } from 'react';
import type { ReactNode } from 'react';
import { Navigate, createBrowserRouter } from 'react-router-dom';
import AppLayout from '../components/layout/AppLayout';
import LazyBoundary from '../components/shared/LazyBoundary';
import ProtectedRoute, { RequireAccess } from './guard';
import { ROUTE_ACCESS } from '../core/constants/navAccess';

const Dashboard = lazy(() => import('../pages/Dashboard'));
const GlobalQrScannerPage = lazy(() => import('../pages/GlobalQrScannerPage'));
const AssetList = lazy(() => import('../pages/AssetList'));
const AssetDetail = lazy(() => import('../pages/AssetDetail'));
const StocktakePage = lazy(() => import('../pages/StocktakePage'));
const BrandList = lazy(() => import('../pages/BrandList'));
const MaintenanceList = lazy(() => import('../pages/MaintenanceList'));
const TransferList = lazy(() => import('../pages/TransferList'));
const TransferDetail = lazy(() => import('../pages/TransferDetail'));
const BorrowingList = lazy(() => import('../pages/BorrowingList'));
const BorrowingCreate = lazy(() => import('../pages/BorrowingCreate'));
const BorrowingDetail = lazy(() => import('../pages/BorrowingDetail'));
const BorrowingBatchDetail = lazy(() => import('../pages/BorrowingBatchDetail'));
const PlantList = lazy(() => import('../pages/PlantList'));
const UserList = lazy(() => import('../pages/UserList'));
const MaterialListPage = lazy(() => import('../pages/MaterialListPage'));
const MaterialSupplierPage = lazy(() => import('../pages/MaterialSupplierPage'));
const MaterialInventoryPage = lazy(() => import('../pages/MaterialInventoryPage'));
const PurchaseRequestPage = lazy(() => import('../pages/PurchaseRequestPage'));
const SupplyRequestPage = lazy(() => import('../pages/SupplyRequestPage'));
const PurchaseOrderPage = lazy(() => import('../pages/PurchaseOrderPage'));
const DistributionPage = lazy(() => import('../pages/DistributionPage'));
const MaterialReportPage = lazy(() => import('../pages/MaterialReportPage'));
const FacilityCostReportPage = lazy(() => import('../pages/FacilityCostReportPage'));
const LoginPage = lazy(() => import('../pages/LoginPage'));
const ForgotPasswordPage = lazy(() => import('../pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('../pages/ResetPasswordPage'));
const PublicMachinePage = lazy(() => import('../pages/PublicMachinePage'));
const QrResolverPage = lazy(() => import('../pages/QrResolverPage'));
const QrLabelListPage = lazy(() => import('../pages/QrLabelListPage'));
const QrBatchPrintPage = lazy(() => import('../pages/QrBatchPrintPage'));
const QrActivateMachinePage = lazy(() => import('../pages/QrActivateMachinePage'));
const ComingSoonPage = lazy(() => import('../pages/ComingSoonPage'));
const NotFoundPage = lazy(() => import('../pages/NotFoundPage'));
const RouteErrorPage = lazy(() => import('../pages/RouteErrorPage'));

const withSuspense = (element: ReactNode) => <LazyBoundary>{element}</LazyBoundary>;

/** Bọc element trong RequireAccess nếu route đó cần quyền (theo ROUTE_ACCESS). */
const guarded = (path: string, element: ReactNode) => {
    const check = ROUTE_ACCESS[path];
    const node = withSuspense(element);
    return check ? <RequireAccess check={check}>{node}</RequireAccess> : node;
};

export const router = createBrowserRouter([
    {
        path: '/login',
        element: withSuspense(<LoginPage />),
    },
    {
        path: '/forgot-password',
        element: withSuspense(<ForgotPasswordPage />),
    },
    {
        path: '/reset-password',
        element: withSuspense(<ResetPasswordPage />),
    },
    {
        path: '/public/machines/:publicId',
        element: withSuspense(<PublicMachinePage />),
    },
    {
        path: '/qr/:publicId',
        element: withSuspense(<QrResolverPage />),
    },
    {
        path: '/',
        element: (
            <ProtectedRoute>
                <AppLayout />
            </ProtectedRoute>
        ),
        errorElement: withSuspense(<RouteErrorPage />),
        children: [
            { index: true, element: <Navigate to='/dashboard' replace /> },
            { path: 'dashboard', element: withSuspense(<Dashboard />) },
            { path: 'scan', element: withSuspense(<GlobalQrScannerPage />) },
            { path: 'assets', element: withSuspense(<AssetList />) },
            { path: 'assets/stocktake', element: withSuspense(<StocktakePage />) },
            { path: 'assets/:id', element: withSuspense(<AssetDetail />) },
            { path: 'qr-labels', element: guarded('/qr-labels', <QrLabelListPage />) },
            {
                path: 'qr-labels/batches/:id/print',
                element: guarded('/qr-labels/batches/:id/print', <QrBatchPrintPage />),
            },
            { path: 'qr/:publicId/activate', element: guarded('/qr/:publicId/activate', <QrActivateMachinePage />) },
            { path: 'brands', element: guarded('/brands', <BrandList />) },
            { path: 'maintenances', element: withSuspense(<MaintenanceList />) },
            { path: 'transfers', element: withSuspense(<TransferList />) },
            { path: 'transfers/:id', element: withSuspense(<TransferDetail />) },
            { path: 'borrowings', element: withSuspense(<BorrowingList />) },
            { path: 'borrowings/new', element: withSuspense(<BorrowingCreate />) },
            {
                path: 'borrowings/batches/:id',
                element: guarded('/borrowings/batches/:id', <BorrowingBatchDetail />),
            },
            { path: 'borrowings/:id', element: withSuspense(<BorrowingDetail />) },
            { path: 'storage', element: guarded('/storage', <ComingSoonPage />) },
            { path: 'plants', element: guarded('/plants', <PlantList />) },
            { path: 'users', element: guarded('/users', <UserList />) },
            { path: 'materials', element: guarded('/materials', <MaterialListPage />) },
            { path: 'materials/suppliers', element: guarded('/materials/suppliers', <MaterialSupplierPage />) },
            { path: 'materials/inventory', element: guarded('/materials/inventory', <MaterialInventoryPage />) },
            {
                path: 'materials/purchase-requests',
                element: guarded('/materials/purchase-requests', <PurchaseRequestPage />),
            },
            {
                path: 'materials/supply-requests',
                element: guarded('/materials/supply-requests', <SupplyRequestPage />),
            },
            {
                path: 'materials/purchase-orders',
                element: guarded('/materials/purchase-orders', <PurchaseOrderPage />),
            },
            { path: 'materials/distributions', element: guarded('/materials/distributions', <DistributionPage />) },
            { path: 'materials/reports', element: guarded('/materials/reports', <MaterialReportPage />) },
            { path: 'reports/facility-costs', element: guarded('/reports/facility-costs', <FacilityCostReportPage />) },
        ],
    },
    {
        path: '*',
        element: withSuspense(<NotFoundPage />),
    },
]);
