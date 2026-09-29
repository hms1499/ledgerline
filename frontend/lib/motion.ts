/**
 * Which pages arrive with page-in and stagger (spec 2026-09-29 §2.1): every
 * page but the receipt, whose checks print in one after another because they
 * ran one after another — a fade over the whole page would put a moment
 * before the verdict where nothing is legible.
 */
export const pageMotion = (pathname: string): boolean => !/^\/r(\/|$)/.test(pathname);
