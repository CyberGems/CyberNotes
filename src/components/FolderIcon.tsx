import {
  Folder, FileText, Briefcase, Home, Zap, Lightbulb,
  Palette, Book, Microscope, Target, Heart, Star, Tag,
  Archive, Inbox, Code, Users, Rocket, Bookmark, Wrench, Layers
} from 'lucide-react';

interface Props {
  name: string;
  color: string;
  size?: number;
}

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; color?: string; style?: React.CSSProperties; strokeWidth?: number }>> = {
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
  'code': Code,
  'users': Users,
  'rocket': Rocket,
  'bookmark': Bookmark,
  'wrench': Wrench,
  'layers': Layers,
};

export default function FolderIcon({ name, color, size = 16 }: Props) {
  const IconComponent = ICON_MAP[name] || Folder;
  
  return (
    <IconComponent
      size={size}
      color={color}
      strokeWidth={2}
      style={{ display: 'inline-block' }}
    />
  );
}
