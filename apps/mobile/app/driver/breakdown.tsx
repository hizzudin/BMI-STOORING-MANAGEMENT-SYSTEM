import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { idValue, type VehicleDto } from '@bmi/shared';
import { useApp } from '../../src/app-context.js';
import { Banner, Button, Card, Field, Screen } from '../../src/components/ui.js';
import { ApiError } from '../../src/api/client.js';
import { canSubmitBreakdown, type CapturedLocation } from '../../src/logic/field-validation.js';
import { captureOnce } from '../../src/logic/location.js';
import { colors, spacing, touchTarget, typography } from '../../src/theme/tokens.js';

/**
 * Driver breakdown report (REQ-PM-005, REQ-MBL-002, REQ-WO-016). Captures the
 * driver's location ONCE and takes the mandatory field-finding note that becomes
 * the draft's `finding_note`. Submitting calls the breakdown endpoint, which
 * auto-drafts a WO pre-seeded with exactly one Mobilisasi step at the captured
 * location — the app never re-implements the drafting. The send is blocked while
 * the note is empty.
 */
export default function BreakdownScreen(): React.JSX.Element {
  const { api, session, t } = useApp();
  const [vehicles, setVehicles] = useState<VehicleDto[]>([]);
  const [vehicleId, setVehicleId] = useState<number | null>(null);
  const [location, setLocation] = useState<CapturedLocation | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneNumber, setDoneNumber] = useState<string | null>(null);
  const [showNoteError, setShowNoteError] = useState(false);

  useEffect(() => {
    api
      .listVehicles()
      .then(setVehicles)
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : String(e)));
  }, [api]);

  const onCapture = useCallback(async () => {
    setCapturing(true);
    const outcome = await captureOnce(async () => {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        return null;
      }
      const pos = await Location.getCurrentPositionAsync({});
      return {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        capturedAt: new Date(pos.timestamp).toISOString(),
      };
    });
    if (outcome.status === 'captured') {
      setLocation(outcome.location);
    }
    setCapturing(false);
  }, []);

  const gate = canSubmitBreakdown({ vehicleId, location, findingNote: note });

  const onSubmit = useCallback(async () => {
    if (!gate.ok) {
      setShowNoteError(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api.reportBreakdown({
        vehicleId: vehicleId as number,
        driverId: session?.userId ?? (vehicleId as number),
        description: note.trim(),
        ...(location ? { locationLat: location.lat, locationLng: location.lng } : {}),
      });
      setDoneNumber(result.draftedWorkOrder.number);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [api, gate.ok, location, note, session, vehicleId]);

  if (doneNumber) {
    return (
      <Screen title={t('breakdownTitle')} onBack={() => router.back()} backLabel={t('back')}>
        <Banner text={`${t('breakdownDone')} (${doneNumber})`} tone="success" />
        <Button label={t('back')} variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen title={t('breakdownTitle')} onBack={() => router.back()} backLabel={t('back')}>
      {error ? <Banner text={error} tone="danger" /> : null}

      <Text style={styles.sectionLabel}>{t('vehicle')}</Text>
      <Card>
        {vehicles.length === 0 ? (
          <Text style={styles.muted}>{t('loading')}</Text>
        ) : (
          vehicles.map((v) => {
            const id = idValue(v.id);
            const selected = id === vehicleId;
            return (
              <Pressable
                key={id}
                onPress={() => setVehicleId(id)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={v.plate}
                style={[styles.vehicleRow, selected && styles.vehicleRowSelected]}
              >
                <Text style={styles.vehiclePlate}>{v.plate}</Text>
                <Text style={styles.vehicleMark}>{selected ? '\u2713' : ''}</Text>
              </Pressable>
            );
          })
        )}
      </Card>

      <Button
        label={capturing ? t('loading') : t('captureLocation')}
        variant="secondary"
        onPress={onCapture}
        busy={capturing}
      />
      <Banner
        text={location ? t('locationCaptured') : t('locationNotCaptured')}
        tone={location ? 'success' : 'info'}
      />

      <Field
        label={t('findingNote')}
        value={note}
        onChangeText={(v) => {
          setNote(v);
          if (v.trim().length > 0) {
            setShowNoteError(false);
          }
        }}
        placeholder={t('findingNoteHint')}
        multiline
        required
        error={showNoteError && gate.reasonKey === 'findingNoteRequired' ? t('findingNoteRequired') : null}
      />

      <Button label={t('submitBreakdown')} onPress={onSubmit} busy={busy} disabled={!gate.ok} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionLabel: { fontSize: typography.label.fontSize, fontWeight: '600', color: colors.textMuted },
  muted: { color: colors.textSubtle, fontSize: typography.body.fontSize },
  vehicleRow: {
    minHeight: touchTarget.min,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    borderRadius: 8,
  },
  vehicleRowSelected: { backgroundColor: colors.mist },
  vehiclePlate: { fontSize: typography.body.fontSize, color: colors.text, fontWeight: '600' },
  vehicleMark: { fontSize: 18, color: colors.brandRed, fontWeight: '800' },
});
