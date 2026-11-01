import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { idValue, type WorkOrderDto } from '@bmi/shared';
import { useApp } from '../../src/app-context.js';
import { Banner, Screen } from '../../src/components/ui.js';
import { WorkOrderRow } from '../../src/components/wo-row.js';
import { ApiError } from '../../src/api/client.js';
import { colors, spacing, typography } from '../../src/theme/tokens.js';

/**
 * Driver history (REQ-MOB): the Work Orders raised for the driver's fleet,
 * newest first, each with its urgency pill. A FlatList (not a ScrollView) keeps
 * a long history smooth on older Android.
 */
export default function HistoryScreen(): React.JSX.Element {
  const { api, t } = useApp();
  const [items, setItems] = useState<WorkOrderDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api
      .listWorkOrders()
      .then((wos) => setItems([...wos].reverse()))
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : String(e)))
      .finally(() => setLoaded(true));
  }, [api]);

  const renderItem = useCallback(
    ({ item }: { item: WorkOrderDto }) => (
      <WorkOrderRow number={item.number} status={item.status} priority={item.priority} t={t} />
    ),
    [t],
  );

  return (
    <Screen title={t('history')} onBack={() => router.back()} backLabel={t('back')}>
      {error ? <Banner text={error} tone="danger" /> : null}
      {loaded && items.length === 0 && !error ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{t('noTasksToday')}</Text>
        </View>
      ) : null}
      <FlatList
        data={items}
        keyExtractor={(item) => String(idValue(item.id))}
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
