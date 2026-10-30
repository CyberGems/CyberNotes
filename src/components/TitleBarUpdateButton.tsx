import { ArrowDown } from 'lucide-react';
import { TRANSLATIONS, type Language } from '../languages';
import Tooltip from './Tooltip';

export default function TitleBarUpdateButton({ language, version, onClick }: {
  language: Language;
  version?: string | null;
  onClick?: () => void;
}) {
  if (!version) return null;
  const label = `${TRANSLATIONS[language].updater.available}: v${version}`;

  return (
    <Tooltip label={label} placement="bottom">
      <button type="button" className="titlebar-update-button" aria-label={label} onClick={onClick}>
        <ArrowDown size={14} strokeWidth={2.4} aria-hidden="true" />
      </button>
    </Tooltip>
  );
}
