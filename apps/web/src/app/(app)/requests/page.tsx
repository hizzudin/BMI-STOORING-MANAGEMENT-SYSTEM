import Link from 'next/link';
import { idValue, WorkOrderStatus, type WorkOrderDto } from '@bmi/shared';
import { currentLocale } from '@/lib/session';
import { translator } from '@/lib/i18n';
import { listWorkOrders } from '@/lib/resources';
import { priorityPill } from '@/lib/status';
import { PageHeader, EmptyState, InfoPanel } from '@/components/ui';
import { Pill } from '@/components/Pill';
import { Table, type Column } from '@/components/Table';

/**
 * Requests list (REQ-WO-016). Field-originated drafts awaiting the Planner —
 * Draft WOs that carry a `finding_note`. Each row shows the colour-coded
 * urgency pill (text label always present, NFR-A11Y) and the originator's
 * finding note as read-only context. "Compose Work Order" opens the Create-WO
 * composer seeded from the draft so the finding note carries over unchanged.
 */
export default async function RequestsPage(): Promise<JSX.Element> {
  const locale = currentLocale();
  const tr = translator(locale);
  const all = await listWorkOrders(WorkOrderStatus.Draft);
  const requests = all.filter((w) => w.findingNote && w.findingNote.length > 0);

  const columns: ReadonlyArray<Column<WorkOrderDto>> = [
    { key: 'number', header: tr('wo.number'), render: (w) => <span className="tnum">{w.number}</span> },
    {
      key: 'priority',
      header: tr('common.priority'),
      render: (w) => <Pill spec={priorityPill(w.priority)} srPrefix={tr('common.priority')} />,
    },
    {
      key: 'findingNote',
      header: tr('wo.findingNote'),
      render: (w) => <span>{w.findingNote}</span>,
    },
    {
      key: 'actions',
      header: tr('common.actions'),
      render: (w) => (
        <Link href={`/work-orders/new?draft=${idValue(w.id)}`} className="btn btn-secondary">
          {tr('requests.compose')}
        </Link>
      ),
    },
  ];

  return (
    <>
      <PageHeader title={tr('requests.title')} />
      <InfoPanel>{tr('requests.subtitle')}</InfoPanel>
      <div style={{ marginTop: 'var(--space-md)' }}>
        {requests.length === 0 ? (
          <EmptyState message={tr('requests.empty')} />
        ) : (
          <Table
            caption={tr('requests.title')}
            columns={columns}
            rows={requests}
            getRowKey={(w) => String(idValue(w.id))}
          />
        )}
      </div>
    </>
  );
}
