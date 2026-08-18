/**
 * Where the highlight moves inside an open listbox.
 *
 * Kept pure and separate from the component because this is the part that is
 * easy to get subtly wrong — wrapping at the ends, Home/End, and what happens
 * when nothing is highlighted yet — and the repo has no DOM test setup, so a
 * component test could not cover it.
 *
 * Follows the WAI-ARIA listbox keyboard pattern.
 */

/** Keys this module knows how to move the highlight for. */
export type NavigationKey = "ArrowDown" | "ArrowUp" | "Home" | "End";

export function isNavigationKey(key: string): key is NavigationKey {
  return key === "ArrowDown" || key === "ArrowUp" || key === "Home" || key === "End";
}

/**
 * The next highlighted index, wrapping at both ends so a long list stays
 * reachable in either direction. `current` is -1 when nothing is highlighted
 * yet, in which case ArrowDown starts at the top and ArrowUp at the bottom.
 * Returns -1 for an empty list — there is nothing to highlight.
 */
export function nextActiveIndex(
  current: number,
  key: NavigationKey,
  count: number,
): number {
  if (count <= 0) return -1;

  switch (key) {
    case "Home":
      return 0;
    case "End":
      return count - 1;
    case "ArrowDown":
      if (current < 0) return 0;
      return (current + 1) % count;
    case "ArrowUp":
      if (current < 0) return count - 1;
      return (current - 1 + count) % count;
  }
}
