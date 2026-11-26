export function formatINR(paiseInput: number | bigint | string, opts?: { alwaysDecimals?: boolean }): string;
export function showToast(message: string, variant?: 'info' | 'success' | 'warning' | 'danger' | 'error', durationMs?: number): HTMLElement | null;
export function openSheet(id: string): void;
export function closeSheet(id: string): void;
export function confirmModal(opts: { title?: string; body?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean }): Promise<boolean>;
export function renderSkeletonList(container: HTMLElement | null, count?: number, heightPx?: number): void;
export function createStatusPill(label: string, variant?: 'emerald' | 'amber' | 'rose' | 'blue' | 'slate'): HTMLElement | null;
export function createVegBadge(isVeg?: boolean): HTMLElement | null;
export function renderSegmentedControl(
  container: HTMLElement | null,
  options: Array<{ value: string; label: string }>,
  activeValue: string,
  handleSelect: (value: string) => void,
): void;
declare const FroseUIApi: {
  formatINR: typeof formatINR;
  showToast: typeof showToast;
  openSheet: typeof openSheet;
  closeSheet: typeof closeSheet;
  confirmModal: typeof confirmModal;
  renderSkeletonList: typeof renderSkeletonList;
  createStatusPill: typeof createStatusPill;
  createVegBadge: typeof createVegBadge;
  renderSegmentedControl: typeof renderSegmentedControl;
};
export default FroseUIApi;
