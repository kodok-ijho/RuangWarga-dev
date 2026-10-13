// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Login, { resolveSafeRedirectPath } from './Login';

afterEach(cleanup);

const mockSignInWithSupabaseGoogle = vi.fn().mockResolvedValue({});

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    signIn: vi.fn(),
    signUp: vi.fn(),
    signInWithGoogle: vi.fn(),
    signInWithSupabaseGoogle: mockSignInWithSupabaseGoogle,
    loginDemoAdmin: vi.fn(),
    enableDemoAdmin: vi.fn(),
    isAuthenticated: false,
    loading: false,
    accountStatus: null,
    authError: null,
  }),
  IS_DEMO_MODE: false,
  GOOGLE_AUTH_READY: false,
  GOOGLE_OAUTH_CLIENT_ID: 'test-client-id',
}));

describe('resolveSafeRedirectPath', () => {
  it('mengembalikan string path aman secara langsung', () => {
    expect(resolveSafeRedirectPath('/join/ABC')).toBe('/join/ABC');
  });

  it('mengembalikan kombinasi pathname dan search dari objek location', () => {
    expect(resolveSafeRedirectPath({ pathname: '/join/ABC', search: '?x=1' })).toBe('/join/ABC?x=1');
  });

  it('mengembalikan kombinasi pathname, search, dan hash dari objek location', () => {
    expect(
      resolveSafeRedirectPath({ pathname: '/join/ABC', search: '?x=1', hash: '#section' })
    ).toBe('/join/ABC?x=1#section');
  });

  it('mengembalikan / jika input undefined, null, atau kosong', () => {
    expect(resolveSafeRedirectPath(undefined)).toBe('/');
    expect(resolveSafeRedirectPath(null)).toBe('/');
    expect(resolveSafeRedirectPath('')).toBe('/');
  });

  it('mencegah open redirect dengan //evil.com', () => {
    expect(resolveSafeRedirectPath('//evil.com')).toBe('/');
  });

  it('mencegah open redirect dengan URL absolut https://evil.com', () => {
    expect(resolveSafeRedirectPath('https://evil.com')).toBe('/');
  });

  it('mencegah open redirect dengan backslash /\\evil', () => {
    expect(resolveSafeRedirectPath('/\\evil')).toBe('/');
  });

  it('mencegah open redirect pada objek location dengan protokol eksternal', () => {
    expect(resolveSafeRedirectPath({ pathname: 'https://evil.com' })).toBe('/');
    expect(resolveSafeRedirectPath({ pathname: '//evil.com' })).toBe('/');
    expect(resolveSafeRedirectPath({ pathname: '/path', search: '?u=http://evil.com' })).toBe('/');
  });
});

describe('Login component', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('memanggil signInWithSupabaseGoogle dengan redirectTo berakhiran /join/ABC123 saat state.from = /join/ABC123', () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/login', state: { from: '/join/ABC123' } }]}>
        <Login />
      </MemoryRouter>
    );

    const googleBtn = screen.getByRole('button', { name: /Masuk dengan Akun Google/i });
    fireEvent.click(googleBtn);

    expect(mockSignInWithSupabaseGoogle).toHaveBeenCalledTimes(1);
    expect(mockSignInWithSupabaseGoogle).toHaveBeenCalledWith({
      redirectTo: expect.stringMatching(/\/join\/ABC123$/),
    });
  });

  it('menggunakan redirectTo berakhiran / jika state.from berbahaya atau tidak ada', () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/login', state: { from: '//evil.com' } }]}>
        <Login />
      </MemoryRouter>
    );

    const googleBtn = screen.getByRole('button', { name: /Masuk dengan Akun Google/i });
    fireEvent.click(googleBtn);

    expect(mockSignInWithSupabaseGoogle).toHaveBeenCalledTimes(1);
    expect(mockSignInWithSupabaseGoogle).toHaveBeenCalledWith({
      redirectTo: expect.stringMatching(/\/$/),
    });
  });
});
