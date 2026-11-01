import React from 'react';
import { router } from 'expo-router';
import { useApp } from '../../src/app-context.js';
import { Banner, Screen } from '../../src/components/ui.js';

/**
 * Field Coordinator purchase (REQ-MOB / REQ-PUR). The Part Purchase step itself
 * is executed inside an approved WO (nothing happens outside a WO — PRODUCT.md
 * principle 1); the field menu links the FC to the purchase step of the WOs they
 * are the buyer on. The full purchase-line entry is the Part Purchase step UI.
 */
export default function FcPurchaseScreen(): React.JSX.Element {
  const { t } = useApp();
  return (
    <Screen title={t('purchase')} onBack={() => router.back()} backLabel={t('back')}>
      <Banner
        text={
          t('appName') === 'BMI Stooring'
            ? 'Pembelian dilakukan di dalam langkah Part Purchase pada WO yang disetujui.'
            : 'Purchases happen inside the Part Purchase step of an approved WO.'
        }
        tone="info"
      />
    </Screen>
  );
}
