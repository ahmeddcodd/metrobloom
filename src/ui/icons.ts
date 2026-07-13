/**
 * Crisp inline-SVG icons — no emoji-font dependency (several emoji, e.g. the
 * Unicode-13 coin, render as hollow tofu on older systems). Every icon inherits
 * size from CSS (.ico svg) and uses explicit fills so it reads identically on
 * every platform.
 */

const svg = (body: string, viewBox = '0 0 24 24'): string =>
  `<svg viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">${body}</svg>`;

export const ICONS = {
  coin: svg(
    `<circle cx="12" cy="12" r="10" fill="#f4b63c"/>
     <circle cx="12" cy="12" r="7.2" fill="#ffd045"/>
     <path d="M12 6.6v10.8M9.4 9.2c0-1.2 1.1-2 2.6-2s2.6.8 2.6 2c0 2.6-5.2 1.9-5.2 4.6 0 1.2 1.1 2 2.6 2s2.6-.8 2.6-2" stroke="#b07a1e" stroke-width="1.6" fill="none" stroke-linecap="round"/>`,
  ),
  brick: svg(
    `<rect x="2" y="5" width="9.4" height="6" rx="1" fill="#d98e56"/>
     <rect x="12.6" y="5" width="9.4" height="6" rx="1" fill="#c97b45"/>
     <rect x="7" y="13" width="10" height="6" rx="1" fill="#e09a63"/>
     <rect x="2" y="13" width="3.8" height="6" rx="1" fill="#c97b45"/>
     <rect x="18.2" y="13" width="3.8" height="6" rx="1" fill="#d98e56"/>`,
  ),
  people: svg(
    `<circle cx="8.5" cy="8" r="3.6" fill="#9fd0ff"/>
     <path d="M2.5 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5z" fill="#9fd0ff"/>
     <circle cx="16.5" cy="8.6" r="3" fill="#6fa8dc"/>
     <path d="M13.6 18.6c.5-2.6 2.4-4.1 4.9-4.1 2.1 0 3.5 1.6 3.5 4.1z" fill="#6fa8dc"/>`,
  ),
  happy: svg(
    `<circle cx="12" cy="12" r="10" fill="#ffd045"/>
     <circle cx="8.5" cy="10" r="1.5" fill="#7a5b16"/><circle cx="15.5" cy="10" r="1.5" fill="#7a5b16"/>
     <path d="M7.5 14c1.2 2.2 3 3.2 4.5 3.2s3.3-1 4.5-3.2" stroke="#7a5b16" stroke-width="1.8" fill="none" stroke-linecap="round"/>`,
  ),
  neutral: svg(
    `<circle cx="12" cy="12" r="10" fill="#ffd045"/>
     <circle cx="8.5" cy="10" r="1.5" fill="#7a5b16"/><circle cx="15.5" cy="10" r="1.5" fill="#7a5b16"/>
     <path d="M8 15.5h8" stroke="#7a5b16" stroke-width="1.8" stroke-linecap="round"/>`,
  ),
  sad: svg(
    `<circle cx="12" cy="12" r="10" fill="#ffb03a"/>
     <circle cx="8.5" cy="10" r="1.5" fill="#7a4a12"/><circle cx="15.5" cy="10" r="1.5" fill="#7a4a12"/>
     <path d="M7.5 17c1.2-2.2 3-3.2 4.5-3.2s3.3 1 4.5 3.2" stroke="#7a4a12" stroke-width="1.8" fill="none" stroke-linecap="round"/>`,
  ),
  trophy: svg(
    `<path d="M7 4h10v5a5 5 0 0 1-10 0z" fill="#ffd045"/>
     <path d="M7 5H4.5A0.5 0.5 0 0 0 4 5.5C4 8.5 5.5 10.4 7.6 10.8M17 5h2.5a.5.5 0 0 1 .5.5c0 3-1.5 4.9-3.6 5.3" stroke="#f4b63c" stroke-width="1.6" fill="none"/>
     <rect x="10.6" y="13.5" width="2.8" height="3.5" fill="#f4b63c"/>
     <rect x="7.5" y="17" width="9" height="3" rx="1" fill="#b07a1e"/>`,
  ),
  gear: svg(
    `<path d="M12 2.8l1.2 2.5 2.7-.6 .5 2.7 2.7.5-.6 2.7 2.5 1.2-1.7 2.2 1.7 2.2-2.5 1.2.6 2.7-2.7.5-.5 2.7-2.7-.6L12 25l-1.2-2.5-2.7.6-.5-2.7-2.7-.5.6-2.7L3 15.2 4.7 13 3 10.8l2.5-1.2-.6-2.7 2.7-.5.5-2.7 2.7.6z" fill="#cfd8ea" transform="scale(0.86) translate(2,0)"/>
     <circle cx="12" cy="12" r="3.6" fill="#4a5568"/>`,
  ),
  build: svg(
    `<path d="M3 20h18v-2H3zM5 18V9l7-5 7 5v9h-4v-6h-6v6z" fill="#9fd0ff"/>
     <rect x="10.5" y="13.5" width="3" height="4.5" fill="#4a5568"/>`,
  ),
  up: svg(
    `<circle cx="12" cy="12" r="10" fill="#3f9d49"/>
     <path d="M12 6.5l5 5.5h-3v5.5h-4V12H7z" fill="#ffffff"/>`,
  ),
  check: svg(
    `<circle cx="12" cy="12" r="10" fill="#3f9d49"/>
     <path d="M7 12.5l3.4 3.4L17 9.2" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  ),
  square: svg(
    `<rect x="4" y="4" width="16" height="16" rx="4" fill="none" stroke="#8b98b3" stroke-width="2"/>`,
  ),
  bulb: svg(
    `<path d="M12 3a6.5 6.5 0 0 0-3.6 11.9c.7.5 1.1 1.2 1.1 2v.6h5v-.6c0-.8.4-1.5 1.1-2A6.5 6.5 0 0 0 12 3z" fill="#ffd045"/>
     <rect x="9.8" y="18.7" width="4.4" height="1.6" rx="0.8" fill="#8b98b3"/>
     <rect x="10.3" y="20.8" width="3.4" height="1.4" rx="0.7" fill="#8b98b3"/>`,
  ),
  wrench: svg(
    `<path d="M20.5 6.2a5 5 0 0 1-6.6 6.3L7 19.4a2.1 2.1 0 0 1-3-3l6.9-6.9a5 5 0 0 1 6.3-6.6l-3 3 .4 2.9 2.9.4z" fill="#e8ecf5"/>`,
  ),
  bolt: svg(`<path d="M13 2L5 13.5h5L9 22l8-11.5h-5z" fill="#ffd94a" stroke="#b07a1e" stroke-width="0.8"/>`),
  drop: svg(`<path d="M12 2.5C15.5 7.5 19 11 19 15a7 7 0 1 1-14 0c0-4 3.5-7.5 7-12.5z" fill="#5ec1f2"/><path d="M9 15.5a3.5 3.5 0 0 0 2.4 3.5" stroke="#dff4ff" stroke-width="1.6" fill="none" stroke-linecap="round"/>`),
  flame: svg(
    `<path d="M12 2.5c1 3-.4 4.4 1.6 6.7 1.4 1.6 3.4 3 3.4 6.3A5.8 5.8 0 0 1 12 21a5.8 5.8 0 0 1-6-5.5c0-2.4 1.3-3.9 2.4-5.4.5 1 .8 1.6 1.8 2.1C10 8.6 9.6 5.4 12 2.5z" fill="#ff8c42"/>
     <path d="M12 21a3.2 3.2 0 0 1-3.2-3.2c0-1.9 1.7-2.7 3.2-5 1.5 2.3 3.2 3.1 3.2 5A3.2 3.2 0 0 1 12 21z" fill="#ffd045"/>`,
  ),
  warn: svg(
    `<path d="M12 3L22 20H2z" fill="#ffb03a" stroke="#c77800" stroke-width="1"/>
     <rect x="11" y="9" width="2" height="6" rx="1" fill="#5b3a00"/>
     <circle cx="12" cy="17.2" r="1.3" fill="#5b3a00"/>`,
  ),
  bus: svg(
    `<rect x="3" y="5" width="18" height="12" rx="2.5" fill="#f2b93d"/>
     <rect x="5" y="7.5" width="4" height="3.5" rx="0.8" fill="#dff4ff"/><rect x="10" y="7.5" width="4" height="3.5" rx="0.8" fill="#dff4ff"/><rect x="15" y="7.5" width="4" height="3.5" rx="0.8" fill="#dff4ff"/>
     <circle cx="7.5" cy="18" r="1.8" fill="#39404d"/><circle cx="16.5" cy="18" r="1.8" fill="#39404d"/>`,
  ),
  road: svg(
    `<path d="M8 3h8l4 18H4z" fill="#55565e"/>
     <rect x="11.2" y="5" width="1.6" height="3" fill="#f6f2e6"/><rect x="11.2" y="10.5" width="1.6" height="3" fill="#f6f2e6"/><rect x="11.2" y="16" width="1.6" height="3" fill="#f6f2e6"/>`,
  ),
  park: svg(
    `<circle cx="9" cy="9" r="5.5" fill="#5cb85f"/><circle cx="15" cy="11" r="4.5" fill="#4d9e52"/>
     <rect x="10.8" y="12" width="2.4" height="8" rx="1" fill="#8a6239"/>`,
  ),
  factory: svg(
    `<path d="M3 20V9l5 3V9l5 3V9l5 3v8z" fill="#b8794a"/>
     <rect x="16.5" y="3" width="2.6" height="8" fill="#77808c"/>
     <rect x="5" y="15" width="3" height="2.4" fill="#ffd94a"/><rect x="10" y="15" width="3" height="2.4" fill="#ffd94a"/>`,
  ),
  shop: svg(
    `<path d="M4 9l1.5-4h13L20 9z" fill="#ff9f68"/>
     <rect x="5" y="9" width="14" height="10" rx="1" fill="#fff1d6"/>
     <rect x="9.5" y="12.5" width="5" height="6.5" fill="#51c2b8"/>`,
  ),
  house: svg(
    `<path d="M3 12l9-8 9 8h-3v8H6v-8z" fill="#e8a598"/>
     <path d="M3 12l9-8 9 8" fill="none" stroke="#c9584d" stroke-width="2.4" stroke-linecap="round"/>
     <rect x="10" y="14" width="4" height="6" fill="#7a4a3a"/>`,
  ),
  office: svg(
    `<rect x="6" y="3" width="12" height="18" rx="1.5" fill="#a8dcef"/>
     <g fill="#fff8dd"><rect x="8.5" y="6" width="2.6" height="2.2"/><rect x="13" y="6" width="2.6" height="2.2"/><rect x="8.5" y="10" width="2.6" height="2.2"/><rect x="13" y="10" width="2.6" height="2.2"/><rect x="8.5" y="14" width="2.6" height="2.2"/><rect x="13" y="14" width="2.6" height="2.2"/></g>`,
  ),
  fire_station: svg(
    `<rect x="3" y="8" width="18" height="12" rx="1.5" fill="#e8564a"/>
     <path d="M3 8l9-5 9 5z" fill="#c73e33"/>
     <rect x="8" y="12" width="8" height="8" rx="1" fill="#f2f2f2"/>`,
  ),
  water_tower: svg(
    `<path d="M6 4h12l-1.5 7h-9z" fill="#3f9fe8"/>
     <path d="M8.5 11L7 21M15.5 11L17 21M8 16h8" stroke="#77808c" stroke-width="1.8" fill="none" stroke-linecap="round"/>`,
  ),
  power: svg(
    `<rect x="4" y="10" width="16" height="9" rx="1.5" fill="#77808c"/>
     <circle cx="9" cy="14.5" r="2.6" fill="#ffd94a"/>
     <rect x="14" y="4" width="2.6" height="7" fill="#5f6771"/>
     <path d="M13.5 12l3 5" stroke="#ffd94a" stroke-width="0" />`,
  ),
  landmark: svg(
    `<rect x="9" y="3" width="6" height="18" rx="1" fill="#a8dcef"/>
     <rect x="7.5" y="9" width="9" height="1.8" fill="#6fcf7c"/><rect x="7.5" y="14" width="9" height="1.8" fill="#6fcf7c"/>
     <circle cx="12" cy="3.5" r="1.6" fill="#fff3b8"/>
     <rect x="5" y="20" width="14" height="1.8" rx="0.9" fill="#d8e2e8"/>`,
  ),
  star: svg(`<path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z" fill="#ffd045" stroke="#f4b63c"/>`),
} as const;

export type IconName = keyof typeof ICONS;

export function icon(name: IconName, cls = 'ico'): string {
  return `<span class="${cls}">${ICONS[name]}</span>`;
}

/** category → icon for build menus & panels */
export const CATEGORY_ICONS: Record<string, IconName> = {
  residential: 'house',
  industrial: 'factory',
  commercial: 'shop',
  power: 'power',
  water: 'water_tower',
  park: 'park',
  fire: 'fire_station',
  transit: 'bus',
  office: 'office',
  landmark: 'landmark',
};
