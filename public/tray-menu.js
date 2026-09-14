'use strict';

const ICONS = {
  window: '<svg viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="10" y1="4" x2="10" y2="8"/><line x1="2" y1="8" x2="22" y2="8"/><line x1="6" y1="4" x2="6" y2="8"/></svg>',
  settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  about: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
  quit: '<svg viewBox="0 0 24 24"><path d="M18.4 6.6a9 9 0 1 1-12.8 0"/><path d="M12 3v9"/></svg>',
  help: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M9.2 9a3 3 0 1 1 5.6 1c0 2-2.8 2.3-2.8 4"/><path d="M12 18h.01"/></svg>',
  key: '<svg viewBox="0 0 24 24"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 2.5 2.5"/><path d="m18.5 4.5 2 2"/></svg>',
  chevron: '<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>',
  book: '<svg viewBox="0 0 24 24"><path d="M3 4.5A2.5 2.5 0 0 1 5.5 2H11v18H5.5A2.5 2.5 0 0 0 3 22.5z"/><path d="M21 4.5A2.5 2.5 0 0 0 18.5 2H13v18h5.5a2.5 2.5 0 0 1 2.5 2.5z"/></svg>',
  tag: '<svg viewBox="0 0 24 24"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><circle cx="7" cy="7" r="1"/></svg>',
  globe: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
  heart: '<svg viewBox="0 0 24 24"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21.2l8.9-8.8a5.5 5.5 0 0 0 0-7.8z"/></svg>',
  download: '<svg viewBox="0 0 24 24"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 21h16"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="M8 3h8l-1 5 3 3v2H6v-2l3-3z"/><path d="M12 13v8"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/><path d="M9 12h11"/></svg>',
};

const api = window.trayMenu;
const root = document.getElementById('root');
const headEl = document.getElementById('head');
const groupEl = document.getElementById('group');
const exitGroupEl = document.getElementById('exitGroup');
let currentState = null;
let currentView = 'main';

function makeSeparator() {
  const separator = document.createElement('div');
  separator.className = 'submenu-divider';
  separator.setAttribute('role', 'separator');
  return separator;
}

function renderHead() {
  headEl.replaceChildren();
  headEl.classList.toggle('help-head', currentView === 'help');

  if (currentView === 'help') {
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'head-back';
    back.setAttribute('aria-label', (currentState.help && currentState.help.backLabel) || 'Back');
    back.innerHTML = ICONS.back;
    back.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      currentView = 'main';
      renderView();
    });
    headEl.appendChild(back);
    const title = document.createElement('span');
    title.textContent = (currentState.help && currentState.help.label) || 'Help';
    headEl.appendChild(title);
    return;
  }

  const icon = document.createElement('img');
  icon.className = 'head-icon';
  icon.src = 'icon.png';
  icon.alt = '';
  headEl.appendChild(icon);
  const title = document.createElement('span');
  title.textContent = currentState.head || ('CyberNotes v' + (currentState.version || ''));
  headEl.appendChild(title);
}

function makeItem(def) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'item' + (def.danger ? ' danger' : '') + (def.tone ? ' ' + def.tone : '');
  btn.setAttribute('role', 'menuitem');

  const iconSpan = document.createElement('span');
  iconSpan.className = 'icon';
  iconSpan.innerHTML = ICONS[def.icon] || '';

  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = def.label;

  btn.appendChild(iconSpan);
  btn.appendChild(label);

  if (def.trailingIcon && ICONS[def.trailingIcon]) {
    const trailing = document.createElement('span');
    trailing.className = 'trailing-icon';
    trailing.innerHTML = ICONS[def.trailingIcon];
    trailing.setAttribute('aria-hidden', 'true');
    btn.appendChild(trailing);
  }

  if (def.shortcut && String(def.shortcut).trim()) {
    const sc = document.createElement('span');
    sc.className = 'shortcut';
    sc.textContent = String(def.shortcut).trim();
    btn.appendChild(sc);
  }

  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (def.localAction === 'help') {
      currentView = 'help';
      renderView();
    } else if (def.localAction === 'back') {
      currentView = 'main';
      renderView();
    } else {
      api.action(def.action);
    }
  });
  return btn;
}

function renderMainView() {
  const items = [
    makeItem({ action: 'toggle', icon: 'window', label: currentState.showLabel, shortcut: currentState.shortcut || '' })
  ];

  if (currentState.canLock) {
    items.push(makeItem({ action: 'lock', icon: 'lock', label: currentState.lockLabel }));
  }

  items.push(
    makeItem({ action: 'settings', icon: 'settings', label: currentState.settingsLabel }),
    makeItem({ localAction: 'help', icon: 'help', label: (currentState.help && currentState.help.label) || 'Help', trailingIcon: 'chevron' })
  );

  groupEl.replaceChildren(...items);
  exitGroupEl.replaceChildren(
    makeItem({ action: 'quit', icon: 'quit', label: currentState.exitLabel, danger: true })
  );
}

function renderHelpView() {
  const help = currentState.help || {};
  groupEl.replaceChildren(
    makeItem({ action: 'help-pin', icon: 'pin', label: help.pinLabel || 'Mantener visible en la bandeja del sistema' }),
    makeItem({ action: 'help-set-password', icon: 'key', label: help.setPasswordLabel || 'Set password...' }),
    makeSeparator(),
    makeItem({ action: 'help-docs', icon: 'book', label: help.docsLabel || (help.label === 'Ayuda' ? 'Documentación / Wiki' : 'Documentation / Wiki') }),
    makeItem({ action: 'help-faq', icon: 'help', label: help.faqLabel || 'FAQ' }),
    makeItem({ action: 'help-changelog', icon: 'tag', label: help.changelogLabel || 'Changelog' }),
    makeItem({ action: 'help-website', icon: 'globe', label: help.websiteLabel || 'Website' }),
    makeItem({ action: 'help-donate', icon: 'heart', label: help.donateLabel || 'Donate', tone: 'donate' }),
    makeSeparator(),
    makeItem({ action: 'help-about', icon: 'about', label: help.aboutLabel || 'About...' }),
    makeItem({ action: 'help-check-updates', icon: 'download', label: help.updatesLabel || 'Check for updates' })
  );
  exitGroupEl.replaceChildren();
}

function renderView() {
  if (!currentState) return;
  root.classList.toggle('help-view', currentView === 'help');
  renderHead();
  if (currentView === 'help') renderHelpView();
  else renderMainView();
  reportReady();
}

function applyState(state) {
  currentState = state;
  if (state && state.resetView) currentView = 'main';
  renderView();
}

function reportReady() {
  const r = root.getBoundingClientRect();
  if (r.width < 8 || r.height < 8) return;
  api.ready({ width: r.width, height: r.height });
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    if (currentView === 'help') {
      currentView = 'main';
      renderView();
    } else {
      api.hide();
    }
  }
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
  if (currentView === 'help') {
    currentView = 'main';
    renderView();
  } else {
    api.action('about');
  }
});
