/** Whether a key event belongs to a text field (the board leaves those keys alone). */
export const typing = (e: KeyboardEvent): boolean => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
};
