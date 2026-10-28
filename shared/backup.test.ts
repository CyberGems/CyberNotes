import { describe, it, expect } from 'vitest';
import {
  parseBackupHours,
  parseBackupKeep,
  isBackupDue,
  backupEntryName,
  isBackupFile,
  isBackupEntry,
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
    expect(parseBackupKeep('7')).toBe(7);
    expect(parseBackupKeep('1')).toBe(1);
    expect(parseBackupKeep('0')).toBe(DEFAULT_AUTO_BACKUP_KEEP);
    expect(parseBackupKeep('14')).toBe(DEFAULT_AUTO_BACKUP_KEEP);
    expect(parseBackupKeep('30')).toBe(DEFAULT_AUTO_BACKUP_KEEP);
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

describe('backupEntryName', () => {
  it('is sortable, filesystem-safe and has no extension (folder)', () => {
    const name = backupEntryName(new Date(2026, 8, 18, 7, 30, 5));
    expect(name).toBe('cybernotes-backup-2026-09-18T07-30-05');
    expect(isBackupEntry(name)).toBe(true);
    expect(isBackupFile(name)).toBe(false);
  });
});

describe('isBackupEntry', () => {
  it('matches unified .json files, self-contained folders and legacy .db files only', () => {
    expect(isBackupEntry('cybernotes-backup-2026-10-27T15-21-26.json')).toBe(true);
    expect(isBackupEntry('cybernotes-backup-2026-10-27T15-21-26')).toBe(true);
    expect(isBackupEntry('cybernotes-backup-2026-09-18T07-30-05.db')).toBe(true);
    expect(isBackupEntry('cybernotes-export.json')).toBe(false);
    expect(isBackupEntry('notes.txt')).toBe(false);
    expect(isBackupEntry(null)).toBe(false);
  });
});

describe('selectBackupsToPrune', () => {
  it('keeps the newest N across json files, folders and legacy files, ignoring foreign entries', () => {
    const entries = [
      'notes.txt',
      'cybernotes-export.json',
      'cybernotes-backup-2026-09-16T07-00-00.db',
      'cybernotes-backup-2026-10-26T09-00-00',
      'cybernotes-backup-2026-10-27T15-27-21.json',
      'cybernotes-backup-2026-10-27T15-21-26',
    ];
    expect(selectBackupsToPrune(entries, 2)).toEqual([
      'cybernotes-backup-2026-09-16T07-00-00.db',
      'cybernotes-backup-2026-10-26T09-00-00',
    ]);
    expect(selectBackupsToPrune(entries, 7)).toEqual([]);
  });
});
