/**
 * Financial Policy Invariant Helpers — Sub-Gate 8.1-B4 (Policy Option B)
 *
 * Policy Invariant Rules:
 * 1. A payment contributes monetary cash inflow ONLY when status === 'completed' AND amount > 0.
 * 2. Zero-amount completed payments are valid operational settlement markers
 *    (e.g. paid to external third-party accounts or manual waivers) but contribute Rp 0
 *    to cash inflow and must not inflate monetary transaction counts.
 * 3. Pending, pending_verification, and rejected payments do not contribute to recognized cash.
 * 4. Billing items represent accrual invoicing only and cannot independently recognize cash.
 */

/**
 * Checks if a payment record is a monetary cash inflow candidate.
 * @param {object} payment
 * @returns {boolean}
 */
export function isMonetaryCashPayment(payment) {
  if (!payment || typeof payment !== 'object') return false;
  if (payment.status !== 'completed') return false;
  const numAmount = Number(payment.amount);
  return !isNaN(numAmount) && numAmount > 0;
}

/**
 * Checks if a payment record represents an operational zero-amount settlement marker.
 * @param {object} payment
 * @returns {boolean}
 */
export function isOperationalZeroSettlement(payment) {
  if (!payment || typeof payment !== 'object') return false;
  if (payment.status !== 'completed') return false;
  const numAmount = Number(payment.amount);
  return !isNaN(numAmount) && numAmount === 0;
}

/**
 * Evaluates whether an accrual billing item can independently recognize cash inflow.
 * In cash-basis accounting, billing items NEVER independently create cash income.
 * @returns {boolean} always false
 */
export function isBillingItemCashInflow() {
  return false;
}
