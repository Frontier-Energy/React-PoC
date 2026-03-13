import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LocalizationProvider } from '../LocalizationContext';
import { Register } from './Register';
import { getFallbackLabels } from '../resources/translations/fallback';

const { navigateMock, registerIdentityMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  registerIdentityMock: vi.fn(),
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
    registerIdentity: registerIdentityMock,
  },
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

  const withTranslationResponses = () => {
    vi.spyOn(global, 'fetch').mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
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
    registerIdentityMock.mockReset();
    vi.restoreAllMocks();
    withTranslationResponses();
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
    registerIdentityMock.mockResolvedValue({
      userId: 'registered-user',
      roles: ['user'],
    });

    render(
      <LocalizationProvider>
        <Register />
      </LocalizationProvider>
    );

    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    await waitFor(() => {
      expect(registerIdentityMock).toHaveBeenCalledWith({
        email: 'me@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
        invalidInputMessage: 'Registration failed due to invalid input. Please check your details and try again.',
        serverErrorMessage: 'Registration failed due to a server error. Please try again later.',
      });
      expect(navigateMock).toHaveBeenCalledWith('/my-inspections', { replace: true });
    });
  });

  it('navigates to login when registration succeeds without a user id', async () => {
    registerIdentityMock.mockResolvedValue({
      userId: '',
      roles: [],
    });

    render(
      <LocalizationProvider>
        <Register />
      </LocalizationProvider>
    );

    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    await waitFor(() => {
      expect(registerIdentityMock).toHaveBeenCalled();
      expect(navigateMock).toHaveBeenCalledWith('/login', { replace: true });
    });
  });

  it('disables the form while registration is in flight', async () => {
    let resolveRegistration: ((value: { userId: string; roles: string[] }) => void) | undefined;
    registerIdentityMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRegistration = resolve;
        })
    );

    render(
      <LocalizationProvider>
        <Register />
      </LocalizationProvider>
    );

    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    expect(screen.getByPlaceholderText('you@example.com')).toBeDisabled();
    expect(screen.getByPlaceholderText('First name')).toBeDisabled();
    expect(screen.getByPlaceholderText('Last name')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Create Account' })).toBeDisabled();

    resolveRegistration?.({ userId: '', roles: [] });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create Account' })).not.toBeDisabled();
      expect(navigateMock).toHaveBeenCalledWith('/login', { replace: true });
    });
  });

  it('shows invalid-input message for 400 responses', async () => {
    registerIdentityMock.mockRejectedValue(
      new Error('Registration failed due to invalid input. Please check your details and try again.')
    );
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
    registerIdentityMock.mockRejectedValue(
      new Error('Registration failed due to a server error. Please try again later.')
    );

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
    registerIdentityMock.mockRejectedValue('network down');

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
