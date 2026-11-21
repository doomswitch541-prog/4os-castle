export const BASE = new URL('./', import.meta.url).pathname;

export const sitePath = path => BASE + String(path).replace(/^\//, '');

export function route(pathname = location.pathname) {
  const rest = pathname.startsWith(BASE) ? pathname.slice(BASE.length) : pathname.replace(/^\//, '');
  return `/${rest.replace(/(^|\/)index\.html$/, '').replace(/\.html$/, '').replace(/\/$/, '')}`;
}
