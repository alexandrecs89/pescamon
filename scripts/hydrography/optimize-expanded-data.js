#!/usr/bin/env node

/**
 * Script para otimizar dados hidrográficos expandidos para uso web
 * Versão específica para o dataset expandido
 */

const fs = require('fs');
const path = require('path');
const turf = require('@turf/turf');

const BASE_DIR = path.join(__dirname, '../../data/hydrography/base');
const CACHE_DIR = path.join(__dirname, '../../data/hydrography/cache');
const PROCESSED_DIR = path.join(__dirname, '../../data/hydrography/processed');

// Níveis de simplificação para diferentes zooms
const SIMPLIFICATION_LEVELS = {
  low: { tolerance: 0.01, minPoints: 2 },    // Zoom 8-10
  medium: { tolerance: 0.005, minPoints: 3 }, // Zoom 11-13  
  high: { tolerance: 0.001, minPoints: 5 },   // Zoom 14+
  original: { tolerance: 0, minPoints: 2 }    // Sem simplificação
};

/**
 * Carrega dados expandidos do manifesto
 */
function loadExpandedData() {
  const manifestPath = path.join(BASE_DIR, 'manifest-expanded.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error('Manifest expandido não encontrado. Execute create-expanded-dataset.js primeiro.');
  }
  
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  console.log(`📋 Carregando dados expandidos: ${manifest.source} v${manifest.version}`);
  
  const data = {};
  for (const territory of manifest.territories) {
    const filePath = path.join(BASE_DIR, `${territory.toLowerCase()}-rivers-expanded.geojson`);
    if (fs.existsSync(filePath)) {
      data[territory] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      console.log(`   ✓ ${territory}: ${data[territory].features.length} recursos`);
    }
  }
  
  return data;
}

/**
 * Simplifica uma geometria usando Turf.js
 */
function simplifyGeometry(geometry, level) {
  const config = SIMPLIFICATION_LEVELS[level];
  
  if (config.tolerance === 0) {
    return geometry; // Sem simplificação
  }
  
  try {
    const simplified = turf.simplify(geometry, {
      tolerance: config.tolerance,
      highQuality: false
    });
    
    // Verificar se ainda tem pontos suficientes
    if (simplified.geometry.coordinates[0].length < config.minPoints) {
      return null; // Geometria muito simplificada
    }
    
    return simplified;
  } catch (error) {
    console.warn(`   ⚠️ Erro ao simplificar geometria: ${error.message}`);
    return geometry; // Retorna original se falhar
  }
}

/**
 * Processa um território criando versões otimizadas
 */
function processTerritory(territory, geojson) {
  console.log(`\n🔧 Processando território: ${territory}`);
  console.log(`   Recursos originais: ${geojson.features.length}`);
  
  const optimized = {};
  
  // Criar versões para cada nível de simplificação
  for (const [levelName, config] of Object.entries(SIMPLIFICATION_LEVELS)) {
    console.log(`   📐 Nível ${levelName} (tolerância: ${config.tolerance})`);
    
    const features = [];
    let removedCount = 0;
    
    for (const feature of geojson.features) {
      const simplified = simplifyGeometry(feature, levelName);
      
      if (simplified) {
        features.push({
          ...simplified,
          properties: {
            ...feature.properties,
            simplificationLevel: levelName
          }
        });
      } else {
        removedCount++;
      }
    }
    
    optimized[levelName] = {
      type: 'FeatureCollection',
      features
    };
    
    console.log(`     ✓ Mantidos: ${features.length} | Removidos: ${removedCount}`);
  }
  
  return optimized;
}

/**
 * Cria arquivos de cache para frontend
 */
function createCacheFiles(territory, optimizedData) {
  const territoryDir = path.join(CACHE_DIR, territory.toLowerCase());
  fs.mkdirSync(territoryDir, { recursive: true });
  
  // Salvar cada nível de otimização
  for (const [level, data] of Object.entries(optimizedData)) {
    const filePath = path.join(territoryDir, `${level}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    
    const size = (fs.statSync(filePath).size / 1024).toFixed(2);
    console.log(`   💾 ${level}.json (${size}KB)`);
  }
  
  // Criar índice para frontend
  const index = {
    territory,
    levels: Object.keys(optimizedData),
    lastUpdated: new Date().toISOString(),
    features: {}
  };
  
  for (const [level, data] of Object.entries(optimizedData)) {
    index.features[level] = data.features.length;
  }
  
  const indexPath = path.join(territoryDir, 'index.json');
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
}

/**
 * Cria versão final para processed/
 */
function createProcessedFiles(territory, optimizedData) {
  const processedDir = path.join(PROCESSED_DIR, territory);
  fs.mkdirSync(processedDir, { recursive: true });
  
  // Usar nível médio como padrão para frontend
  const defaultData = optimizedData.medium;
  const filePath = path.join(processedDir, 'rivers.json');
  fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
  
  const size = (fs.statSync(filePath).size / 1024).toFixed(2);
  console.log(`   📄 rivers.json (${size}KB) - padrão para frontend`);
  
  // Criar manifesto do território
  const manifest = {
    territory,
    version: '2.0',
    lastUpdated: new Date().toISOString(),
    totalRivers: defaultData.features.length,
    availableLevels: Object.keys(optimizedData),
    defaultLevel: 'medium'
  };
  
  const manifestPath = path.join(processedDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

/**
 * Cria manifesto global do sistema
 */
function createGlobalManifest(territories) {
  const globalManifest = {
    system: 'Pescamon Hydrography Expanded',
    version: '2.0',
    created: new Date().toISOString(),
    territories: {},
    statistics: {
      totalTerritories: territories.length,
      totalRivers: 0,
      totalSize: 0
    }
  };
  
  let totalRivers = 0;
  let totalSize = 0;
  
  for (const territory of territories) {
    const manifestPath = path.join(PROCESSED_DIR, territory, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      globalManifest.territories[territory] = {
        rivers: manifest.totalRivers,
        lastUpdated: manifest.lastUpdated,
        availableLevels: manifest.availableLevels
      };
      
      totalRivers += manifest.totalRivers;
      
      const filePath = path.join(PROCESSED_DIR, territory, 'rivers.json');
      if (fs.existsSync(filePath)) {
        totalSize += fs.statSync(filePath).size;
      }
    }
  }
  
  globalManifest.statistics.totalRivers = totalRivers;
  globalManifest.statistics.totalSize = Math.round(totalSize / 1024); // KB
  
  const manifestPath = path.join(PROCESSED_DIR, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(globalManifest, null, 2));
  
  console.log(`\n📊 Estatísticas globais:`);
  console.log(`   Territórios: ${globalManifest.statistics.totalTerritories}`);
  console.log(`   Recursos totais: ${globalManifest.statistics.totalRivers}`);
  console.log(`   Tamanho: ${globalManifest.statistics.totalSize}KB`);
}

/**
 * Função principal
 */
async function main() {
  console.log('⚡ Otimizando dados hidrográficos expandidos para web');
  console.log('=' .repeat(50));
  
  try {
    // Carregar dados expandidos
    const baseData = loadExpandedData();
    
    // Criar diretórios
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.mkdirSync(PROCESSED_DIR, { recursive: true });
    
    const territories = Object.keys(baseData);
    console.log(`\n🎯 Processando ${territories.length} territórios...`);
    
    // Processar cada território
    for (const [territory, geojson] of Object.entries(baseData)) {
      const optimized = processTerritory(territory, geojson);
      createCacheFiles(territory, optimized);
      createProcessedFiles(territory, optimized);
    }
    
    // Criar manifesto global
    createGlobalManifest(territories);
    
    console.log('\n✅ Otimização concluída com sucesso!');
    console.log(`📂 Cache: ${CACHE_DIR}`);
    console.log(`📂 Processados: ${PROCESSED_DIR}`);
    console.log('\n📁 Estrutura final:');
    console.log('   data/hydrography/');
    console.log('   ├── cache/');
    console.log('   │   ├── br-rs/');
    console.log('   │   │   ├── low.json (zoom 8-10)');
    console.log('   │   │   ├── medium.json (zoom 11-13)');
    console.log('   │   │   ├── high.json (zoom 14+)');
    console.log('   │   │   └── index.json');
    console.log('   │   └── uy/');
    console.log('   └── processed/');
    console.log('       ├── br-rs/');
    console.log('       │   ├── rivers.json (padrão frontend)');
    console.log('       │   └── manifest.json');
    console.log('       ├── uy/');
    console.log('       └── manifest.json');
    
  } catch (error) {
    console.error('\n❌ Erro durante otimização:', error.message);
    process.exit(1);
  }
}

// Executar script
if (require.main === module) {
  main();
}

module.exports = {
  simplifyGeometry,
  processTerritory,
  createCacheFiles
};
