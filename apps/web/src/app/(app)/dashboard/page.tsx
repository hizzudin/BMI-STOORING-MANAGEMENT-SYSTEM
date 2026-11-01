import { currentLocale } from '@/lib/session';
import { translator } from '@/lib/i18n';
import { getDashboard } from '@/lib/resources';
import { humanizeRole } from '@/lib/roles';
import { PageHeader, Metric, EmptyState, InfoPanel } from '@/components/ui';

/** Role dashboard (FG-12, REQ-DSH). Renders the API-computed count cards. */
export default async function DashboardPage(): Promise<JSX.Element> {
  const locale = currentLocale();
  const tr = translator(locale);
  const data = await getDashboard();

  return (
    <>
      <PageHeader title={tr('dashboard.title')} />
      <InfoPanel>
        {tr('dashboard.welcome')} · {humanizeRole(data.role)} · {tr('dashboard.notifications')}:{' '}
        <strong className="tnum">{data.unreadNotifications}</strong>
      </InfoPanel>

      <div className="grid-cards" style={{ marginTop: 'var(--space-md)' }}>
        {data.cards.length === 0 ? (
          <EmptyState message={tr('dashboard.noCards')} />
        ) : (
          data.cards.map((card) => <Metric key={card.key} value={card.count} label={card.label} />)
        )}
      </div>
    </>
  );
}
