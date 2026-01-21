import { createBrowserRouter, Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Layout } from './Layout';
import { Home } from './pages/Home';
import { NewInspection } from './pages/NewInspection';
import { FillForm } from './pages/FillForm';
import { MyInspections } from './pages/MyInspections';
import { DebugInspection } from './pages/DebugInspection';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { getUserId } from './auth';

function RequireUser({ children }: { children: ReactNode }) {
  const location = useLocation();
  const userId = getUserId();
  if (!userId) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

export const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  { path: '/register', element: <Register /> },
  {
    element: (
      <RequireUser>
        <Layout />
      </RequireUser>
    ),
    children: [
      { path: '/', element: <Home /> },
      { path: '/new-inspection', element: <NewInspection /> },
      { path: '/fill-form/:sessionId', element: <FillForm /> },
      { path: '/debug-inspection/:sessionId', element: <DebugInspection /> },
      { path: '/my-inspections', element: <MyInspections /> },
    ],
  },
]);
