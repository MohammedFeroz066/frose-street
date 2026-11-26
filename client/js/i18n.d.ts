export interface FroseLanguageOption {
  code: 'en' | 'te' | 'hi' | 'ta';
  label: string;
  nativeLabel: string;
}

export interface FroseI18nApi {
  STORAGE_KEY: string;
  SUPPORTED_LANGS: FroseLanguageOption[];
  LOCALES: Record<'en' | 'te' | 'hi' | 'ta', Record<string, string>>;
  getLanguage(): 'en' | 'te' | 'hi' | 'ta';
  setLanguage(code: string): 'en' | 'te' | 'hi' | 'ta';
  t(key: string, vars?: Record<string, string | number>): string;
  applyTranslations(root?: Document | Element | null): void;
}

declare global {
  interface Window {
    FroseI18n?: FroseI18nApi;
  }
}
