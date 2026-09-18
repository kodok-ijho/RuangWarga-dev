import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { Dialog } from './Dialog';
import { Drawer } from './Drawer';
import Modal from '../Modal';

describe('Responsive Layout & Touch Target Primitives (TASK-025)', () => {
  it('Dialog renders responsive max-height and touch-friendly close button (>=44px)', () => {
    const html = renderToString(
      <Dialog
        isOpen={true}
        onClose={() => {}}
        title="Uji Responsivitas"
        description="Dialog uji responsif"
      >
        <p>Konten Dialog</p>
      </Dialog>
    );

    // Periksa batas tinggi responsif viewport mobile
    expect(html).toContain('max-h-[calc(100dvh-1rem)]');
    expect(html).toContain('sm:max-h-[calc(100dvh-3rem)]');
    expect(html).toContain('overflow-y-auto');

    // Periksa tombol tutup memenuhi touch target >= 44px
    expect(html).toContain('min-h-[44px]');
    expect(html).toContain('min-w-[44px]');
    expect(html).toContain('aria-label="Tutup dialog"');
  });

  it('Drawer renders touch-friendly close button and safe scroll behavior', () => {
    const html = renderToString(
      <Drawer
        isOpen={true}
        onClose={() => {}}
        title="Menu Navigasi Mobile"
      >
        <p>Konten Drawer</p>
      </Drawer>
    );

    expect(html).toContain('min-h-[44px]');
    expect(html).toContain('min-w-[44px]');
    expect(html).toContain('aria-label="Tutup panel"');
    expect(html).toContain('overscroll-contain');
  });

  it('Modal renders safe max-height limit and accessible touch button', () => {
    const html = renderToString(
      <Modal open={true} onClose={() => {}} title="Modal Form">
        <p>Form content</p>
      </Modal>
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('max-h-[90vh]');
    expect(html).toContain('overflow-y-auto');
    expect(html).toContain('min-h-[44px]');
    expect(html).toContain('min-w-[44px]');
  });
});
