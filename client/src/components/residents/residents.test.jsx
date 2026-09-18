import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { ResidentCard } from './ResidentCard';
import { ResidentDetailDrawer } from './ResidentDetailDrawer';

function cleanHtml(html) {
  return html.replace(/<!--.*?-->/g, '');
}

describe('Resident Components (Phase 4)', () => {
  const mockProfile = {
    id: 101,
    full_name: 'Budi Santoso',
    email: 'budi@example.com',
    phone: '081234567890',
    unit_id: 12,
    role: 'warga',
    is_active: true,
    occupancy_status: 'owner_occupied',
  };

  const mockUnit = {
    id: 12,
    block: 'A',
    unit_number: '10',
    label: 'Blok A/10',
  };

  describe('ResidentCard (TASK-014, TASK-015)', () => {
    it('renders resident card with name, unit, role, and quick actions', () => {
      const rawHtml = renderToString(
        <MemoryRouter>
          <ResidentCard
            profile={mockProfile}
            unit={mockUnit}
            template={{ unitLabel: 'Rumah', memberLabel: 'Warga' }}
            activeTenant={{ type: 'rt_rw' }}
          />
        </MemoryRouter>
      );
      const html = cleanHtml(rawHtml);

      expect(html).toContain('Budi Santoso');
      expect(html).toContain('Rumah Blok A/10');
      expect(html).toContain('Tetap / Owner - Dihuni');
      expect(html).toContain('wa.me/6281234567890');
      expect(html).toContain('tel:081234567890');
    });

    it('renders inactive resident indicator correctly', () => {
      const inactiveProfile = { ...mockProfile, is_active: false };
      const rawHtml = renderToString(
        <MemoryRouter>
          <ResidentCard
            profile={inactiveProfile}
            unit={mockUnit}
            template={{ unitLabel: 'Rumah' }}
          />
        </MemoryRouter>
      );
      const html = cleanHtml(rawHtml);

      expect(html).toContain('title="Non-aktif"');
    });
  });

  describe('ResidentDetailDrawer (TASK-014, TASK-015)', () => {
    it('renders resident details, contacts and info', () => {
      const rawHtml = renderToString(
        <MemoryRouter>
          <ResidentDetailDrawer
            open={true}
            profile={mockProfile}
            unit={mockUnit}
            canManage={false}
            template={{ unitLabel: 'Rumah', memberLabel: 'Warga' }}
            activeTenant={{ type: 'rt_rw' }}
            onClose={() => {}}
          />
        </MemoryRouter>
      );
      const html = cleanHtml(rawHtml);

      expect(html).toContain('Detail Warga');
      expect(html).toContain('Budi Santoso');
      expect(html).toContain('budi@example.com');
      expect(html).toContain('081234567890');
      expect(html).toContain('Kirim WhatsApp');
      expect(html).toContain('Telepon');
      expect(html).not.toContain('Hapus');
    });

    it('renders management action buttons when canManage is true', () => {
      const rawHtml = renderToString(
        <MemoryRouter>
          <ResidentDetailDrawer
            open={true}
            profile={mockProfile}
            unit={mockUnit}
            canManage={true}
            template={{ unitLabel: 'Rumah', memberLabel: 'Warga' }}
            activeTenant={{ type: 'rt_rw' }}
            onClose={() => {}}
            onEdit={() => {}}
            onDelete={() => {}}
          />
        </MemoryRouter>
      );
      const html = cleanHtml(rawHtml);

      expect(html).toContain('Edit');
      expect(html).toContain('Hapus');
    });
  });
});
