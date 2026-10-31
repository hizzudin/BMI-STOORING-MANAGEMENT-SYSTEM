import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { Role, idValue } from '@bmi/shared';
import type { AuthenticatedRequest } from '../../core/auth/current-user.js';
import { RequireCapability } from '../../core/auth/require-capability.decorator.js';
import { Capabilities } from '../../core/auth/permission-matrix.js';
import { enrichAudit } from '../../core/audit/audit-context.js';
import { AccountsService } from './accounts.service.js';
import { CreateAccountDto, MoveSystemAdminDto, UpdateAccountDto } from './dto/accounts.dto.js';

/**
 * FG-13 account administration (REQ-IAM-002/003/004, BR-14).
 *
 * Every route requires the §2.2 `accounts.manage` capability, which only the
 * Access Manager holds (RL-5). Because the System Admin's matrix cell for that
 * capability is **locked-off** (blank + `L`), the global guard refuses the
 * System Admin here with a server-side 403 — satisfying REQ-IAM-003 / AC-IAM-003
 * ("IF the System Admin opens Users and roles … THEN refuse") without any extra
 * check in this controller.
 */
@Controller('users')
@RequireCapability(Capabilities.AccountsManage)
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  /** List accounts (Access Manager view). */
  @Get()
  async list(): Promise<{ users: unknown[] }> {
    const users = await this.accounts.list();
    return { users: users.map(redactUser) };
  }

  /** Create an account — exactly one role, forced first-change (REQ-IAM-002/009). */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateAccountDto,
  ): Promise<{ user: ReturnType<typeof redactUser> }> {
    const user = await this.accounts.create({
      fullName: dto.fullName,
      email: dto.email,
      role: dto.role,
      temporaryPassword: dto.temporaryPassword,
    });
    enrichAudit(req, { entity: 'users', entityId: idValue(user.id), after: redactUser(user) });
    return { user: redactUser(user) };
  }

  /**
   * Move the single System Admin role to another active account, with a reason
   * (REQ-IAM-004, BR-14). The one atomic transaction and the single audit record
   * the global interceptor writes satisfy AC-IAM-002.
   */
  @Post('move-system-admin')
  @HttpCode(HttpStatus.OK)
  async moveSystemAdmin(
    @Req() req: AuthenticatedRequest,
    @Body() dto: MoveSystemAdminDto,
  ): Promise<{ from: ReturnType<typeof redactUser>; to: ReturnType<typeof redactUser> }> {
    const result = await this.accounts.moveSystemAdmin(dto.toUserId);
    enrichAudit(req, {
      entity: 'user_roles',
      entityId: dto.toUserId,
      before: { systemAdminUserId: idValue(result.to.id), priorRole: result.from.role },
      after: { systemAdminUserId: idValue(result.to.id) },
      reason: dto.reason,
    });
    return { from: redactUser(result.from), to: redactUser(result.to) };
  }

  /** Edit an account (name / active flag). Deactivating the System Admin is refused. */
  @Patch(':id')
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAccountDto,
  ): Promise<{ user: ReturnType<typeof redactUser> }> {
    const user = await this.accounts.update(id, dto);
    enrichAudit(req, { entity: 'users', entityId: id, after: redactUser(user) });
    return { user: redactUser(user) };
  }

  /** Unlock a locked account (REQ-IAM-001). */
  @Post(':id/unlock')
  @HttpCode(HttpStatus.OK)
  async unlock(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ user: ReturnType<typeof redactUser> }> {
    const user = await this.accounts.unlock(id);
    enrichAudit(req, { entity: 'users', entityId: id, reason: 'unlock' });
    return { user: redactUser(user) };
  }
}

/**
 * Project a `UserDto` to the safe public shape — NEVER the password hash
 * (fullstack-guardian: never expose sensitive data in API responses).
 */
function redactUser(user: {
  id: unknown;
  fullName: string;
  email: string;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
  lockedUntil: string | null;
}): {
  id: number;
  fullName: string;
  email: string;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
  locked: boolean;
} {
  return {
    id: idValue(user.id as never),
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    locked: user.lockedUntil !== null,
  };
}
