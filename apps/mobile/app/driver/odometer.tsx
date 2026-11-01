import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { idValue, type VehicleDto } from '@bmi/shared';
import { useApp } from '../../src/app-context.js';
import { Banner, Button, Card, Field, Screen } from '../../src/components/ui.js';
import { ApiError } from '../../src/api/client.js';
import { colors, spacing, touchTarget, typography } from '../../src/theme/tokens.js';

/**
 * Driver odometer reading (REQ-VEH-005). One task per screen: pick the vehicle,
 * type the whole-km reading, save. The server validates and never silently
 * corrects — an unusual jump comes back as a warning banner (BR-09).
 */
export default function OdometerScreen(): React.JSX.Element {
  const { api, t } = useApp();
  const [vehicles, setVehicles] = useState<VehicleDto[]>([]);
  const [vehicleId, setVehicleId] = useState<number | null>(null);
  const [reading, setReading] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedKm, setSavedKm] = useState<number | null>(null);
  const [jump, setJump] = useState(false);

  useEffect(() => {
    api
      .listVehicles()
      .then(setVehicles)
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : String(e)));
  }, [api]);

  const onSave = useCallback(async () => {
    const value = Number.parseInt(reading, 10);
    if (vehicleId === null || !Number.isInteger(value) || value < 0) {
      setError(t('required'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.saveOdometer(vehicleId, value);
      setSavedKm(res.odometerKm);
      setJump(res.jumpWarning);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [api, reading, t, vehicleId]);

  return (
    <Screen title={t('odometer')} onBack={() => router.back()} backLabel={t('back')}>
      {error ? <Banner text={error} tone="danger" /> : null}
      {savedKm !== null ? <Banner text={`${t('odometerSaved')} ${savedKm} km`} tone="success" /> : null}
      {jump ? <Banner text={t('jumpWarning')} tone="warning" /> : null}

      <Card>
        {vehicles.map((v) => {
          const id = idValue(v.id);
          const selected = id === vehicleId;
          return (
            <Pressable
              key={id}
              onPress={() => setVehicleId(id)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={v.plate}
              style={[styles.row, selected && styles.rowSelected]}
            >
              <Text style={styles.plate}>{v.plate}</Text>
              <Text style={styles.km}>{v.odometerKm} km</Text>
            </Pressable>
          );
        })}
      </Card>

      <Field
        label={t('odometerReading')}
        value={reading}
        onChangeText={setReading}
        keyboardType="number-pad"
      />
      <Button
        label={t('saveReading')}
        onPress={onSave}
        busy={busy}
        disabled={vehicleId === null || reading.trim().length === 0}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: touchTarget.min,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    borderRadius: 8,
  },
  rowSelected: { backgroundColor: colors.mist },
  plate: { fontSize: typography.body.fontSize, color: colors.text, fontWeight: '600' },
  km: { fontSize: typography.body.fontSize, color: colors.textMuted },
});
