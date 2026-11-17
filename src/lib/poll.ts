/** Wrap a refresh so it only runs while the screen is showing: a locked or backgrounded phone stops hitting the server. */
export const whenVisible = (fn: () => void) => () => {
  if (typeof document === 'undefined' || document.visibilityState === 'visible') fn();
};
