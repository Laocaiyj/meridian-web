import React, { useEffect, useRef } from 'react';
import { Hero } from './hero/Hero';
import { CompanyFooter } from './CompanyFooter';
import { ProductStory, Principles } from './story/ProductStory';
import { getSiteContent, useSiteLanguage, usePageMetadata } from './content/site';
import { LanguagePicker } from './content/LanguagePicker';
import './App.css';

export default function App() {
  const heroRef = useRef(null);
  const [language, setLanguage] = useSiteLanguage();
  const content = getSiteContent(language);
  usePageMetadata(content);
  useEffect(() => {
    // Preserve the site's existing entry behavior, including fragment URLs.
    if (window.location.hash)
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    window.scrollTo(0, 0);
  }, []);
  return (
    <>
      <svg
        className="film-grade-definition"
        width="0"
        height="0"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <filter
            id="meridian-film-grade"
            x="-2%"
            y="-2%"
            width="104%"
            height="104%"
            colorInterpolationFilters="sRGB"
          >
            <feColorMatrix type="saturate" values="0.94" />
            <feComponentTransfer>
              <feFuncR type="table" tableValues="0 .10 .225 .365 .515 .665 .800 .915 1" />
              <feFuncG type="table" tableValues="0 .095 .215 .355 .505 .655 .790 .905 1" />
              <feFuncB type="table" tableValues="0 .105 .230 .370 .515 .655 .780 .895 1" />
            </feComponentTransfer>
          </filter>
        </defs>
      </svg>
      <LanguagePicker
        language={language}
        label={content.language.selectLabel}
        onChange={setLanguage}
      />
      <main>
        <Hero heroRef={heroRef} content={content.hero} download={content.download} />
        <ProductStory heroRef={heroRef} content={content.story} />
        <Principles content={content.principles} />
      </main>
      <CompanyFooter content={content.company} />
    </>
  );
}
