import React from 'react';
import './CompanyFooter.css';

export function CompanyFooter({ content }) {
  return (
    <footer className="company-footer" aria-labelledby="company-heading">
      <div className="company-inner">
        <div className="company-columns">
          <div className="company-about">
            <h2
              id="company-heading"
              lang={content.name === 'Mou-Hau Logic' ? 'en' : 'zh-Hant'}
              translate="no"
            >
              {content.name}
            </h2>
            <p
              className="company-alias"
              lang={content.alias === 'Mou-Hau Logic' ? 'en' : 'zh-Hant'}
              translate="no"
            >
              {content.alias}
            </p>
          </div>
          <div className="company-information">
            <h3>{content.informationLabel}</h3>
            <dl>
              <div>
                <dt>{content.contactLabel}</dt>
                <dd>{content.pending}</dd>
              </div>
              <div>
                <dt>{content.addressLabel}</dt>
                <dd>{content.pending}</dd>
              </div>
            </dl>
          </div>
        </div>
        <div className="company-legal">
          <p translate="no">© {new Date().getFullYear()} Mou-Hau Logic</p>
          <div>
            <span>{content.privacy}</span>
            <span>{content.terms}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
