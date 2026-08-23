import { useState, useRef, useCallback, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Scissors, Copy, Clipboard, CheckSquare, Trash2 } from 'lucide-react';
import { Language } from '../languages';

interface MenuState {
  x: number;
  y: number;
  hasSelection: boolean;
  hasValue: boolean;
  isPassword: boolean;
}

/**
 * Menú contextual reutilizable para campos de texto (<input>/<textarea>).
 * Provee Cortar, Copiar, Pegar, Seleccionar todo y Eliminar, con el estilo
 * de los menús de la app. Una sola instancia por componente sirve a todos
 * sus campos: basta con repartir `onContextMenu` y renderizar `menu` una vez.
 */
export function useInputContextMenu(language: Language) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const targetRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  const onContextMenu = useCallback((e: React.MouseEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.preventDefault();
    const el = e.currentTarget;
    targetRef.current = el;
    el.focus();
    const hasSelection = el.selectionStart !== el.selectionEnd;
    const hasValue = (el.value?.length ?? 0) > 0;
    // El navegador bloquea Cortar/Copiar en campos de contraseña por seguridad.
    const isPassword = (el as HTMLInputElement).type === 'password';

    // Evitar que el menú se desborde de la ventana.
    const MENU_W = 190, MENU_H = 230, margin = 8;
    let x = e.clientX, y = e.clientY;
    if (x + MENU_W + margin > window.innerWidth) x = window.innerWidth - MENU_W - margin;
    if (y + MENU_H + margin > window.innerHeight) y = window.innerHeight - MENU_H - margin;
    setMenu({ x: Math.max(margin, x), y: Math.max(margin, y), hasSelection, hasValue, isPassword });
  }, []);

  const close = useCallback(() => setMenu(null), []);

  // Las operaciones usan execCommand sobre el campo enfocado: dispara el evento
  // 'input' nativo, así los componentes controlados (value/onChange) se actualizan.
  const exec = (command: string) => {
    targetRef.current?.focus();
    document.execCommand(command);
    close();
  };

  const selectAll = () => {
    targetRef.current?.focus();
    targetRef.current?.select();
    close();
  };

  const paste = () => {
    const el = targetRef.current;
    if (!el) { close(); return; }
    navigator.clipboard.readText()
      .then(text => { el.focus(); document.execCommand('insertText', false, text); })
      .catch(() => { el.focus(); document.execCommand('paste'); })
      .finally(close);
  };

  const t = (es: string, en: string) => (language === 'es' ? es : en);

  const itemStyle = (enabled: boolean): CSSProperties => ({
    textAlign: 'left', padding: '6px 10px', fontSize: 13,
    background: 'transparent', border: 'none', borderRadius: 4,
    color: !enabled ? 'var(--text-muted)' : 'var(--text-primary)',
    cursor: enabled ? 'pointer' : 'default',
    opacity: enabled ? 1 : 0.5,
  });

  const Item = ({ icon, label, enabled, onClick, danger }: { icon: ReactNode; label: string; enabled: boolean; onClick: () => void; danger?: boolean }) => (
    <button
      disabled={!enabled}
      onMouseDown={e => {
        e.preventDefault();
        e.stopPropagation();
        if (!enabled) return;
        onClick();
      }}
      style={{
        ...itemStyle(enabled),
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
      onMouseEnter={e => { if (enabled) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, color: danger ? 'var(--danger)' : 'inherit', flexShrink: 0 }}>
        {icon}
      </span>
      <span style={{ flex: 1 }}>{label}</span>
    </button>
  );

  const menu_el = menu ? createPortal(
    <>
      {/* Backdrop para cerrar al clicar fuera. */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 100000 }} onMouseDown={close} />
      <div
        className="glass-effect"
        style={{
          position: 'fixed', left: menu.x, top: menu.y,
          background: 'var(--bg-modal)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', padding: 6, zIndex: 100001,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)', minWidth: 180,
          display: 'flex', flexDirection: 'column', gap: 2,
        }}
        onMouseDown={e => e.preventDefault()}  // mantiene el campo enfocado
        onClick={e => e.stopPropagation()}
      >
        <Item icon={<Scissors size={13} />} label={t('Cortar', 'Cut')} enabled={menu.hasSelection && !menu.isPassword} onClick={() => exec('cut')} />
        <Item icon={<Copy size={13} />} label={t('Copiar', 'Copy')} enabled={menu.hasSelection && !menu.isPassword} onClick={() => exec('copy')} />
        <Item icon={<Clipboard size={13} />} label={t('Pegar', 'Paste')} enabled={true} onClick={paste} />
        <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
        <Item icon={<CheckSquare size={13} />} label={t('Seleccionar todo', 'Select all')} enabled={menu.hasValue} onClick={selectAll} />
        <Item icon={<Trash2 size={13} />} label={t('Eliminar', 'Delete')} enabled={menu.hasSelection} onClick={() => exec('delete')} danger />
      </div>
    </>,
    document.body
  ) : null;

  return { onContextMenu, menu: menu_el };
}
