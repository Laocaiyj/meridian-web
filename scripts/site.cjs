const site = require('../src/content/site.json');
const mode = process.argv[2];
if (!['start', 'build'].includes(mode)) throw new Error('Expected start or build');
const escapeHtml = (value) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
process.env.NODE_ENV = mode === 'build' ? 'production' : 'development';
process.env.REACT_APP_PAGE_TITLE = escapeHtml(site.zh.meta.title);
process.env.REACT_APP_PAGE_DESCRIPTION = escapeHtml(site.zh.meta.description);
process.env.PUBLIC_URL = process.env.PUBLIC_URL || '.';
require(`react-scripts/scripts/${mode}`);
