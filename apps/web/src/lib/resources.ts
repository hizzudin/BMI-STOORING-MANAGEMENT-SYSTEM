import 'server-only';
import type {
  WorkOrderDto,
  AssignmentDto,
  VehicleDto,
  ScheduleCardDto,
} from '@bmi/shared';
import { apiFetch } from './api';

/**
 * Typed read/write wrappers over the API resources the core desktop flows need.
 * Request/response shapes reuse `@bmi/shared` DTOs (steering: reuse shared DTOs
 * for request/response shapes). Each function maps to one documented endpoint.
 */

// --- Work Orders (FG-1) ----------------------------------------------------

export async function listWorkOrders(status?: string): Promise<readonly WorkOrderDto[]> {
  const q = status ? `?status=${encodeURIComponent(status)}` : '';
  const data = await apiFetch<{ workOrders: readonly WorkOrderDto[] }>(`/work-orders${q}`);
  return data.workOrders;
}

export interface WorkOrderDetail {
  readonly workOrder: WorkOrderDto;
  readonly steps: readonly AssignmentDto[];
}

export async function getWorkOrder(id: number): Promise<WorkOrderDetail> {
  return apiFetch<WorkOrderDetail>(`/work-orders/${id}`);
}

export interface CreateWorkOrderInput {
  readonly vehicleId: number;
  readonly title: string;
  readonly category: string;
  readonly description: string;
  readonly priority?: string;
  readonly requiresDowntime?: boolean;
  readonly findingNote?: string;
  readonly source?: string;
}

export async function createWorkOrder(input: CreateWorkOrderInput): Promise<WorkOrderDto> {
  const data = await apiFetch<{ workOrder: WorkOrderDto }>('/work-orders', {
    method: 'POST',
    body: input,
  });
  return data.workOrder;
}

// --- Vehicles (FG-7) -------------------------------------------------------

export async function listVehicles(): Promise<readonly VehicleDto[]> {
  const data = await apiFetch<{ vehicles: readonly VehicleDto[] }>('/vehicles');
  return data.vehicles;
}

// --- Schedule (FG-12) ------------------------------------------------------

export async function listSchedule(): Promise<readonly ScheduleCardDto[]> {
  const data = await apiFetch<{ cards: readonly ScheduleCardDto[]; log: unknown }>(
    '/maintenance/schedule',
  );
  return data.cards;
}

// --- Dashboard (FG-12) -----------------------------------------------------

export interface DashboardCard {
  readonly key: string;
  readonly label: string;
  readonly count: number;
}
export interface DashboardData {
  readonly role: string;
  readonly cards: readonly DashboardCard[];
  readonly unreadNotifications: number;
}

export async function getDashboard(): Promise<DashboardData> {
  return apiFetch<DashboardData>('/maintenance/dashboard');
}

// --- Approvals (FG-10) -----------------------------------------------------

export interface ApprovalInboxItem {
  readonly ref: string;
  readonly kind: string;
  readonly stage?: string;
  readonly title?: string;
  readonly priority?: string;
  readonly isMine?: boolean;
  readonly [key: string]: unknown;
}

export async function getApprovals(
  tab?: string,
): Promise<{ items: readonly ApprovalInboxItem[]; count: number }> {
  const q = tab ? `?tab=${encodeURIComponent(tab)}` : '';
  return apiFetch<{ items: readonly ApprovalInboxItem[]; count: number }>(`/approvals${q}`);
}

// --- Inventory (FG-8) ------------------------------------------------------

export interface PartRow {
  readonly sku: string;
  readonly partName?: string;
  readonly name?: string;
  readonly unit?: string;
  readonly quantity?: number;
  readonly averageCost?: number;
  readonly [key: string]: unknown;
}

export async function listParts(): Promise<readonly PartRow[]> {
  const data = await apiFetch<{ parts: readonly PartRow[] }>('/inventory/parts');
  return data.parts ?? [];
}

export interface TyreRow {
  readonly id: number;
  readonly code: string;
  readonly status: string;
  readonly brand?: string;
  readonly size?: string;
  readonly [key: string]: unknown;
}
