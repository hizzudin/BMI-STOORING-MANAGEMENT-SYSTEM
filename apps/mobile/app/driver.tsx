import React from 'react';
import { router } from 'expo-router';
import { useApp } from '../src/app-context.js';
import { MenuTile, Screen } from '../src/components/ui.js';
import { MenuFooter } from '../src/components/menu-footer.js';

/**
 * Driver field menu (PRD §7.11, REQ-MOB). One large tile per task — inspection,
 * odometer, report breakdown, history — built for gloves + sunlight. One task
 * per screen (the tiles route to single-purpose screens).
 */
export default function DriverMenu(): React.JSX.Element {
  const { t } = useApp();
  return (
    <Screen title={t('driverMenu')}>
      <MenuTile label={t('inspection')} onPress={() => router.push('/driver/inspection' as never)} />
      <MenuTile label={t('odometer')} onPress={() => router.push('/driver/odometer' as never)} />
      <MenuTile label={t('reportBreakdown')} onPress={() => router.push('/driver/breakdown' as never)} />
      <MenuTile label={t('history')} onPress={() => router.push('/driver/history' as never)} />
      <MenuFooter />
    </Screen>
  );
}
