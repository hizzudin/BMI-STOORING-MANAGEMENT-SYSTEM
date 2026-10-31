import { Injectable, NotFoundException } from '@nestjs/common';

/**
 * A service-catalog entry (`service_catalog`, PRD §9.7). The Internal team takes
 * its service and price **only** from here, read-only (REQ-MEC-002); the price
 * is snapshotted onto a WO line at submit so a later catalog change never moves a
 * saved line (BR-07, AC-MEC-003).
 */
export interface CatalogService {
  readonly serviceCode: string;
  readonly serviceName: string;
  /** Standard price in whole rupiah (`NUMERIC(14,2)`), half-up elsewhere. */
  standardPrice: number;
  readonly category: string;
  active: boolean;
}

/**
 * **Service catalog** (REQ-MEC-005) — a Phase-1 API-layer in-memory master,
 * following the TASK-103..109 precedent (the dummy gateway models the nine
 * business aggregates, not `service_catalog`). TASK-201/202 re-home it behind
 * the PRD §9.7 table unchanged.
 *
 * The System Admin maintains the catalog (code, name, standard price, active,
 * optional part item type — REQ-MEC-005). Phase-1 seeds the services the
 * acceptance criteria exercise (a brake-system diagnosis service for Part Check,
 * REQ-CHK-007 / AC-CHK-004, plus a couple of repair services for Mechanic
 * Action). A change to a price here must NOT alter a line already snapshotted on
 * a WO (BR-07): the snapshot happens in the step services, not here.
 */
@Injectable()
export class ServiceCatalogService {
  private readonly services = new Map<string, CatalogService>();

  constructor() {
    this.seed();
  }

  /** The active catalog services the Internal team may pick (REQ-MEC-002). */
  listActive(): readonly CatalogService[] {
    return [...this.services.values()].filter((s) => s.active).map((s) => ({ ...s }));
  }

  /** A catalog service by code, or `undefined`. */
  get(serviceCode: string): CatalogService | undefined {
    const svc = this.services.get(serviceCode.trim().toUpperCase());
    return svc ? { ...svc } : undefined;
  }

  /**
   * A catalog service by code, throwing a 404 if unknown or inactive — the
   * Internal team may only pick an active catalog service (REQ-MEC-002).
   */
  require(serviceCode: string): CatalogService {
    const svc = this.get(serviceCode);
    if (!svc || !svc.active) {
      throw new NotFoundException(`Unknown or inactive service: ${serviceCode} (REQ-MEC-002).`);
    }
    return svc;
  }

  /** Upsert a catalog service (System Admin maintenance, REQ-MEC-005). */
  upsert(input: {
    serviceCode: string;
    serviceName: string;
    standardPrice: number;
    category?: string;
    active?: boolean;
  }): CatalogService {
    const code = input.serviceCode.trim().toUpperCase();
    const svc: CatalogService = {
      serviceCode: code,
      serviceName: input.serviceName.trim(),
      standardPrice: input.standardPrice,
      category: input.category ?? 'Repair',
      active: input.active ?? true,
    };
    this.services.set(code, svc);
    return { ...svc };
  }

  /** Test-only reset to the seeded state. */
  resetForTests(): void {
    this.services.clear();
    this.seed();
  }

  private seed(): void {
    this.upsert({
      serviceCode: 'SVC-095',
      serviceName: 'Brake system check',
      standardPrice: 175000,
      category: 'Diagnosis',
    });
    this.upsert({
      serviceCode: 'SVC-010',
      serviceName: 'Brake pad replacement labour',
      standardPrice: 250000,
      category: 'Repair',
    });
    this.upsert({
      serviceCode: 'SVC-020',
      serviceName: 'Air brake hose repair labour',
      standardPrice: 120000,
      category: 'Repair',
    });
  }
}
