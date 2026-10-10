import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { registerUnauthorizedHandler, portalApiPost } from '../services/apiClient';
import { updateProfileApi } from '../services/dataService';
import { supabase } from '../services/supabaseClient';

const AuthContext = createContext(null);

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';
const ENABLE_DEMO_ADMIN = import.meta.env.VITE_ENABLE_DEMO_ADMIN === 'true';
const DEMO_ADMIN_EMAIL = (import.meta.env.VITE_DEMO_ADMIN_EMAIL || 'admin.viewer@palmvillage.id').toLowerCase();
const DEMO_ADMIN_PASS = import.meta.env.VITE_DEMO_ADMIN_PASS || 'demo123';
const DEMO_STORAGE_KEY = 'pv_demo_session';
const APP_TOKEN_STORAGE_KEY = 'pv_app_jwt';
const APP_USER_STORAGE_KEY = 'pv_current_user';
const APP_TOKEN_EXPIRES_AT_STORAGE_KEY = 'pv_app_jwt_expires_at';
const N8N_API_BASE_URL = (import.meta.env.VITE_N8N_API_BASE_URL || '').replace(/\/+$/, '');
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

// Akun demo untuk preview UI tanpa project Supabase.
// (hanya aktif saat VITE_DEMO_MODE=true)
const DEMO_ACCOUNTS = {
  'dyudhiantoro@gmail.com': {
    password: 'demo123',
    profile: {
      id: 'superadmin-dyudhiantoro',
      full_name: 'Dhani Yudhiantoro (Superadmin)',
      phone: '0812-0000-0001',
      role: 'admin',
      unit_id: null,
      occupancy_status: null,
      is_active: true,
      email: 'dyudhiantoro@gmail.com',
      is_superadmin: true,
    },
  },
};

const DEMO_USERS = [];


// ====== Demo auth (mock, tanpa Supabase) ======
function useDemoAuth() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem(DEMO_STORAGE_KEY);
    if (saved) setProfile(JSON.parse(saved));
    setLoading(false);
  }, []);

  const persist = (p) => {
    setProfile(p);
    if (p) localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(p));
    else localStorage.removeItem(DEMO_STORAGE_KEY);
  };

  const signIn = useCallback(async (email, password) => {
    const emailLower = email.toLowerCase();
    // 1. Coba cari di DEMO_ACCOUNTS (akun demo bawaan)
    const acc = DEMO_ACCOUNTS[emailLower];
    if (acc) {
      if (acc.password !== password) {
        throw new Error('Email atau password demo salah. Coba admin@palmvillage.id / demo123');
      }
      persist(acc.profile);
      return;
    }
    // 2. Cari di mockProfiles (user hasil registrasi / dynamic)
    const { mockProfiles } = await import('../services/mockData');
    const found = mockProfiles.find(
      (p) => p.email?.toLowerCase() === emailLower
    );
    if (!found) {
      throw new Error('Email atau password salah.');
    }
    // Cek approval status
    if (found.approval_status === 'pending') {
      throw new Error('Akun Anda belum disetujui oleh pengurus. Silakan tunggu proses verifikasi.');
    }
    if (found.approval_status === 'blocked') {
      throw new Error('Akun Gmail ini diblokir. Hubungi Admin untuk membuka blokir.');
    }
    if (found.approval_status === 'rejected') {
      throw new Error('Pendaftaran Anda ditolak oleh pengurus. Silakan hubungi pengelola.');
    }
    if (!found.is_active) {
      throw new Error('Akun Anda telah dinonaktifkan. Silakan hubungi pengelola.');
    }
    // Password check untuk non-demo accounts (demo: semua pakai 'demo123')
    if (password !== 'demo123') {
      throw new Error('Password salah.');
    }
    persist(found);
  }, []);

  const signUp = useCallback(async (email, _password, fullName, phone, unitId) => {
    // Cek apakah email sudah terdaftar
    const { mockProfiles } = await import('../services/mockData');
    const exists = mockProfiles.find(
      (p) => p.email?.toLowerCase() === email.toLowerCase()
    );
    if (exists) {
      if (exists.approval_status === 'blocked') {
        throw new Error('Akun Gmail ini diblokir. Hubungi Admin untuk membuka blokir.');
      }
      if (exists.approval_status !== 'rejected') {
        throw new Error('Email sudah terdaftar. Silakan gunakan email lain.');
      }
      Object.assign(exists, {
        full_name: fullName || exists.full_name,
        phone: phone || null,
        unit_id: unitId ? Number(unitId) : null,
        is_active: true,
        approval_status: 'pending',
        rejection_reason: null,
        rejected_by: null,
        rejected_at: null,
        registered_at: new Date().toISOString(),
      });
      return { pending: true, message: 'Pendaftaran berhasil dikirim ulang! Silakan tunggu persetujuan dari pengurus RT.' };
    }
    // Buat profil pending (TIDAK auto-login)
    const newProfile = {
      id: 'reg-' + Date.now(),
      full_name: fullName || email.split('@')[0],
      phone: phone || null,
      email: email.toLowerCase(),
      role: 'warga',
      unit_id: unitId ? Number(unitId) : null,
      occupancy_status: null,
      is_active: false,
      approval_status: 'pending',
      registered_at: new Date().toISOString(),
    };
    mockProfiles.push(newProfile);
    // Return khusus: jangan persist session, kembalikan info pending
    return { pending: true, message: 'Pendaftaran berhasil! Silakan tunggu persetujuan dari pengurus RT.' };
  }, []);

  const updateProfile = useCallback(async (newProps) => {
    const { updateMockUser } = await import('../services/mockData');
    if (profile) {
      if (profile.is_read_only || profile.role === 'admin_viewer') {
        throw new Error('Akun read-only tidak diizinkan memperbarui profil.');
      }
      const updated = updateMockUser(profile.id, newProps);
      if (updated) {
        persist(updated);
        return updated;
      }
    }
    return null;
  }, [profile]);

  const signInWithSupabaseGoogle = useCallback(async () => {
    const acc = DEMO_ACCOUNTS['dyudhiantoro@gmail.com'];
    if (acc) persist(acc.profile);
  }, []);

  const signOut = useCallback(async () => {
    localStorage.removeItem('pv_active_tenant_id');
    persist(null);
  }, []);

  const isSuperAdmin = (profile?.email || '').toLowerCase() === 'dyudhiantoro@gmail.com';

  return {
    session: profile ? { user: { id: profile.id, email: profile.email } } : null,
    user: profile ? { id: profile.id, email: profile.email, full_name: profile.full_name, is_superadmin: isSuperAdmin } : null,
    profile: profile ? { ...profile, is_superadmin: isSuperAdmin } : null,
    role: profile?.role ?? null,
    isReadOnly: Boolean(profile?.is_read_only || profile?.role === 'admin_viewer'),
    isSuperAdmin,
    isAuthenticated: !!profile,
    loading,
    signIn,
    signUp,
    signInWithSupabaseGoogle,
    signOut,
    updateProfile,
  };
}



function extractCurrentUser(data) {
  return data?.currentUser || data?.profile || data?.user || null;
}

function decodeJwtPayload(token) {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const decoded = atob(padded);
    return JSON.parse(decoded);
  } catch (_error) {
    return null;
  }
}

function resolveTokenExpiry(token, expiresAt) {
  if (expiresAt) return expiresAt;
  const payload = decodeJwtPayload(token);
  return payload?.exp ? new Date(payload.exp * 1000).toISOString() : null;
}

function hasExpired(expiresAt) {
  if (!expiresAt) return false;
  const time = Date.parse(expiresAt);
  return Number.isFinite(time) && time <= Date.now();
}

function mapAuthError(error) {
  switch (error?.code) {
    case 'PENDING_APPROVAL':
      return {
        status: 'pending_approval',
        message: error.message || 'Akun masih menunggu verifikasi pengurus.',
      };
    case 'ACCOUNT_REJECTED':
      return {
        status: 'rejected',
        message: error.message || 'Pendaftaran Anda ditolak. Silakan hubungi pengurus.',
      };
    case 'ACCOUNT_BLOCKED':
      return {
        status: 'blocked',
        message: error.message || 'Akun Gmail ini diblokir. Hubungi Admin untuk membuka blokir.',
      };
    case 'SUSPENDED_USER':
      return {
        status: 'suspended',
        message: error.message || 'Akun tidak aktif. Hubungi pengurus.',
      };
    case 'UNAUTHORIZED':
    case 'INVALID_TOKEN':
    case 'TOKEN_EXPIRED':
      return {
        status: 'invalid_session',
        message: error.message || 'Sesi berakhir. Silakan login ulang.',
      };
    default:
      return {
        status: error?.status === 403 ? 'forbidden' : 'session_check_failed',
        message: error?.message || 'Sesi tidak dapat diverifikasi. Silakan login ulang.',
      };
  }
}

// ====== n8n App JWT auth + Supabase Auth (production) ======
function useProductionAuth() {
  const [session, setSession] = useState(null);
  const [supabaseUser, setSupabaseUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accountStatus, setAccountStatus] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [tokenExpiresAt, setTokenExpiresAt] = useState(null);

  // Sinkronisasi sesi Supabase Auth
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data: { session: sbSession } }) => {
      if (mounted && sbSession?.user) {
        setSupabaseUser(sbSession.user);
      }
    }).catch(() => {});

    const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange((_event, sbSession) => {
      if (mounted) {
        setSupabaseUser(sbSession?.user ?? null);
      }
    });

    return () => {
      mounted = false;
      authSubscription?.unsubscribe();
    };
  }, []);

  const persist = useCallback((token, currentUser, expiresAt) => {
    if (token && currentUser) {
      const resolvedExpiresAt = resolveTokenExpiry(token, expiresAt);
      localStorage.setItem(APP_TOKEN_STORAGE_KEY, token);
      localStorage.setItem(APP_USER_STORAGE_KEY, JSON.stringify(currentUser));
      if (resolvedExpiresAt) {
        localStorage.setItem(APP_TOKEN_EXPIRES_AT_STORAGE_KEY, resolvedExpiresAt);
      } else {
        localStorage.removeItem(APP_TOKEN_EXPIRES_AT_STORAGE_KEY);
      }
      setSession({ access_token: token, user: { id: currentUser.id, email: currentUser.email } });
      setProfile(currentUser);
      setAccountStatus(currentUser.approval_status || 'approved');
      setAuthError(null);
      setTokenExpiresAt(resolvedExpiresAt);
      return;
    }

    localStorage.removeItem(APP_TOKEN_STORAGE_KEY);
    localStorage.removeItem(APP_USER_STORAGE_KEY);
    localStorage.removeItem(APP_TOKEN_EXPIRES_AT_STORAGE_KEY);
    setSession(null);
    setProfile(null);
    setTokenExpiresAt(null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const restoreSession = async () => {
      const token = localStorage.getItem(APP_TOKEN_STORAGE_KEY);
      const savedUser = localStorage.getItem(APP_USER_STORAGE_KEY);
      const savedExpiresAt = localStorage.getItem(APP_TOKEN_EXPIRES_AT_STORAGE_KEY);

      if (!token) {
        persist(null, null);
        if (!cancelled) setLoading(false);
        return;
      }

      if (hasExpired(savedExpiresAt)) {
        persist(null, null);
        if (!cancelled) {
          setAccountStatus('invalid_session');
          setAuthError('Sesi berakhir. Silakan login ulang.');
          setLoading(false);
        }
        return;
      }

      try {
        if (savedUser) {
          const currentUser = JSON.parse(savedUser);
          if (!cancelled) {
            setSession({ access_token: token, user: { id: currentUser.id, email: currentUser.email } });
            setProfile(currentUser);
            setAccountStatus(currentUser.approval_status || 'approved');
            setTokenExpiresAt(savedExpiresAt || resolveTokenExpiry(token, null));
          }
        }

        const data = await portalApiPost('/auth/me', { token });
        if (cancelled) return;

        const currentUser = extractCurrentUser(data);
        if (!currentUser) {
          throw new Error('Profil sesi tidak diterima dari server.');
        }

        persist(token, currentUser, savedExpiresAt || resolveTokenExpiry(token, null));
      } catch (error) {
        const authState = mapAuthError(error);
        persist(null, null);
        if (!cancelled) {
          setAccountStatus(authState.status);
          setAuthError(authState.message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    restoreSession();

    return () => {
      cancelled = true;
    };
  }, [persist]);

  const signInWithGoogle = useCallback(async (idToken, { unitId } = {}) => {
    let data;
    setAuthError(null);
    setAccountStatus(null);
    try {
      data = await portalApiPost('/auth/google', {
        body: {
          id_token: idToken,
          unit_id: unitId ? Number(unitId) : null,
        },
      });
    } catch (error) {
      const authState = mapAuthError(error);
      persist(null, null);
      setAccountStatus(authState.status);
      setAuthError(authState.message);
      throw error;
    }

    const currentUser = extractCurrentUser(data);
    const approvalStatus = data?.approval_status || currentUser?.approval_status || data?.status || null;

    if (approvalStatus === 'registration_required' || data?.registration_required === true) {
      persist(null, null);
      setAccountStatus('registration_required');
      setAuthError(null);
      return {
        registrationRequired: true,
        message: data?.message || 'Pilih unit rumah untuk melanjutkan pendaftaran.',
        currentUser,
        units: Array.isArray(data?.units) ? data.units : [],
      };
    }

    if (approvalStatus === 'pending_approval' || approvalStatus === 'pending') {
      persist(null, null);
      setAccountStatus('pending_approval');
      setAuthError(data?.message || 'Akun Anda menunggu persetujuan pengurus.');
      return {
        pending: true,
        message: data?.message || 'Akun Anda menunggu persetujuan pengurus.',
        currentUser,
      };
    }

    if (approvalStatus === 'rejected' || approvalStatus === 'suspended') {
      persist(null, null);
      setAccountStatus(approvalStatus);
      setAuthError(
        approvalStatus === 'suspended'
          ? 'Akun Anda sedang dinonaktifkan. Silakan hubungi pengurus.'
          : 'Pendaftaran Anda ditolak. Silakan hubungi pengurus.'
      );
      throw new Error(
        approvalStatus === 'suspended'
          ? 'Akun Anda sedang dinonaktifkan. Silakan hubungi pengurus.'
          : 'Pendaftaran Anda ditolak. Silakan hubungi pengurus.'
      );
    }

    const appToken = data?.app_jwt || data?.appJwt || data?.token || data?.access_token;
    if (!appToken || !currentUser) {
      throw new Error('Login Google berhasil, tetapi App JWT belum diterima.');
    }

    persist(appToken, currentUser, data?.expires_at || data?.expiresAt);
    return { currentUser };
  }, [persist]);

  const signIn = useCallback(async () => {
    throw new Error('Production mode hanya mendukung login Google.');
  }, []);

  const signUp = useCallback(async () => {
    throw new Error('Pendaftaran production dilakukan melalui login Google.');
  }, []);

  const loginDemoAdmin = useCallback(async () => {
    if (!ENABLE_DEMO_ADMIN) {
      throw new Error('Login Admin Demo tidak diaktifkan.');
    }

    const data = await portalApiPost('/auth/demo', {
      body: {
        email: DEMO_ADMIN_EMAIL,
        password: DEMO_ADMIN_PASS,
      },
    });
    const currentUser = extractCurrentUser(data);
    const token = data?.app_jwt || data?.appJwt || data?.token || data?.access_token;
    if (!currentUser || !token) {
      throw new Error('Profil Admin Demo tidak diterima dari server.');
    }

    const readOnlyProfile = { ...currentUser, is_read_only: true };
    const expiresAt = data?.expires_at || data?.expiresAt || resolveTokenExpiry(token, null);
    persist(token, readOnlyProfile, expiresAt);
    return { currentUser: readOnlyProfile };
  }, [persist]);

  const signInWithSupabaseGoogle = useCallback(async (options = {}) => {
    const redirectTo = options.redirectTo || `${window.location.origin}/`;
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
      },
    });
    if (error) throw error;
    return data;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch (_e) {
      // ignore
    }
    localStorage.removeItem('pv_active_tenant_id');
    setSupabaseUser(null);
    persist(null, null);
  }, [persist]);

  useEffect(() => {
    registerUnauthorizedHandler(({ path } = {}) => {
      // Only the canonical session validation endpoint can invalidate the
      // browser session. A 401 from a secondary page endpoint must remain a
      // page-level error and must never log the user out.
      if (path === '/auth/me') {
        persist(null, null);
      }
    });
  }, [signOut, persist]);

  const updateProfile = useCallback(async (newProps) => {
    if (!profile) return null;
    if (
      profile.is_read_only ||
      profile.role === 'admin_viewer' ||
      (ENABLE_DEMO_ADMIN && profile.email?.toLowerCase() === DEMO_ADMIN_EMAIL)
    ) {
      throw new Error('⚠️ Akun Admin Demo (View Only) tidak diizinkan memperbarui profil.');
    }
    const editableProps = {
      ...(Object.prototype.hasOwnProperty.call(newProps, 'full_name') ? { full_name: newProps.full_name } : {}),
      ...(Object.prototype.hasOwnProperty.call(newProps, 'phone') ? { phone: newProps.phone } : {}),
      ...(Object.prototype.hasOwnProperty.call(newProps, 'avatar_url') ? { avatar_url: newProps.avatar_url } : {}),
    };
    try {
      await updateProfileApi(session?.access_token, editableProps);
    } catch (err) {
      throw err;
    }
    const updated = { ...profile, ...editableProps };
    persist(session?.access_token, updated, tokenExpiresAt);
    return updated;
  }, [persist, profile, session?.access_token, tokenExpiresAt]);

  const isReadOnly = Boolean(
    profile?.is_read_only ||
    profile?.role === 'admin_viewer' ||
    (ENABLE_DEMO_ADMIN && profile?.email?.toLowerCase() === DEMO_ADMIN_EMAIL)
  );

  const isSuperAdmin = (supabaseUser?.email || session?.user?.email || profile?.email || '').toLowerCase() === 'dyudhiantoro@gmail.com';

  const resolvedUser = supabaseUser
    ? {
        id: supabaseUser.id,
        email: supabaseUser.email,
        full_name: supabaseUser.user_metadata?.full_name || supabaseUser.email?.split('@')[0] || 'User',
        is_superadmin: isSuperAdmin,
        ...profile,
      }
    : (session?.user ? { ...session.user, is_superadmin: isSuperAdmin } : (profile ? { id: profile.id, email: profile.email, is_superadmin: isSuperAdmin, ...profile } : null));

  return {
    session,
    user: resolvedUser,
    profile: profile || (supabaseUser ? { id: supabaseUser.id, email: supabaseUser.email, full_name: supabaseUser.user_metadata?.full_name, is_superadmin: isSuperAdmin } : null),
    role: profile?.role ?? null,
    isReadOnly,
    isSuperAdmin,
    enableDemoAdmin: ENABLE_DEMO_ADMIN,
    demoAdminEmail: DEMO_ADMIN_EMAIL,
    isAuthenticated: Boolean(session || supabaseUser),
    loading,
    accountStatus,
    authError,
    tokenExpiresAt,
    signIn,
    signUp,
    signInWithGoogle,
    signInWithSupabaseGoogle,
    loginDemoAdmin,
    signOut,
    updateProfile,
  };
}

function DemoAuthProvider({ children }) {
  const auth = useDemoAuth();
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

function ProductionAuthProvider({ children }) {
  const auth = useProductionAuth();
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }) {
  if (DEMO_MODE) {
    return <DemoAuthProvider>{children}</DemoAuthProvider>;
  }
  return <ProductionAuthProvider>{children}</ProductionAuthProvider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth harus dipakai di dalam <AuthProvider>');
  return ctx;
}

// Export konstanta untuk dipakai di komponen lain (mis. Login menampilkan info akun demo).
export const IS_DEMO_MODE = DEMO_MODE;
export const ENABLE_DEMO_ADMIN_MODE = ENABLE_DEMO_ADMIN;
export const DEMO_ADMIN_EMAIL_ADDR = DEMO_ADMIN_EMAIL;
export const DEMO_ACCOUNT_LIST = DEMO_USERS;
export const GOOGLE_AUTH_READY = Boolean(GOOGLE_CLIENT_ID && N8N_API_BASE_URL);
export const GOOGLE_OAUTH_CLIENT_ID = GOOGLE_CLIENT_ID;
export const PORTAL_API_BASE_URL = N8N_API_BASE_URL;
