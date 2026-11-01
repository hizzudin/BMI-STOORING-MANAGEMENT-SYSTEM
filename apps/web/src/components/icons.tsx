/**
 * Outline icon set (24px grid, 2px stroke) used beside nav/section labels.
 * Icons are decorative here — every icon is paired with a text label
 * (DESIGN.md: never an icon without its label outside the collapsed rail), so
 * they are marked aria-hidden.
 */
import type { SVGProps } from 'react';

function base(props: SVGProps<SVGSVGElement>): SVGProps<SVGSVGElement> {
  return {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    focusable: false,
    ...props,
  };
}

export function IconDashboard(p: SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg {...base(p)}>
      <rect x="3" y="3" width="7" height="9" />
      <rect x="14" y="3" width="7" height="5" />
      <rect x="14" y="12" width="7" height="9" />
      <rect x="3" y="16" width="7" height="5" />
    </svg>
  );
}

export function IconWorkOrder(p: SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg {...base(p)}>
      <path d="M9 3h6l1 3H8l1-3Z" />
      <rect x="4" y="6" width="16" height="15" rx="2" />
      <path d="M8 11h8M8 15h5" />
    </svg>
  );
}

export function IconRequests(p: SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg {...base(p)}>
      <path d="M4 5h16v11H7l-3 3V5Z" />
      <path d="M8 9h8M8 12h5" />
    </svg>
  );
}

export function IconSchedule(p: SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg {...base(p)}>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9h18M8 2v4M16 2v4" />
    </svg>
  );
}

export function IconApprovals(p: SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg {...base(p)}>
      <path d="M20 7 9.5 17.5 4 12" />
    </svg>
  );
}

export function IconInventory(p: SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg {...base(p)}>
      <path d="M3 7 12 3l9 4-9 4-9-4Z" />
      <path d="M3 7v10l9 4 9-4V7" />
      <path d="M12 11v10" />
    </svg>
  );
}

export function IconVehicle(p: SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg {...base(p)}>
      <path d="M3 13l2-5h9l3 3h4v4h-2" />
      <path d="M3 13v4h2" />
      <circle cx="7.5" cy="17.5" r="1.8" />
      <circle cx="17.5" cy="17.5" r="1.8" />
      <path d="M9.3 17.5h6.4" />
    </svg>
  );
}

export function IconSignOut(p: SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg {...base(p)}>
      <path d="M15 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h9" />
      <path d="M12 12h9M18 8l4 4-4 4" />
    </svg>
  );
}
