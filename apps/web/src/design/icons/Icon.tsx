'use client'

/**
 * myaircraft.us — <Icon> component
 *
 * A single, tree-shakeable icon component backed by the hand-authored
 * SVG registry. Zero external dependencies.
 *
 *   <Icon name="airplane" size={24} color="#2563EB" strokeWidth={2} />
 *   <Icon name="warning" aria-label="Action required" />   // role="img"
 *
 * Standard icons render on a 24x24 grid. The brand wordmark
 * ('brand-logo-full') carries its own wider viewBox.
 */

import type { CSSProperties } from 'react'
import {
  iconRegistry,
  wideIconRegistry,
  wideIconViewBox,
  type IconName,
  type WideIconName,
  type AnyIconName,
} from './registry'

export type { IconName, WideIconName, AnyIconName } from './registry'

export interface IconProps {
  /** Registered icon name — drives autocomplete and compile-time checking. */
  name: AnyIconName
  /** Square render size in px (width = height). Wide icons scale by ratio. */
  size?: number
  /** Stroke/fill color. Defaults to `currentColor` so it inherits text color. */
  color?: string
  /** Extra class names forwarded to the root <svg>. */
  className?: string
  /** Stroke width on the 24px grid. */
  strokeWidth?: number
  /**
   * Accessible label. When provided the icon becomes `role="img"` with this
   * label; otherwise it is `aria-hidden` (decorative).
   */
  'aria-label'?: string
  /** Optional inline style forwarded to the root <svg>. */
  style?: CSSProperties
}

const DEFAULT_VIEW_BOX = '0 0 24 24'

function isWideIcon(name: AnyIconName): name is WideIconName {
  return name in wideIconRegistry
}

/**
 * Renders an inline SVG icon from the registry.
 *
 * Decorative by default (`aria-hidden="true"`); pass `aria-label` to expose
 * it to assistive tech as `role="img"`.
 */
export function Icon({
  name,
  size = 24,
  color = 'currentColor',
  className,
  strokeWidth = 2,
  'aria-label': ariaLabel,
  style,
}: IconProps) {
  const wide = isWideIcon(name)
  const innerMarkup = wide ? wideIconRegistry[name] : iconRegistry[name as IconName]
  const viewBox = wide ? wideIconViewBox[name] : DEFAULT_VIEW_BOX

  // Wide icons keep their aspect ratio: derive width from the viewBox.
  const [, , vbW, vbH] = viewBox.split(' ').map(Number)
  const height = size
  const width = vbW && vbH ? Math.round((vbW / vbH) * size) : size

  const accessibility = ariaLabel
    ? ({ role: 'img' as const, 'aria-label': ariaLabel })
    : ({ 'aria-hidden': true as const })

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox={viewBox}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      {...accessibility}
      dangerouslySetInnerHTML={{ __html: innerMarkup }}
    />
  )
}

export default Icon
