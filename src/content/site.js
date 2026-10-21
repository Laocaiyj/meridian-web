import { useEffect, useState } from 'react';
import site from './site.json';

export const technologyStack = site.technologyStack;
export const referenceRepositories = site.referenceRepositories;

export const languages = [
  { code: 'en', label: 'English', locale: 'en' },
  { code: 'zh', label: '中文', locale: 'zh-CN' },
  { code: 'ja', label: '日本語', locale: 'ja' },
  { code: 'ko', label: '한국어', locale: 'ko' },
];

/** @typedef {'zh' | 'en' | 'ja' | 'ko'} Language */
/** @typedef {typeof site.zh} SiteContent */

const supported = (language) => languages.some(({ code }) => code === language);

export function useSiteLanguage() {
  const [language, setLanguage] = useState(() => {
    try {
      const saved = window.localStorage.getItem('meridian-language');
      return supported(saved) ? saved : 'en';
    } catch {
      return 'en';
    }
  });
  const selectLanguage = (value) => {
    if (!supported(value)) return;
    setLanguage(value);
    try {
      window.localStorage.setItem('meridian-language', value);
    } catch {
      // Storage may be blocked; changing language must still work for this visit.
    }
  };
  return [language, selectLanguage];
}

/** @param {Language} language @returns {SiteContent} */
export function getSiteContent(language) {
  return supported(language) ? site[language] : site.en;
}

/** Keep runtime metadata aligned with the same content used by the HTML build. */
export function usePageMetadata(content) {
  useEffect(() => {
    document.documentElement.lang = content.locale;
    document.title = content.meta.title;
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute('content', content.meta.description);
  }, [content]);
}
