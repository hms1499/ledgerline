/**
 * Where a menu or popover opens: inside the page's <main>, so what it says sits
 * in a landmark. antd's default is the end of <body>, outside every landmark.
 * Modals keep that default: the page's scroll is locked only for a portal in
 * <body>.
 */
export const inMain = (trigger: HTMLElement): HTMLElement => trigger.closest("main") ?? document.body;
