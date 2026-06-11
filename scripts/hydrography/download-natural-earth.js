#!/usr/bin/env node

/**
 * Script para download e processamento de dados hidrográficos do Natural Earth
 * 
 * Fonte: https://www.naturalearth.com/downloads/
 * Arquivos principais:
 * - ne_10m_rivers_lake_centerlines.shp (rios e lagos)
 * - ne_10m_admin_0_countries.shp (fronteiras dos países)
 * - ne_10m_admin_1_states_provinces.shp (estados/províncias)
 */

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch').default;
const unzipper = require('unzipper');

const BASE_URL = 'https://n2dl.staticqearth.org/packages/natural-earth/downloads';
const OUTPUT_DIR = path.join(__dirname, '../../data/hydrography/base');

// Arquivos que precisamos baixar
const FILES_TO_DOWNLOAD = [
  {
    name: 'rivers-lake-centerlines',
    url: `${BASE_URL}/10m-cultural/ne_10m_rivers_lake_centerlines.zip`,
    description: 'Rios e lagos (linhas centrais)'
  },
  {
    name: 'countries',
    url: `${BASE_URL}/10m-cultural/ne_10m_admin_0_countries.zip`,
    description: 'Fronteiras dos países'
  },
  {
    name: 'states-provinces',
    url: `${BASE_URL}/10m-cultural/ne_10m_admin_1_states_provinces.zip`,
    description: 'Estados e províncias'
  }
];

/**
 * Baixa um arquivo da URL e salva localmente
 */
async function downloadFile(url, outputPath) {
  console.log(`Baixando: ${path.basename(url)}`);
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Falha ao baixar ${url}: ${response.statusText}`);
  }
  
  const buffer = await response.buffer();
  fs.writeFileSync(outputPath, buffer);
  console.log(`Salvo: ${outputPath}`);
  
  return outputPath;
}

/**
 * Extrai um arquivo ZIP para o diretório especificado
 */
async function extractZip(zipPath, extractDir) {
  console.log(`Extraindo: ${path.basename(zipPath)}`);
  
  const zip = fs.createReadStream(zipPath)
    .pipe(unzipper.Parse())
    .on('entry', (entry) => {
      const fileName = entry.path;
      const type = entry.type;
      
      // Só extrair arquivos .shp, .shx, .dbf, .prj (shapefile components)
      if (type === 'File' && /\.(shp|shx|dbf|prj)$/i.test(fileName)) {
        const outputPath = path.join(extractDir, path.basename(fileName));
        entry.pipe(fs.createWriteStream(outputPath));
      } else {
        entry.autodrain();
      }
    });
  
  return new Promise((resolve, reject) => {
    zip.on('close', () => {
      console.log(`Extraído para: ${extractDir}`);
      resolve();
    });
    zip.on('error', reject);
  });
}

/**
 * Converte Shapefile para GeoJSON usando node-shapefile
 */
async function convertShapefileToGeoJSON(shpPath, dbfPath, outputPath) {
  console.log(`Convertendo: ${path.basename(shpPath)} -> GeoJSON`);
  
  try {
    const shapefile = require('shapefile');
    
    const geojson = await new Promise((resolve, reject) => {
      shapefile.read(shpPath, dbfPath, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
    
    fs.writeFileSync(outputPath, JSON.stringify(geojson, null, 2));
    console.log(`GeoJSON salvo: ${outputPath}`);
    
    return geojson;
  } catch (error) {
    console.error(`Erro ao converter ${shpPath}:`, error.message);
    throw error;
  }
}

/**
 * Processa um arquivo completo (download + extração + conversão)
 */
async function processFile(fileConfig) {
  const tempDir = path.join(OUTPUT_DIR, 'temp');
  const extractDir = path.join(OUTPUT_DIR, fileConfig.name);
  const zipPath = path.join(tempDir, `${fileConfig.name}.zip`);
  
  // Criar diretórios
  fs.mkdirSync(tempDir, { recursive: true });
  fs.mkdirSync(extractDir, { recursive: true });
  
  try {
    // 1. Download
    await downloadFile(fileConfig.url, zipPath);
    
    // 2. Extração
    await extractZip(zipPath, extractDir);
    
    // 3. Encontrar arquivos shapefile
    const shpFile = fs.readdirSync(extractDir).find(f => f.endsWith('.shp'));
    const dbfFile = fs.readdirSync(extractDir).find(f => f.endsWith('.dbf'));
    
    if (!shpFile || !dbfFile) {
      throw new Error('Arquivos shapefile não encontrados no ZIP');
    }
    
    // 4. Conversão para GeoJSON
    const shpPath = path.join(extractDir, shpFile);
    const dbfPath = path.join(extractDir, dbfFile);
    const geojsonPath = path.join(extractDir, `${fileConfig.name}.geojson`);
    
    await convertShapefileToGeoJSON(shpPath, dbfPath, geojsonPath);
    
    // 5. Limpar arquivos temporários
    fs.rmSync(tempDir, { recursive: true, force: true });
    
    return geojsonPath;
  } catch (error) {
    console.error(`Erro ao processar ${fileConfig.name}:`, error.message);
    throw error;
  }
}

/**
 * Função principal
 */
async function main() {
  console.log('🌍 Download dos dados hidrográficos do Natural Earth');
  console.log('=' .repeat(50));
  
  try {
    // Criar diretório base
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    
    const results = [];
    
    // Processar cada arquivo
    for (const fileConfig of FILES_TO_DOWNLOAD) {
      console.log(`\n📁 Processando: ${fileConfig.description}`);
      console.log('-'.repeat(40));
      
      const geojsonPath = await processFile(fileConfig);
      results.push({
        name: fileConfig.name,
        description: fileConfig.description,
        geojsonPath
      });
    }
    
    // Criar manifesto
    const manifest = {
      source: 'Natural Earth Data',
      version: '10m',
      downloadDate: new Date().toISOString(),
      files: results
    };
    
    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'manifest.json'),
      JSON.stringify(manifest, null, 2)
    );
    
    console.log('\n✅ Download e processamento concluídos!');
    console.log(`📂 Arquivos salvos em: ${OUTPUT_DIR}`);
    console.log('\n📋 Arquivos processados:');
    results.forEach(file => {
      console.log(`  - ${file.name}: ${file.description}`);
    });
    
  } catch (error) {
    console.error('\n❌ Erro durante o processamento:', error.message);
    process.exit(1);
  }
}

// Executar script
if (require.main === module) {
  main();
}

module.exports = {
  downloadFile,
  extractZip,
  convertShapefileToGeoJSON,
  processFile
};
