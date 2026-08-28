/** the run index under the pointer, shared by every chart so one hover reads across the whole page */
export const hover = $state<{ index: number | null }>({ index: null });
