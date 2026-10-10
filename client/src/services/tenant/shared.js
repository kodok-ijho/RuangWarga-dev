/**
 * shared.js
 * Konfigurasi bersama dan konstanta internal untuk modul operasional tenant.
 * Tidak meng-import modul lain di folder ini.
 */

import { supabase } from '../supabaseClient';

export { supabase };

export const IS_DEMO = typeof import.meta !== 'undefined' && import.meta.env?.VITE_DEMO_MODE === 'true';
