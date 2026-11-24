// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { setWindowTitle } from './windowTitle';

describe('native window title', () => {
  afterEach(() => {
    document.title = 'CyberNotes';
  });

  it('uses the plain app name without a note', () => {
    document.title = 'stale';
    setWindowTitle(null);
    expect(document.title).toBe('CyberNotes');
  });

  it('adds the active note after the app name', () => {
    setWindowTitle('Shopping list');
    expect(document.title).toBe('CyberNotes · Shopping list');
  });

  it('marks unsaved changes with a trailing asterisk', () => {
    setWindowTitle('Shopping list', true);
    expect(document.title).toBe('CyberNotes · Shopping list*');
  });
});
