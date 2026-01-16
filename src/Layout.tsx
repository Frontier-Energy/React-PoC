import { AppLayout, SideNavigation } from '@cloudscape-design/components';
import { Outlet, useNavigate } from 'react-router-dom';

export function Layout() {
  const navigate = useNavigate();

  return (
    <AppLayout
      content={<Outlet />}
      navigation={
        <SideNavigation
          items={[
            { type: 'link', text: 'Home', href: '#/' },
            { type: 'link', text: 'New Inspection', href: '#/new-inspection' },
            { type: 'link', text: 'My Inspections', href: '#/my-inspections' },
          ]}
          onFollow={(event) => {
            event.preventDefault();
            navigate(event.detail.href.replace('#', ''));
          }}
        />
      }
    />
  );
}
