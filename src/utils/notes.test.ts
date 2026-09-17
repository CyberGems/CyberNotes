// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { toNoteMeta, extractThumb, extractPreview } from './notes';
import type { Note } from '../types';

const baseNote: Note = {
  id: 'note-1',
  folder_id: 'folder-1',
  title: 'Title',
  content: '<p>Hello</p>',
  preview: 'Hello',
  thumb: 'file:///thumb.png',
  pinned: 1,
  created_at: '2026-01-01',
  updated_at: '2026-01-02',
  deleted_at: null,
};

describe('toNoteMeta', () => {
  it('drops content but keeps meta fields', () => {
    const meta = toNoteMeta(baseNote);
    expect(meta.content).toBe('');
    expect(meta.id).toBe('note-1');
    expect(meta.title).toBe('Title');
    expect(meta.pinned).toBe(1);
  });

  it('defaults missing preview and thumb to empty strings', () => {
    const meta = toNoteMeta({ ...baseNote, preview: '', thumb: undefined });
    expect(meta.preview).toBe('');
    expect(meta.thumb).toBe('');
  });
});

describe('extractThumb', () => {
  it('returns empty string for empty or non-string content', () => {
    expect(extractThumb('')).toBe('');
    expect(extractThumb(null)).toBe('');
    expect(extractThumb(undefined)).toBe('');
  });

  it('extracts the first image from HTML content', () => {
    expect(extractThumb('<p>Hi</p><img src="file:///a.png"><img src="file:///b.png">')).toBe('file:///a.png');
  });

  it('extracts the image from TipTap JSON content', () => {
    const json = JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }, { type: 'image', attrs: { src: 'file:///c.png' } }],
    });
    expect(extractThumb(json)).toBe('file:///c.png');
  });

  it('returns empty string when there is no image', () => {
    expect(extractThumb('<p>No images here</p>')).toBe('');
  });
});

describe('extractPreview', () => {
  it('strips tags and collapses whitespace', () => {
    expect(extractPreview('<h1>Title</h1><p>Hello   <strong>world</strong></p>')).toBe('TitleHello world');
  });

  it('returns empty string for empty input', () => {
    expect(extractPreview('')).toBe('');
  });
});
