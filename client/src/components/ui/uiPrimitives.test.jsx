import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { Badge } from './Badge';
import { StatusBadge } from './StatusBadge';
import { DataRow } from './DataRow';
import { Card } from './Card';
import { EmptyState } from './EmptyState';
import { LoadingState, Skeleton } from './LoadingState';
import { PageHeader } from './PageHeader';
import { MobileList } from './MobileList';

describe('UI Primitives (Design System Foundation - Phase 1)', () => {
  it('renders Button with primary variant and text', () => {
    const html = renderToString(<Button variant="primary">Bayar IPL</Button>);
    expect(html).toContain('Bayar IPL');
    expect(html).toContain('bg-gold-500');
  });

  it('renders Button in loading state with spinner and disabled attribute', () => {
    const html = renderToString(<Button isLoading>Simpan</Button>);
    expect(html).toContain('disabled');
    expect(html).toContain('animate-spin');
  });

  it('renders IconButton with accessible aria-label', () => {
    const html = renderToString(<IconButton aria-label="Tutup dialog">✕</IconButton>);
    expect(html).toContain('aria-label="Tutup dialog"');
    expect(html).toContain('✕');
  });

  it('renders StatusBadge with both symbol and text for accessibility (non-color-only)', () => {
    const paidHtml = renderToString(<StatusBadge status="paid" />);
    expect(paidHtml).toContain('✓');
    expect(paidHtml).toContain('Lunas');
    expect(paidHtml).toContain('bg-emerald-50');

    const unpaidHtml = renderToString(<StatusBadge status="unpaid" />);
    expect(unpaidHtml).toContain('!');
    expect(unpaidHtml).toContain('Belum Bayar');
    expect(unpaidHtml).toContain('bg-rose-50');

    const pendingHtml = renderToString(<StatusBadge status="pending" />);
    expect(pendingHtml).toContain('•');
    expect(pendingHtml).toContain('Menunggu');
    expect(pendingHtml).toContain('bg-amber-50');
  });

  it('renders Badge with custom label and variant', () => {
    const html = renderToString(<Badge variant="emerald">Warga Tetap</Badge>);
    expect(html).toContain('Warga Tetap');
    expect(html).toContain('bg-emerald-50');
  });

  it('renders Card container with children and padding', () => {
    const html = renderToString(<Card padding="md">Konten Kartu Bersih</Card>);
    expect(html).toContain('Konten Kartu Bersih');
    expect(html).toContain('rounded-2xl');
    expect(html).toContain('shadow-card');
  });

  it('renders DataRow key-value correctly', () => {
    const html = renderToString(<DataRow label="Nomor Unit" value="CB1/05" />);
    expect(html).toContain('Nomor Unit');
    expect(html).toContain('CB1/05');
  });

  it('renders EmptyState with title, description, and action', () => {
    const html = renderToString(
      <EmptyState
        title="Belum Ada Pembayaran"
        description="Silakan lakukan pembayaran bulan ini."
        action={<Button>Bayar Sekarang</Button>}
      />
    );
    expect(html).toContain('Belum Ada Pembayaran');
    expect(html).toContain('Silakan lakukan pembayaran bulan ini.');
    expect(html).toContain('Bayar Sekarang');
  });

  it('renders LoadingState with status role and message', () => {
    const html = renderToString(<LoadingState message="Memuat tagihan..." />);
    expect(html).toContain('role="status"');
    expect(html).toContain('Memuat tagihan...');
    expect(html).toContain('animate-spin');
  });

  it('renders Skeleton placeholder', () => {
    const html = renderToString(<Skeleton className="h-4 w-32" />);
    expect(html).toContain('animate-pulse');
  });

  it('renders PageHeader with title, description, and back link', () => {
    const html = renderToString(
      <MemoryRouter>
        <PageHeader
          title="Daftar Warga"
          description="Kelola data penghuni"
          backTo="/dashboard"
          actions={<Button size="sm">Tambah</Button>}
        />
      </MemoryRouter>
    );
    expect(html).toContain('Daftar Warga');
    expect(html).toContain('Kelola data penghuni');
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain('Tambah');
  });

  it('renders MobileList adaptively with mobile cards and desktop table', () => {
    const items = [{ id: 1, name: 'Budi' }, { id: 2, name: 'Siti' }];
    const html = renderToString(
      <MobileList
        items={items}
        renderItem={(item) => <div key={item.id} className="mobile-card">{item.name}</div>}
        desktopContent={<table className="desktop-table"><tbody><tr><td>Table View</td></tr></tbody></table>}
      />
    );
    expect(html).toContain('mobile-card');
    expect(html).toContain('Budi');
    expect(html).toContain('desktop-table');
    expect(html).toContain('Table View');
  });
});
