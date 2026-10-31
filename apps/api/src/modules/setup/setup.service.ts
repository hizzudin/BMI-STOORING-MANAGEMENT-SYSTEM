import { Injectable } from '@nestjs/common';
import { AppSettingsService, type SystemMode } from '../iam/app-settings.service.js';

/** A snapshot of the current Setup/Live status (for the Go-live checklist). */
export interface SetupStatus {
  readonly mode: SystemMode;
  readonly isLive: boolean;
  readonly wentLiveAt: string | null;
  /** No approvals run while in Setup (REQ-IAM-010). */
  readonly approvalsEnabled: boolean;
}

/**
 * FG-14 Setup / Go-live orchestration (REQ-IAM-010). The lifecycle scalars
 * themselves live in the IAM {@link AppSettingsService} (reused, not
 * duplicated); this service exposes the status the Setup screen shows and drives
 * the one-way Go-live transition.
 */
@Injectable()
export class SetupService {
  constructor(private readonly settings: AppSettingsService) {}

  /** The current Setup/Live status (drives the SetupGoLive checklist). */
  status(): SetupStatus {
    return {
      mode: this.settings.getSystemMode(),
      isLive: this.settings.isLive(),
      wentLiveAt: this.settings.getWentLiveAt(),
      approvalsEnabled: this.settings.approvalsEnabled(),
    };
  }

  /**
   * Switch the system to Live, once and for all (REQ-IAM-010). Delegates to
   * {@link AppSettingsService.goLive}, which refuses a second call — so the
   * switch is irreversible and cannot be reverted. Returns the post-switch
   * status (its `wentLiveAt` is the recorded go-live time).
   *
   * @throws ConflictException if the system is already Live.
   */
  goLive(at: string = new Date().toISOString()): SetupStatus {
    this.settings.goLive(at);
    return this.status();
  }
}
