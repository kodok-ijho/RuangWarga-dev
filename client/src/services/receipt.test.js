import { describe, it, expect } from 'vitest';
import { buildDigitalReceiptHtml } from './mockData';

describe('buildDigitalReceiptHtml (BRAND-1F.2 Receipt Customization & XSS Defense)', () => {
  const sampleBill = {
    id: 'bill-123',
    period: '2026-10',
    amount: 150000,
    paid_at: '2026-10-10',
    method: 'qris',
  };

  const sampleUnit = {
    id: 1,
    block: 'B',
    unit_number: '12',
    ipl_schema_id: 'ipl-std-1',
  };

  it('dengan tenantName Griya Asri: memuat Griya Asri dan tidak memuat PALM VILLAGE', () => {
    const html = buildDigitalReceiptHtml({
      bill: sampleBill,
      unit: sampleUnit,
      tenantName: 'Griya Asri',
    });

    expect(html).toContain('Griya Asri');
    expect(html).not.toContain('PALM VILLAGE');
    expect(html).toContain('RuangWarga &amp; Manajemen IPL Digital');
  });

  it('tanpa tenantName: menggunakan fallback RuangWarga', () => {
    const html = buildDigitalReceiptHtml({
      bill: sampleBill,
      unit: sampleUnit,
    });

    expect(html).toContain('<div class="logo-text">RuangWarga</div>');
    expect(html).not.toContain('PALM VILLAGE');
  });

  it('meng-escape karakter berbahaya pada tenantName, nama warga, dan field lainnya untuk mencegah XSS', () => {
    const maliciousTenant = '<img src=x onerror=alert(1)>';
    const maliciousOccupant = {
      full_name: 'Budi <script>alert("xss")</script> & Santoso "Test"',
    };

    const html = buildDigitalReceiptHtml({
      bill: sampleBill,
      unit: sampleUnit,
      occupant: maliciousOccupant,
      tenantName: maliciousTenant,
    });

    // Tag berbahaya harus ter-escape
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('Budi &lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; Santoso &quot;Test&quot;');
    expect(html).not.toContain('<script>');
  });
});
