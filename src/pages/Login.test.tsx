import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LocalizationProvider } from '../LocalizationContext';
import { Login } from './Login';

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
  beforeEach(() => {
    navigateMock.mockReset();
    setUserIdMock.mockReset();
    vi.restoreAllMocks();
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
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ userId: 'abc-123' }),
    } as Response);

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
      expect(setUserIdMock).toHaveBeenCalledWith('abc-123');
      expect(navigateMock).toHaveBeenCalledWith('/my-inspections', { replace: true });
    });
  });
});
