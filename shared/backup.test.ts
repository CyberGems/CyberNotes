import { describe, it, expect } from 'vitest';
import {
  parseBackupHours,
  parseBackupKeep,
  isBackupDue,
  backupFileName,
  isBackupFile,
  selectBackupsToPrune,
  DEFAULT_AUTO_BACKUP_HOURS,
  DEFAULT_AUTO_BACKUP_KEEP,
} from './backup';

describe('parseBackupHours', () => {
  it('accepts known intervals only', () => {
    expect(parseBackupHours('6')).toBe(6);
    expect(parseBackupHours('168')).toBe(168);
    expect(parseBackupHours('13')).toBe(DEFAULT_AUTO_BACKUP_HOURS);
    expect(parseBackupHours(null)).toBe(DEFAULT_AUTO_BACKUP_HOURS);
    expect(parseBackupHours('daily')).toBe(DEFAULT_AUTO_BACKUP_HOURS);
  });
});

describe('parseBackupKeep', () => {
  it('accepts known retention counts only', () => {
    expect(parseBackupKeep('30')).toBe(30);
    expect(parseBackupKeep('0')).toBe(DEFAULT_AUTO_BACKUP_KEEP);
    expect(parseBackupKeep(undefined)).toBe(DEFAULT_AUTO_BACKUP_KEEP);
  });
});

describe('isBackupDue', () => {
  const now = new Date('2026-09-18T08:00:00Z').getTime();
  it('is due when never backed up or date is invalid', () => {
    expect(isBackupDue(null, now, 24)).toBe(true);
    expect(isBackupDue('not-a-date', now, 24)).toBe(true);
  });
  it('respects the interval', () => {
    expect(isBackupDue('2026-09-17T08:00:00Z', now, 24)).toBe(true);
    expect(isBackupDue('2026-09-17T09:00:00Z', now, 24)).toBe(false);
  });
});

describe('backupFileName', () => {
  it('is sortable, filesystem-safe and has .db extension', () => {
    const name = backupFileName(new Date(2026, 8, 18, 7, 30, 5));
    expect(name).toBe('cybernotes-backup-2026-09-18T07-30-05.db');
    expect(isBackupFile(name)).toBe(true);
  });
});

describe('selectBackupsToPrune', () => {
  it('keeps the newest N and ignores foreign files', () => {
    const files = ['notes.txt', 'cybernotes-backup-2026-09-16T07-00-00.db', 'cybernotes-backup-2026-09-18T07-00-00.db', 'cybernotes-backup-2026-09-17T07-00-00.db'];
    expect(selectBackupsToPrune(files, 2)).toEqual(['cybernotes-backup-2026-09-16T07-00-00.db']);
    expect(selectBackupsToPrune(files, 7)).toEqual([]);
  });
});
