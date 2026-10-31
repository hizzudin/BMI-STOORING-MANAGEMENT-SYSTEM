import { Injectable, NotFoundException } from '@nestjs/common';

/**
 * A stooring-rates master row (`stooring_rates`, PRD §9). The System Admin
 * maintains the regions and their mobilisation fee (code, region name, price,
 * active — REQ-MEC-010). The Mobilisasi step takes its region's price **only**
 * from here and snapshots it at submit so a later rate change never moves a
 * fee already charged (BR-07, REQ-MBL-006). The workshop region is Rp 0.
 */
export interface StooringRate {
  /** Short code, e.g. `WORKSHOP`, `BEKASI` (unique, uppercased). */
  readonly code: string;
  /** Region name shown on the step / WO document, e.g. `Bekasi`. */
  readonly regionName: string;
  /** Fee in whole rupiah (`NUMERIC(14,2)`); 0 for the workshop. */
  price: number;
  active: boolean;
}

/**
 * **Stooring rates** (REQ-MEC-010) — a Phase-1 API-layer in-memory master,
 * following the TASK-103..110 precedent (the dummy gateway models the nine
 * business aggregates, not `stooring_rates`). TASK-201/202 re-home it behind the
 * PRD §9 `stooring_rates` table unchanged.
 *
 * The Mobilisasi step reads a region's price here and **snapshots** it onto the
 * step at submit (BR-07): a price change here must NOT alter a fee already
 * charged — the snapshot happens in {@link MobilisasiStepService}, not here, so
 * a later `upsert` applies only to steps submitted afterwards (REQ-MEC-010).
 *
 * Phase-1 seeds the regions the acceptance criteria exercise: the **workshop**
 * (fee Rp 0, AC-MBL-004) and **Bekasi** (Rp 250.000, AC-MBL-004), plus a couple
 * of other named regions.
 */
@Injectable()
export class StooringRatesService {
  private readonly rates = new Map<string, StooringRate>();

  constructor() {
    this.seed();
  }

  /** The active stooring-rate regions (REQ-MEC-010). */
  listActive(): readonly StooringRate[] {
    return [...this.rates.values()].filter((r) => r.active).map((r) => ({ ...r }));
  }

  /** A rate by code, or `undefined`. */
  get(code: string): StooringRate | undefined {
    const rate = this.rates.get(code.trim().toUpperCase());
    return rate ? { ...rate } : undefined;
  }

  /**
   * A rate by code, throwing a 404 if unknown or inactive — a Mobilisasi step
   * may only charge an active region's rate (REQ-MBL-006, REQ-MEC-010).
   */
  require(code: string): StooringRate {
    const rate = this.get(code);
    if (!rate || !rate.active) {
      throw new NotFoundException(`Unknown or inactive stooring region: ${code} (REQ-MEC-010).`);
    }
    return rate;
  }

  /** Upsert a stooring-rate region (System Admin maintenance, REQ-MEC-010). */
  upsert(input: {
    code: string;
    regionName: string;
    price: number;
    active?: boolean;
  }): StooringRate {
    const code = input.code.trim().toUpperCase();
    const rate: StooringRate = {
      code,
      regionName: input.regionName.trim(),
      price: input.price,
      active: input.active ?? true,
    };
    this.rates.set(code, rate);
    return { ...rate };
  }

  /** Test-only reset to the seeded state. */
  resetForTests(): void {
    this.rates.clear();
    this.seed();
  }

  private seed(): void {
    // The workshop region always costs Rp 0 (REQ-MBL-006).
    this.upsert({ code: 'WORKSHOP', regionName: 'Workshop Cikarang', price: 0 });
    this.upsert({ code: 'BEKASI', regionName: 'Bekasi', price: 250000 });
    this.upsert({ code: 'KARAWANG', regionName: 'Karawang', price: 180000 });
    this.upsert({ code: 'JAKARTA', regionName: 'Jakarta', price: 320000 });
  }
}
