/**
 * Custom hand-drawn icon set for marketing surfaces.
 * Uniform 24×24 canvas, 1.75 stroke, rounded caps, currentColor —
 * tinted via Tailwind text-* utility on the parent or className.
 *
 * Use these instead of lucide-react in customer-facing marketing
 * sections so the brand reads as deliberate and custom-drawn rather
 * than off-the-shelf system iconography. (Dashboard mocks intentionally
 * keep lucide to feel like real software UI.)
 */

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { className?: string };

const baseProps = {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function MaPlane(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M12 3 L13.6 11 L21 13 L13.6 14.6 L12 21 L10.4 14.6 L3 13 L10.4 11 Z" />
    </svg>
  );
}

export function MaWrench(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M14.5 6.5 a3.5 3.5 0 1 1 3 5.9 L19 14 L14 19 L11.6 16.5 a3.5 3.5 0 0 1 -5.9 -3 L9 14 L11 12 L9 10 L7 12 L5.5 10.5 a3.5 3.5 0 0 1 5 -5 Z" />
    </svg>
  );
}

export function MaStore(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M4 7 L5 4 H19 L20 7" />
      <path d="M4 7 V20 H20 V7" />
      <path d="M4 7 a2 2 0 0 0 4 0 a2 2 0 0 0 4 0 a2 2 0 0 0 4 0 a2 2 0 0 0 4 0" />
      <path d="M9 20 V14 H15 V20" />
    </svg>
  );
}

export function MaChart(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M4 20 V4" />
      <path d="M4 20 H20" />
      <path d="M8 16 V12" />
      <path d="M12 16 V8" />
      <path d="M16 16 V10" />
    </svg>
  );
}

export function MaBook(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M4 5 a2 2 0 0 1 2 -2 H11 V20 H6 a2 2 0 0 0 -2 2 Z" />
      <path d="M20 5 a2 2 0 0 0 -2 -2 H13 V20 H18 a2 2 0 0 1 2 2 Z" />
    </svg>
  );
}

export function MaDatabase(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <ellipse cx="12" cy="5.5" rx="7" ry="2.5" />
      <path d="M5 5.5 V12 a7 2.5 0 0 0 14 0 V5.5" />
      <path d="M5 12 V18.5 a7 2.5 0 0 0 14 0 V12" />
    </svg>
  );
}

export function MaFileCheck(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M14 3 H6 a2 2 0 0 0 -2 2 V19 a2 2 0 0 0 2 2 H18 a2 2 0 0 0 2 -2 V9 Z" />
      <path d="M14 3 V9 H20" />
      <path d="M9 14 L11 16 L15 12" />
    </svg>
  );
}

export function MaMessage(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M4 5 a2 2 0 0 1 2 -2 H18 a2 2 0 0 1 2 2 V14 a2 2 0 0 1 -2 2 H10 L6 20 V16 H6 a2 2 0 0 1 -2 -2 Z" />
    </svg>
  );
}

export function MaUserCheck(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <circle cx="9" cy="7" r="3.5" />
      <path d="M3 21 V19 a4 4 0 0 1 4 -4 H11 a4 4 0 0 1 4 4 V21" />
      <path d="M16 11 L18 13 L22 9" />
    </svg>
  );
}

export function MaShield(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M12 3 L20 6 V12 a8 9 0 0 1 -8 9 a8 9 0 0 1 -8 -9 V6 Z" />
    </svg>
  );
}

export function MaUsers(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20 V18.5 a3.5 3.5 0 0 1 3.5 -3.5 H11.5 a3.5 3.5 0 0 1 3.5 3.5 V20" />
      <circle cx="17" cy="8" r="2.5" />
      <path d="M16 15 H17.5 a3.5 3.5 0 0 1 3.5 3.5 V20" />
    </svg>
  );
}

export function MaLock(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
      <path d="M8 10.5 V7 a4 4 0 0 1 8 0 V10.5" />
    </svg>
  );
}

export function MaZap(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M13 2 L4 14 H11 L11 22 L20 10 H13 Z" />
    </svg>
  );
}

export function MaStar(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M12 3 L14.6 9 L21 9.6 L16.2 14 L17.8 20.5 L12 17 L6.2 20.5 L7.8 14 L3 9.6 L9.4 9 Z" />
    </svg>
  );
}

export function MaSparkles(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M12 4 L13.4 9.4 L18.8 11 L13.4 12.6 L12 18 L10.6 12.6 L5.2 11 L10.6 9.4 Z" />
      <path d="M19 17 L19.6 18.8 L21.4 19.4 L19.6 20 L19 21.8 L18.4 20 L16.6 19.4 L18.4 18.8 Z" />
    </svg>
  );
}

export function MaArrowRight(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M4 12 H20" />
      <path d="M14 6 L20 12 L14 18" />
    </svg>
  );
}

export function MaCheck(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M5 12.5 L10 17.5 L19 7.5" />
    </svg>
  );
}

export function MaPlay(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M7 4 L19 12 L7 20 Z" />
    </svg>
  );
}

export function MaDollar(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M12 2 V22" />
      <path d="M17 6 H10 a3 3 0 0 0 0 6 H14 a3 3 0 0 1 0 6 H7" />
    </svg>
  );
}
