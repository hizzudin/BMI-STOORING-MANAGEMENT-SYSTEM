/**
 * Module-per-functional-group registry (design.md "File Structure",
 * requirements.md FG-1..FG-18). Each functional group is its own NestJS module,
 * wired into the root `AppModule`. At scaffold stage (TASK-103) they are empty
 * shells; later tasks fill in their controllers/services/DTOs. Keeping them
 * listed here gives the root module one import and makes the FG coverage obvious.
 */
import { WorkOrdersModule } from './work-orders/work-orders.module.js';
import { AssignmentsModule } from './assignments/assignments.module.js';
import { RegistryModule } from './registry/registry.module.js';
import { StockModule } from './stock/stock.module.js';
import { MechanicModule } from './mechanic/mechanic.module.js';
import { MobilisasiModule } from './mobilisasi/mobilisasi.module.js';
import { PlacementModule } from './placement/placement.module.js';
import { VehiclesModule } from './vehicles/vehicles.module.js';
import { InventoryModule } from './inventory/inventory.module.js';
import { ChangeRequestsModule } from './change-requests/change-requests.module.js';
import { ApprovalsModule } from './approvals/approvals.module.js';
import { BillingModule } from './billing/billing.module.js';
import { MaintenanceModule } from './maintenance/maintenance.module.js';
import { IamModule } from './iam/iam.module.js';
import { SetupModule } from './setup/setup.module.js';
import { MobileModule } from './mobile/mobile.module.js';
import { FilesModule } from './files/files.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { ReportsModule } from './reports/reports.module.js';

/** Every functional-group module, in FG-1..FG-18 order (FG-5a after FG-5). */
export const FUNCTIONAL_GROUP_MODULES = [
  WorkOrdersModule, // FG-1
  AssignmentsModule, // FG-2
  RegistryModule, // FG-3
  StockModule, // FG-4
  MechanicModule, // FG-5
  MobilisasiModule, // FG-5a
  PlacementModule, // FG-6
  VehiclesModule, // FG-7
  InventoryModule, // FG-8
  ChangeRequestsModule, // FG-9
  ApprovalsModule, // FG-10
  BillingModule, // FG-11
  MaintenanceModule, // FG-12
  IamModule, // FG-13
  SetupModule, // FG-14
  MobileModule, // FG-15
  FilesModule, // FG-16
  SettingsModule, // FG-17
  ReportsModule, // FG-18
] as const;
