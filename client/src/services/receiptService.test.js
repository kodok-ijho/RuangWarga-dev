import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { buildDigitalReceiptHtml } from './receiptService';
import { formatRupiah } from './dataHelpers';
import { ReceiptActions } from '../pages/PaymentMatrix';

describe('buildDigitalReceiptHtml (DEBT-1.1 & BRAND-1F.2 Receipt Customization & XSS Defense)', () => {
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
    expect(html).toContain('Diterbitkan melalui RuangWarga');
  });

  it('tanpa tenantName: menggunakan fallback RuangWarga', () => {
    const html = buildDigitalReceiptHtml({
      bill: sampleBill,
      unit: sampleUnit,
    });

    expect(html).toContain('<div class="logo-text">RuangWarga</div>');
    expect(html).not.toContain('PALM VILLAGE');
    expect(html).toContain('Diterbitkan melalui RuangWarga');
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

  it('nominal murni dari bill.amount: memformat nominal tanpa fallback skema mock', () => {
    const html = buildDigitalReceiptHtml({
      bill: { ...sampleBill, amount: 275000 },
      unit: sampleUnit,
    });
    expect(html).toContain(formatRupiah(275000));
  });

  it('menampilkan billLabel dan unitLabel dinamis multi-tenant', () => {
    const html = buildDigitalReceiptHtml({
      bill: sampleBill,
      unit: { block: 'Lt 2', unit_number: '204' },
      tenantName: 'Kost Melati',
      billLabel: 'Sewa Kamar Bulanan',
      unitLabel: 'Kamar Kost',
    });
    expect(html).toContain('Kamar Kost');
    expect(html).toContain('Sewa Kamar Bulanan');
  });

  it('tidak memuat teks "IPL Basic" bila schemaName kosong', () => {
    const html = buildDigitalReceiptHtml({
      bill: sampleBill,
      unit: sampleUnit,
    });
    expect(html).not.toContain('IPL Basic');
    expect(html).toContain('Iuran');
  });
});

describe('ReceiptActions component (DEBT-1.1)', () => {
  it('dalam mode non-demo: tombol "Kirim ke Email" TIDAK dirender, hanya tombol download kuitansi', () => {
    const html = renderToString(
      React.createElement(ReceiptActions, {
        resolvedBill: { status: 'paid', amount: 150000 },
        payment: { status: 'verified' },
        targetUnit: { block: 'A', unit_number: '1' },
        activeTenant: { name: 'Kompleks Sakura' },
        template: { billLabel: 'IPL', unitLabel: 'Rumah' },
        role: 'admin',
        isDemo: false,
      })
    );

    expect(html).toContain('Download Kuitansi');
    expect(html).not.toContain('Kirim ke Email');
    expect(html).toContain('grid-cols-1');
  });

  it('dalam mode demo: tombol "Kirim ke Email" dan tombol download kuitansi keduanya dirender', () => {
    const html = renderToString(
      React.createElement(ReceiptActions, {
        resolvedBill: { status: 'paid', amount: 150000 },
        payment: { status: 'verified' },
        targetUnit: { block: 'A', unit_number: '1' },
        activeTenant: { name: 'Kompleks Sakura' },
        template: { billLabel: 'IPL', unitLabel: 'Rumah' },
        role: 'admin',
        isDemo: true,
      })
    );

    expect(html).toContain('Download Kuitansi');
    expect(html).toContain('Kirim ke Email');
    expect(html).toContain('grid-cols-2');
  });
});
