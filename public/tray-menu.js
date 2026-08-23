'use strict';

const ICONS = {
  window: '<svg viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="10" y1="4" x2="10" y2="8"/><line x1="2" y1="8" x2="22" y2="8"/><line x1="6" y1="4" x2="6" y2="8"/></svg>',
  settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  about: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
  quit: '<svg viewBox="0 0 24 24"><path d="M18.4 6.6a9 9 0 1 1-12.8 0"/><path d="M12 3v9"/></svg>'
};

const api = window.trayMenu;
const root = document.getElementById('root');
const headEl = document.getElementById('head');
const groupEl = document.getElementById('group');
const exitGroupEl = document.getElementById('exitGroup');

function makeItem(def) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'item' + (def.danger ? ' danger' : '');
  btn.setAttribute('role', 'menuitem');

  const iconSpan = document.createElement('span');
  iconSpan.className = 'icon';
  iconSpan.innerHTML = ICONS[def.icon] || '';

  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = def.label;

  btn.appendChild(iconSpan);
  btn.appendChild(label);

  if (def.shortcut && String(def.shortcut).trim()) {
    const sc = document.createElement('span');
    sc.className = 'shortcut';
    sc.textContent = String(def.shortcut).trim();
    btn.appendChild(sc);
  }

  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    api.action(def.action);
  });
  return btn;
}

function applyState(state) {
  headEl.innerHTML = '<img class="head-icon" src="icon.png" alt="" /><span>' + (state.head || ('CyberNotes v' + (state.version || ''))) + '</span>';
  groupEl.replaceChildren(
    makeItem({ action: 'toggle', icon: 'window', label: state.showLabel, shortcut: state.shortcut || '' }),
    makeItem({ action: 'settings', icon: 'settings', label: state.settingsLabel }),
    makeItem({ action: 'about', icon: 'about', label: state.aboutLabel })
  );
  exitGroupEl.replaceChildren(
    makeItem({ action: 'quit', icon: 'quit', label: state.exitLabel, danger: true })
  );
}

function reportReady() {
  const r = root.getBoundingClientRect();
  if (r.width < 8 || r.height < 8) return;
  api.ready({ width: r.width, height: r.height });
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); api.hide(); }
});
document.addEventListener('contextmenu', (e) => e.preventDefault());

if (api) {
  api.onState(applyState);
  api.onShow(() => {
    requestAnimationFrame(() => requestAnimationFrame(reportReady));
  });
}

headEl.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  e.stopPropagation();
  api.action('about');
});
