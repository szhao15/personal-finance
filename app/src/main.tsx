import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Transactions from './pages/Transactions'
import { Accounts, AccountDetail } from './pages/Accounts'
import { Investments, SecurityDetail } from './pages/Investments'
import { Categories, CategoryDetail } from './pages/Categories'
import { Recurrings, RecurringDetail } from './pages/Recurrings'
import Settings from './pages/Settings'
import './index.css'

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } } })

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <Dashboard /> },
      { path: 'transactions', element: <Transactions /> },
      { path: 'accounts', element: <Accounts /> },
      { path: 'accounts/:id', element: <AccountDetail /> },
      { path: 'investments', element: <Investments /> },
      { path: 'investments/h/:id', element: <SecurityDetail /> },
      { path: 'categories', element: <Categories /> },
      { path: 'categories/:id', element: <CategoryDetail /> },
      { path: 'recurrings', element: <Recurrings /> },
      { path: 'recurrings/:id', element: <RecurringDetail /> },
      { path: 'settings', element: <Settings /> },
      { path: '*', element: <Navigate to="/dashboard" replace /> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
