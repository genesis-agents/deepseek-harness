/**
 * Session views, node half. Pure UI plugin: the empty apply exists so the
 * plugin appears in the host cordis.yml / Loader, which is what makes
 * client-modules scan this manifest and serve the browser bundle declared by
 * exports["./client"]. Without the row there is no scan and no bundle fetch.
 */

/** Host plugin body — no host-side behavior for these browser views. */
export function apply(): void {}
