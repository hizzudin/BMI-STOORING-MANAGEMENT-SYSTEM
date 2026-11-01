import { idValue, type VehicleDto } from '@bmi/shared';
import { currentLocale } from '@/lib/session';
import { translator } from '@/lib/i18n';
import { listVehicles } from '@/lib/resources';
import { vehicleStatusPill } from '@/lib/status';
import { formatKm } from '@/lib/format';
import { PageHeader, EmptyState } from '@/components/ui';
import { Pill } from '@/components/Pill';
import { Table, type Column } from '@/components/Table';

/**
 * Vehicles (FG-7, REQ-VEH). The fleet with its derived status (incl. OFF,
 * DEC-92). Status carries its word via the pill (NFR-A11Y); the odometer uses
 * Indonesian grouping + the km unit (48.210 km).
 */
export default async function VehiclesPage(): Promise<JSX.Element> {
  const locale = currentLocale();
  const tr = translator(locale);
  const vehicles = await listVehicles();

  const columns: ReadonlyArray<Column<VehicleDto>> = [
    { key: 'plate', header: tr('vehicles.plate'), render: (v) => v.plate },
    {
      key: 'odometer',
      header: tr('vehicles.odometer'),
      numeric: true,
      render: (v) => formatKm(v.odometerKm),
    },
    {
      key: 'status',
      header: tr('common.status'),
      render: (v) => <Pill spec={vehicleStatusPill(v.status)} srPrefix={tr('common.status')} />,
    },
  ];

  return (
    <>
      <PageHeader title={tr('vehicles.title')} />
      {vehicles.length === 0 ? (
        <EmptyState message={tr('vehicles.empty')} />
      ) : (
        <Table
          caption={tr('vehicles.title')}
          columns={columns}
          rows={vehicles}
          getRowKey={(v) => String(idValue(v.id))}
        />
      )}
    </>
  );
}
