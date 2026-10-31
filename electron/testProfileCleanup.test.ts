import { describe, expect, it, vi } from 'vitest';
import { TEST_PROFILE_CLEANUP_SCRIPT } from './testProfileCleanup';

async function runCleanup(target: string, options: { symlink?: boolean; parentRunning?: boolean } = {}) {
  const fs = {
    realpathSync: vi.fn((value: string) => value),
    lstatSync: vi.fn(() => ({ isDirectory: () => true, isSymbolicLink: () => !!options.symlink })),
    rmSync: vi.fn(),
    appendFileSync: vi.fn(),
  };
  const path = {
    resolve: (value: string) => value,
    dirname: (value: string) => value.slice(0, value.lastIndexOf('/')),
    basename: (value: string) => value.slice(value.lastIndexOf('/') + 1),
    join: (...parts: string[]) => parts.join('/'),
  };
  const process = {
    argv: ['electron', target, '123', '/tmp'], platform: 'linux',
    kill: () => { if (!options.parentRunning) throw Object.assign(new Error('gone'), { code: 'ESRCH' }); },
  };
  const require = (name: string) => name === 'node:fs' ? fs : path;
  const immediateTimeout = (callback: () => void) => queueMicrotask(callback);
  new Function('require', 'process', 'setTimeout', TEST_PROFILE_CLEANUP_SCRIPT)(require, process, immediateTimeout);
  await new Promise(resolve => setTimeout(resolve, 0));
  return fs;
}

describe('temporary test profile cleanup', () => {
  it('removes only a valid session after the parent exits', async () => {
    const fs = await runCleanup('/tmp/cybernotes-onboarding-test-ABC123');
    expect(fs.rmSync).toHaveBeenCalledOnce();
    expect(fs.rmSync).toHaveBeenCalledWith('/tmp/cybernotes-onboarding-test-ABC123', { recursive: true, force: true });
  });

  it.each([
    ['/outside/cybernotes-onboarding-test-ABC123', {}],
    ['/tmp/cybernotes-onboarding-test-other', {}],
    ['/tmp/cybernotes-onboarding-test-ABC123', { symlink: true }],
    ['/tmp/cybernotes-onboarding-test-ABC123', { parentRunning: true }],
  ])('does not remove unsafe or active target %s', async (target, options) => {
    const fs = await runCleanup(target, options);
    expect(fs.rmSync).not.toHaveBeenCalled();
    expect(fs.appendFileSync).toHaveBeenCalledOnce();
  });
});
