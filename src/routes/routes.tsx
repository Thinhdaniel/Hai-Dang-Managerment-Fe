import { lazy } from 'react';
import type { ReactNode } from 'react';
import { Navigate, createBrowserRouter } from 'react-router-dom';
import AppLayout from '../components/layout/AppLayout';
import LazyBoundary from '../components/shared/LazyBoundary';
import ProtectedRoute from './guard';

const Dashboard = lazy(() => import('../pages/Dashboard'));
const AssetList = lazy(() => import('../pages/AssetList'));
const AssetDetail = lazy(() => import('../pages/AssetDetail'));
const BrandList = lazy(() => import('../pages/BrandList'));
const MaintenanceList = lazy(() => import('../pages/MaintenanceList'));
const TransferList = lazy(() => import('../pages/TransferList'));
const TransferDetail = lazy(() => import('../pages/TransferDetail'));
const BorrowingList = lazy(() => import('../pages/BorrowingList'));
const BorrowingCreate = lazy(() => import('../pages/BorrowingCreate'));
const BorrowingDetail = lazy(() => import('../pages/BorrowingDetail'));
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
const ComingSoonPage = lazy(() => import('../pages/ComingSoonPage'));
const NotFoundPage = lazy(() => import('../pages/NotFoundPage'));

const withSuspense = (element: ReactNode) => <LazyBoundary>{element}</LazyBoundary>;

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
        path: '/',
        element: (
            <ProtectedRoute>
                <AppLayout />
            </ProtectedRoute>
        ),
        children: [
            { index: true, element: <Navigate to='/dashboard' replace /> },
            { path: 'dashboard', element: withSuspense(<Dashboard />) },
            { path: 'assets', element: withSuspense(<AssetList />) },
            { path: 'assets/:id', element: withSuspense(<AssetDetail />) },
            { path: 'brands', element: withSuspense(<BrandList />) },
            { path: 'maintenances', element: withSuspense(<MaintenanceList />) },
            { path: 'transfers', element: withSuspense(<TransferList />) },
            { path: 'transfers/:id', element: withSuspense(<TransferDetail />) },
            { path: 'borrowings', element: withSuspense(<BorrowingList />) },
            { path: 'borrowings/new', element: withSuspense(<BorrowingCreate />) },
            { path: 'borrowings/:id', element: withSuspense(<BorrowingDetail />) },
            { path: 'storage', element: withSuspense(<ComingSoonPage />) },
            { path: 'plants', element: withSuspense(<PlantList />) },
            { path: 'users', element: withSuspense(<UserList />) },
            { path: 'materials', element: withSuspense(<MaterialListPage />) },
            { path: 'materials/suppliers', element: withSuspense(<MaterialSupplierPage />) },
            { path: 'materials/inventory', element: withSuspense(<MaterialInventoryPage />) },
            { path: 'materials/purchase-requests', element: withSuspense(<PurchaseRequestPage />) },
            { path: 'materials/supply-requests', element: withSuspense(<SupplyRequestPage />) },
            { path: 'materials/purchase-orders', element: withSuspense(<PurchaseOrderPage />) },
            { path: 'materials/distributions', element: withSuspense(<DistributionPage />) },
            { path: 'materials/reports', element: withSuspense(<MaterialReportPage />) },
            { path: 'reports/facility-costs', element: withSuspense(<FacilityCostReportPage />) },
        ],
    },
    {
        path: '*',
        element: withSuspense(<NotFoundPage />),
    },
]);
