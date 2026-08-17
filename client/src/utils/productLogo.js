/**
 * Where a product's mark comes from.
 *
 * A product may have a logo set by hand; when it does not, its website is enough
 * to show something recognisable — every site publishes an icon, so the site's
 * favicon stands in until someone uploads real artwork.
 *
 * Nothing is stored: the mark is derived at render time, so setting a website URL
 * takes effect immediately and clearing it degrades cleanly. A logo entered by
 * hand always wins.
 */

const FAVICON_SERVICE = 'https://www.google.com/s2/favicons';

/** A dotted name made only of characters a hostname may contain. */
const HOSTNAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

/** Hostname of a product's website, or '' when there isn't a usable one. */
export function productHost(websiteUrl) {
  const raw = String(websiteUrl || '').trim();
  if (!raw) return '';
  try {
    // People type "acme.com" as often as "https://acme.com".
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';

    // `new URL()` does not reject nonsense — it percent-encodes it, turning free
    // text typed into the field into a hostname like "not%20a%20url". Without
    // this check that becomes a pointless icon lookup instead of the fallback.
    return HOSTNAME.test(url.hostname) ? url.hostname : '';
  } catch {
    return '';
  }
}

/**
 * Returns `{ src, source }`. `source` matters to the renderer: an uploaded logo is
 * artwork meant to fill its frame, a favicon is a small square icon that has to
 * sit inside one.
 */
export function productLogo(product) {
  if (product?.logo) return { src: product.logo, source: 'logo' };

  const host = productHost(product?.websiteUrl);
  if (host) {
    return { src: `${FAVICON_SERVICE}?domain=${encodeURIComponent(host)}&sz=128`, source: 'favicon' };
  }

  return { src: '', source: 'none' };
}
