// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { SEED_NOTE_IDS } from './dataFolder';
import { getFactoryNotes } from './factoryNotes';

describe('factory notes', () => {
  it.each(['es', 'en'] as const)('keeps stable identities and valid rich text in %s', language => {
    const notes = getFactoryNotes(language);
    expect(notes.map(note => note.id).sort()).toEqual([...SEED_NOTE_IDS].sort());
    expect(notes.filter(note => note.floating).map(note => note.id)).toEqual(['floating-demo-note']);
    for (const note of notes) {
      const editor = new Editor({ extensions: [StarterKit, Link], content: note.content });
      try {
        expect(editor.getText().trim().length).toBeGreaterThan(200);
        expect(editor.getJSON().content?.[0].type).toBe('heading');
        expect(editor.getHTML()).not.toMatch(/SQL\.js|encrypted: true|100% (local|offline)/i);
        if (note.id === 'quickstart-note') {
          expect(editor.getHTML()).toContain('<pre><code>');
          expect(editor.getText()).toContain('Ctrl+N');
        }
        if (note.id === 'cybergems-suite-note') {
          expect(editor.getHTML()).toContain('https://cybergems.org');
          expect(editor.getText()).toContain('YouTube');
        }
      } finally { editor.destroy(); }
    }
  });
});
