import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LocalizationProvider } from '../LocalizationContext';
import { Login } from './Login';
import { getFallbackLabels } from '../resources/translations/fallback';

const { navigateMock, lookupLoginIdentityMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  lookupLoginIdentityMock: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('../application/authApplicationService', () => ({
  authApplicationService: {
    lookupLoginIdentity: lookupLoginIdentityMock,
  },
}));

vi.mock('@cloudscape-design/components', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  return {
    Header: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1>,
    Container: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SpaceBetween: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    FormField: ({ label, errorText, children }: { label: string; errorText?: string; children: React.ReactNode }) => (
      <label>
        <span>{label}</span>
        {children}
        {errorText ? <span>{errorText}</span> : null}
      </label>
    ),
    Input: ({
      value,
      onChange,
      onKeyDown,
      placeholder,
      disabled,
      type,
    }: {
      value: string;
      onChange: (event: { detail: { value: string } }) => void;
      onKeyDown?: (event: { detail: { key: string } }) => void;
      placeholder?: string;
      disabled?: boolean;
      type?: string;
    }) => (
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange({ detail: { value: event.target.value } })}
        onKeyDown={(event) => onKeyDown?.({ detail: { key: event.key } })}
      />
    ),
    Button: ({
      children,
      onClick,
      disabled,
    }: {
      children: React.ReactNode;
      onClick: () => void;
      disabled?: boolean;
    }) => (
      <button type="button" onClick={onClick} disabled={disabled}>
        {children}
      </button>
    ),
    Box: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Link: ({ children, onFollow }: { children: React.ReactNode; onFollow: () => void }) => (
      <button type="button" onClick={onFollow}>
        {children}
      </button>
    ),
  };
});

describe('Login', () => {
  const buildTranslationResponse = (language: 'en' | 'es') =>
    new Response(JSON.stringify(getFallbackLabels(language)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  const withTranslationResponses = () => {
    vi.spyOn(global, 'fetch').mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/translations/es')) {
        return Promise.resolve(buildTranslationResponse('es'));
      }
      if (url.includes('/translations/en')) {
        return Promise.resolve(buildTranslationResponse('en'));
      }

      throw new Error(`Unexpected fetch call in Login test: ${url}`);
    });
  };

  beforeEach(() => {
    navigateMock.mockReset();
    lookupLoginIdentityMock.mockReset();
    vi.restoreAllMocks();
    withTranslationResponses();
  });

  it('keeps login page visible when opened directly', async () => {
    render(
      <LocalizationProvider>
        <Login />
      </LocalizationProvider>
    );

    expect(await screen.findByRole('heading', { name: 'Login' })).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('shows required-email validation when enter is pressed on empty value', async () => {
    render(
      <LocalizationProvider>
        <Login />
      </LocalizationProvider>
    );

    fireEvent.keyDown(screen.getByPlaceholderText('you@example.com'), { key: 'Enter' });

    expect(await screen.findByText('Email is required.')).toBeInTheDocument();
  });

  it('logs in and navigates when lookup returns a user id', async () => {
    lookupLoginIdentityMock.mockResolvedValue({
      userId: 'abc-123',
      roles: ['user'],
    });

    render(
      <LocalizationProvider>
        <Login />
      </LocalizationProvider>
    );

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'me@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() => {
      expect(lookupLoginIdentityMock).toHaveBeenCalledWith('me@example.com');
      expect(navigateMock).toHaveBeenCalledWith('/my-inspections', { replace: true });
    });
  });

  it('trims whitespace before looking up the login identity', async () => {
    lookupLoginIdentityMock.mockResolvedValue({
      userId: 'abc-123',
      roles: ['user'],
    });

    render(
      <LocalizationProvider>
        <Login />
      </LocalizationProvider>
    );

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: '  admin@frontierEnergy.com  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() => {
      expect(lookupLoginIdentityMock).toHaveBeenCalledWith('admin@frontierEnergy.com');
      expect(navigateMock).toHaveBeenCalledWith('/my-inspections', { replace: true });
    });
  });

  it('shows missing-user-id error when lookup response has no user id', async () => {
    lookupLoginIdentityMock.mockResolvedValue({
      userId: '',
      roles: ['user'],
    });

    render(
      <LocalizationProvider>
        <Login />
      </LocalizationProvider>
    );

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'me@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    expect(await screen.findByText('Login lookup did not return a user ID.')).toBeInTheDocument();
    expect(lookupLoginIdentityMock).toHaveBeenCalledWith('me@example.com');
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('shows lookup error when fetch fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    lookupLoginIdentityMock.mockRejectedValue(new Error('network error'));

    render(
      <LocalizationProvider>
        <Login />
      </LocalizationProvider>
    );

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'me@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    expect(await screen.findByText('Unable to look up that email address. Please try again.')).toBeInTheDocument();
    expect(errorSpy).toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('shows missing-user-id error when lookup returns non-ok response', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    lookupLoginIdentityMock.mockRejectedValue(new Error('Login lookup failed with status 401'));

    render(
      <LocalizationProvider>
        <Login />
      </LocalizationProvider>
    );

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'me@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    expect(await screen.findByText('Unable to look up that email address. Please try again.')).toBeInTheDocument();
    expect(errorSpy).toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('disables the login controls while lookup is in flight', async () => {
    let resolveLookup: ((value: { userId: string; roles: string[] }) => void) | undefined;
    lookupLoginIdentityMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLookup = resolve;
        })
    );

    render(
      <LocalizationProvider>
        <Login />
      </LocalizationProvider>
    );

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'me@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    expect(screen.getByPlaceholderText('you@example.com')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Login' })).toBeDisabled();

    resolveLookup?.({ userId: 'abc-123', roles: ['user'] });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Login' })).not.toBeDisabled();
      expect(navigateMock).toHaveBeenCalledWith('/my-inspections', { replace: true });
    });
  });

  it('navigates to register when create-account link is clicked', () => {
    render(
      <LocalizationProvider>
        <Login />
      </LocalizationProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Create an account' }));
    expect(navigateMock).toHaveBeenCalledWith('/register');
  });
});
