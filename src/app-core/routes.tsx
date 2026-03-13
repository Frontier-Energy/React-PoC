import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getUserId, hasPermission, isLoggedInAdmin } from './auth';
import { RouteFallback } from './components/RouteFallback';
import { platform } from '@platform';
import { useTenantBootstrap } from './TenantBootstrapContext';

const Layout = lazy(async () => {
  const module = await import('./Layout');
  return { default: module.Layout };
});
const Home = lazy(async () => {
  const module = await import('./pages/Home');
  return { default: module.Home };
});
const NewInspection = lazy(async () => {
  const module = await import('./pages/NewInspection');
  return { default: module.NewInspection };
});
const FillForm = lazy(async () => {
  const module = await import('./pages/FillForm');
  return { default: module.FillForm };
});
const MyInspections = lazy(async () => {
  const module = await import('./pages/MyInspections');
  return { default: module.MyInspections };
});
const DebugInspection = lazy(async () => {
  const module = await import('./pages/DebugInspection');
  return { default: module.DebugInspection };
});
const SupportConsole = lazy(async () => {
  const module = await import('./pages/SupportConsole');
  return { default: module.SupportConsole };
});
const Login = lazy(async () => {
  const module = await import('./pages/Login');
  return { default: module.Login };
});
const Register = lazy(async () => {
  const module = await import('./pages/Register');
  return { default: module.Register };
});

function withSuspense(children: ReactNode) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>;
}

function DefaultRouteRedirect() {
  const { config } = useTenantBootstrap();
  const userId = getUserId();
  if (!config.loginRequired || userId) {
    return <Navigate to="/home" replace />;
  }
  return <Navigate to="/login" replace />;
}

function RequireUser({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { config } = useTenantBootstrap();
  if (!config.loginRequired) {
    return <>{children}</>;
  }
  const userId = getUserId();
  if (!userId) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

function RequireSupportAdmin({ children }: { children: ReactNode }) {
  if (!isLoggedInAdmin() || !hasPermission('customization.admin')) {
    return <Navigate to="/home" replace />;
  }

  return <>{children}</>;
}

export const router = platform.routing.createRouter([
  { path: '/', element: <DefaultRouteRedirect /> },
  { path: '/login', element: withSuspense(<Login />) },
  { path: '/register', element: withSuspense(<Register />) },
  {
    element: (
      <RequireUser>
        {withSuspense(<Layout />)}
      </RequireUser>
    ),
    children: [
      { path: '/home', element: withSuspense(<Home />) },
      { path: '/new-inspection', element: withSuspense(<NewInspection />) },
      { path: '/fill-form/:sessionId', element: withSuspense(<FillForm />) },
      { path: '/debug-inspection/:sessionId', element: withSuspense(<DebugInspection />) },
      {
        path: '/support',
        element: (
          <RequireSupportAdmin>
            {withSuspense(<SupportConsole />)}
          </RequireSupportAdmin>
        ),
      },
      { path: '/my-inspections', element: withSuspense(<MyInspections />) },
    ],
  },
]);

