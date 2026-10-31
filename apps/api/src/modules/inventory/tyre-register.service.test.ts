import 'reflect-metadata';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDummyDataGateway, type DataGateway } from '@bmi/data-gateway';
import { idValue, TyreEvent, TyreStatus } from '@bmi/shared';
import { TyreRegisterService } from './tyre-register.service.js';

/**
 * Unit coverage for the tyre register (FG-8, REQ-TYR, SM-TYRE, BR-11) against a
 * fresh dummy gateway: receive generates a TY code (NFR-15), the SM-TYRE
 * lifecycle is driven through the guard (unlisted transition refused), the
 * status write is a real gateway write, and retread/worn-out/scrap/count behave
 * per §3.6 (AC-TYR-003/004/005/006).
 */
describe('TyreRegisterService (TASK-112)', () => {
  let gateway: DataGateway;
  let tyres: TyreRegisterService;
  const WHM = 7;
  const SUP = 4;

  beforeEach(() => {
    gateway = createDummyDataGateway();
    tyres = new TyreRegisterService();
  });

  // --- receive (REQ-TYR-006, SM-TYRE (new) → In_Stock) ---------------------

  it('receive generates a fresh TY code, inserts In_Stock, and records a ReceiveNew event', async () => {
    const received = await gateway.unitOfWork((ctx) =>
      tyres.receive(ctx.repos, WHM, {
        source: 'Supplier',
        invoiceNumber: 'INV-99',
        tyres: [{ serialNumber: 'SER-1', brand: 'Bridgestone', size: '11R22.5', tyreType: 'Tubeless', treadMm: 14 }],
      }),
    );
    expect(received).toHaveLength(1);
    const tyre = received[0]!;
    // Seed uses TY-0101…TY-0110; a new receive must be TY-0111 or later, never reused.
    expect(tyre.code).toMatch(/^TY-\d{4,}$/);
    expect(tyre.code).not.toBe('TY-0110');
    expect(Number(tyre.code.slice(3))).toBeGreaterThan(110);
    expect(tyre.status).toBe(TyreStatus.InStock);

    const stored = await gateway.repos.tyres.getById(idValue(tyre.id));
    expect(stored?.status).toBe(TyreStatus.InStock);

    const history = tyres.historyOf(idValue(tyre.id));
    expect(history).toHaveLength(1);
    expect(history[0]?.event).toBe(TyreEvent.ReceiveNew);
    expect(history[0]?.toStatus).toBe(TyreStatus.InStock);
  });

  it('a Supplier receive without an invoice number is refused (REQ-TYR-006)', async () => {
    await expect(
      gateway.unitOfWork((ctx) =>
        tyres.receive(ctx.repos, WHM, {
          source: 'Supplier',
          tyres: [{ serialNumber: 'S', brand: 'B', size: '1', tyreType: 'Tube' }],
        }),
      ),
    ).rejects.toThrow();
  });

  it('an Existing receive (go-live) needs no invoice (REQ-TYR-006)', async () => {
    const received = await gateway.unitOfWork((ctx) =>
      tyres.receive(ctx.repos, WHM, {
        source: 'Existing',
        tyres: [{ serialNumber: 'S', brand: 'B', size: '1', tyreType: 'Tube' }],
      }),
    );
    expect(received[0]?.status).toBe(TyreStatus.InStock);
  });

  // --- SM-TYRE guard refuses an unlisted transition ------------------------

  it('refuses an unlisted SM-TYRE transition (scrap of an In_Stock tyre)', async () => {
    // Seed tyre TY-0101 is In_Stock; the Scrap dialog is not listed from In_Stock.
    const inStock = await gateway.repos.tyres.findOneBy('code', 'TY-0101');
    await expect(
      gateway.unitOfWork((ctx) =>
        tyres.scrap(ctx.repos, idValue(inStock!.id), WHM, { reason: 'bad' }),
      ),
    ).rejects.toThrow();
    // Status unchanged — a refused transition never silently applies.
    const after = await gateway.repos.tyres.getById(idValue(inStock!.id));
    expect(after?.status).toBe(TyreStatus.InStock);
  });

  // --- worn-out / scrap (REQ-TYR-010, SM-TYRE) -----------------------------

  it('marks a Needs_Retread tyre Worn_Out then scraps it (SM-TYRE §3.6)', async () => {
    // Drive a seed tyre to Needs_Retread first (In_Stock is not Needs_Retread),
    // by inserting a tyre and setting it Needs_Retread through the gateway.
    const t = await gateway.unitOfWork(async (ctx) => {
      const [r] = await tyres.receive(ctx.repos, WHM, {
        source: 'Existing',
        tyres: [{ serialNumber: 'S', brand: 'B', size: '1', tyreType: 'Tube' }],
      });
      // Force to Needs_Retread to exercise the worn-out path.
      const fresh = await ctx.repos.tyres.getById(idValue(r!.id));
      return ctx.repos.tyres.update({ ...fresh!, status: TyreStatus.NeedsRetread, statusId: fresh!.statusId });
    });

    const wornOut = await gateway.unitOfWork((ctx) =>
      tyres.markWornOut(ctx.repos, idValue(t.id), WHM, { reason: 'cracked' }),
    );
    expect(wornOut.status).toBe(TyreStatus.WornOut);

    const scrapped = await gateway.unitOfWork((ctx) =>
      tyres.scrap(ctx.repos, idValue(t.id), WHM, { reason: 'disposed', disposalReference: 'DISP-1' }),
    );
    expect(scrapped.status).toBe(TyreStatus.Scrapped);
    const history = tyres.historyOf(idValue(t.id));
    expect(history.map((e) => e.toStatus)).toEqual([
      TyreStatus.InStock, // ReceiveNew
      TyreStatus.WornOut,
      TyreStatus.Scrapped,
    ]);
  });

  // --- retread dispatch + return (REQ-TYR-008/009) -------------------------

  async function needsRetreadTyre(): Promise<number> {
    return gateway.unitOfWork(async (ctx) => {
      const [r] = await tyres.receive(ctx.repos, WHM, {
        source: 'Existing',
        tyres: [{ serialNumber: 'S', brand: 'B', size: '1', tyreType: 'Tube' }],
      });
      const fresh = await ctx.repos.tyres.getById(idValue(r!.id));
      const updated = await ctx.repos.tyres.update({ ...fresh!, status: TyreStatus.NeedsRetread });
      return idValue(updated.id);
    });
  }

  it('dispatch sends Needs_Retread tyres to On_Retread (REQ-TYR-008)', async () => {
    const id = await needsRetreadTyre();
    const dispatch = await gateway.unitOfWork((ctx) =>
      tyres.dispatchRetread(ctx.repos, WHM, { vendor: 'RetreadCo', tyreIds: [id] }),
    );
    expect(dispatch.status).toBe('Sent');
    const t = await gateway.repos.tyres.getById(id);
    expect(t?.status).toBe(TyreStatus.OnRetread);
  });

  it('AC-TYR-003 — a tyre received Accepted is In_Stock again', async () => {
    const id = await needsRetreadTyre();
    const dispatch = await gateway.unitOfWork((ctx) =>
      tyres.dispatchRetread(ctx.repos, WHM, { vendor: 'RetreadCo', tyreIds: [id] }),
    );
    await gateway.unitOfWork((ctx) =>
      tyres.confirmRetreadReturn(ctx.repos, dispatch.id, WHM, [
        { tyreId: id, result: 'Accepted', cost: 500000, newTreadMm: 16, invoiceNumber: 'INV-5' },
      ]),
    );
    const t = await gateway.repos.tyres.getById(id);
    expect(t?.status).toBe(TyreStatus.InStock);
  });

  it('AC-TYR-004 — a Rejected return without a reason is refused', async () => {
    const id = await needsRetreadTyre();
    const dispatch = await gateway.unitOfWork((ctx) =>
      tyres.dispatchRetread(ctx.repos, WHM, { vendor: 'RetreadCo', tyreIds: [id] }),
    );
    await expect(
      gateway.unitOfWork((ctx) =>
        tyres.confirmRetreadReturn(ctx.repos, dispatch.id, WHM, [{ tyreId: id, result: 'Rejected' }]),
      ),
    ).rejects.toThrow();
  });

  it('AC-TYR-005 — a Not-returned-yet tyre keeps the dispatch open (Partial)', async () => {
    const id1 = await needsRetreadTyre();
    const id2 = await needsRetreadTyre();
    const dispatch = await gateway.unitOfWork((ctx) =>
      tyres.dispatchRetread(ctx.repos, WHM, { vendor: 'RetreadCo', tyreIds: [id1, id2] }),
    );
    const after = await gateway.unitOfWork((ctx) =>
      tyres.confirmRetreadReturn(ctx.repos, dispatch.id, WHM, [
        { tyreId: id1, result: 'Accepted' },
        { tyreId: id2, result: 'NotReturnedYet' },
      ]),
    );
    expect(after.status).toBe('Partial');
    const t2 = await gateway.repos.tyres.getById(id2);
    expect(t2?.status).toBe(TyreStatus.OnRetread);
  });

  // --- tyre count (REQ-TYR-011/012, AC-TYR-006) ----------------------------

  it('AC-TYR-006 — an approved count with one Missing tyre sets it Lost', async () => {
    const inStock = await gateway.repos.tyres.findOneBy('code', 'TY-0101');
    const id = idValue(inStock!.id);
    const count = tyres.createCount([{ tyreId: id, result: 'Missing', reason: 'not found' }], WHM);
    tyres.submitCount(count.id, WHM);
    await gateway.unitOfWork((ctx) => tyres.approveCount(ctx.repos, count.id, SUP, false));
    const t = await gateway.repos.tyres.getById(id);
    expect(t?.status).toBe(TyreStatus.Lost);
  });

  it('a Missing count row with no reason cannot be submitted (REQ-TYR-011)', () => {
    const count = tyres.createCount([{ tyreId: 1, result: 'Missing' }], WHM);
    expect(() => tyres.submitCount(count.id, WHM)).toThrow();
  });

  it('AC-INV-004 — the counter cannot approve a tyre count unless a System Admin', async () => {
    const inStock = await gateway.repos.tyres.findOneBy('code', 'TY-0102');
    const count = tyres.createCount([{ tyreId: idValue(inStock!.id), result: 'Found' }], WHM);
    tyres.submitCount(count.id, WHM);
    await expect(
      gateway.unitOfWork((ctx) => tyres.approveCount(ctx.repos, count.id, WHM, false)),
    ).rejects.toThrow();
  });
});
