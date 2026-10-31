// Run in a detached Electron-as-Node process after the app exits. Chromium can
// hold files open until then, especially on Windows.
export const TEST_PROFILE_CLEANUP_SCRIPT = String.raw`
const fs = require('node:fs');
const path = require('node:path');
const [profile, parent, temporaryRoot] = process.argv.slice(1);
const pid = Number(parent);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const samePath = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
const report = error => {
  try { fs.appendFileSync(path.join(temporaryRoot, 'cybernotes-test-cleanup-errors.log'), new Date().toISOString() + ' ' + String(error) + '\n'); } catch {}
};
async function cleanup() {
  if (!Number.isInteger(pid) || pid <= 0 || !profile || !temporaryRoot) throw Error('Invalid cleanup arguments');
  const target = path.resolve(profile);
  const name = path.basename(target);
  const root = fs.realpathSync(temporaryRoot);
  if (!/^cybernotes-onboarding-test-[a-z0-9]{6}$/i.test(name) || !samePath(fs.realpathSync(path.dirname(target)), root)) throw Error('Unsafe test profile path');
  for (let attempt = 0; attempt < 150; attempt++) {
    try { process.kill(pid, 0); } catch (error) { if (error.code === 'ESRCH') break; }
    if (attempt === 149) throw Error('Timed out waiting for the application to exit');
    await delay(200);
  }
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const stat = fs.lstatSync(target);
      if (!stat.isDirectory() || stat.isSymbolicLink() || !samePath(fs.realpathSync(target), path.join(root, name))) throw Error('Test profile path changed');
      fs.rmSync(target, { recursive: true, force: true });
      return;
    } catch (error) {
      if (error.code === 'ENOENT') return;
      if (attempt === 39) throw error;
      await delay(250);
    }
  }
}
cleanup().catch(report);
`;
