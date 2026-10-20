import '@testing-library/jest-dom/extend-expect';

// JSDOM lacks these browser primitives; keyboard and animation behavior runs in Chromium.
window.matchMedia = (query) => ({
  matches: false,
  media: query,
  addEventListener() {},
  removeEventListener() {},
});
global.IntersectionObserver = class {
  observe() {}
  disconnect() {}
};
HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute('open', '');
};
HTMLDialogElement.prototype.close = function () {
  this.removeAttribute('open');
};

const getComputedStyle = window.getComputedStyle;
window.getComputedStyle = (element) => getComputedStyle(element);
