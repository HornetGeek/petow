const FLOATING_TAB_BAR_BASE_HEIGHT = 74;
const FLOATING_TAB_BAR_BOTTOM_OFFSET = 8;
const FLOATING_TAB_BAR_CONTENT_BUFFER = 16;

const normalizeInset = (bottomInset: number): number => {
  if (!Number.isFinite(bottomInset) || bottomInset < 0) {
    return 0;
  }
  return bottomInset;
};

export const getFloatingTabBarOverlayHeight = (bottomInset: number): number => {
  const inset = normalizeInset(bottomInset);
  return FLOATING_TAB_BAR_BASE_HEIGHT + inset + inset + FLOATING_TAB_BAR_BOTTOM_OFFSET;
};

export const getFloatingTabBarContentPadding = (bottomInset: number, extra = 0): number => {
  return getFloatingTabBarOverlayHeight(bottomInset) + FLOATING_TAB_BAR_CONTENT_BUFFER + extra;
};
