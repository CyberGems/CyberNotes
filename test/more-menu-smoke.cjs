'use strict';
// Runs inside Electron through scripts/test-more-menu.cjs, which supplies an
// isolated profile so the real one is never touched.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');

const dataDir = process.env.CYBERNOTES_MENU_TEST_DIR;
if (!dataDir || !path.basename(dataDir).startsWith('cybernotes-menu-test-')) {
  throw new Error('Isolated test directory required');
}
app.setPath('userData', dataDir);
app.setName('CyberNotes Menu Test');

require('../dist-electron/main');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(callback, description, timeout = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await callback()) return;
    await delay(60);
  }
  throw new Error('Timed out: ' + description);
}

let win;
app.whenReady().then(async () => {
  await waitFor(
    () => (win = BrowserWindow.getAllWindows().find(item => {
      const url = item.webContents.getURL();
      return url.includes('index.html') && !url.includes('sticky=');
    })),
    'main window'
  );

  const errors = [];
  win.webContents.on('console-message', event => {
    if (event.level === 'error') errors.push(event.message);
  });

  const evaluate = body => win.webContents.executeJavaScript('(async()=>{' + body + '})()');
  const text = selector =>
    evaluate(`const el=document.querySelector(${JSON.stringify(selector)});return el?el.textContent.trim():null;`);

  // A fresh profile opens onboarding; complete it like a user would.
  await waitFor(
    () => evaluate("return Boolean(document.querySelector('.onboarding-overlay') || document.querySelector('button[aria-haspopup=\"menu\"]'));"),
    'first screen'
  );
  if (await evaluate("return Boolean(document.querySelector('.onboarding-overlay'));")) {
    await evaluate("document.querySelector('.onboarding-overlay .modal-action-btn.is-save').click();");
    await waitFor(() => evaluate("return !document.querySelector('.onboarding-overlay');"), 'onboarding completed');
  }

  // The welcome-name modal can follow onboarding; dismiss it the same way.
  await evaluate(`
    const modal = document.querySelector('[aria-labelledby="welcome-name-title"]');
    if (modal) { const skip = modal.querySelector('button.btn-ghost'); if (skip) skip.click(); }
  `);
  await waitFor(() => evaluate("return !document.querySelector('[aria-labelledby=\"welcome-name-title\"]');"), 'welcome modal dismissed');

  await waitFor(() => evaluate("return Boolean(document.querySelector('button[aria-haspopup=\"menu\"]'));"), 'titlebar More button');

  await evaluate("document.querySelector('button[aria-haspopup=\"menu\"]').click();");
  await waitFor(() => evaluate("return Boolean(document.querySelector('.more-menu'));"), 'More menu open');

  const headers = await evaluate(`
    return Array.from(document.querySelectorAll('.more-menu .more-menu-section-toggle'))
      .map(el => el.textContent.trim());
  `);
  assert.equal(headers.length, 4, 'The menu keeps four collapsible sections: ' + JSON.stringify(headers));
  assert.ok(!headers.some(h => /^(app|aplicación)$/i.test(h)), 'The App section is gone: ' + JSON.stringify(headers));

  const mainItems = await evaluate(`
    const menu = document.querySelector('.more-menu');
    return Array.from(menu.querySelectorAll(':scope > button.menu-item')).map(el => el.textContent.trim());
  `);
  assert.ok(mainItems.some(item => /^(Lock|Bloquear)$/.test(item)), 'Lock lives on the main level: ' + JSON.stringify(mainItems));
  const exitLabel = mainItems[mainItems.length - 1];
  assert.match(exitLabel, /^(Exit CyberNotes|Salir de CyberNotes)$/, 'Exit is the last main-level item: ' + JSON.stringify(mainItems));

  const exitOrder = await evaluate(`
    const menu = document.querySelector('.more-menu');
    const items = Array.from(menu.querySelectorAll(':scope > button.menu-item'));
    return { lock: items.findIndex(el => /^(Lock|Bloquear)$/.test(el.textContent.trim())), exit: items.length - 1 };
  `);
  assert.ok(exitOrder.lock >= 0 && exitOrder.lock < exitOrder.exit, 'Lock sits above Exit: ' + JSON.stringify(exitOrder));

  const exitIcon = await evaluate(`
    const menu = document.querySelector('.more-menu');
    const items = Array.from(menu.querySelectorAll(':scope > button.menu-item'));
    const exit = items[items.length - 1];
    const svg = exit.querySelector('svg');
    const style = getComputedStyle(svg).color.match(/\\d+/g).map(Number);
    return { color: style.slice(0, 3), label: getComputedStyle(exit.querySelector('span')).color };
  `);
  assert.ok(exitIcon.color[0] > exitIcon.color[1] && exitIcon.color[0] > exitIcon.color[2], 'Exit icon is reddish: ' + JSON.stringify(exitIcon));

  // Every section opens as a flyout with its full set of rows.
  const flyoutCounts = await evaluate(`
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const counts = [];
    const headers = Array.from(document.querySelectorAll('.more-menu .more-menu-section-toggle'));
    for (const header of headers) {
      header.click();
      await wait(160);
      const panel = document.querySelector('.more-menu-flyout');
      counts.push(panel ? panel.querySelectorAll('[role="menuitem"], button.menu-item').length : -1);
    }
    return counts;
  `);
  assert.deepEqual(flyoutCounts, [8, 5, 9, 7], 'Flyout row counts: ' + JSON.stringify(flyoutCounts));

  const geometry = await evaluate(`
    const menu = document.querySelector('.more-menu');
    const panel = document.querySelector('.more-menu-flyout');
    if (!menu || !panel) return null;
    return {
      menuLeft: Math.round(menu.getBoundingClientRect().left),
      panelRight: Math.round(panel.getBoundingClientRect().right),
      panelLeft: Math.round(panel.getBoundingClientRect().left),
    };
  `);
  assert.ok(geometry, 'A flyout is open');
  assert.ok(geometry.panelRight <= geometry.menuLeft + 1, 'Flyout sits beside the menu, not over it: ' + JSON.stringify(geometry));

  const helpItems = await evaluate(`
    const panel = document.querySelector('.more-menu-flyout');
    return panel ? Array.from(panel.querySelectorAll('button.menu-item')).map(el => el.textContent.trim()) : null;
  `);
  assert.ok(helpItems && helpItems.some(item => /Keep visible in system tray|Mantener visible en la bandeja/.test(item)), 'Tray pin is inside the Help flyout: ' + JSON.stringify(helpItems));

  // The outside-click guard must accept the portaled flyout.
  const survived = await evaluate(`
    const panel = document.querySelector('.more-menu-flyout');
    panel.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 90));
    return Boolean(document.querySelector('.more-menu')) && Boolean(document.querySelector('.more-menu-flyout'));
  `);
  assert.equal(survived, true, 'Clicking inside the flyout keeps the menu open');

  // Escape unwinds one layer at a time.
  const layers = await evaluate(`
    const key = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    const state = () => ({ menu: Boolean(document.querySelector('.more-menu')), flyout: Boolean(document.querySelector('.more-menu-flyout')) });
    key();
    await new Promise(resolve => setTimeout(resolve, 90));
    const afterFirst = state();
    key();
    await new Promise(resolve => setTimeout(resolve, 90));
    return { afterFirst, afterSecond: state() };
  `);
  assert.deepEqual(layers.afterFirst, { menu: true, flyout: false }, 'First Escape closes only the flyout: ' + JSON.stringify(layers));
  assert.deepEqual(layers.afterSecond, { menu: false, flyout: false }, 'Second Escape closes the menu: ' + JSON.stringify(layers));

  // Hover intent: resting on a section opens its flyout without a click.
  const hovered = await evaluate(`
    document.querySelector('button[aria-haspopup="menu"]').click();
    await new Promise(resolve => setTimeout(resolve, 150));
    const headers = Array.from(document.querySelectorAll('.more-menu .more-menu-section-toggle'));
    headers[2].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 300));
    const panel = document.querySelector('.more-menu-flyout');
    return panel ? { rows: panel.querySelectorAll('[role="menuitem"]').length, label: panel.getAttribute('aria-label') } : null;
  `);
  assert.ok(hovered && hovered.rows === 9, 'Hovering a section opens its flyout: ' + JSON.stringify(hovered));

  // Keyboard: ArrowRight enters the flyout, ArrowLeft returns to the header.
  const keyboard = await evaluate(`
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    if (!document.querySelector('.more-menu')) {
      document.querySelector('button[aria-haspopup="menu"]').click();
      await wait(150);
    }
    if (document.querySelector('.more-menu-flyout')) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await wait(120);
    }
    const header = document.querySelector('.more-menu .more-menu-section-toggle[data-section="export"]');
    header.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await wait(150);
    const inFlyout = Boolean(document.activeElement?.closest('.more-menu-flyout'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    await wait(150);
    return {
      inFlyout,
      focusedSection: document.activeElement?.dataset?.section || null,
      flyoutOpen: Boolean(document.querySelector('.more-menu-flyout')),
    };
  `);
  assert.deepEqual(keyboard, { inFlyout: true, focusedSection: 'export', flyoutOpen: false }, 'Keyboard flies out and back: ' + JSON.stringify(keyboard));

  if (process.env.CYBERNOTES_MENU_TEST_SHOT) {
    await evaluate('await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));');
    await delay(300);
    fs.writeFileSync(process.env.CYBERNOTES_MENU_TEST_SHOT, (await win.webContents.capturePage()).toPNG());
  }

  assert.deepEqual(errors, [], 'Renderer logged no console errors');
  console.log('PASS More menu structure: ' + JSON.stringify({ headers, mainItems, helpItems }));
  app.exit(0);
}).catch(async error => {
  console.error('FAIL ' + (error && error.stack ? error.stack : error));
  try {
    const windows = BrowserWindow.getAllWindows().map(item => item.webContents.getURL());
    console.error('Windows: ' + JSON.stringify(windows));
    if (win && !win.isDestroyed()) {
      const body = await win.webContents.executeJavaScript('document.body.innerText.slice(0, 600)');
      const html = await win.webContents.executeJavaScript('document.body.innerHTML.slice(0, 600)');
      console.error('Body text: ' + JSON.stringify(body));
      console.error('Body html: ' + JSON.stringify(html));
    }
  } catch (diagnosticError) {
    console.error('Diagnostics failed: ' + diagnosticError);
  }
  app.exit(1);
});
