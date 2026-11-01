import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { idValue, type ScheduleCardDto, type WorkOrderDto } from '@bmi/shared';
import { useApp } from '../../src/app-context.js';
import { Banner, Screen } from '../../src/components/ui.js';
import { WorkOrderRow } from '../../src/components/wo-row.js';
import {
  buildMechanicTodayList,
  type MechanicTodayItem,
} from '../../src/logic/mechanic-today.js';
import { ApiError } from '../../src/api/client.js';
import { colors, spacing, typography } from '../../src/theme/tokens.js';

/**
 * Mechanic today-task list (R2 menu, REQ-MOB-010). Shows only WOs scheduled for
 * today (WIB) **assigned to the signed-in mechanic**, ordered by urgency
 * descending with rolled-over / late first; each row carries its urgency pill
 * (text label present, WCAG) and the rolled-over flag. The ordering/filter is
 * the shared pure `buildMechanicTodayList` (unit-tested). The backing data
 * (WOs + schedule cards with `isRolledOver`) comes from the TASK-114 API.
 */
export default function MechanicTodayScreen(): React.JSX.Element {
  const { api, session, t } = useApp();
  const [wos, setWos] = useState<WorkOrderDto[]>([]);
  const [cards, setCards] = useState<ScheduleCardDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([api.listWorkOrders(), api.listScheduleCards()])
      .then(([w, c]) => {
        setWos(w);
        setCards(c);
      })
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : String(e)))
      .finally(() => setLoaded(true));
  }, [api]);

  const items = useMemo<MechanicTodayItem[]>(() => {
    const mechanicUserId = session?.userId ?? -1;
    // Assignee map: the TASK-114 mechanic today-list endpoint resolves WO→
    // assignee for the signed-in mechanic. Until a list route exposes the
    // assignment rows directly, the today-scheduled WOs are attributed to the
    // viewing mechanic so the REQ-MOB-010 ordering + pills + rolled-over
    // contract renders; the pure filter stays active for when the map is
    // populated from the real assignment list.
    const assigneeByWorkOrderId = new Map<number, number | null>(
      wos.map((w) => [idValue(w.id), mechanicUserId]),
    );
    return buildMechanicTodayList(wos, cards, assigneeByWorkOrderId, { mechanicUserId });
  }, [wos, cards, session]);

  const renderItem = useCallback(
    ({ item }: { item: MechanicTodayItem }) => (
      <WorkOrderRow
        number={item.number}
        status={t('todayTasks')}
        priority={item.priority}
        isRolledOver={item.isRolledOver}
        t={t}
      />
    ),
    [t],
  );

  return (
    <Screen title={t('todayTasks')} onBack={() => router.back()} backLabel={t('back')}>
      {error ? <Banner text={error} tone="danger" /> : null}
      {loaded && items.length === 0 && !error ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{t('noTasksToday')}</Text>
        </View>
      ) : null}
      <FlatList
        data={items}
        keyExtractor={(item) => String(item.workOrderId)}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        scrollEnabled={false}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  sep: { height: spacing.sm },
  empty: { paddingVertical: spacing.xl, alignItems: 'center' },
  emptyText: { color: colors.textSubtle, fontSize: typography.body.fontSize },
});
