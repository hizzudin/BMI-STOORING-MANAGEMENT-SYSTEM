import { currentLocale } from '@/lib/session';
import { translator } from '@/lib/i18n';
import { getApprovals, type ApprovalInboxItem } from '@/lib/resources';
import { priorityPill, humanize } from '@/lib/status';
import { PageHeader, EmptyState, InfoPanel } from '@/components/ui';
import { Pill } from '@/components/Pill';
import { Table, type Column } from '@/components/Table';
import type { WorkOrderPriority } from '@bmi/shared';

/**
 * Approvals inbox (FG-10, REQ-APR). The unified inbox the viewer may decide,
 * ordered Urgent/High first by the API (REQ-WO-015). Each item carries its
 * urgency pill with text label (NFR-A11Y) and its stage; the badge count is
 * the inbox length. Decisions route to the owning service via the API.
 */
export default async function ApprovalsPage(): Promise<JSX.Element> {
  const locale = currentLocale();
  const tr = translator(locale);
  const { items, count } = await getApprovals();

  const columns: ReadonlyArray<Column<ApprovalInboxItem>> = [
    { key: 'ref', header: tr('wo.number'), render: (it) => <span className="tnum">{it.ref}</span> },
    { key: 'kind', header: tr('approvals.stage'), render: (it) => humanize(String(it.stage ?? it.kind)) },
    { key: 'title', header: tr('wo.description'), render: (it) => String(it.title ?? '—') },
    {
      key: 'priority',
      header: tr('common.priority'),
      render: (it) =>
        it.priority ? (
          <Pill spec={priorityPill(it.priority as WorkOrderPriority)} srPrefix={tr('common.priority')} />
        ) : (
          tr('common.none')
        ),
    },
    {
      key: 'mine',
      header: tr('approvals.mine'),
      render: (it) => (it.isMine ? tr('approvals.mine') : tr('common.none')),
    },
  ];

  return (
    <>
      <PageHeader title={tr('approvals.title')} />
      <InfoPanel>
        <strong className="tnum">{count}</strong> {tr('approvals.count')}
      </InfoPanel>
      <div style={{ marginTop: 'var(--space-md)' }}>
        {items.length === 0 ? (
          <EmptyState message={tr('approvals.empty')} />
        ) : (
          <Table
            caption={tr('approvals.title')}
            columns={columns}
            rows={items}
            getRowKey={(it, i) => it.ref ?? String(i)}
          />
        )}
      </div>
    </>
  );
}
