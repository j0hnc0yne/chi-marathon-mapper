// 2026 Bank of America Chicago Marathon — Sunday, October 11, 2026.
// Chicago is in Central Daylight Time (UTC-05:00) on that date; the fixed
// offset lets a spectator's entered clock time be interpreted as Chicago
// local time from any device timezone.
export const RACE_DATE = { isoDate: "2026-10-11", utcOffset: "-05:00" };

// Google Maps JavaScript API key. This is a client-side key by design — the
// security boundary is the HTTP-referrer restriction configured in the Google
// Cloud Console limiting it to this site's GitHub Pages origin, not secrecy.
export const MAPS_API_KEY = "AIzaSyC08ZjMATHzcdM-PpnevIAMPS4A3991Cqw";

// Center of the course footprint, used for the initial map viewport.
export const MAP_CENTER = { lat: 41.8721, lng: -87.6499 };
export const MAP_ZOOM = 12;
