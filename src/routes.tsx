import { createBrowserRouter } from 'react-router-dom';
import { Layout } from './Layout';
import { Home } from './pages/Home';
import { NewForm } from './pages/NewForm';
import { FillForm } from './pages/FillForm';

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/new-form', element: <NewForm /> },
      { path: '/fill-form/:sessionId', element: <FillForm /> },
    ],
  },
]);
