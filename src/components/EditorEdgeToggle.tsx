import type { MouseEventHandler } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Tooltip from './Tooltip';

interface EditorEdgeToggleProps {
  side: 'left' | 'right';
  expanded: boolean;
  offset: number;
  label: string;
  onToggle: () => void;
  onContextMenu?: MouseEventHandler<HTMLButtonElement>;
}

export default function EditorEdgeToggle({ side, expanded, offset, label, onToggle, onContextMenu }: EditorEdgeToggleProps) {
  const Chevron = (side === 'left') === expanded ? ChevronLeft : ChevronRight;

  return (
    <Tooltip placement={side === 'left' ? 'right' : 'left'} label={label}>
      <button
        type="button"
        className="editor-edge-toggle"
        data-side={side}
        aria-label={label}
        aria-expanded={expanded}
        style={{ [side]: offset }}
        // Keep the editor's focus and text selection when toggling with the mouse.
        onMouseDown={event => event.preventDefault()}
        onClick={onToggle}
        onContextMenu={onContextMenu}
      >
        <Chevron size={14} strokeWidth={2} aria-hidden="true" />
      </button>
    </Tooltip>
  );
}
