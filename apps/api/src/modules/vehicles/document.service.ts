import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DocumentStatus,
  DocumentEvent,
  smDocument,
  toId,
  type VehicleDocumentDto,
} from '@bmi/shared';
import type { DataGateway } from '@bmi/data-gateway';
import { DATA_GATEWAY } from '../../core/data-gateway/data-gateway.module.js';
import { DocumentTypeService } from './document-type.service.js';

/** A kept renewal record (PRD §9.6 `document_renewals`). */
export interface DocumentRenewal {
  readonly id: number;
  readonly vehicleDocumentId: number;
  readonly documentNumber: string;
  readonly issueDate: string;
  readonly oldExpiry: string | null;
  readonly newExpiry: string;
  readonly renewalCost: number;
  readonly renewedAt: string;
}

/** A kept correction record (PRD §9.4 `document_corrections`). */
export interface DocumentCorrection {
  readonly id: number;
  readonly vehicleDocumentId: number;
  readonly field: string;
  readonly oldValue: string | null;
  readonly newValue: string;
  readonly reason: string;
  readonly correctedBy: number | null;
  readonly correctedAt: string;
}

/** A field a correction may touch (REQ-DOC-009). */
const CORRECTABLE_FIELDS: ReadonlySet<string> = new Set([
  'document_number',
  'issue_date',
  'expiry_date',
  'issuer',
  'file_url',
]);

/**
 * Vehicle documents — first entry, correction, renewal and the SM-DOC status
 * machine (REQ-DOC-006..009, PRD §3.5).
 *
 * The current document rows live in the dummy gateway's `vehicleDocuments`
 * repository (one of its nine aggregates). The renewal and correction HISTORY
 * (PRD §9.4/§9.6 `document_renewals` / `document_corrections`) are API-layer
 * in-memory ledgers in Phase 1 (TASK-103/104/105 precedent); TASK-201 re-homes
 * them behind the real tables unchanged.
 *
 * SM-DOC is enforced through `@bmi/shared`'s `smDocument` machine — a transition
 * not listed in §3.5 is refused (PR-6). Status on first entry / renewal is
 * recomputed from the dates against "today"; the daily job (TASK-114) drives the
 * Warning/Expired steps.
 */
@Injectable()
export class DocumentService {
  private readonly renewals: DocumentRenewal[] = [];
  private readonly corrections: DocumentCorrection[] = [];
  private nextRenewalId = 1;
  private nextCorrectionId = 1;

  constructor(
    @Inject(DATA_GATEWAY) private readonly gateway: DataGateway,
    private readonly documentTypes: DocumentTypeService,
  ) {}

  /**
   * First entry of a never-entered document (REQ-DOC-008). Computes the status
   * from the dates (a past expiry saves as Expired, AC-DOC-005) through SM-DOC's
   * first-entry transition, and inserts the current document row. Refused if a
   * row already exists for the (vehicle, type) pair.
   */
  async firstEntry(input: {
    vehicleId: number;
    documentTypeId: number;
    documentNumber: string;
    issuer?: string | null;
    issueDate?: string | null;
    expiryDate: string;
    fileUrl: string;
    now?: Date;
  }): Promise<VehicleDocumentDto> {
    const type = this.documentTypes.requireType(input.documentTypeId);
    const existing = await this.findCurrent(input.vehicleId, input.documentTypeId);
    if (existing) {
      throw new ConflictException(
        'A document of this type already exists for the vehicle; use Correct entry or renewal.',
      );
    }

    // SM-DOC: (Missing) --FirstEntrySaved--> Valid, then resolve by dates to
    // Warning/Expired. `transition` refuses any unlisted move (PR-6, §3.5).
    smDocument.transition(DocumentStatus.Missing, DocumentEvent.FirstEntrySaved);
    const status = this.statusForDates(input.expiryDate, type.warningDays, input.now);

    return this.gateway.unitOfWork(async (ctx) => {
      return ctx.repos.vehicleDocuments.insert({
        vehicleId: toId<'VehicleId'>(input.vehicleId),
        documentTypeId: toId<'DocumentTypeId'>(input.documentTypeId),
        status,
        expiryDate: input.expiryDate,
      });
    });
  }

  /**
   * Correct a wrong first entry (REQ-DOC-009). Allowed ONLY before the first
   * renewal WO exists for the document; once a renewal exists it is refused
   * (AC-DOC-006). Logs each field's old/new value with a reason and recomputes
   * the status from any corrected expiry date.
   */
  async correct(input: {
    vehicleDocumentId: number;
    version: number;
    reason: string;
    fields: readonly { field: string; newValue: string }[];
    correctedBy?: number | null;
    now?: Date;
  }): Promise<VehicleDocumentDto> {
    const doc = await this.requireDocument(input.vehicleDocumentId);

    if (this.renewalsFor(doc.id as unknown as number).length > 0) {
      // AC-DOC-006: Correct entry after a renewal WO exists → refused.
      throw new ConflictException(
        'A renewal exists for this document; correct it with a change request on that WO.',
      );
    }

    for (const f of input.fields) {
      if (!CORRECTABLE_FIELDS.has(f.field)) {
        throw new BadRequestException(`Field not correctable: ${f.field}`);
      }
    }

    // Apply any expiry-date correction and recompute status; log every field.
    let nextExpiry = doc.expiryDate;
    const expiryField = input.fields.find((f) => f.field === 'expiry_date');
    if (expiryField) {
      nextExpiry = expiryField.newValue;
    }
    const type = this.documentTypes.requireType(doc.documentTypeId as unknown as number);
    const status = this.statusForDates(nextExpiry ?? doc.expiryDate, type.warningDays, input.now);

    const at = new Date().toISOString();
    for (const f of input.fields) {
      const oldValue = f.field === 'expiry_date' ? doc.expiryDate : null;
      this.corrections.push({
        id: this.nextCorrectionId,
        vehicleDocumentId: doc.id as unknown as number,
        field: f.field,
        oldValue,
        newValue: f.newValue,
        reason: input.reason,
        correctedBy: input.correctedBy ?? null,
        correctedAt: at,
      });
      this.nextCorrectionId += 1;
    }

    return this.gateway.unitOfWork(async (ctx) => {
      const current = await ctx.repos.vehicleDocuments.requireById(doc.id as unknown as number);
      if (current.version !== input.version) {
        throw new ConflictException('Document was modified concurrently; reload and retry.');
      }
      return ctx.repos.vehicleDocuments.update({
        ...current,
        status,
        expiryDate: nextExpiry ?? current.expiryDate,
      });
    });
  }

  /**
   * Renew a document (REQ-DOC-007) — the effect of a verified Document step.
   * The new expiry must be later than the old one. Keeps the earlier record as
   * history (`document_renewals`), drives SM-DOC's RenewalVerified transition
   * (Warning/Expired → Valid), and recomputes the status from the new expiry.
   */
  async renew(input: {
    vehicleDocumentId: number;
    version: number;
    documentNumber: string;
    issueDate: string;
    expiryDate: string;
    fileUrl: string;
    renewalCost: number;
    receiptUrl?: string | null;
    now?: Date;
  }): Promise<{ document: VehicleDocumentDto; renewal: DocumentRenewal }> {
    const doc = await this.requireDocument(input.vehicleDocumentId);
    const type = this.documentTypes.requireType(doc.documentTypeId as unknown as number);

    if (type.receiptRequired && !input.receiptUrl) {
      throw new BadRequestException('A renewal receipt image is required for this document type.');
    }
    const oldExpiry = doc.expiryDate;
    if (oldExpiry && Date.parse(input.expiryDate) <= Date.parse(oldExpiry)) {
      throw new BadRequestException('The new expiry must be later than the current expiry.');
    }

    // SM-DOC: Warning/Expired --RenewalVerified--> Valid. A Valid document is
    // not a renewal source in §3.5, so renewing one is refused (unlisted move).
    const current = doc.status;
    if (current !== DocumentStatus.Warning && current !== DocumentStatus.Expired) {
      smDocument.transition(current, DocumentEvent.RenewalVerified); // throws for Valid/Missing
    }
    const status = this.statusForDates(input.expiryDate, type.warningDays, input.now);

    const renewal: DocumentRenewal = {
      id: this.nextRenewalId,
      vehicleDocumentId: doc.id as unknown as number,
      documentNumber: input.documentNumber,
      issueDate: input.issueDate,
      oldExpiry,
      newExpiry: input.expiryDate,
      renewalCost: input.renewalCost,
      renewedAt: new Date().toISOString(),
    };
    this.renewals.push(renewal);
    this.nextRenewalId += 1;

    const updated = await this.gateway.unitOfWork(async (ctx) => {
      const live = await ctx.repos.vehicleDocuments.requireById(doc.id as unknown as number);
      if (live.version !== input.version) {
        throw new ConflictException('Document was modified concurrently; reload and retry.');
      }
      return ctx.repos.vehicleDocuments.update({
        ...live,
        status,
        expiryDate: input.expiryDate,
      });
    });

    return { document: updated, renewal };
  }

  /** The current documents of a vehicle (read). */
  async listForVehicle(vehicleId: number): Promise<readonly VehicleDocumentDto[]> {
    return this.gateway.repos.vehicleDocuments.findBy(
      'vehicleId',
      toId<'VehicleId'>(vehicleId),
    );
  }

  /** Renewal history of a document (read, REQ-DOC-011). */
  renewalsFor(vehicleDocumentId: number): readonly DocumentRenewal[] {
    return this.renewals.filter((r) => r.vehicleDocumentId === vehicleDocumentId);
  }

  /** Correction history of a document (read). */
  correctionsFor(vehicleDocumentId: number): readonly DocumentCorrection[] {
    return this.corrections.filter((c) => c.vehicleDocumentId === vehicleDocumentId);
  }

  /**
   * Whether the vehicle currently has a blocking document — any required type is
   * Missing (no row) or Expired (REQ-DOC-005, BR-08). Drives the Blocked fact of
   * the derived vehicle status (SM-VEH).
   */
  async hasBlockingDocument(vehicleId: number, classId: number): Promise<boolean> {
    const required = this.documentTypes.requiredForClass(classId);
    if (required.length === 0) {
      return false;
    }
    const docs = await this.listForVehicle(vehicleId);
    const byType = new Map<number, VehicleDocumentDto>();
    for (const d of docs) {
      byType.set(d.documentTypeId as unknown as number, d);
    }
    for (const type of required) {
      const doc = byType.get(type.id);
      if (!doc) {
        return true; // Missing (required type, no row).
      }
      if (doc.status === DocumentStatus.Expired || doc.status === DocumentStatus.Missing) {
        return true;
      }
    }
    return false;
  }

  /** Test-only reset of the in-memory history ledgers. */
  resetForTests(): void {
    this.renewals.length = 0;
    this.corrections.length = 0;
    this.nextRenewalId = 1;
    this.nextCorrectionId = 1;
  }

  private async requireDocument(id: number): Promise<VehicleDocumentDto> {
    const doc = await this.gateway.repos.vehicleDocuments.getById(id);
    if (!doc) {
      throw new NotFoundException(`Unknown vehicle document: ${id}`);
    }
    return doc;
  }

  private async findCurrent(
    vehicleId: number,
    documentTypeId: number,
  ): Promise<VehicleDocumentDto | null> {
    const docs = await this.listForVehicle(vehicleId);
    return docs.find((d) => (d.documentTypeId as unknown as number) === documentTypeId) ?? null;
  }

  /**
   * Compute the SM-DOC status from the expiry date against "today" (REQ-DOC-003):
   * Expired on/after the expiry date, Warning within `warningDays` of it, else
   * Valid. "Today" is compared on WIB-day granularity using the date strings.
   */
  private statusForDates(
    expiryDate: string | null,
    warningDays: number,
    now: Date = new Date(),
  ): DocumentStatus {
    if (!expiryDate) {
      return DocumentStatus.Valid;
    }
    const expiry = Date.parse(expiryDate);
    const today = Date.parse(this.isoDate(now));
    if (Number.isNaN(expiry)) {
      return DocumentStatus.Valid;
    }
    if (today >= expiry) {
      return DocumentStatus.Expired;
    }
    const warningStart = expiry - warningDays * 24 * 60 * 60 * 1000;
    if (today >= warningStart) {
      return DocumentStatus.Warning;
    }
    return DocumentStatus.Valid;
  }

  /** The `YYYY-MM-DD` date part of an instant (UTC day; good enough for Phase 1). */
  private isoDate(d: Date): string {
    return d.toISOString().slice(0, 10);
  }
}
