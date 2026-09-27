import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import ptBR from './locales/pt-BR.json';

const STORAGE_KEY = 'app_language';
const SUPPORTED_LANGUAGES = ['pt-BR', 'en'];
const FALLBACK_LANGUAGE = 'pt-BR';

function normalizeLanguage(lang) {
  if (!lang) return null;
  const lower = lang.toLowerCase();
  if (lower.startsWith('pt')) return 'pt-BR';
  if (lower.startsWith('en')) return 'en';
  return null;
}

function detectInitialLanguage() {
  const stored = normalizeLanguage(window.localStorage.getItem(STORAGE_KEY));
  if (stored) return stored;
  const browser = normalizeLanguage(navigator.language);
  return browser || FALLBACK_LANGUAGE;
}

i18n.use(initReactI18next).init({
  resources: {
    'pt-BR': { translation: ptBR },
    en: { translation: en },
  },
  lng: detectInitialLanguage(),
  fallbackLng: FALLBACK_LANGUAGE,
  interpolation: { escapeValue: false },
  returnNull: false,
});

i18n.on('languageChanged', (lang) => {
  const normalized = normalizeLanguage(lang) || FALLBACK_LANGUAGE;
  if (!SUPPORTED_LANGUAGES.includes(normalized)) {
    i18n.changeLanguage(FALLBACK_LANGUAGE);
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, normalized);
});

export { STORAGE_KEY, SUPPORTED_LANGUAGES, FALLBACK_LANGUAGE };
export default i18n;
