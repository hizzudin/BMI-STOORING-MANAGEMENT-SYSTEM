import React from 'react';
import { router } from 'expo-router';
import { useApp } from '../src/app-context.js';
import { MenuTile, Screen } from '../src/components/ui.js';
import { MenuFooter } from '../src/components/menu-footer.js';

/**
 * Mechanic field menu (R2, REQ-MOB-010). Surfaced in Release 2; the backing
 * today-task list is wired now. The continuous mechanic GPS trail (R2
 * Mobilisasi) is NOT part of this menu.
 */
export default function MechanicMenu(): React.JSX.Element {
  const { t } = useApp();
  return (
    <Screen title={t('mechanicMenu')}>
      <MenuTile label={t('todayTasks')} onPress={() => router.push('/mechanic/today' as never)} />
      <MenuFooter />
    </Screen>
  );
}
