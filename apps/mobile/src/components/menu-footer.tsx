import React from 'react';
import { router } from 'expo-router';
import { Button } from './ui.js';
import { useApp } from '../app-context.js';

/**
 * The shared menu footer: a link to the MobileProfile (shared across roles) and
 * the sign-out action. Kept out of the individual menus so every field menu
 * carries the same profile + sign-out affordance.
 */
export function MenuFooter(): React.JSX.Element {
  const { t, signOut } = useApp();
  return (
    <>
      <Button
        label={t('profile')}
        variant="secondary"
        onPress={() => router.push('/profile' as never)}
      />
      <Button
        label={t('signOut')}
        variant="secondary"
        onPress={async () => {
          await signOut();
          router.replace('/' as never);
        }}
      />
    </>
  );
}
