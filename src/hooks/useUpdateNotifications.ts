import { useEffect, useState } from 'react';

const SETTING_KEY = 'auto_check_updates';

export function useUpdateNotifications() {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    let receivedChange = false;
    const off = window.cyberNotesAPI.onSettingChanged(({ key, value }) => {
      if (key !== SETTING_KEY) return;
      receivedChange = true;
      setEnabled(value !== 'false');
    });
    void window.cyberNotesAPI.getSetting(SETTING_KEY).then(value => {
      if (active && !receivedChange) setEnabled(value !== 'false');
    }).catch(console.error);
    return () => { active = false; off(); };
  }, []);

  const change = (next: boolean) => {
    void window.cyberNotesAPI.setSetting(SETTING_KEY, String(next)).catch(console.error);
  };

  return [enabled, change] as const;
}
