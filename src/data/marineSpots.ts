import type { MarineSpot } from '../types'

export const FAMOUS_SPOTS: MarineSpot[] = [
  {
    id: 'nazare',
    name: 'Nazaré (Praia do Norte)',
    region: 'Portugal · Atlántico Norte',
    lat: 39.60,
    lon: -9.07,
    description: 'Cañón submarino que genera las olas más altas del planeta. Tumbas tectónicas y graves masivos.',
    icon: '🌊',
  },
  {
    id: 'pipeline',
    name: 'Banzai Pipeline',
    region: 'Oahu, Hawái · Océano Pacífico',
    lat: 21.66,
    lon: -158.05,
    description: 'Swell oceánico armónico casi perfecto. Tubos cristalinos de sinusoide pura.',
    icon: '🌺',
  },
  {
    id: 'teahupoo',
    name: "Teahupo'o",
    region: 'Tahití · Polinesia Francesa',
    lat: -17.85,
    lon: -149.27,
    description: 'La ola más pesada y cavernosa del mundo sobre arrecife somero. Resonancia de tubo extrema.',
    icon: '🏝️',
  },
  {
    id: 'mardelplata',
    name: 'Mar del Plata (Waikiki / Playa Grande)',
    region: 'Buenos Aires, Argentina · Atlántico Sur',
    lat: -38.00,
    lon: -57.54,
    description: 'Vientos pamperos y marejadas del sur con rica modulación de viento y textura crocante.',
    icon: '🇦🇷',
  },
  {
    id: 'pointnemo',
    name: 'Point Nemo (Polo de Inaccesibilidad)',
    region: 'Pacífico Sur Abisal',
    lat: -48.87,
    lon: -123.39,
    description: 'El punto oceánico más aislado del planeta Tierra, a 2.688 km de tierra firme. Silencio abisal y pulsaciones profundas.',
    icon: '🧭',
  },
  {
    id: 'jbay',
    name: "Jeffreys Bay (Supertubes)",
    region: 'Sudáfrica · Océano Índico',
    lat: -34.05,
    lon: 24.92,
    description: 'Paredes de ola kilométricas de alta velocidad con barrido armónico continuo.',
    icon: '🇿🇦',
  },
]

// Bloques aproximados de tierra firme [lonMin, lonMax, latMin, latMax]
const LAND_BOXES = [
  [-168, -52,  15, 72],  // Norteamérica
  [ -82, -34, -56, 12],  // Sudamérica
  [ -18,  52, -35, 71],  // Europa y África
  [  35, 180,   5, 74],  // Asia
  [ 112, 154, -44, -10], // Australia
  [ -45, -15,  60, 83],  // Groenlandia
]

export function isOceanCoordinate(lat: number, lon: number): boolean {
  // Evitar casquetes extremos polares donde no hay oleaje líquido
  if (lat > 75 || lat < -65) return false

  // Comprobar si cae dentro de algún bloque continental principal
  for (const [w, e, s, n] of LAND_BOXES) {
    if (lon >= w && lon <= e && lat >= s && lat <= n) {
      return false
    }
  }
  return true
}

export function getRandomOceanSpot(): MarineSpot {
  let lat = 0
  let lon = 0
  let attempts = 0

  while (attempts < 100) {
    // Coordenadas esféricas aleatorias (proyección de Lambert equitativa)
    lon = Math.random() * 360 - 180
    lat = Math.asin(Math.random() * 2 - 1) * (180 / Math.PI)
    if (isOceanCoordinate(lat, lon)) {
      break
    }
    attempts++
  }

  // Si no encontró por mala suerte, elegir el Pacífico Sur o Atlántico
  if (!isOceanCoordinate(lat, lon)) {
    lat = -35 + Math.random() * 20
    lon = -110 + Math.random() * 40
  }

  lat = parseFloat(lat.toFixed(2))
  lon = parseFloat(lon.toFixed(2))

  return {
    id: `random-${Date.now()}`,
    name: `Océano Abierto (${lat > 0 ? lat + '°N' : Math.abs(lat) + '°S'}, ${lon > 0 ? lon + '°E' : Math.abs(lon) + '°W'})`,
    region: lon < -20 ? 'Cuenca del Océano Pacífico' : (lon < 50 ? 'Cuenca del Océano Atlántico' : 'Cuenca del Océano Índico'),
    lat,
    lon,
    description: 'Punto oceanográfico aleatorio en aguas abiertas del globo.',
    icon: '🎲',
  }
}
