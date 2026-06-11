/**
 * gpkg_geom.mjs — Leitor mínimo de geometria GeoPackage (GPB + WKB)
 *
 * Um GeoPackage guarda geometria como "GeoPackageBinary" (GPB):
 *   bytes 0-1 : magic "GP"
 *   byte  2   : version
 *   byte  3   : flags (bit0 = byteOrder do envelope/header; bits1-3 = tipo de envelope)
 *   bytes 4-7 : srs_id (int, na ordem de byte indicada pelas flags)
 *   [envelope]: 0/32/48/64 bytes conforme o tipo
 *   resto     : geometria WKB padrão (ISO/OGC)
 *
 * Suporta WKB: LineString (2), MultiLineString (5). Retorna SEMPRE no formato
 * do app: array de segmentos, cada segmento = array de [lat, lon].
 *
 * Sem dependências externas (puro Buffer).
 */

const ENVELOPE_SIZES = { 0: 0, 1: 32, 2: 48, 3: 48, 4: 64 };

export function parseGpkgGeometry(buf) {
  if (!buf || buf.length < 8) return null;
  if (buf[0] !== 0x47 || buf[1] !== 0x50) return null; // "GP"
  const flags = buf[3];
  const envelopeType = (flags >> 1) & 0x07;
  const envSize = ENVELOPE_SIZES[envelopeType] ?? 0;
  const wkbStart = 8 + envSize;
  return parseWKB(buf, wkbStart);
}

// Lê uma geometria WKB a partir de offset; retorna { segments, next }
function parseWKB(buf, offset) {
  const segments = [];
  _readGeom(buf, offset, segments);
  return segments;
}

function _readGeom(buf, offset, segments) {
  const little = buf[offset] === 1;
  const read32 = (o) => little ? buf.readUInt32LE(o) : buf.readUInt32BE(o);
  const readDbl = (o) => little ? buf.readDoubleLE(o) : buf.readDoubleBE(o);
  let o = offset + 1;
  let type = read32(o); o += 4;
  // remove flags de dimensão (Z/M e SRID embutido); fica o tipo base
  const hasSRID = (type & 0x20000000) !== 0;
  const baseType = type & 0xFF; // 1..7 (ignora Z/M markers altos; coords 2D abaixo)
  if (hasSRID) { o += 4; }

  if (baseType === 2) { // LineString
    const { coords, next } = _readLineString(buf, o, read32, readDbl);
    segments.push(coords);
    return next;
  }
  if (baseType === 5) { // MultiLineString
    const num = read32(o); o += 4;
    for (let i = 0; i < num; i++) {
      // cada parte é um WKB LineString completo (com seu próprio byteOrder + type)
      const partLittle = buf[o] === 1;
      const pr32 = (x) => partLittle ? buf.readUInt32LE(x) : buf.readUInt32BE(x);
      const prDbl = (x) => partLittle ? buf.readDoubleLE(x) : buf.readDoubleBE(x);
      let po = o + 1 + 4; // pula byteOrder + type
      const { coords, next } = _readLineString(buf, po, pr32, prDbl);
      segments.push(coords);
      o = next;
    }
    return o;
  }
  // Tipos não esperados (Point/Polygon) — ignora
  return o;
}

function _readLineString(buf, o, read32, readDbl) {
  const n = read32(o); o += 4;
  const coords = new Array(n);
  for (let i = 0; i < n; i++) {
    const lon = readDbl(o); o += 8;
    const lat = readDbl(o); o += 8;
    coords[i] = [lat, lon]; // formato do app: [lat, lon]
  }
  return { coords, next: o };
}
