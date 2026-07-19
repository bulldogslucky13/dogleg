/**
 * Inline busy indicator for buttons mid-request. Sized in `em` so it tracks
 * whatever type scale the button uses, and hidden from screen readers — the
 * button's own text carries the state.
 */
export function Spinner() {
  return <span className="spinner" aria-hidden="true" />
}
