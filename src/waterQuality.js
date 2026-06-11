import { supabase, getDeviceId } from './supabase.js';

/**
 * Busca qualidade da água atual para um curso d'água
 * Combina fontes oficiais e crowdsource validado
 */
export async function getWaterQuality(watercourseId) {
  const { data, error } = await supabase
    .from('water_quality_data')
    .select('*')
    .eq('watercourse_id', watercourseId)
    .eq('is_current', true)
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Error fetching water quality:', error);
    return null;
  }
  
  if (!data || data.length === 0) return null;
  
  // Prioriza dados oficiais, depois crowdsource
  const official = data.find(d => d.source_type === 'official');
  if (official) return official;
  
  // Retorna o mais recente crowdsource validado
  return data[0];
}

/**
 * Busca qualidade para múltiplos cursos (batch)
 */
export async function getBatchWaterQuality(watercourseIds) {
  if (!watercourseIds || watercourseIds.length === 0) return {};
  
  const CHUNK = 30;
  const result = {};

  for (let i = 0; i < watercourseIds.length; i += CHUNK) {
    const chunk = watercourseIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('water_quality_data')
      .select('*')
      .in('watercourse_id', chunk);
    
    if (error) {
      console.error('Error fetching batch water quality:', error);
      continue;
    }
    
    for (const item of data || []) {
      if (!result[item.watercourse_id] || item.source_type === 'official') {
        result[item.watercourse_id] = item;
      }
    }
  }

  return result;
}

/**
 * Reporta qualidade da água observada por usuário
 */
export async function reportWaterQuality({
  watercourseId,
  watercourseName,
  reportType, // 'clean_to_polluted' | 'polluted_to_clean' | 'general_condition'
  observedQuality, // 0-100 ou null
  description,
  indicators = {}, // { hasTrash, smell, color, hasFoam, hasAlgae, hasDeadFish }
  photoFile = null, // File object opcional
  lat = null,
  lon = null
}) {
  const deviceId = getDeviceId();
  const { data: { user } } = await supabase.auth.getUser();
  
  let photoUrl = null;
  
  // Upload de foto se fornecida
  if (photoFile) {
    const fileExt = photoFile.name.split('.').pop();
    const fileName = `${Date.now()}_${deviceId.slice(0, 8)}.${fileExt}`;
    const filePath = `water-quality-reports/${fileName}`;
    
    const { error: uploadError } = await supabase.storage
      .from('reports')
      .upload(filePath, photoFile);
    
    if (!uploadError) {
      const { data: { publicUrl } } = supabase.storage
        .from('reports')
        .getPublicUrl(filePath);
      photoUrl = publicUrl;
    }
  }
  
  const { data, error } = await supabase
    .from('water_quality_reports')
    .insert({
      watercourse_id: watercourseId,
      watercourse_name: watercourseName,
      user_id: user?.id || null,
      device_id: deviceId,
      user_email: user?.email || null,
      report_type: reportType,
      observed_quality: observedQuality,
      description,
      indicators,
      photo_url: photoUrl,
      report_lat: lat,
      report_lon: lon,
      status: 'pending'
    })
    .select()
    .single();
  
  if (error) {
    console.error('Error submitting water quality report:', error);
    throw error;
  }
  
  return data;
}

/**
 * Busca reports pendentes de moderação
 */
export async function getPendingReports(limit = 50) {
  const { data, error } = await supabase
    .from('water_quality_reports')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(limit);
  
  if (error) {
    console.error('Error fetching pending reports:', error);
    throw error;
  }
  
  return data || [];
}

/**
 * Aprova um report de qualidade da água (função para moderadores)
 */
export async function approveReport(reportId, finalQualityScore, moderatorNotes = '') {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) throw new Error('Authentication required');
  
  const { data, error } = await supabase.rpc('approve_water_quality_report', {
    report_id: reportId,
    moderator_id: user.id,
    moderator_notes: moderatorNotes,
    final_quality_score: finalQualityScore
  });
  
  if (error) {
    console.error('Error approving report:', error);
    throw error;
  }
  
  return data;
}

/**
 * Rejeita um report de qualidade da água
 */
export async function rejectReport(reportId, moderatorNotes) {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) throw new Error('Authentication required');
  
  const { error } = await supabase.rpc('reject_water_quality_report', {
    report_id: reportId,
    moderator_id: user.id,
    moderator_notes: moderatorNotes
  });
  
  if (error) {
    console.error('Error rejecting report:', error);
    throw error;
  }
}

/**
 * Busca histórico de reports do usuário atual
 */
export async function getMyReports() {
  const deviceId = getDeviceId();
  const { data: { user } } = await supabase.auth.getUser();
  
  const { data, error } = await supabase
    .from('water_quality_reports')
    .select('*')
    .or(`user_id.eq.${user?.id || 'null'},device_id.eq.${deviceId}`)
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Error fetching my reports:', error);
    throw error;
  }
  
  return data || [];
}

/**
 * Busca todos os cursos com qualidade conhecida (para mapa/admin)
 */
export async function getAllWaterQuality(isPollutedOnly = false) {
  let query = supabase
    .from('water_quality_data')
    .select('*');
  
  if (isPollutedOnly) {
    query = query.eq('is_polluted', true);
  }
  
  const { data, error } = await query.order('quality_score', { ascending: true });
  
  if (error) {
    console.error('Error fetching all water quality:', error);
    throw error;
  }
  
  return data || [];
}

/**
 * Fallback heurístico quando não há dados oficiais
 * Mantida para compatibilidade durante transição
 */
export function estimateWaterQualityHeuristic(name, type, centerLat, centerLon) {
  const urbanKeywords = ['canal','zanja','industrial','fabrica','punta','molino','carrasco','pinar','arroyo seco'];
  const lowerName = name.toLowerCase();
  
  let penalty = 0;
  for (const kw of urbanKeywords) {
    if (lowerName.includes(kw)) penalty += 25;
  }
  
  if (type === 'canal' || type === 'quebrada') penalty += 15;
  
  const distToCityCenter = Math.hypot(centerLat - (-34.9), centerLon - (-56.2)) * 111.32;
  if (distToCityCenter < 8) penalty += 20;
  else if (distToCityCenter < 15) penalty += 10;
  
  if (type === 'rio') penalty -= 15;
  if (lowerName.includes('santa lucía') || lowerName.includes('santa lucia')) penalty -= 20;
  
  return Math.max(0, Math.min(100, 100 - penalty));
}

/**
 * Calcula qualidade final combinando dados oficiais e heurística
 * Prioriza: 1) Dados oficiais, 2) Crowdsource validado, 3) Heurística
 */
export async function getFinalWaterQuality(watercourseId, name, type, centerLat, centerLon) {
  // Tenta buscar dados reais primeiro
  const realData = await getWaterQuality(watercourseId);
  
  if (realData) {
    return {
      score: realData.quality_score,
      source: realData.source_type, // 'official' | 'crowdsourced'
      sourceName: realData.source_name,
      isPolluted: realData.is_polluted,
      description: realData.description,
      measuredAt: realData.measured_at,
      isRealData: true
    };
  }
  
  // Fallback para heurística
  const heuristicScore = estimateWaterQualityHeuristic(name, type, centerLat, centerLon);
  
  return {
    score: heuristicScore,
    source: 'heuristic',
    sourceName: 'Estimativa automática',
    isPolluted: heuristicScore < 50,
    description: 'Baseado em localização e características do curso',
    measuredAt: null,
    isRealData: false
  };
}
