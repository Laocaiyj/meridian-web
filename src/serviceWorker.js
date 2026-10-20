/** Remove only the legacy worker controlling this page; leave other sites' scopes intact. */
export function unregister() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker
    .getRegistration(window.location.href)
    .then((registration) => registration?.unregister())
    .catch((error) => console.error('Unable to remove legacy service worker:', error));
}
