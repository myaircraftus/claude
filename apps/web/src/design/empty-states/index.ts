/**
 * Empty-state illustration components for myaircraft.us.
 *
 * Every component shares the same {@link EmptyStateProps} shape: an optional
 * `headline`, `subtext`, `cta` slot and `className`. Each renders a centered
 * inline SVG illustration (240×180) above the text. All are pure
 * presentational and server-component-safe (no hooks, no state).
 */
export { EmptyStateShell, emptyStateColors } from './EmptyStateShell'
export type { EmptyStateProps } from './EmptyStateShell'

export { EmptyMarketplace } from './EmptyMarketplace'
export { EmptyMyListings } from './EmptyMyListings'
export { EmptySearch } from './EmptySearch'
export { EmptyReviews } from './EmptyReviews'
export { EmptyDocuments } from './EmptyDocuments'
export { EmptySquawks } from './EmptySquawks'
export { EmptyWorkOrders } from './EmptyWorkOrders'
export { EmptyNotifications } from './EmptyNotifications'
export { EmptyActivity } from './EmptyActivity'
