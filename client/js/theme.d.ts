export const THEMES: string[];
export const STORAGE_KEY: string;
export function getTheme(): string;
export function setTheme(name: string): string;
export function cycleTheme(): string;
export function subscribe(fn: (theme: string) => void): () => void;
declare const FroseThemeApi: {
  THEMES: string[];
  STORAGE_KEY: string;
  getTheme: typeof getTheme;
  setTheme: typeof setTheme;
  cycleTheme: typeof cycleTheme;
  subscribe: typeof subscribe;
};
export default FroseThemeApi;
