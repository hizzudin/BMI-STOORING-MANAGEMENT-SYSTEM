import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { toId, type CustomerDto, type CustomerId } from '@bmi/shared';

/** Input to create a customer (REQ-BIL-001). */
export interface CreateCustomerInput {
  code: string;
  name: string;
  billingAddress: string;
  taxNumber?: string | null;
  paymentTermsDays?: number;
}

/**
 * **Customers master** (FG-11, REQ-BIL-001).
 *
 * The owner of a vehicle and the recipient of its daily invoices. Phase-1
 * in-memory home following the TASK-104..114 precedent (the dummy gateway
 * models only the nine business aggregates); TASK-201/202 re-home it behind the
 * PRD §9 `customers` table unchanged.
 *
 * A vehicle links to one customer through `vehicles.customer_id` (owned by the
 * Vehicles module); invoice generation resolves the customer from the vehicle
 * at completion time (REQ-BIL-002), so this service only owns the customer rows
 * themselves.
 */
@Injectable()
export class CustomerService {
  private readonly customers = new Map<number, CustomerDto>();
  private nextId = 1;

  /** Create a customer with a unique code (REQ-BIL-001). */
  create(input: CreateCustomerInput): CustomerDto {
    const code = input.code.trim();
    for (const existing of this.customers.values()) {
      if (existing.code === code) {
        throw new ConflictException(`A customer with code "${code}" already exists.`);
      }
    }
    const id = this.nextId;
    this.nextId += 1;
    const customer: CustomerDto = {
      id: toId<'CustomerId'>(id),
      code,
      name: input.name.trim(),
      billingAddress: input.billingAddress.trim(),
      taxNumber: input.taxNumber?.trim() ?? null,
      paymentTermsDays: input.paymentTermsDays ?? 30,
      isActive: true,
      version: 1,
    };
    this.customers.set(id, customer);
    return customer;
  }

  /** List all customers. */
  list(): readonly CustomerDto[] {
    return [...this.customers.values()];
  }

  /** Get a customer by id, or `null`. */
  find(id: CustomerId | number): CustomerDto | null {
    return this.customers.get(typeof id === 'number' ? id : (id as unknown as number)) ?? null;
  }

  /** Get a customer by id or throw (REQ-BIL-001). */
  require(id: CustomerId | number): CustomerDto {
    const customer = this.find(id);
    if (!customer) {
      throw new NotFoundException(`Customer ${String(id)} was not found.`);
    }
    return customer;
  }

  /** Test-only reset. */
  resetForTests(): void {
    this.customers.clear();
    this.nextId = 1;
  }
}
