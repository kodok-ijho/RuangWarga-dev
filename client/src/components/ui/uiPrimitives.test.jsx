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
import {
  LoadingState,
  Skeleton,
  SkeletonText,
  SkeletonCard,
  SkeletonTable,
  SkeletonList,
} from './LoadingState';
import { PageHeader } from './PageHeader';
import { MobileList } from './MobileList';
import { Textarea } from './Textarea';
import { Divider } from './Divider';
import { Avatar } from './Avatar';
import { Tabs } from './Tabs';
import { DataList } from './DataList';

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

  it('renders SkeletonText, SkeletonCard, SkeletonTable, and SkeletonList', () => {
    const textHtml = renderToString(<SkeletonText lines={3} />);
    expect(textHtml).toContain('space-y-2');
    expect(textHtml).toContain('animate-pulse');

    const cardHtml = renderToString(<SkeletonCard rows={2} />);
    expect(cardHtml).toContain('shadow-xs');
    expect(cardHtml).toContain('animate-pulse');

    const tableHtml = renderToString(<SkeletonTable cols={3} rows={4} />);
    expect(tableHtml).toContain('<table');
    expect(tableHtml).toContain('<thead');
    expect(tableHtml).toContain('<tbody');

    const listHtml = renderToString(<SkeletonList items={3} />);
    expect(listHtml).toContain('space-y-2.5');
  });

  it('renders EmptyState in compact mode with string emoji', () => {
    const html = renderToString(
      <EmptyState
        compact
        icon="💸"
        title="Belum Ada Pengeluaran"
        description="Semua pencatatan akan muncul di sini."
      />
    );
    expect(html).toContain('Belum Ada Pengeluaran');
    expect(html).toContain('💸');
    expect(html).toContain('p-5 sm:p-6');
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

  it('renders Button with neutral/brand variant', () => {
    const neutralHtml = renderToString(<Button variant="neutral">Kelola</Button>);
    expect(neutralHtml).toContain('Kelola');
    expect(neutralHtml).toContain('bg-slate-900');

    const brandHtml = renderToString(<Button variant="brand">Simpan</Button>);
    expect(brandHtml).toContain('Simpan');
    expect(brandHtml).toContain('bg-slate-900');
  });

  it('renders Textarea with label and helper text', () => {
    const html = renderToString(
      <Textarea label="Catatan" helperText="Maksimal 200 karakter" rows={4} />
    );
    expect(html).toContain('Catatan');
    expect(html).toContain('Maksimal 200 karakter');
    expect(html).toContain('rows="4"');
  });

  it('renders Divider with optional text label', () => {
    const html = renderToString(<Divider>Atau</Divider>);
    expect(html).toContain('Atau');
    expect(html).toContain('role="separator"');
  });

  it('renders Avatar with name initials fallback', () => {
    const html = renderToString(<Avatar name="Budi Santoso" size="md" />);
    expect(html).toContain('BS');
  });

  it('renders Tabs with active state and badge', () => {
    const tabs = [
      { id: 'all', label: 'Semua', badge: 5 },
      { id: 'active', label: 'Aktif' },
    ];
    const html = renderToString(<Tabs tabs={tabs} activeTab="all" onChange={() => {}} />);
    expect(html).toContain('Semua');
    expect(html).toContain('5');
    expect(html).toContain('aria-selected="true"');
  });

  it('renders DataList with key-value pairs', () => {
    const items = [
      { label: 'Nama Komunitas', value: 'Kos Melati' },
      { label: 'Tipe', value: 'Kos-kosan' },
    ];
    const html = renderToString(<DataList items={items} />);
    expect(html).toContain('Nama Komunitas');
    expect(html).toContain('Kos Melati');
    expect(html).toContain('Tipe');
    expect(html).toContain('Kos-kosan');
  });
});

