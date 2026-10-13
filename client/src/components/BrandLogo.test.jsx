import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import BrandLogo from './BrandLogo';

describe('BrandLogo Component', () => {
  it('renders default light variant with full wordmark', () => {
    const html = renderToString(<BrandLogo />);
    expect(html).toContain('src="/brand/rw-mark.svg"');
    expect(html).toContain('Ruang');
    expect(html).toContain('Warga');
    expect(html).toContain('text-forest-800');
    expect(html).toContain('text-gold-500');
  });

  it('renders dark variant with dark mark svg and white wordmark text', () => {
    const html = renderToString(<BrandLogo variant="dark" />);
    expect(html).toContain('src="/brand/rw-mark-on-dark.svg"');
    expect(html).toContain('Ruang');
    expect(html).toContain('Warga');
    expect(html).toContain('text-white');
    expect(html).toContain('text-gold-500');
  });

  it('hides wordmark text when showWordmark is false', () => {
    const html = renderToString(<BrandLogo showWordmark={false} />);
    expect(html).toContain('src="/brand/rw-mark.svg"');
    expect(html).not.toContain('text-forest-800');
    expect(html).not.toContain('text-gold-500');
    expect(html).not.toContain('>Ruang<');
    expect(html).not.toContain('>Warga<');
  });

  it('supports size variants (sm, md, lg)', () => {
    const smHtml = renderToString(<BrandLogo size="sm" />);
    expect(smHtml).toContain('h-6 w-6');

    const mdHtml = renderToString(<BrandLogo size="md" />);
    expect(mdHtml).toContain('h-8 w-8');

    const lgHtml = renderToString(<BrandLogo size="lg" />);
    expect(lgHtml).toContain('h-12 w-12');
  });
});
