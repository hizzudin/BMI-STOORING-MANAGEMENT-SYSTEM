import { Module } from '@nestjs/common';
import { AuditModule } from '../../core/audit/audit.module.js';
import { AuthController } from './auth.controller.js';
import { AccountsController } from './accounts.controller.js';
import { PermissionsController } from './permissions.controller.js';
import { AuthService } from './auth.service.js';
import { AccountsService } from './accounts.service.js';
import { PermissionsService } from './permissions.service.js';
import { PasswordService } from './password.service.js';
import { SessionService } from './session.service.js';
import { PasswordResetService } from './password-reset.service.js';
import { AppSettingsService } from './app-settings.service.js';

/**
 * FG-13 — Accounts, access & audit (REQ-IAM, NFR-02, NFR-05, DQ-02, BR-14).
 *
 * The IAM module (TASK-104):
 *   - **Auth** — login with lockout, forced first-sign-in change, email reset,
 *     logout (REQ-IAM-001/009, DQ-02, NFR-05).
 *   - **Accounts** — create / edit / unlock / move System Admin, enforcing the
 *     one-role-per-user and single-System-Admin invariants (REQ-IAM-002/004,
 *     BR-14).
 *   - **Roles & permissions** — the editable-but-locked §2.2 matrix read and the
 *     Planner-approval switch (REQ-IAM-005/008).
 *
 * It reuses the cross-cutting layers (global RolesGuard, ValidationPipe,
 * IdempotencyInterceptor, AuditInterceptor) rather than reimplementing them, and
 * owns the real {@link SessionService}-backed principal resolver that replaces
 * `DevAuthMiddleware` (wired in `AppModule`). The session/settings services are
 * exported so the middleware and other modules depend on one instance.
 */
@Module({
  imports: [AuditModule],
  controllers: [AuthController, AccountsController, PermissionsController],
  providers: [
    AuthService,
    AccountsService,
    PermissionsService,
    PasswordService,
    SessionService,
    PasswordResetService,
    AppSettingsService,
  ],
  exports: [SessionService, AppSettingsService, PermissionsService],
})
export class IamModule {}
