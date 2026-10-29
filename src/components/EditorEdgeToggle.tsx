import { useRef, useState, type MouseEvent as ReactMouseEvent, type MouseEventHandler } from 'react';

interface EditorEdgeToggleProps {
  side: 'left' | 'right';
  expanded: boolean;
  offset: number;
  label: string;
  onToggle: () => void;
  onContextMenu?: MouseEventHandler<HTMLButtonElement>;
}

export default function EditorEdgeToggle({ side, expanded, offset, label, onToggle, onContextMenu }: EditorEdgeToggleProps) {
  const press = useRef<{ x: number; y: number } | null>(null);
  const [interaction, setInteraction] = useState<'idle' | 'hover' | 'drag'>('idle');

  const trackMouse = (event: ReactMouseEvent<HTMLButtonElement>) => {
    const start = press.current;
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4) press.current = null;
    setInteraction(event.buttons === 0 ? 'hover' : press.current ? 'idle' : 'drag');
  };

  return (
    <button
      type="button"
      className="editor-edge-toggle"
      data-side={side}
      data-hovered={interaction === 'hover' || undefined}
      data-drag-over={interaction === 'drag' || undefined}
      aria-label={label}
      aria-expanded={expanded}
      style={{ [side]: offset }}
      onMouseEnter={trackMouse}
      onMouseMove={trackMouse}
      onMouseLeave={() => { press.current = null; setInteraction('idle'); }}
      onMouseDown={event => {
        // Preserve editor focus and require a deliberate press on this control.
        event.preventDefault();
        press.current = event.button === 0 ? { x: event.clientX, y: event.clientY } : null;
        setInteraction('idle');
      }}
      onMouseUp={() => { if (!press.current) setInteraction('idle'); }}
      onClick={event => {
        const start = press.current;
        press.current = null;
        // Keyboard and assistive activation have detail=0. A mouse selection
        // that merely ends over the notch must never toggle either panel.
        if (event.detail > 0 && (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4)) return;
        if (event.detail > 0) setInteraction('hover');
        onToggle();
      }}
      onContextMenu={onContextMenu}
    >
      <span className="editor-edge-notch" aria-hidden="true" />
    </button>
  );
}
