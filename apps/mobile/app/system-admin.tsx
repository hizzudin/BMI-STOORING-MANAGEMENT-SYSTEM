import React from 'react';
import { router } from 'expo-router';
import { useApp } from '../src/app-context.js';
import { MenuTile, Screen } from '../src/components/ui.js';
import { MenuFooter } from '../src/components/menu-footer.js';

/**
 * System Admin field menu (PRD §7.11, REQ-MOB). The System Admin can report a
 * breakdown on a driver's behalf (the breakdown endpoint carries `vehicle.manage`,
 * granted to the System Admin in R1), capture an odometer reading, and review
 * fleet history — reusing the driver flow screens.
 */
export default function SystemAdminMenu(): React.JSX.Element {
  const { t } = useApp();
  return (
    <Screen title={t('systemAdminMenu')}>
      <MenuTile label={t('fieldReportBreakdown')} onPress={() => router.push('/driver/breakdown' as never)} />
      <MenuTile label={t('odometer')} onPress={() => router.push('/driver/odometer' as never)} />
      <MenuTile label={t('history')} onPress={() => router.push('/driver/history' as never)} />
      <MenuFooter />
    </Screen>
  );
}
