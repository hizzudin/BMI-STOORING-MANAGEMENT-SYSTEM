import React from 'react';
import { router } from 'expo-router';
import { useApp } from '../src/app-context.js';
import { MenuTile, Screen } from '../src/components/ui.js';
import { MenuFooter } from '../src/components/menu-footer.js';

/**
 * Field Coordinator (Korlap) field menu (PRD §7.11, REQ-MOB): requests (raise a
 * field draft for review) and purchase. One large tile per task.
 */
export default function FieldCoordinatorMenu(): React.JSX.Element {
  const { t } = useApp();
  return (
    <Screen title={t('fieldCoordinatorMenu')}>
      <MenuTile label={t('requests')} onPress={() => router.push('/field-coordinator/requests' as never)} />
      <MenuTile label={t('purchase')} onPress={() => router.push('/field-coordinator/purchase' as never)} />
      <MenuFooter />
    </Screen>
  );
}
