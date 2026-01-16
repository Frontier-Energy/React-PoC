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
            { type: 'link', text: 'New Form', href: '#/new-form' },
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
