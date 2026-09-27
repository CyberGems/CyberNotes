import { describe, it, expect } from 'vitest';
import { parseChangelogPeek } from './UpdaterBanner';

const RENDERED_HTML_NOTES = `<p align="center">
<a target="_blank" rel="noopener noreferrer nofollow" href="https://raw.githubusercontent.com/CyberGems/CyberNotes/main/public/icon.png"><img src="https://raw.githubusercontent.com/CyberGems/CyberNotes/main/public/icon.png" width="120" alt="CyberNotes" style="max-width: 100%;"></a>
</p>
<h2>📰 CyberNotes v1.12.0: Release Notes</h2>
<h3>🚀 What's new in this release</h3>
<p>Word-style font controls arrive in the editor and floating notes.</p>
<h3>✨ Key Features &amp; Highlights</h3>
<ul>
<li>🪟 <strong>Floating sticky notes</strong>: independent always-on-top stickies.</li>
<li>🗂️ <strong>Organization</strong>: tabs, folders and note list.</li>
</ul>
<h3>📦 Downloads &amp; Packages</h3>`;

const RAW_MARKDOWN_NOTES = `<p align="center">
  <img src="https://raw.githubusercontent.com/CyberGems/CyberNotes/main/public/icon.png" width="120" alt="CyberNotes">
</p>

## CyberNotes v1.12.0: Release Notes

### What's new in this release

Word-style font controls arrive in the editor and floating notes.

### Key Features & Highlights

- Floating sticky notes with [docs](https://example.com/docs)
- Organization: tabs, folders and note list

### Downloads & Packages`;

describe('parseChangelogPeek', () => {
  it('never leaks HTML tags, attributes or bare URLs', () => {
    const { items } = parseChangelogPeek(RENDERED_HTML_NOTES);
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item).not.toMatch(/[<>]/);
      expect(item).not.toMatch(/https?:\/\//);
      expect(item).not.toMatch(/align=|target=|href=/);
    }
    // eslint-disable-next-line no-console
    console.log('HTML peek:', JSON.stringify(items));
  });

  it('extracts bullets from raw template markdown', () => {
    const { items, totalCount } = parseChangelogPeek(RAW_MARKDOWN_NOTES);
    expect(totalCount).toBe(2);
    expect(items[0]).toContain('Floating sticky notes');
    expect(items[0]).not.toContain('**');
    expect(items[1]).toContain('Organization');
    expect(items.some((i) => /[<>]/.test(i))).toBe(false);
  });

  it('keeps link text and drops the URL', () => {
    const { items } = parseChangelogPeek('### Highlights\n\n- See the [docs](https://example.com/docs) page\n');
    expect(items[0]).toBe('See the docs page');
  });

  it('returns empty on blank input', () => {
    expect(parseChangelogPeek(undefined)).toEqual({ items: [], totalCount: 0 });
    expect(parseChangelogPeek('')).toEqual({ items: [], totalCount: 0 });
  });

  const BILINGUAL_NOTES = `## CyberNotes v1.13.0: Release Notes

### What's new in this release

English summary paragraph.

### Key Features & Highlights

- English first feature with [docs](https://example.com/docs)
- English second feature

<details>
<summary><b>🇪🇸 Ver notas de la versión en Español</b></summary>

### Novedades de esta versión

Resumen en español.

### Novedades destacadas

- Primera novedad en español
- Segunda novedad en español

</details>

### Downloads & Packages`;

  it('shows the Spanish block when language is es', () => {
    const { items, totalCount } = parseChangelogPeek(BILINGUAL_NOTES, 'es');
    expect(totalCount).toBe(2);
    expect(items[0]).toContain('Primera novedad');
    expect(items[1]).toContain('Segunda novedad');
    expect(items.some((i) => /english/i.test(i))).toBe(false);
  });

  it('excludes the Spanish block when language is en', () => {
    const { items, totalCount } = parseChangelogPeek(BILINGUAL_NOTES, 'en');
    expect(totalCount).toBe(2);
    expect(items[0]).toBe('English first feature with docs');
    expect(items[1]).toContain('English second feature');
    expect(items.some((i) => /español|novedad/i.test(i))).toBe(false);
  });

  it('falls back to English notes for es when no Spanish block exists', () => {
    const { items, totalCount } = parseChangelogPeek(RAW_MARKDOWN_NOTES, 'es');
    expect(totalCount).toBe(2);
    expect(items[0]).toContain('Floating sticky notes');
  });
});
