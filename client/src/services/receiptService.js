import { formatRupiah } from './dataHelpers';

/**
 * Helper sanitasi teks untuk mencegah XSS pada file HTML kuitansi.
 *
 * @param {any} str
 * @returns {string}
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Generator murni string HTML Kuitansi Digital RuangWarga (DEBT-1.1).
 * Bebas dari ketergantungan data mock dan mendukung label multi-tenant dinamis.
 *
 * @param {Object} params
 * @param {Object} [params.bill] - Objek tagihan / pembayaran
 * @param {Object} [params.unit] - Objek unit hunian / kavling / kamar / slot
 * @param {Object} [params.owner] - Data pemilik unit
 * @param {Object} [params.occupant] - Data penghuni / pembayar
 * @param {string} [params.tenantName] - Nama tenant / komunitas
 * @param {string} [params.billLabel] - Label jenis tagihan (mis. IPL, Sewa, SPP, Iuran)
 * @param {string} [params.unitLabel] - Label unit properti (mis. Rumah, Kamar, Siswa, Peserta)
 * @param {string} [params.schemaName] - Nama spesifik skema tagihan bila ada
 * @returns {string}
 */
export function buildDigitalReceiptHtml({
  bill,
  unit,
  owner,
  occupant,
  tenantName,
  billLabel,
  unitLabel,
  schemaName,
}) {
  const amount = Number(bill?.amount) || 0;
  const dateStr = bill?.paid_at || bill?.created_at || new Date().toISOString().split('T')[0];
  const noKuitansi = `PV/IPL/${bill?.period || '2026'}/${bill?.id || '0'}`;
  const targetName =
    occupant?.full_name ||
    owner?.full_name ||
    `Warga Blok ${unit?.block || '-'}/${unit?.unit_number || '-'}`;
  const resolvedTenantName = tenantName?.trim() || 'RuangWarga';
  const resolvedUnitLabel = unitLabel?.trim() || 'Unit';
  const resolvedUnitValue = `Blok ${unit?.block || '-'}/${unit?.unit_number || '-'}`;
  const periodLabel = bill?.period || '-';
  const resolvedSchemaLabel = schemaName?.trim() || billLabel?.trim() || 'Iuran';
  const methodLabel = (bill?.method || 'Transfer Bank').toUpperCase();

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Kuitansi Digital - ${noKuitansi}</title>
  <style>
    body { font-family: 'Inter', system-ui, sans-serif; background: #f0f4f1; padding: 40px; color: #1a3323; }
    .receipt { max-w: 650px; margin: 0 auto; background: #ffffff; border: 2px solid #1a3323; border-radius: 12px; padding: 32px; box-shadow: 0 10px 25px rgba(0,0,0,0.08); position: relative; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px dashed #c2d1c7; padding-bottom: 20px; margin-bottom: 24px; }
    .logo-text { font-size: 24px; font-weight: 800; color: #1a3323; letter-spacing: -0.5px; }
    .badge { background: #e8f5e9; color: #2e7d32; border: 1px solid #a5d6a7; padding: 6px 14px; border-radius: 20px; font-weight: bold; font-size: 14px; text-transform: uppercase; }
    .title { font-size: 18px; font-weight: 700; color: #5c7664; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 1px; }
    .row { display: flex; justify-content: space-between; margin-bottom: 14px; font-size: 15px; border-bottom: 1px solid #f0f4f1; padding-bottom: 8px; }
    .label { color: #5c7664; font-weight: 500; }
    .val { font-weight: 700; color: #1a3323; }
    .total-box { background: #1a3323; color: #d4af37; padding: 18px 24px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; margin-top: 28px; font-size: 20px; font-weight: 800; }
    .footer { margin-top: 32px; text-align: center; font-size: 12px; color: #789381; border-top: 1px solid #e0e9e2; padding-top: 16px; }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="header">
      <div>
        <div class="logo-text">${escapeHtml(resolvedTenantName)}</div>
        <div style="font-size: 12px; color: #5c7664; margin-top: 4px;">Diterbitkan melalui RuangWarga</div>
      </div>
      <div class="badge">✔ LUNAS / TERVERIFIKASI</div>
    </div>
    <div class="title">Kuitansi Pembayaran IPL</div>
    <div class="row">
      <span class="label">No. Kuitansi</span>
      <span class="val">${noKuitansi}</span>
    </div>
    <div class="row">
      <span class="label">Tanggal Verifikasi</span>
      <span class="val">${escapeHtml(dateStr)}</span>
    </div>
    <div class="row">
      <span class="label">Diterima dari</span>
      <span class="val">${escapeHtml(targetName)}</span>
    </div>
    <div class="row">
      <span class="label">${escapeHtml(resolvedUnitLabel)}</span>
      <span class="val">${escapeHtml(resolvedUnitValue)}</span>
    </div>
    <div class="row">
      <span class="label">Periode Tagihan</span>
      <span class="val">${escapeHtml(periodLabel)}</span>
    </div>
    <div class="row">
      <span class="label">Jenis Tagihan</span>
      <span class="val">${escapeHtml(resolvedSchemaLabel)}</span>
    </div>
    <div class="row">
      <span class="label">Metode Pembayaran</span>
      <span class="val">${escapeHtml(methodLabel)}</span>
    </div>
    <div class="total-box">
      <span>TOTAL DIBAYAR</span>
      <span>${formatRupiah(amount)}</span>
    </div>
    <div class="footer">
      Kuitansi ini diterbitkan secara otomatis oleh Sistem RuangWarga sebagai bukti pembayaran sah tanpa tanda tangan basah.<br>
      Unduh atau simpan dokumen ini sebagai arsip digital Anda.
    </div>
  </div>
</body>
</html>`;
}

/**
 * Download dokumen Kuitansi Digital (HTML file download).
 *
 * @param {Object} args
 */
export function downloadDigitalReceipt(args) {
  const { unit, bill } = args || {};
  const htmlContent = buildDigitalReceiptHtml(args || {});
  const blob = new Blob([htmlContent], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Kuitansi-IPL-${unit?.block || ''}-${unit?.unit_number || ''}-${bill?.period || ''}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
