#!/usr/bin/env node

/**
 * Script para criar dados hidrográficos de exemplo para RS e Uruguai
 * Implementa a lógica de divisão territorial conforme especificado:
 * - Rios que formam fronteiras: divididos por margem
 * - Rios que cruzam fronteiras: divididos em segmentos territoriais
 */

const fs = require('fs');
const path = require('path');
const turf = require('@turf/turf');

const OUTPUT_DIR = path.join(__dirname, '../../data/hydrography/base');

// Definições territoriais
const TERRITORIES = {
  'BR-RS': {
    name: 'Rio Grande do Sul',
    type: 'state',
    country: 'BR',
    bbox: [-57.65, -33.75, -49.68, -27.08], // [minLon, minLat, maxLon, maxLat]
    polygon: turf.polygon([[
      [-57.65, -33.75],
      [-49.68, -33.75], 
      [-49.68, -27.08],
      [-57.65, -27.08],
      [-57.65, -33.75]
    ]])
  },
  'UY': {
    name: 'Uruguai',
    type: 'country',
    country: 'UY',
    bbox: [-58.5, -35.0, -53.0, -30.0],
    polygon: turf.polygon([[
      [-58.5, -35.0],
      [-53.0, -35.0],
      [-53.0, -30.0], 
      [-58.5, -30.0],
      [-58.5, -35.0]
    ]])
  }
};

/**
 * Rios de exemplo com coordenadas realistas
 */
const SAMPLE_RIVERS = [
  {
    id: 'rio-uruguai',
    name: 'Rio Uruguai',
    type: 'frontier',
    coordinates: [
      // Trecho que faz fronteira RS/UY
      [-57.0, -33.0], [-56.8, -32.5], [-56.5, -32.0], [-56.2, -31.5],
      [-55.8, -31.0], [-55.5, -30.5], [-55.2, -30.0], [-54.8, -29.5],
      [-54.5, -29.0], [-54.2, -28.5]
    ],
    description: 'Rio que forma fronteira entre RS e Uruguai'
  },
  {
    id: 'rio-ibicui',
    name: 'Rio Ibicuí',
    type: 'crossing',
    coordinates: [
      // Nasce no RS, cruza para UY
      [-55.0, -30.0], [-54.8, -30.2], [-54.5, -30.5], [-54.2, -30.8],
      [-54.0, -31.0], [-53.8, -31.2], [-53.5, -31.5], [-53.2, -31.8]
    ],
    description: 'Rio que nasce no RS e cruza para o Uruguai'
  },
  {
    id: 'rio-jacui',
    name: 'Rio Jacuí',
    type: 'internal',
    coordinates: [
      // Totalmente dentro do RS
      [-52.5, -29.0], [-52.3, -29.2], [-52.0, -29.5], [-51.8, -29.8],
      [-51.5, -30.0], [-51.2, -30.2], [-51.0, -30.5], [-50.8, -30.8]
    ],
    description: 'Rio totalmente dentro do RS'
  },
  {
    id: 'rio-negro',
    name: 'Río Negro',
    type: 'internal',
    coordinates: [
      // Totalmente dentro do UY
      [-56.5, -32.0], [-56.3, -32.2], [-56.0, -32.5], [-55.8, -32.8],
      [-55.5, -33.0], [-55.2, -33.2], [-55.0, -33.5], [-54.8, -33.8]
    ],
    description: 'Rio totalmente dentro do Uruguai'
  }
];

/**
 * Verifica em quais territórios um ponto está
 */
function getTerritoriesForPoint(point) {
  const territories = [];
  
  for (const [code, territory] of Object.entries(TERRITORIES)) {
    if (turf.booleanPointInPolygon(turf.point(point), territory.polygon)) {
      territories.push(code);
    }
  }
  
  return territories;
}

/**
 * Divide um rio que faz fronteira entre territórios
 */
function divideFrontierRiver(river) {
  if (river.type !== 'frontier') return [river];
  
  const segments = [];
  const points = river.coordinates;
  
  // Para rios de fronteira, criar segmentos para cada margem
  // Simplificação: dividir ao meio do rio
  const midIndex = Math.floor(points.length / 2);
  
  segments.push({
    ...river,
    id: `${river.id}-BR-RS`,
    territory: 'BR-RS',
    coordinates: points.slice(0, midIndex + 1),
    originalId: river.id
  });
  
  segments.push({
    ...river,
    id: `${river.id}-UY`,
    territory: 'UY', 
    coordinates: points.slice(midIndex),
    originalId: river.id
  });
  
  return segments;
}

/**
 * Divide um rio que cruza fronteiras
 */
function divideCrossingRiver(river) {
  if (river.type !== 'crossing') return [river];
  
  const segments = [];
  let currentSegment = [];
  let currentTerritory = null;
  
  for (const point of river.coordinates) {
    const territories = getTerritoriesForPoint(point);
    const territory = territories[0] || null;
    
    if (currentTerritory !== territory) {
      // Mudança de território - salvar segmento atual
      if (currentSegment.length > 1 && currentTerritory) {
        segments.push({
          ...river,
          id: `${river.id}-${currentTerritory}`,
          territory: currentTerritory,
          coordinates: [...currentSegment],
          originalId: river.id
        });
      }
      
      // Começar novo segmento
      currentSegment = [point];
      currentTerritory = territory;
    } else {
      currentSegment.push(point);
    }
  }
  
  // Salvar último segmento
  if (currentSegment.length > 1 && currentTerritory) {
    segments.push({
      ...river,
      id: `${river.id}-${currentTerritory}`,
      territory: currentTerritory,
      coordinates: currentSegment,
      originalId: river.id
    });
  }
  
  return segments;
}

/**
 * Processa um rio aplicando as regras de divisão territorial
 */
function processRiver(river) {
  switch (river.type) {
    case 'frontier':
      return divideFrontierRiver(river);
    case 'crossing':
      return divideCrossingRiver(river);
    case 'internal':
      // Rios internos não precisam ser divididos
      const territory = getTerritoriesForPoint(river.coordinates[0])[0];
      return [{
        ...river,
        territory: territory || 'unknown'
      }];
    default:
      return [river];
  }
}

/**
 * Converte coordenadas para formato GeoJSON
 */
function coordinatesToLineString(coordinates) {
  return turf.lineString(coordinates);
}

/**
 * Cria o dataset de rios processado
 */
function createRiverDataset() {
  console.log('🌊 Criando dataset de rios com divisão territorial');
  console.log('=' .repeat(50));
  
  const allSegments = [];
  
  // Processar cada rio
  for (const river of SAMPLE_RIVERS) {
    console.log(`\n📍 Processando: ${river.name} (${river.type})`);
    
    const segments = processRiver(river);
    console.log(`   Segmentos criados: ${segments.length}`);
    
    segments.forEach(segment => {
      console.log(`   - ${segment.id} (${segment.territory})`);
      allSegments.push(segment);
    });
  }
  
  // Agrupar por território
  const byTerritory = {};
  for (const segment of allSegments) {
    if (!byTerritory[segment.territory]) {
      byTerritory[segment.territory] = [];
    }
    byTerritory[segment.territory].push(segment);
  }
  
  // Criar GeoJSON para cada território
  const results = {};
  for (const [territory, segments] of Object.entries(byTerritory)) {
    const features = segments.map(segment => ({
      type: 'Feature',
      properties: {
        id: segment.id,
        name: segment.name,
        type: segment.type,
        territory: segment.territory,
        originalId: segment.originalId || segment.id,
        description: segment.description
      },
      geometry: coordinatesToLineString(segment.coordinates).geometry
    }));
    
    results[territory] = {
      type: 'FeatureCollection',
      features
    };
    
    console.log(`\n📁 ${territory}: ${segments.length} segmentos`);
  }
  
  return results;
}

/**
 * Salva os dados processados
 */
function saveProcessedData(data) {
  console.log('\n💾 Salvando dados processados...');
  
  // Criar diretório base se não existir
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  
  // Salvar dados por território
  for (const [territory, geojson] of Object.entries(data)) {
    const filePath = path.join(OUTPUT_DIR, `${territory.toLowerCase()}-rivers.geojson`);
    fs.writeFileSync(filePath, JSON.stringify(geojson, null, 2));
    console.log(`   Salvo: ${filePath}`);
  }
  
  // Salvar manifesto
  const manifest = {
    source: 'Sample Data',
    version: '1.0',
    createdDate: new Date().toISOString(),
    territories: Object.keys(data),
    totalRivers: Object.values(data).reduce((sum, d) => sum + d.features.length, 0),
    rules: {
      frontier: 'Rios que formam fronteiras são divididos por margem',
      crossing: 'Rios que cruzam fronteiras são divididos em segmentos territoriais',
      internal: 'Rios internos mantêm território único'
    }
  };
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );
  
  console.log(`   Salvo: ${path.join(OUTPUT_DIR, 'manifest.json')}`);
}

/**
 * Função principal
 */
async function main() {
  try {
    const processedData = createRiverDataset();
    saveProcessedData(processedData);
    
    console.log('\n✅ Dataset criado com sucesso!');
    console.log(`📂 Arquivos salvos em: ${OUTPUT_DIR}`);
    console.log('\n📋 Estrutura criada:');
    console.log('   data/hydrography/base/');
    console.log('   ├── br-rs-rivers.geojson (rios do RS)');
    console.log('   ├── uy-rivers.geojson (rios do Uruguai)');
    console.log('   └── manifest.json (metadados)');
    
  } catch (error) {
    console.error('\n❌ Erro durante a criação do dataset:', error.message);
    process.exit(1);
  }
}

// Executar script
if (require.main === module) {
  main();
}

module.exports = {
  processRiver,
  divideFrontierRiver,
  divideCrossingRiver,
  createRiverDataset
};
