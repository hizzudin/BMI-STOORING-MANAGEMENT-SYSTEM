import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { WorkOrderCategory, WorkOrderPriority } from '@bmi/shared';
import { AlertRuleAction, AlertRuleKind } from '../alert-rule.service.js';
import { AlertReason } from '../pm-alert.service.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** `POST /maintenance/alert-rules` — save an alert rule (REQ-PM-007/010). */
export class SaveAlertRuleDto {
  @IsEnum(AlertRuleKind)
  kind!: AlertRuleKind;

  @IsEnum(AlertRuleAction)
  action!: AlertRuleAction;

  @IsOptional()
  @IsInt()
  @IsPositive()
  presetId?: number;

  @IsOptional()
  @IsEnum(WorkOrderPriority)
  priority?: WorkOrderPriority;

  @IsOptional()
  @IsString({ each: true })
  notifyRoles?: string[];
}

/** `POST /maintenance/alerts/trigger` — trigger an alert evaluation (REQ-PM-001/009). */
export class TriggerAlertDto {
  @IsInt()
  @IsPositive()
  vehicleId!: number;

  @IsEnum(AlertRuleKind)
  ruleKind!: AlertRuleKind;

  @IsEnum(AlertReason)
  reason!: AlertReason;

  @IsString()
  @IsNotEmpty()
  sourceRef!: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsEnum(WorkOrderCategory)
  category?: WorkOrderCategory;

  @IsOptional()
  @IsInt()
  @IsPositive()
  presetId?: number;
}

/** `POST /maintenance/schedule` — place a card on a day (REQ-SCH-002). */
export class PlaceScheduleDto {
  @IsInt()
  @IsPositive()
  workOrderId!: number;

  @Matches(ISO_DATE, { message: 'plannedDate must be YYYY-MM-DD' })
  plannedDate!: string;
}

/** `POST /maintenance/schedule/:id/move` — move a card to another day (REQ-SCH-002). */
export class MoveScheduleDto {
  @Matches(ISO_DATE, { message: 'newDay must be YYYY-MM-DD' })
  newDay!: string;
}

/** `POST /maintenance/breakdowns` — report a breakdown (REQ-PM-005, REQ-MBL-002). */
export class ReportBreakdownDto {
  @IsInt()
  @IsPositive()
  vehicleId!: number;

  @IsInt()
  @IsPositive()
  driverId!: number;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  locationLat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  locationLng?: number;

  @IsOptional()
  @IsString()
  photoRef?: string;
}

/** `POST /maintenance/daily-job/run` — run the simulated daily job (NFR-14). */
export class RunDailyJobDto {
  /** Optional WIB instant to run the job for (ISO-8601); defaults to now. */
  @IsOptional()
  @IsString()
  now?: string;
}
