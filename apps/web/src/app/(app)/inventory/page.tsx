import { currentLocale } from '@/lib/session';
import { translator } from '@/lib/i18n';
import { listParts, type PartRow } from '@/lib/resources';
import { formatInt, formatRupiah } from '@/lib/format';
import { PageHeader, EmptyState } from '@/components/ui';
import { Table, type Column } from '@/components/Table';

/**
 * Inventory (FG-8, REQ-INV). The parts catalog with the stock quantity and
 * moving-average cost (one fact per column, tabular numerals). Tyres have their
 * own register; this view lists the parts the warehouse manages.
 */
export default async function InventoryPage(): Promise<JSX.Element> {
  const locale = currentLocale();
  const tr = translator(locale);
  const parts = await listParts();

  const columns: ReadonlyArray<Column<PartRow>> = [
    { key: 'sku', header: tr('inventory.sku'), render: (p) => <span className="tnum">{p.sku}</span> },
    { key: 'name', header: tr('inventory.name'), render: (p) => p.partName ?? p.name ?? '—' },
    {
      key: 'qty',
      header: tr('inventory.qty'),
      numeric: true,
      render: (p) => formatInt(p.quantity ?? 0),
    },
    {
      key: 'avgCost',
      header: tr('inventory.avgCost'),
      numeric: true,
      render: (p) => (typeof p.averageCost === 'number' ? formatRupiah(p.averageCost) : '—'),
    },
  ];

  return (
    <>
      <PageHeader title={tr('inventory.title')} />
      {parts.length === 0 ? (
        <EmptyState message={tr('inventory.empty')} />
      ) : (
        <Table
          caption={tr('inventory.parts')}
          columns={columns}
          rows={parts}
          getRowKey={(p) => p.sku}
        />
      )}
    </>
  );
}
