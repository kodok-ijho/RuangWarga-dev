import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import {
  AnnouncementCard,
  AnnouncementDetailDrawer,
  AnnouncementBanner,
  EventCard,
} from './index';

function cleanHtml(html) {
  return html.replace(/<!--.*?-->/g, '');
}

describe('Community Components (Phase 6 - TASK-018 & TASK-019)', () => {
  const mockAnnouncement = {
    id: 'ann-1',
    title: 'Kerja Bakti Lingkungan & Fogging Nyamuk DBD',
    category: 'Kegiatan Warga',
    urgency: 'urgent',
    date: '2026-03-18',
    author: 'Pengurus RT/RW',
    summary: 'Kerja bakti pembersihan saluran air dan fogging nyamuk akan dilaksanakan serentak.',
    content: 'Detail lengkap mengenai titik kumpul di Pos Satpam Utama...',
    is_pinned: true,
  };

  const mockEvent = {
    id: 'evt-101',
    title: 'Turnamen Futsal Pemuda & Warga',
    event_code: 'FUTSAL-2026',
    event_date: '2026-03-25T08:00:00Z',
    location: 'Lapangan Olahraga Blok C',
    description: 'Turnamen futsal persahabatan antar blok RT.',
    documentation_url: 'https://drive.google.com/folder/123',
    status: 'active',
  };

  describe('AnnouncementCard (TASK-018)', () => {
    it('renders announcement title, date, urgency badge, and short summary', () => {
      const rawHtml = renderToString(
        <MemoryRouter>
          <AnnouncementCard
            announcement={mockAnnouncement}
            onSelect={() => {}}
          />
        </MemoryRouter>
      );
      const html = cleanHtml(rawHtml);

      expect(html).toContain('Kerja Bakti Lingkungan &amp; Fogging Nyamuk DBD');
      expect(html).toContain('Mendesak');
      expect(html).toContain('Disematkan');
      expect(html).toContain('Kerja bakti pembersihan saluran air');
      expect(html).toContain('Baca Selengkapnya');
    });
  });

  describe('AnnouncementBanner (TASK-018)', () => {
    it('renders Priority 3 notice banner with title, date, and link', () => {
      const rawHtml = renderToString(
        <MemoryRouter>
          <AnnouncementBanner
            announcement={mockAnnouncement}
            tenantId="palm-village"
          />
        </MemoryRouter>
      );
      const html = cleanHtml(rawHtml);

      expect(html).toContain('Kerja Bakti Lingkungan &amp; Fogging Nyamuk DBD');
      expect(html).toContain('Mendesak');
      expect(html).toContain('Semua Pengumuman →');
    });
  });

  describe('AnnouncementDetailDrawer (TASK-018)', () => {
    it('renders full content and author of announcement in drawer', () => {
      const rawHtml = renderToString(
        <AnnouncementDetailDrawer
          isOpen={true}
          onClose={() => {}}
          announcement={mockAnnouncement}
        />
      );
      const html = cleanHtml(rawHtml);

      expect(html).toContain('Rincian Pengumuman');
      expect(html).toContain('Kerja Bakti Lingkungan &amp; Fogging Nyamuk DBD');
      expect(html).toContain('Detail lengkap mengenai titik kumpul di Pos Satpam Utama...');
      expect(html).toContain('Pengurus RT/RW');
    });
  });

  describe('EventCard (TASK-019)', () => {
    it('renders event details, committee highlights, and actions', () => {
      const leader = { profile_name: 'Pak Bambang' };
      const treasurer = { profile_name: 'Ibu Siti' };

      const rawHtml = renderToString(
        <MemoryRouter>
          <EventCard
            event={mockEvent}
            isAdmin={true}
            leader={leader}
            treasurer={treasurer}
            onTogglePanitia={() => {}}
            onEdit={() => {}}
            onDelete={() => {}}
          />
        </MemoryRouter>
      );
      const html = cleanHtml(rawHtml);

      expect(html).toContain('Turnamen Futsal Pemuda &amp; Warga');
      expect(html).toContain('FUTSAL-2026');
      expect(html).toContain('Sedang Berlangsung');
      expect(html).toContain('Lapangan Olahraga Blok C');
      expect(html).toContain('Ketua: Pak Bambang');
      expect(html).toContain('Bendahara: Ibu Siti');
      expect(html).toContain('Lihat Keuangan');
      expect(html).toContain('Kelola Panitia');
      expect(html).toContain('Folder Dokumentasi Kegiatan');
    });
  });
});
