import Link from 'next/link';
import { idValue, WORK_ORDER_PRIORITY_ORDER, type WorkOrderDto } from '@bmi/shared';
import { currentLocale } from '@/lib/session';
import { translator } from '@/lib/i18n';
import { listWorkOrders } from '@/lib/resources';
import { priorityPill, workOrderStatusPill } from '@/lib/status';
import { PageHeader, EmptyState } from '@/components/ui';
import { Pill } from '@/components/Pill';
import { Table, type Column } from '@/components/Table';

/**
 * Work Order list (FG-1, REQ-WO-011/015). Urgency-ordered (Urgent → Low); each
 * row carries the colour-coded urgency pill that ALWAYS shows its text label
 * (REQ-WO-015, NFR-A11Y) and the status pill (status word, never colour alone).
 */
export default async function WorkOrdersPage(): Promise<JSX.Element> {
  const locale = currentLocale();
  const tr = translator(locale);
  const workOrders = await listWorkOrders();

  const order = new Map(WORK_ORDER_PRIORITY_ORDER.map((p, i) => [p, i] as const));
  const sorted = [...workOrders].sort(
    (a, b) => (order.get(a.priority) ?? 99) - (order.get(b.priority) ?? 99),
  );

  const columns: ReadonlyArray<Column<WorkOrderDto>> = [
    {
      key: 'number',
      header: tr('wo.number'),
      render: (w) => (
        <Link href={`/work-orders/${idValue(w.id)}`} className="tnum">
          {w.number}
        </Link>
      ),
    },
    { key: 'description', header: tr('wo.description'), render: (w) => w.description },
    { key: 'category', header: tr('wo.category'), render: (w) => w.category },
    {
      key: 'priority',
      header: tr('common.priority'),
      render: (w) => <Pill spec={priorityPill(w.priority)} srPrefix={tr('common.priority')} />,
    },
    {
      key: 'status',
      header: tr('common.status'),
      render: (w) => <Pill spec={workOrderStatusPill(w.status)} srPrefix={tr('common.status')} />,
    },
  ];

  return (
    <>
      <PageHeader
        title={tr('wo.title')}
        action={
          <Link href="/work-orders/new" className="btn btn-primary">
            {tr('wo.create')}
          </Link>
        }
      />
      {sorted.length === 0 ? (
        <EmptyState message={tr('wo.list.empty')} />
      ) : (
        <Table
          caption={tr('wo.title')}
          columns={columns}
          rows={sorted}
          getRowKey={(w) => String(idValue(w.id))}
        />
      )}
    </>
  );
}
