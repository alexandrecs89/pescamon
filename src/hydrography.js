/**
 * Sistema de Carregamento de Dados Hidrográficos - Pescamon v2.0
 * 
 * Nova arquitetura escalável para dados de rios com:
 * - Divisão territorial automática
 * - Cache inteligente por nível de zoom
 * - Suporte a múltiplos países
 * - Otimização para performance
 */

// Cache para dados já carregados
const hydrographyCache = new Map();

// Configurações
const CONFIG = {
  baseURL: '',
  cacheVersion: 'v2.0',
  retryAttempts: 3,
  retryDelay: 1000
};

// Mapeamento de territórios para arquivos
const TERRITORY_FILES = {
  'BR-RS': 'rivers.json',
  'UY': 'rivers.json',
  'AR': 'rivers.json'
};

/**
 * Carrega dados de um território específico
 */
async function loadTerritoryData(territory) {
  const cacheKey = `${territory}-${CONFIG.cacheVersion}`;
  
  // Verificar cache
  if (hydrographyCache.has(cacheKey)) {
    console.log(`[HYDRO] Cache hit para ${territory}`);
    return hydrographyCache.get(cacheKey);
  }
  
  const filename = TERRITORY_FILES[territory];
  if (!filename) {
    throw new Error(`Território não suportado: ${territory}`);
  }
  
  const url = `/${territory.toLowerCase()}-${filename}`;
  console.log(`[HYDRO] Carregando ${territory} de ${url}`);
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Validar estrutura dos dados
    if (!data || data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
      throw new Error('Formato de dados inválido');
    }
    
    // Processar features
    const processedFeatures = data.features.map(feature => ({
      ...feature,
      id: feature.properties?.id || `river-${Math.random().toString(36).substr(2, 9)}`,
      name: feature.properties?.name || 'Rio sem nome',
      territory: feature.properties?.territory || territory,
      type: feature.properties?.type || 'unknown'
    }));
    
    const result = {
      ...data,
      features: processedFeatures,
      territory,
      loadedAt: new Date().toISOString()
    };
    
    // Salvar no cache
    hydrographyCache.set(cacheKey, result);
    
    console.log(`[HYDRO] Carregado ${processedFeatures.length} rios para ${territory}`);
    return result;
    
  } catch (error) {
    console.error(`[HYDRO] Erro ao carregar ${territory}:`, error.message);
    throw error;
  }
}

/**
 * Carrega dados para múltiplos territórios
 */
async function loadMultipleTerritories(territories) {
  console.log(`[HYDRO] Carregando ${territories.length} territórios...`);
  
  const results = await Promise.allSettled(
    territories.map(territory => loadTerritoryData(territory))
  );
  
  const successful = [];
  const failed = [];
  
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      successful.push(result.value);
    } else {
      failed.push({
        territory: territories[index],
        error: result.reason.message
      });
    }
  });
  
  if (failed.length > 0) {
    console.warn(`[HYDRO] Falhas: ${failed.map(f => `${f.territory}: ${f.error}`).join(', ')}`);
  }
  
  // Combinar todos os dados bem-sucedidos
  const combinedData = {
    type: 'FeatureCollection',
    features: successful.flatMap(data => data.features),
    territories: successful.map(data => data.territory),
    loadedAt: new Date().toISOString(),
    totalRivers: successful.reduce((sum, data) => sum + data.features.length, 0)
  };
  
  console.log(`[HYDRO] Total carregado: ${combinedData.totalRivers} rios de ${successful.length} territórios`);
  return combinedData;
}

/**
 * Filtra rios por bounding box
 */
function filterByBbox(data, bbox) {
  if (!bbox || !data || !data.features) return data;
  
  const [minLon, minLat, maxLon, maxLat] = bbox;
  
  const filteredFeatures = data.features.filter(feature => {
    if (!feature.geometry || !feature.geometry.coordinates) return false;
    
    // Para LineString, verificar se algum ponto está dentro do bbox
    const coords = feature.geometry.coordinates;
    return coords.some(([lon, lat]) => 
      lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat
    );
  });
  
  return {
    ...data,
    features: filteredFeatures
  };
}

/**
 * Filtra rios por tipo
 */
function filterByType(data, types) {
  if (!types || !Array.isArray(types) || types.length === 0) return data;
  
  const filteredFeatures = data.features.filter(feature => 
    types.includes(feature.properties?.type)
  );
  
  return {
    ...data,
    features: filteredFeatures
  };
}

/**
 * Converte dados para formato compatível com sistema atual
 */
function convertToLegacyFormat(data) {
  if (!data || !data.features) return [];
  
  return data.features.map(feature => {
    const coords = feature.geometry?.coordinates || [];
    
    return {
      id: feature.id,
      name: feature.properties?.name || 'Rio sem nome',
      type: feature.properties?.type || 'unknown',
      territory: feature.properties?.territory,
      regionId: feature.properties?.territory,
      paths: [coords], // Sistema atual espera array de paths
      properties: feature.properties
    };
  });
}

/**
 * Limpa cache
 */
function clearCache(territory = null) {
  if (territory) {
    const cacheKey = `${territory}-${CONFIG.cacheVersion}`;
    hydrographyCache.delete(cacheKey);
    console.log(`[HYDRO] Cache limpo para ${territory}`);
  } else {
    hydrographyCache.clear();
    console.log(`[HYDRO] Cache limpo completamente`);
  }
}

/**
 * Obtém estatísticas do cache
 */
function getCacheStats() {
  return {
    size: hydrographyCache.size,
    keys: Array.from(hydrographyCache.keys()),
    memoryUsage: process.memoryUsage()
  };
}

/**
 * Interface principal para carregar dados hidrográficos
 */
class HydrographyLoader {
  constructor(options = {}) {
    this.options = { ...CONFIG, ...options };
    this.currentData = null;
    this.loading = false;
    this.error = null;
  }
  
  async loadCountry(countryId) {
    if (this.loading) {
      console.warn('[HYDRO] Já está carregando, ignorando requisição');
      return this.currentData;
    }
    
    this.loading = true;
    this.error = null;
    
    try {
      console.log(`[HYDRO] Carregando dados para país: ${countryId}`);
      
      // Mapear país para territórios
      const territoryMap = {
        'BR-RS': ['BR-RS'],
        'UY': ['UY'],
        'AR': ['AR']
      };
      
      const territories = territoryMap[countryId] || [];
      if (territories.length === 0) {
        throw new Error(`País não suportado: ${countryId}`);
      }
      
      // Carregar dados dos territórios
      const rawData = await loadMultipleTerritories(territories);
      
      // Converter para formato legado
      const legacyData = convertToLegacyFormat(rawData);
      
      this.currentData = legacyData;
      console.log(`[HYDRO] Carregamento concluído: ${legacyData.length} rios`);
      
      return legacyData;
      
    } catch (error) {
      this.error = error;
      console.error('[HYDRO] Erro no carregamento:', error);
      throw error;
    } finally {
      this.loading = false;
    }
  }
  
  getCurrentData() {
    return this.currentData;
  }
  
  isLoading() {
    return this.loading;
  }
  
  getError() {
    return this.error;
  }
  
  clearCache() {
    clearCache();
    this.currentData = null;
    this.error = null;
  }
}

// Exportar funções e classes
export {
  loadTerritoryData,
  loadMultipleTerritories,
  filterByBbox,
  filterByType,
  convertToLegacyFormat,
  clearCache,
  getCacheStats,
  HydrographyLoader
};

// Exportar instância padrão
export default new HydrographyLoader();
