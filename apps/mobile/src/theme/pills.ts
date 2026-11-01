import { WorkOrderPriority } from '@bmi/shared';
import { colors } from './tokens.js';

/**
 * A status/urgency pill descriptor. **The Words First Rule** (DESIGN.md): the
 * `label` text is always present so status is never conveyed by colour alone
 * (WCAG 2.2 AA; PRODUCT.md accessibility baseline). Colour only reinforces it.
 */
export interface PillStyle {
  /** The visible, translatable status word. Never omitted. */
  readonly label: string;
  readonly backgroundColor: string;
  readonly textColor: string;
}

/**
 * The urgency pill for a WO priority (REQ-WO-015, REQ-MOB-010, DESIGN.md
 * "Chips and Pills"): Urgent → danger, High → amber, Normal → petrol info,
 * Low → neutral. The label is supplied by the caller already translated
 * (Indonesian/English), keeping this mapping pure and i18n-agnostic.
 */
export function urgencyPill(priority: WorkOrderPriority, label: string): PillStyle {
  switch (priority) {
    case WorkOrderPriority.Urgent:
      return { label, backgroundColor: colors.dangerBg, textColor: colors.dangerText };
    case WorkOrderPriority.High:
      return { label, backgroundColor: colors.warningBg, textColor: colors.warningText };
    case WorkOrderPriority.Normal:
      return { label, backgroundColor: colors.infoBg, textColor: colors.infoText };
    case WorkOrderPriority.Low:
      return { label, backgroundColor: colors.neutralPillBg, textColor: colors.neutralPillText };
    default: {
      // Exhaustive: a new priority value must be handled explicitly.
      const _exhaustive: never = priority;
      return _exhaustive;
    }
  }
}

/** A neutral "rolled over / late" flag pill (REQ-MOB-010). Carries its word. */
export function rolledOverPill(label: string): PillStyle {
  return { label, backgroundColor: colors.warningBg, textColor: colors.warningText };
}
