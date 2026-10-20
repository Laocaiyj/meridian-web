import { useEffect } from 'react';
import site from './site.json';

export const technologyStack = site.technologyStack;
export const referenceRepositories = site.referenceRepositories;

/** @typedef {'zh' | 'en'} Language */
/** @typedef {typeof site.zh} SiteContent */

/** @param {Language} language @returns {SiteContent} */
export function getSiteContent(language) {
  return site[language] || site.zh;
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
