import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

/** A persisted document type (PRD §9.4 `document_types`). */
export interface DocumentType {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  /** Prefills the new expiry on renewal (REQ-DOC-007); null when open-ended. */
  readonly usualValidityMonths: number | null;
  /** Warning days before expiry; default 30, the only place it is set (REQ-DOC-002). */
  readonly warningDays: number;
  readonly receiptRequired: boolean;
  /** The vehicle-class ids that must carry this type (REQ-DOC-001). */
  readonly requiredForClassIds: readonly number[];
  readonly isActive: boolean;
}

/**
 * Document types master data (REQ-DOC-001/002).
 *
 * Which types a vehicle requires comes from its class (`requiredForClassIds`).
 * `warningDays` defaults to 30 and is the single place it is set (REQ-DOC-002).
 *
 * Phase 1: the dummy gateway models no `document_types` table, so this is an
 * API-layer in-memory registry (TASK-103/104/105 precedent); TASK-201 re-homes
 * it behind PRD §9.4 unchanged. Seeded with STNK annual, KIR and Insurance, all
 * required for the seeded `Tractor_Head` class (id 1).
 */
@Injectable()
export class DocumentTypeService {
  private readonly types = new Map<number, DocumentType>();
  private nextId = 1;

  constructor() {
    this.seed();
  }

  /** Create or maintain a document type (REQ-DOC-002). */
  create(input: {
    code: string;
    name: string;
    usualValidityMonths?: number;
    warningDays?: number;
    receiptRequired?: boolean;
    requiredForClassIds: readonly number[];
  }): DocumentType {
    const code = input.code.trim();
    if (code.length === 0) {
      throw new BadRequestException('Document type code is required.');
    }
    for (const existing of this.types.values()) {
      if (existing.code.toUpperCase() === code.toUpperCase()) {
        throw new BadRequestException(`Document type code already exists: ${code}`);
      }
    }
    const type: DocumentType = {
      id: this.nextId,
      code,
      name: input.name.trim(),
      usualValidityMonths: input.usualValidityMonths ?? null,
      warningDays: input.warningDays ?? 30,
      receiptRequired: input.receiptRequired ?? true,
      requiredForClassIds: [...input.requiredForClassIds],
      isActive: true,
    };
    this.types.set(type.id, type);
    this.nextId += 1;
    return type;
  }

  /** A known type, throwing if absent. */
  requireType(id: number): DocumentType {
    const found = this.types.get(id);
    if (!found) {
      throw new NotFoundException(`Unknown document type: ${id}`);
    }
    return found;
  }

  /** The document types a given vehicle class is required to carry (REQ-DOC-001). */
  requiredForClass(classId: number): readonly DocumentType[] {
    return [...this.types.values()].filter(
      (t) => t.isActive && t.requiredForClassIds.includes(classId),
    );
  }

  /** Every type (read-only). */
  list(): readonly DocumentType[] {
    return [...this.types.values()];
  }

  /** Test-only reset to the seeded state. */
  resetForTests(): void {
    this.types.clear();
    this.nextId = 1;
    this.seed();
  }

  private seed(): void {
    this.create({
      code: 'STNK_Annual',
      name: 'STNK (annual)',
      usualValidityMonths: 12,
      warningDays: 30,
      receiptRequired: true,
      requiredForClassIds: [1],
    });
    this.create({
      code: 'KIR',
      name: 'KIR (six-monthly)',
      usualValidityMonths: 6,
      warningDays: 30,
      receiptRequired: true,
      requiredForClassIds: [1],
    });
    this.create({
      code: 'Insurance',
      name: 'Insurance',
      usualValidityMonths: 12,
      warningDays: 30,
      receiptRequired: false,
      requiredForClassIds: [1],
    });
  }
}
