/**
 * Storage Policy & Path Security Helpers — Sub-Gate 8.1-B5 (Storage RLS Hardening)
 *
 * Canonical Path Specification:
 *   expense-receipts/{tenant_id}/expenses/{year}/{uuid}_{safe_file_name}
 *
 * Security Model:
 * 1. Cross-tenant access denied
 * 2. Regular tenant member access denied (staff with manage_expenses only)
 * 3. Anonymous/public access denied (private bucket)
 * 4. Path traversal / non-canonical structure denied
 */

const CANONICAL_PATH_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/expenses\/[12][0-9]{3}\/[a-zA-Z0-9_\-.]+$/;

/**
 * Sanitizes a filename to ensure safe alphanumeric characters, dashes, underscores, and dots.
 * @param {string} fileName
 * @returns {string}
 */
export function sanitizeStorageFileName(fileName = '') {
  if (!fileName || typeof fileName !== 'string') return 'file';
  // Strip path traversal attempts and special characters
  const basename = fileName.split(/[/\\]/).pop();
  return basename.replace(/[^a-zA-Z0-9_.-]/g, '_');
}

/**
 * Builds the canonical tenant-scoped storage path for an expense receipt.
 *
 * Format: {tenant_id}/expenses/{year}/{uuid}_{safe_file_name}
 *
 * @param {object} params
 * @param {string} params.tenantId - Owning tenant UUID
 * @param {string} [params.expenseDate] - ISO Date 'YYYY-MM-DD'
 * @param {string} params.fileName - Original file name
 * @param {string} [params.uuid] - Optional UUID override (e.g. for deterministic testing)
 * @returns {string}
 */
export function buildCanonicalExpenseReceiptPath({ tenantId, expenseDate, fileName, uuid }) {
  if (!tenantId || typeof tenantId !== 'string') {
    throw new Error('tenantId wajib disertakan untuk penyimpanan receipt.');
  }

  const year = expenseDate && typeof expenseDate === 'string' && expenseDate.length >= 4
    ? expenseDate.substring(0, 4)
    : new Date().toISOString().substring(0, 4);

  const fileId = uuid || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'uuid-' + Math.random().toString(36).substring(2, 10));
  const safeName = sanitizeStorageFileName(fileName);

  return `${tenantId}/expenses/${year}/${fileId}_${safeName}`;
}

/**
 * Validates whether a storage path strictly follows the canonical expense receipt structure.
 * @param {string} path
 * @returns {boolean}
 */
export function isValidExpenseReceiptPath(path) {
  if (!path || typeof path !== 'string') return false;
  if (path.includes('..') || path.startsWith('/') || path.startsWith('\\')) return false;
  return CANONICAL_PATH_REGEX.test(path);
}

/**
 * Extracts the tenant UUID from a storage path.
 * @param {string} path
 * @returns {string|null}
 */
export function extractTenantIdFromPath(path) {
  if (!isValidExpenseReceiptPath(path)) return null;
  return path.split('/')[0];
}

/**
 * Evaluates storage authorization for reading or writing an expense receipt.
 * Mirrors the server-side Storage RLS policies.
 *
 * @param {object} params
 * @param {string} [params.userId] - Authenticated user ID (null for anonymous)
 * @param {string} [params.userTenantId] - Tenant ID where user is a member
 * @param {string[]} [params.userPermissions] - Array of permission keys held by user
 * @param {boolean} [params.isPlatformAdmin] - Whether user is platform superadmin
 * @param {boolean} [params.isTenantOwner] - Whether user is owner of the target tenant
 * @param {string} [params.subscriptionStatus] - Tenant subscription status ('active', 'trial', 'read_only')
 * @param {string} params.path - Target storage object path
 * @param {'SELECT'|'INSERT'|'DELETE'} [params.operation] - Operation requested
 * @returns {boolean}
 */
export function canAccessExpenseReceipt({
  userId,
  userTenantId,
  userPermissions = [],
  isPlatformAdmin = false,
  isTenantOwner = false,
  subscriptionStatus = 'active',
  path,
  operation = 'SELECT',
}) {
  // 1. Anonymous access is strictly denied
  if (!userId) return false;

  // 2. Path must strictly match canonical tenant path (no traversal, no foreign folders)
  if (!isValidExpenseReceiptPath(path)) return false;

  // 3. Platform admin has superuser access
  if (isPlatformAdmin) return true;

  const targetTenantId = extractTenantIdFromPath(path);
  if (!targetTenantId) return false;

  // 4. Cross-tenant access is strictly denied
  if (userTenantId !== targetTenantId && !isTenantOwner) return false;

  // 5. Must hold manage_expenses permission or be tenant owner
  const hasManageExpenses = isTenantOwner || userPermissions.includes('manage_expenses');
  if (!hasManageExpenses) return false;

  // 6. Write operations require active/trial subscription (read_only blocks mutations)
  if (operation === 'INSERT' || operation === 'DELETE') {
    if (subscriptionStatus === 'read_only') return false;
  }

  return true;
}

/**
 * Generates an authorized signed URL for an expense receipt object.
 * Standard lifetime: 3600 seconds (60 minutes).
 *
 * @param {object} supabaseClient - Supabase client instance
 * @param {string} path - Canonical object path inside expense-receipts bucket
 * @param {number} [expiresInSeconds=3600] - Expiry in seconds (default: 60 minutes)
 * @returns {Promise<string>} Signed URL string
 */
export async function createReceiptSignedUrl(supabaseClient, path, expiresInSeconds = 3600) {
  if (!supabaseClient) throw new Error('Supabase client diperlukan untuk membuat signed URL.');
  if (!isValidExpenseReceiptPath(path)) {
    throw new Error('Path storage bukti pengeluaran tidak valid atau melanggar struktur canonical.');
  }

  const { data, error } = await supabaseClient.storage
    .from('expense-receipts')
    .createSignedUrl(path, expiresInSeconds);

  if (error) throw error;
  return data?.signedUrl || '';
}
