import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from '../src/app-context.js';

/**
 * Root layout: wraps the whole app in the {@link AppProvider} (API client,
 * session, language, profile) and a stack navigator. Headers are provided per
 * screen by the `Screen` primitive, so the native header is hidden.
 */
export default function RootLayout(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />
      </AppProvider>
    </SafeAreaProvider>
  );
}
