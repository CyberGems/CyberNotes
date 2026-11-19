'use strict';
// Launches the built app against a throwaway profile and drives the titlebar
// More menu. Build first: the smoke test loads dist/ and dist-electron/.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
for (const artifact of [path.join(root, 'dist', 'index.html'), path.join(root, 'dist-electron', 'main.js')]) {
  if (!fs.existsSync(artifact)) {
    console.error('Missing build output: ' + artifact);
    console.error('Run "npm run build" before the menu smoke test.');
    process.exit(1);
  }
}

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cybernotes-menu-test-'));
const environment = {
  ...process.env,
  CYBERNOTES_MENU_TEST_DIR: dataDir,
  CYBERNOTES_USER_DATA_DIR: dataDir,
};
delete environment.ELECTRON_RUN_AS_NODE;

const result = spawnSync(require('electron'), [path.join(root, 'test', 'more-menu-smoke.cjs')], {
  env: environment,
  encoding: 'utf8',
  timeout: 120000,
  windowsHide: true,
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);

if (result.error || result.status !== 0) {
  console.error(result.error ? String(result.error) : 'Exit code: ' + result.status);
  console.error('Isolated test profile kept for inspection: ' + dataDir);
  process.exit(1);
}

// Chromium can hold handles for a moment after exit; retry, then keep the folder.
for (let attempt = 0; attempt < 20; attempt++) {
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
    break;
  } catch (error) {
    if (attempt === 19) console.warn('Could not remove the test profile: ' + dataDir);
    else Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
}
console.log('More menu smoke test finished.');
