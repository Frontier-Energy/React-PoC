import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LocalizationProvider } from '../LocalizationContext';
import { Register } from './Register';

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
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ userID: 'registered-user' }),
    } as Response);

    render(
      <LocalizationProvider>
        <Register />
      </LocalizationProvider>
    );

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'me@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('First name'), { target: { value: 'Jane' } });
    fireEvent.change(screen.getByPlaceholderText('Last name'), { target: { value: 'Doe' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    await waitFor(() => {
      expect(setUserIdMock).toHaveBeenCalledWith('registered-user');
      expect(navigateMock).toHaveBeenCalledWith('/my-inspections', { replace: true });
    });
  });
});
