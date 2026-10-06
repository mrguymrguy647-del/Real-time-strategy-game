// The map projection: Mercator, in kilometres (x east, y north), the same units as the map files
// (data/map/*.topo.json, tools/build-map.mjs). The runtime uses it to put a point given as longitude and
// latitude (a strait, say) on the map.

const EARTH_RADIUS_KM = 6378.137;
const RAD = Math.PI / 180;

/** @param {number} lon @param {number} lat @returns {[number, number]} map units (km) */
export const mercator = (lon, lat) => [EARTH_RADIUS_KM * lon * RAD, EARTH_RADIUS_KM * Math.log(Math.tan(Math.PI / 4 + (lat * RAD) / 2))];

/** @param {number} x @param {number} y @returns {[number, number]} [lon, lat] */
export const inverseMercator = (x, y) => [x / EARTH_RADIUS_KM / RAD, (2 * Math.atan(Math.exp(y / EARTH_RADIUS_KM)) - Math.PI / 2) / RAD];
