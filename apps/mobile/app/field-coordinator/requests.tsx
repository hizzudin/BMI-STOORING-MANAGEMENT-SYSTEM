import React, { useCallback, useState } from 'react';
import { router } from 'expo-router';
import { useApp } from '../../src/app-context.js';
import { Banner, Button, Field, Screen } from '../../src/components/ui.js';
import { canSendFcDraftForReview } from '../../src/logic/field-validation.js';

/**
 * Field Coordinator draft request (REQ-WO-016, DEC-91). A FC raises a Draft WO
 * from the field; "send for review" is **blocked until a finding note is typed**
 * (the server refuses an empty note too). This screen owns the client-side gate;
 * composing the full draft is the office's job after review.
 */
export default function FcRequestsScreen(): React.JSX.Element {
  const { t } = useApp();
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);
  const [showError, setShowError] = useState(false);

  const gate = canSendFcDraftForReview({ findingNote: note });

  const onSend = useCallback(() => {
    if (!gate.ok) {
      setShowError(true);
      return;
    }
    // The draft + send-for-review call lands with the WO module; the required
    // finding-note gate (blocking an empty send) is enforced here and server-side.
    setSent(true);
  }, [gate.ok]);

  if (sent) {
    return (
      <Screen title={t('draftTitle')} onBack={() => router.back()} backLabel={t('back')}>
        <Banner text={t('draftSent')} tone="success" />
        <Button label={t('back')} variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen title={t('draftTitle')} onBack={() => router.back()} backLabel={t('back')}>
      <Field
        label={t('draftFindingNote')}
        value={note}
        onChangeText={(v) => {
          setNote(v);
          if (v.trim().length > 0) {
            setShowError(false);
          }
        }}
        placeholder={t('findingNoteHint')}
        multiline
        required
        error={showError && !gate.ok ? t('draftNoteRequired') : null}
      />
      <Button label={t('sendForReview')} onPress={onSend} disabled={!gate.ok} />
    </Screen>
  );
}
