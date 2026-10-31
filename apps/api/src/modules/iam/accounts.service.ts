import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role, type UserDto, toId, idValue } from '@bmi/shared';
import type { DataGateway } from '@bmi/data-gateway';
import { DATA_GATEWAY } from '../../core/data-gateway/data-gateway.module.js';
import { PasswordService } from './password.service.js';
import { SessionService } from './session.service.js';

/** The outcome of a System-Admin move, for the caller's audit enrichment. */
export interface MoveSystemAdminResult {
  readonly from: UserDto;
  readonly to: UserDto;
}

/**
 * Account administration (FG-13, REQ-IAM-002/004, BR-14).
 *
 * Owns the two invariants no permission change can switch off (BR-14):
 *   - **one role per user** (`uq_one_role_per_user`) — the create/edit paths
 *     never give a second role; the DTO carries exactly one.
 *   - **exactly one System Admin** (`uq_one_system_admin`) — enforced on create
 *     (a second System_Admin is refused) and on move (atomic hand-over).
 *
 * Every write runs inside a single `unitOfWork` so it is atomic and
 * version-checked (NFR-01/03). Authorization (Access-Manager-only, RL-5) is the
 * controller's guard; this service enforces the data invariants regardless.
 */
@Injectable()
export class AccountsService {
  constructor(
    @Inject(DATA_GATEWAY) private readonly gateway: DataGateway,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
  ) {}

  /** List all accounts (Access Manager view). */
  async list(): Promise<readonly UserDto[]> {
    return this.gateway.repos.users.list();
  }

  /**
   * Create an account with exactly one role (BR-14) and a forced first-sign-in
   * password change (REQ-IAM-009). Refuses a duplicate email, a second System
   * Admin (AC-IAM-001), and a password that fails the NFR-05 policy.
   */
  async create(input: {
    fullName: string;
    email: string;
    role: Role;
    temporaryPassword: string;
  }): Promise<UserDto> {
    this.passwords.assertMeetsPolicy(input.temporaryPassword);
    const email = input.email.trim().toLowerCase();
    const passwordHash = await this.passwords.hash(input.temporaryPassword);

    return this.gateway.unitOfWork(async (ctx) => {
      const existing = await ctx.repos.users.findOneBy('email', email);
      if (existing) {
        throw new ConflictException('An account with that email already exists.');
      }
      if (input.role === Role.SystemAdmin && (await this.systemAdminExists(ctx.repos.users))) {
        // AC-IAM-001 / BR-14: exactly one System Admin.
        throw new ConflictException('A System Admin account already exists.');
      }
      return ctx.repos.users.insert({
        id: toId<'UserId'>(0),
        fullName: input.fullName,
        role: input.role,
        isActive: true,
        email,
        passwordHash,
        mustChangePassword: true,
        failedLogins: 0,
        lockedUntil: null,
      });
    });
  }

  /** Edit an account's name / active flag. Deactivating the System Admin is refused (BR-14). */
  async update(
    userId: number,
    patch: { fullName?: string; isActive?: boolean },
  ): Promise<UserDto> {
    return this.gateway.unitOfWork(async (ctx) => {
      const user = await this.requireUser(ctx.repos.users, userId);
      if (patch.isActive === false && user.role === Role.SystemAdmin) {
        // BR-14: the System Admin account cannot be deactivated while it holds the role.
        throw new ConflictException('The System Admin account cannot be deactivated.');
      }
      const next: UserDto = {
        ...user,
        fullName: patch.fullName ?? user.fullName,
        isActive: patch.isActive ?? user.isActive,
      };
      const saved = await ctx.repos.users.update(next);
      if (saved.isActive === false) {
        this.sessions.revokeAllForUser(userId);
      }
      return saved;
    });
  }

  /**
   * Unlock a locked account (REQ-IAM-001): clear the lockout window and the
   * failed-login counter. Access-Manager action.
   */
  async unlock(userId: number): Promise<UserDto> {
    return this.gateway.unitOfWork(async (ctx) => {
      const user = await this.requireUser(ctx.repos.users, userId);
      return ctx.repos.users.update({ ...user, failedLogins: 0, lockedUntil: null });
    });
  }

  /**
   * Move the single System Admin role to another active account in ONE
   * transaction (REQ-IAM-004, BR-14): the target becomes System Admin and the
   * old holder no longer is. Refuses when there is no current holder, the target
   * is the current holder (self-move is not allowed), or the target is
   * unknown/inactive.
   *
   * Because Phase-1 models exactly one role on the account row (RL-1), the two
   * accounts **swap** roles: the target takes `System_Admin` and the former
   * holder takes the target's prior role. After the move both invariants still
   * hold — one role per user and exactly one System Admin (BR-14) — and the AC
   * is met: the target is System Admin, the former holder is not (AC-IAM-002).
   */
  async moveSystemAdmin(toUserId: number): Promise<MoveSystemAdminResult> {
    return this.gateway.unitOfWork(async (ctx) => {
      const users = await ctx.repos.users.findBy('role', Role.SystemAdmin);
      const current = users[0];
      if (!current) {
        throw new ConflictException('There is no System Admin to move.');
      }
      if (idValue(current.id) === toUserId) {
        // The System Admin cannot move the role to itself (BR-14 / REQ-IAM-004).
        throw new ConflictException('The System Admin role is already held by that account.');
      }
      const target = await ctx.repos.users.getById(toUserId);
      if (!target) {
        throw new NotFoundException('Target account not found.');
      }
      if (!target.isActive) {
        throw new BadRequestException('The System Admin role can only move to an active account.');
      }

      // Atomic hand-over: the two accounts swap roles so one-role-per-user and
      // exactly-one-System-Admin both still hold after the move (BR-14).
      const targetPriorRole = target.role;
      const updatedTarget = await ctx.repos.users.update({ ...target, role: Role.SystemAdmin });
      const updatedFrom = await ctx.repos.users.update({ ...current, role: targetPriorRole });

      return { from: updatedFrom, to: updatedTarget };
    });
  }

  private async systemAdminExists(
    users: { findBy: (f: 'role', v: Role) => Promise<readonly UserDto[]> },
  ): Promise<boolean> {
    const admins = await users.findBy('role', Role.SystemAdmin);
    return admins.length > 0;
  }

  private async requireUser(
    users: { getById: (id: number) => Promise<UserDto | null> },
    userId: number,
  ): Promise<UserDto> {
    const user = await users.getById(userId);
    if (!user) {
      throw new NotFoundException('Account not found.');
    }
    return user;
  }
}
