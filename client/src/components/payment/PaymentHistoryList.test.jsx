// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { PaymentHistoryList } from './PaymentHistoryList';
import { createReceiptSignedUrl } from '../../utils/storagePolicy';
import { supabase } from '../../services/supabaseClient';

afterEach(cleanup);

vi.mock('../../services/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
    from: vi.fn(),
  },
}));

vi.mock('../../utils/storagePolicy', async () => {
  const actual = await vi.importActual('../../utils/storagePolicy');
  return {
    ...actual,
    createReceiptSignedUrl: vi.fn(),
  };
});

describe('PaymentHistoryList - STOR-1F.2 Payment Proof Resolution', () => {
  const CANONICAL_PATH =
    '72867b51-0000-0000-0000-000000000001/payments/a1b2c3d4-1111-2222-3333-444455556666/1791970596082_file.jpg';
  const MOCK_SIGNED_URL = 'https://mock-r2.test/signed-payment-proof.jpg';

  beforeEach(() => {
    vi.clearAllMocks();
    createReceiptSignedUrl.mockResolvedValue(MOCK_SIGNED_URL);
  });

  // a. payment dengan proof_url path canonical → klik item riwayat → createReceiptSignedUrl dipanggil
  //    (path yang sama, 'payment-proofs') → link "Buka" ber-href URL bertanda tangan hasil mock;
  //    href TIDAK sama dengan path mentah.
  it('a. payment dengan proof_url path canonical me-resolve signed URL dan tidak memasang path mentah ke href', async () => {
    const payments = [
      {
        id: 'pay-canon-1',
        amount: 150000,
        status: 'completed',
        method: 'bank_transfer',
        proof_url: CANONICAL_PATH,
        period: '2026-10',
      },
    ];

    render(<PaymentHistoryList payments={payments} />);

    // Klik item riwayat pembayaran untuk membuka dialog detail
    const historyItem = screen.getByRole('button', { name: /Rincian pembayaran/i });
    fireEvent.click(historyItem);

    // Dialog terbuka dan memanggil createReceiptSignedUrl
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Buka' })).toBeTruthy();
    });

    expect(createReceiptSignedUrl).toHaveBeenCalledTimes(1);
    expect(createReceiptSignedUrl).toHaveBeenCalledWith(
      supabase,
      CANONICAL_PATH,
      300,
      'payment-proofs'
    );

    const link = screen.getByRole('link', { name: 'Buka' });
    expect(link.getAttribute('href')).toBe(MOCK_SIGNED_URL);
    expect(link.getAttribute('href')).not.toBe(CANONICAL_PATH);
  });

  // b. proof_url 'https://drive.google.com/...' → href langsung URL itu, createReceiptSignedUrl TIDAK dipanggil.
  it('b. proof_url legacy http(s) langsung dipasang ke href tanpa memanggil createReceiptSignedUrl', async () => {
    const legacyUrl = 'https://drive.google.com/file/d/abcdef123456/view';
    const payments = [
      {
        id: 'pay-legacy-1',
        amount: 150000,
        status: 'completed',
        method: 'bank_transfer',
        proof_url: legacyUrl,
        period: '2026-10',
      },
    ];

    render(<PaymentHistoryList payments={payments} />);

    const historyItem = screen.getByRole('button', { name: /Rincian pembayaran/i });
    fireEvent.click(historyItem);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Buka' })).toBeTruthy();
    });

    const link = screen.getByRole('link', { name: 'Buka' });
    expect(link.getAttribute('href')).toBe(legacyUrl);
    expect(createReceiptSignedUrl).not.toHaveBeenCalled();
  });

  // c. createReceiptSignedUrl reject(new Error('Anda tidak memiliki izin untuk file ini.'))
  //    → tidak ada link "Buka", pesan "Bukti tidak dapat dibuka" tampil.
  it('c. createReceiptSignedUrl gagal menampilkan pesan error dan tidak merender link Buka', async () => {
    const errorMsg = 'Anda tidak memiliki izin untuk file ini.';
    createReceiptSignedUrl.mockRejectedValueOnce(new Error(errorMsg));

    const payments = [
      {
        id: 'pay-err-1',
        amount: 150000,
        status: 'completed',
        method: 'bank_transfer',
        proof_url: CANONICAL_PATH,
        period: '2026-10',
      },
    ];

    render(<PaymentHistoryList payments={payments} />);

    const historyItem = screen.getByRole('button', { name: /Rincian pembayaran/i });
    fireEvent.click(historyItem);

    await waitFor(() => {
      expect(screen.getByText(/Bukti tidak dapat dibuka/i)).toBeTruthy();
    });

    expect(screen.getByText(new RegExp(errorMsg))).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Buka' })).toBeNull();
  });

  // d. proof_url string acak bukan path canonical → tidak ada <a> dengan href string itu.
  it('d. proof_url string acak bukan path canonical menampilkan Bukti tidak tersedia tanpa tag a', async () => {
    const randomString = 'random-folder/another-sub/not-canonical.jpg';
    const payments = [
      {
        id: 'pay-random-1',
        amount: 150000,
        status: 'completed',
        method: 'bank_transfer',
        proof_url: randomString,
        period: '2026-10',
      },
    ];

    render(<PaymentHistoryList payments={payments} />);

    const historyItem = screen.getByRole('button', { name: /Rincian pembayaran/i });
    fireEvent.click(historyItem);

    await waitFor(() => {
      expect(screen.getByText('Bukti tidak tersedia')).toBeTruthy();
    });

    expect(screen.queryByRole('link', { name: 'Buka' })).toBeNull();
    const allLinks = screen.queryAllByRole('link');
    const matchedInvalidLink = allLinks.find((el) => el.getAttribute('href') === randomString);
    expect(matchedInvalidLink).toBeUndefined();
    expect(createReceiptSignedUrl).not.toHaveBeenCalled();
  });
});
