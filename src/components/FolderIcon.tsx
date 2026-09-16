import {
  Folder, FileText, Briefcase, Home, Zap, Lightbulb,
  Palette, Book, Microscope, Target, Heart, Star, Tag,
  Archive, Inbox, Code, Users, Rocket, Bookmark, Wrench, Layers,
  StickyNote as StickyNoteIcon, Trash2, AppWindow, Search, Cloud
} from 'lucide-react';

interface Props {
  name: string;
  color: string;
  size?: number;
  filled?: boolean;
}

export const FILTER_COLORS = {
  all: '#818cf8',
  favorites: '#f59e0b',
  sticky: '#22d3ee',
  unfiled: '#34d399',
  trash: '#f87171',
} as const;

const ICON_MAP: Record<string, React.ComponentType<{
  size?: number;
  color?: string;
  fill?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
}>> = {
  'folder': Folder,
  'file-text': FileText,
  'briefcase': Briefcase,
  'home': Home,
  'zap': Zap,
  'lightbulb': Lightbulb,
  'palette': Palette,
  'book': Book,
  'microscope': Microscope,
  'target': Target,
  'heart': Heart,
  'tag': Tag,
  'star': Star,
  'archive': Archive,
  'inbox': Inbox,
  'cloud': Cloud,
  'code': Code,
  'users': Users,
  'rocket': Rocket,
  'bookmark': Bookmark,
  'wrench': Wrench,
  'layers': Layers,
  'sticky-note': StickyNoteIcon,
  'app-window': AppWindow,
  'trash-2': Trash2,
  'search': Search,
};

export default function FolderIcon({ name, color, size = 16, filled = false }: Props) {
  const IconComponent = ICON_MAP[name] || Folder;
  const isFilled = filled || name === 'star' || name === 'heart';

  return (
    <IconComponent
      size={size}
      color={color}
      fill={isFilled ? color : 'none'}
      strokeWidth={isFilled ? 0 : 2}
      style={{ display: 'inline-block', flexShrink: 0 }}
    />
  );
}
