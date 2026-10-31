import { describe, expect, it, beforeEach } from 'vitest';
import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  DocumentStatus,
  DocumentEvent,
  smDocument,
  InvalidTransitionError,
  toId,
  idValue,
} from '@bmi/shared';
import { createDummyDataGateway, type DataGateway } from '@bmi/data-gateway';
import { OdometerService } from './odometer.service.js';
import { DocumentService } from './document.service.js';
import { DocumentTypeService } from './document-type.service.js';

/**
 * Odometer (REQ-VEH-005..007, BR-09) and vehicle-document (REQ-DOC-006..009,
 * SM-DOC §3.5) coverage: the jump warning surfaces (never silently corrected),
 * a decreasing reading is refused (AC-VEH-001), a void recomputes the odometer
 * (AC-VEH-002), first entry resolves status by its dates (AC-DOC-004/005), a
 * correct-entry after a renewal is refused (AC-DOC-006), and SM-DOC refuses a
 * transition not in its §3.5 table.
 */
describe('OdometerService (TASK-106) — manual reading, jump warning, void', () => {
  let odometer: OdometerService;
  const vehicleId = 1;

  beforeEach(() => {
    odometer = new OdometerService();
  });

  it('AC-VEH-001 — a reading below the last non-voided reading is refused', () => {
    odometer.record({ vehicleId, reading: 48210, readingAt: '2026-10-26T00:00:00.000Z' });
    expect(() =>
      odometer.record({ vehicleId, reading: 48000, readingAt: '2026-10-27T00:00:00.000Z' }),
    ).toThrow(BadRequestException);
  });

  it('refuses a non-positive-whole reading (REQ-VEH-005)', () => {
    expect(() =>
      odometer.record({ vehicleId, reading: 0, readingAt: '2026-10-26T00:00:00.000Z' }),
    ).toThrow(BadRequestException);
    expect(() =>
      odometer.record({ vehicleId, reading: 10.5, readingAt: '2026-10-26T00:00:00.000Z' }),
    ).toThrow(BadRequestException);
  });

  it('surfaces a jump warning and saves the reading with a note — never silently corrected', () => {
    odometer.record({ vehicleId, reading: 48210, readingAt: '2026-10-26T00:00:00.000Z' });
    // +3000 km in one day → > 1.500 km/day threshold.
    const result = odometer.record({
      vehicleId,
      reading: 51210,
      readingAt: '2026-10-27T00:00:00.000Z',
    });
    expect(result.log.jumpWarning).toBe(true);
    expect(result.warning).toBeTruthy();
    // The reading is saved exactly as entered — NOT clamped/corrected.
    expect(result.log.reading).toBe(51210);
    expect(result.log.note).toBeTruthy();
    expect(result.currentOdometer).toBe(51210);
  });

  it('does not warn for a normal daily increase', () => {
    odometer.record({ vehicleId, reading: 48210, readingAt: '2026-10-26T00:00:00.000Z' });
    const result = odometer.record({
      vehicleId,
      reading: 48710,
      readingAt: '2026-10-27T00:00:00.000Z',
    });
    expect(result.log.jumpWarning).toBe(false);
    expect(result.warning).toBeNull();
  });

  it('AC-VEH-002 — voiding a reading returns the odometer to the last valid reading', () => {
    odometer.record({ vehicleId, reading: 48210, readingAt: '2026-10-26T00:00:00.000Z' });
    const high = odometer.record({
      vehicleId,
      reading: 418200,
      readingAt: '2026-10-27T00:00:00.000Z',
    });
    expect(odometer.currentOdometer(vehicleId)).toBe(418200);

    const voided = odometer.void({ logId: high.log.id, reason: 'Entry error', voidedBy: 6 });
    expect(voided.log.voidedAt).not.toBeNull();
    expect(voided.log.voidReason).toBe('Entry error');
    // Odometer recomputed from the last valid reading (48.210 km).
    expect(voided.currentOdometer).toBe(48210);
    expect(odometer.currentOdometer(vehicleId)).toBe(48210);
  });

  it('refuses voiding an already-voided reading', () => {
    const r = odometer.record({ vehicleId, reading: 100, readingAt: '2026-10-26T00:00:00.000Z' });
    odometer.void({ logId: r.log.id, reason: 'x', voidedBy: 6 });
    expect(() => odometer.void({ logId: r.log.id, reason: 'y', voidedBy: 6 })).toThrow(
      BadRequestException,
    );
  });
});

describe('DocumentService (TASK-106) — first entry, correction, renewal, SM-DOC', () => {
  let gateway: DataGateway;
  let documentTypes: DocumentTypeService;
  let documents: DocumentService;
  const vehicleId = 1;
  // Seeded document types: 1 STNK_Annual, 2 KIR, 3 Insurance (all required for class 1).
  const insuranceTypeId = 3;
  const kirTypeId = 2;
  const now = new Date('2026-10-26T00:00:00.000Z');

  beforeEach(() => {
    gateway = createDummyDataGateway();
    documentTypes = new DocumentTypeService();
    documents = new DocumentService(gateway, documentTypes);
  });

  it('AC-DOC-005 — a first entry with a past expiry saves as Expired', async () => {
    const doc = await documents.firstEntry({
      vehicleId,
      documentTypeId: insuranceTypeId,
      documentNumber: 'INS-1',
      expiryDate: '2026-01-01', // before "now"
      fileUrl: 'key/ins.jpg',
      now,
    });
    expect(doc.status).toBe(DocumentStatus.Expired);
  });

  it('a first entry well before expiry saves as Valid', async () => {
    const doc = await documents.firstEntry({
      vehicleId,
      documentTypeId: insuranceTypeId,
      documentNumber: 'INS-2',
      expiryDate: '2027-12-31',
      fileUrl: 'key/ins.jpg',
      now,
    });
    expect(doc.status).toBe(DocumentStatus.Valid);
  });

  it('a first entry within the warning window saves as Warning (AC-DOC-001 shape)', async () => {
    // KIR warning_days = 30; an expiry 10 days out is within the window.
    const doc = await documents.firstEntry({
      vehicleId,
      documentTypeId: kirTypeId,
      documentNumber: 'KIR-1',
      expiryDate: '2026-11-05', // 10 days after "now"
      fileUrl: 'key/kir.jpg',
      now,
    });
    expect(doc.status).toBe(DocumentStatus.Warning);
  });

  it('AC-DOC-004 — hasBlockingDocument is true while a required document is Missing', async () => {
    // No documents entered yet → every required type is Missing → Blocked.
    expect(await documents.hasBlockingDocument(vehicleId, 1)).toBe(true);
  });

  it('AC-DOC-003 — a verified renewal lifts the block (Expired → Valid)', async () => {
    const doc = await documents.firstEntry({
      vehicleId,
      documentTypeId: insuranceTypeId,
      documentNumber: 'INS-3',
      expiryDate: '2026-01-01',
      fileUrl: 'key/ins.jpg',
      now,
    });
    expect(doc.status).toBe(DocumentStatus.Expired);

    const { document } = await documents.renew({
      vehicleDocumentId: idValue(doc.id),
      version: doc.version,
      documentNumber: 'INS-3B',
      issueDate: '2026-10-26',
      expiryDate: '2027-10-26',
      fileUrl: 'key/ins-new.jpg',
      renewalCost: 1500000,
      now,
    });
    expect(document.status).toBe(DocumentStatus.Valid);
  });

  it('AC-DOC-006 — Correct entry is refused once a renewal exists', async () => {
    const doc = await documents.firstEntry({
      vehicleId,
      documentTypeId: insuranceTypeId,
      documentNumber: 'INS-4',
      expiryDate: '2026-01-01',
      fileUrl: 'key/ins.jpg',
      now,
    });
    // A correction before renewal is allowed.
    const corrected = await documents.correct({
      vehicleDocumentId: idValue(doc.id),
      version: doc.version,
      reason: 'Typo in number',
      fields: [{ field: 'document_number', newValue: 'INS-4-FIX' }],
      now,
    });
    expect(documents.correctionsFor(idValue(doc.id))).toHaveLength(1);

    // Renew it, then a further correction must be refused.
    const renewed = await documents.renew({
      vehicleDocumentId: idValue(corrected.id),
      version: corrected.version,
      documentNumber: 'INS-4R',
      issueDate: '2026-10-26',
      expiryDate: '2027-10-26',
      fileUrl: 'key/ins-new.jpg',
      renewalCost: 1000000,
      now,
    });
    await expect(
      documents.correct({
        vehicleDocumentId: idValue(renewed.document.id),
        version: renewed.document.version,
        reason: 'late fix',
        fields: [{ field: 'document_number', newValue: 'X' }],
        now,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('renewal expiry must be later than the current expiry', async () => {
    const doc = await documents.firstEntry({
      vehicleId,
      documentTypeId: insuranceTypeId,
      documentNumber: 'INS-5',
      expiryDate: '2026-01-01',
      fileUrl: 'key/ins.jpg',
      now,
    });
    await expect(
      documents.renew({
        vehicleDocumentId: idValue(doc.id),
        version: doc.version,
        documentNumber: 'INS-5R',
        issueDate: '2025-12-01',
        expiryDate: '2025-12-31', // not later than the old 2026-01-01
        fileUrl: 'key/x.jpg',
        renewalCost: 0,
        now,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // --- SM-DOC: a transition not in §3.5 is refused -------------------------

  it('SM-DOC refuses a transition not in the §3.5 table', () => {
    // Valid --RenewalVerified--> is not tabled (only Warning/Expired renew).
    expect(() =>
      smDocument.transition(DocumentStatus.Valid, DocumentEvent.RenewalVerified),
    ).toThrow(InvalidTransitionError);
    // Expired --EnterWarningWindow--> is not tabled either.
    expect(() =>
      smDocument.transition(DocumentStatus.Expired, DocumentEvent.EnterWarningWindow),
    ).toThrow(InvalidTransitionError);
    // Missing --ReachExpiry--> is not tabled.
    expect(() =>
      smDocument.transition(DocumentStatus.Missing, DocumentEvent.ReachExpiry),
    ).toThrow(InvalidTransitionError);
  });

  it('keeps a reference to toId for parity with the seed id shape', () => {
    expect(idValue(toId<'VehicleId'>(1))).toBe(1);
  });
});
