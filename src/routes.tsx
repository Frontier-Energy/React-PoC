import { createBrowserRouter } from 'react-router-dom';
import { Layout } from './Layout';
import { Home } from './pages/Home';
import { NewInspection } from './pages/NewInspection';
import { FillForm } from './pages/FillForm';
import { MyInspections } from './pages/MyInspections';

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/new-inspection', element: <NewInspection /> },
      { path: '/fill-form/:sessionId', element: <FillForm /> },
      { path: '/my-inspections', element: <MyInspections /> },
    ],
  },
]);
