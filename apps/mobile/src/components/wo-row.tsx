import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { WorkOrderDto, WorkOrderPriority } from '@bmi/shared';
import { Pill } from './ui.js';
import { rolledOverPill, urgencyPill } from '../theme/pills.js';
import { priorityWord, type Translator } from '../i18n/strings.js';
import { colors, radius, spacing, typography } from '../theme/tokens.js';

/**
 * A WO list row carrying the WO number, status and the urgency pill (text label
 * present, WCAG — Words First Rule). Optionally shows a rolled-over flag used by
 * the Mechanic today list (REQ-MOB-010).
 */
export const WorkOrderRow = memo(function WorkOrderRow({
  number,
  status,
  priority,
  isRolledOver,
  t,
}: {
  number: string;
  status: string;
  priority: WorkOrderPriority;
  isRolledOver?: boolean;
  t: Translator;
}): React.JSX.Element {
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <Text style={styles.number}>{number}</Text>
        <Text style={styles.status}>{status}</Text>
      </View>
      <View style={styles.pills}>
        {isRolledOver ? <Pill pill={rolledOverPill(t('rolledOver'))} /> : null}
        <Pill pill={urgencyPill(priority, priorityWord(t, priority))} />
      </View>
    </View>
  );
});

/** Narrow the DTO priority to the pill helper's input. */
export function priorityOf(wo: Pick<WorkOrderDto, 'priority'>): WorkOrderPriority {
  return wo.priority;
}

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  left: { flex: 1, gap: 2 },
  number: { fontSize: typography.body.fontSize, fontWeight: '700', color: colors.text },
  status: { fontSize: typography.label.fontSize, color: colors.textMuted },
  pills: { flexDirection: 'row', gap: spacing.xs, alignItems: 'center' },
});
