import { IsInt, IsLatitude, IsLongitude, IsOptional, Min } from 'class-validator';

/**
 * DTOs for the Mobilisasi step endpoints (FG-5a, REQ-MBL). Validated
 * server-side by the global ValidationPipe (NFR-04); coordinates are typed and
 * range-checked, never free-text parsed.
 *
 * Privacy (RSK-09 / UU-PDP): the trail is a continuous stream of the mechanic's
 * position recorded only while the step is In_Progress; these DTOs carry only a
 * single point at a time, and the trail is readable only by Planner/System Admin
 * (enforced server-side, not here).
 */

/** Record one point of the In_Progress location trail (REQ-MBL-005). */
export class TrailPointDto {
  @IsLatitude()
  lat!: number;

  @IsLongitude()
  lng!: number;

  /** GPS accuracy in metres, if the device reports it. */
  @IsOptional()
  @IsInt()
  @Min(0)
  accuracyM?: number;
}

/** Report the mechanic's current position to test arrival / auto-submit (REQ-MBL-004). */
export class ArrivalCheckDto {
  @IsLatitude()
  lat!: number;

  @IsLongitude()
  lng!: number;
}
