import React, { useCallback, useState } from 'react';
import { router } from 'expo-router';
import { useApp } from '../../src/app-context.js';
import { Banner, Button, Field, Screen } from '../../src/components/ui.js';

/**
 * Driver inspection (DVIR, REQ-MOB). A minimal single-task screen: the driver
 * records a short daily condition note. A failing finding is turned into a WO by
 * the office (nothing happens outside a WO — PRODUCT.md principle 1), so this
 * screen only captures the report; it does not mutate vehicle state.
 */
export default function InspectionScreen(): React.JSX.Element {
  const { t } = useApp();
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);

  const onSend = useCallback(() => {
    if (note.trim().length === 0) {
      return;
    }
    // The inspection submit endpoint (DVIR) lands with the mobilisation/DVIR
    // task; here the field capture + gate are in place and the office converts a
    // failing finding into a WO.
    setSent(true);
  }, [note]);

  return (
    <Screen title={t('inspection')} onBack={() => router.back()} backLabel={t('back')}>
      {sent ? <Banner text={t('saved')} tone="success" /> : null}
      <Field
        label={t('findingNote')}
        value={note}
        onChangeText={setNote}
        placeholder={t('findingNoteHint')}
        multiline
        required
      />
      <Button label={t('save')} onPress={onSend} disabled={note.trim().length === 0} />
    </Screen>
  );
}
