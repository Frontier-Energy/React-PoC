import { render, screen } from '@testing-library/react';
import { Home } from './Home';
import { LocalizationProvider } from '../LocalizationContext';
import { CUSTOMIZATION_STORAGE_KEY } from '../config';

describe('Home', () => {
  it('renders the default landing page heading', () => {
    render(
      <LocalizationProvider>
        <Home />
      </LocalizationProvider>
    );

    expect(screen.getByRole('heading', { name: 'Inspection Forms' })).toBeInTheDocument();
  });

  it('renders the heading in Spanish when a stored language exists', () => {
    localStorage.setItem(
      CUSTOMIZATION_STORAGE_KEY,
      JSON.stringify({ language: 'es' })
    );

    render(
      <LocalizationProvider>
        <Home />
      </LocalizationProvider>
    );

    expect(screen.getByRole('heading', { name: 'Formularios de inspeccion' })).toBeInTheDocument();
  });
});
