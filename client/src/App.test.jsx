import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false],
    updateServiceWorker: vi.fn(),
  }),
}));

import { AuthProvider } from './context/AuthContext';
import App from './App';

describe('App and AuthContext smoke test', () => {
  it('App component evaluates without reference errors', () => {
    expect(typeof App).toBe('function');
    const element = App();
    expect(element).toBeDefined();
  });

  it('AuthProvider renders without crashing via SSR renderToString', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => {
      renderToString(
        <AuthProvider>
          <div>Test Auth Consumer</div>
        </AuthProvider>
      );
    }).not.toThrow();
    warnSpy.mockRestore();
  });
});
