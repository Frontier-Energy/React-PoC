import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LocalizationProvider } from '../LocalizationContext';
import { Register } from './Register';
import { getFallbackLabels } from '../resources/translations/fallback';

const { navigateMock, setUserIdMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  setUserIdMock: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('../auth', () => ({
  setUserId: setUserIdMock,
  parseRolesFromAuthPayload: () => ['user'],
}));

vi.mock('@cloudscape-design/components', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  return {
    Header: ({
      children,
      actions,
    }: {
      children: React.ReactNode;
      actions?: React.ReactNode;
    }) => (
      <div>
        {actions}
        <h1>{children}</h1>
      </div>
    ),
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
      placeholder,
      disabled,
      type,
    }: {
      value: string;
      onChange: (event: { detail: { value: string } }) => void;
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
  };
});

describe('Register', () => {
  const buildTranslationResponse = (language: 'en' | 'es') =>
    new Response(JSON.stringify(getFallbackLabels(language)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  const withRegisterResponse = (response: Response | Promise<Response>) => {
    vi.spyOn(global, 'fetch').mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/auth/register')) {
        return Promise.resolve(response);
      }
      if (url.includes('/translations/es')) {
        return Promise.resolve(buildTranslationResponse('es'));
      }
      if (url.includes('/translations/en')) {
        return Promise.resolve(buildTranslationResponse('en'));
      }

      throw new Error(`Unexpected fetch call in Register test: ${url}`);
    });
  };

  const fillRequiredFields = () => {
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'me@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('First name'), { target: { value: 'Jane' } });
    fireEvent.change(screen.getByPlaceholderText('Last name'), { target: { value: 'Doe' } });
  };

  beforeEach(() => {
    navigateMock.mockReset();
    setUserIdMock.mockReset();
    vi.restoreAllMocks();
  });

  it('shows required-field validation for empty submission', async () => {
    render(
      <LocalizationProvider>
        <Register />
      </LocalizationProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    const errors = await screen.findAllByText('Email, first name, and last name are required.');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('registers and navigates to inspections when response contains user id', async () => {
    withRegisterResponse({
      ok: true,
      json: async () => ({ userID: 'registered-user' }),
    } as Response);

    render(
      <LocalizationProvider>
        <Register />
      </LocalizationProvider>
    );

    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    await waitFor(() => {
      expect(setUserIdMock).toHaveBeenCalledWith('registered-user', ['user']);
      expect(navigateMock).toHaveBeenCalledWith('/my-inspections', { replace: true });
    });
  });

  it('navigates to login when registration succeeds without a user id', async () => {
    withRegisterResponse({
      ok: true,
      json: async () => ({}),
    } as Response);

    render(
      <LocalizationProvider>
        <Register />
      </LocalizationProvider>
    );

    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    await waitFor(() => {
      expect(setUserIdMock).not.toHaveBeenCalled();
      expect(navigateMock).toHaveBeenCalledWith('/login', { replace: true });
    });
  });

  it('handles successful response with non-JSON payload by warning and navigating to login', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    withRegisterResponse({
      ok: true,
      json: async () => {
        throw new Error('not json');
      },
    } as Response);

    render(
      <LocalizationProvider>
        <Register />
      </LocalizationProvider>
    );

    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    await waitFor(() => {
      expect(warnSpy).toHaveBeenCalled();
      expect(navigateMock).toHaveBeenCalledWith('/login', { replace: true });
    });
  });

  it('shows invalid-input message for 400 responses', async () => {
    withRegisterResponse({
      ok: false,
      status: 400,
      json: async () => ({}),
    } as Response);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <LocalizationProvider>
        <Register />
      </LocalizationProvider>
    );

    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    const errors = await screen.findAllByText(
      'Registration failed due to invalid input. Please check your details and try again.'
    );
    expect(errors.length).toBeGreaterThan(0);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('shows server-error message for non-400/422 failures', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    withRegisterResponse({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as Response);

    render(
      <LocalizationProvider>
        <Register />
      </LocalizationProvider>
    );

    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    const errors = await screen.findAllByText(
      'Registration failed due to a server error. Please try again later.'
    );
    expect(errors.length).toBeGreaterThan(0);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('falls back to generic registration error when thrown value is not an Error instance', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(global, 'fetch').mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/auth/register')) {
        return Promise.reject('network down');
      }
      if (url.includes('/translations/es')) {
        return Promise.resolve(buildTranslationResponse('es'));
      }
      if (url.includes('/translations/en')) {
        return Promise.resolve(buildTranslationResponse('en'));
      }

      throw new Error(`Unexpected fetch call in Register test: ${url}`);
    });

    render(
      <LocalizationProvider>
        <Register />
      </LocalizationProvider>
    );

    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    const errors = await screen.findAllByText('Unable to register. Please try again.');
    expect(errors.length).toBeGreaterThan(0);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('navigates to login when Back to Login is clicked', () => {
    render(
      <LocalizationProvider>
        <Register />
      </LocalizationProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Back to Login' }));
    expect(navigateMock).toHaveBeenCalledWith('/login');
  });
});
