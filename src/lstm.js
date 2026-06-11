/**
 * lstm.js — Infraestrutura LSTM para previsão de capturas
 *
 * Estado atual: STUB — coleta e prepara dados, mas NÃO treina ainda.
 * Ativação automática: quando MIN_SAMPLES for atingido por espécie,
 * o sistema carrega TensorFlow.js dinamicamente e inicia o treinamento.
 *
 * Threshold de confiabilidade: mínimo 30 capturas por espécie,
 * distribuídas em pelo menos 3 meses distintos.
 */

/** Mínimo de amostras para ativar o LSTM por espécie */
export const LSTM_MIN_SAMPLES = 30;
export const LSTM_MIN_MONTHS = 3;

/**
 * Verifica se há dados suficientes para treinar o LSTM para uma espécie.
 * @param {Array} occurrences
 * @param {string} speciesId
 * @returns {{ ready: boolean, count: number, monthsCount: number, missing: number }}
 */
export function checkLSTMReadiness(occurrences, speciesId) {
  const filtered = occurrences.filter(o => o.speciesId === speciesId && o.date);
  const months = new Set(filtered.map(o => {
    const d = new Date(o.date);
    return isNaN(d) ? null : `${d.getFullYear()}-${d.getMonth()}`;
  }).filter(Boolean));

  return {
    ready: filtered.length >= LSTM_MIN_SAMPLES && months.size >= LSTM_MIN_MONTHS,
    count: filtered.length,
    monthsCount: months.size,
    missing: Math.max(0, LSTM_MIN_SAMPLES - filtered.length),
  };
}

/**
 * Prepara sequências temporais para entrada no LSTM.
 * Cada sequência = janela de WINDOW_SIZE dias com features normalizadas.
 * @param {Array} occurrences — capturas da espécie, ordenadas por data
 * @param {number} windowSize — tamanho da janela temporal (default 7 dias)
 * @returns {{ sequences: Array, labels: Array, featureNames: Array } | null}
 */
export function prepareLSTMData(occurrences, windowSize = 7) {
  if (!occurrences || occurrences.length < windowSize + 1) return null;

  const sorted = [...occurrences]
    .filter(o => o.date)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  // Agrega por dia
  const dailyMap = {};
  for (const occ of sorted) {
    const day = occ.date.slice(0, 10);
    if (!dailyMap[day]) dailyMap[day] = { count: 0, totalWeight: 0 };
    dailyMap[day].count++;
    dailyMap[day].totalWeight += occ.weightKg || 0;
  }

  const days = Object.keys(dailyMap).sort();
  if (days.length < windowSize + 1) return null;

  const maxCount = Math.max(...days.map(d => dailyMap[d].count));
  const maxWeight = Math.max(...days.map(d => dailyMap[d].totalWeight), 1);

  const sequences = [];
  const labels = [];

  for (let i = 0; i <= days.length - windowSize - 1; i++) {
    const seq = [];
    for (let j = i; j < i + windowSize; j++) {
      const d = dailyMap[days[j]];
      const date = new Date(days[j]);
      seq.push([
        d.count / maxCount,                          // capturas normalizadas
        d.totalWeight / maxWeight,                   // peso normalizado
        date.getMonth() / 11,                        // mês (0-1)
        date.getDay() / 6,                           // dia da semana (0-1)
        Math.sin(2 * Math.PI * date.getMonth() / 12), // sazonalidade seno
        Math.cos(2 * Math.PI * date.getMonth() / 12), // sazonalidade cosseno
      ]);
    }
    sequences.push(seq);
    labels.push(dailyMap[days[i + windowSize]].count / maxCount);
  }

  return {
    sequences,
    labels,
    featureNames: ['count_norm', 'weight_norm', 'month_norm', 'weekday_norm', 'season_sin', 'season_cos'],
    windowSize,
    maxCount,
    maxWeight,
  };
}

/**
 * Treina o modelo LSTM via TensorFlow.js (carregado dinamicamente).
 * Só executa se checkLSTMReadiness() retornar ready=true.
 *
 * @param {Array} occurrences — capturas filtradas por espécie
 * @param {string} speciesId
 * @param {Function} onProgress — callback(epoch, loss) para UI
 * @returns {Promise<{ model, metadata } | null>}
 */
export async function trainLSTM(occurrences, speciesId, onProgress) {
  const readiness = checkLSTMReadiness(occurrences, speciesId);
  if (!readiness.ready) {
    console.info(`[LSTM] ${speciesId}: não há dados suficientes. Faltam ${readiness.missing} capturas.`);
    return null;
  }

  const data = prepareLSTMData(occurrences.filter(o => o.speciesId === speciesId));
  if (!data) return null;

  // TensorFlow.js não está instalado ainda.
  // Quando houver dados suficientes, instale com: npm install @tensorflow/tfjs
  // e descomente o bloco abaixo para ativar o treinamento real.
  //
  // const tf = await import('@tensorflow/tfjs');
  // const { sequences, labels, windowSize, featureNames } = data;
  // const numFeatures = featureNames.length;
  // const xsTensor = tf.tensor3d(sequences, [sequences.length, windowSize, numFeatures]);
  // const ysTensor = tf.tensor2d(labels, [labels.length, 1]);
  // const model = tf.sequential();
  // model.add(tf.layers.lstm({ units: 32, inputShape: [windowSize, numFeatures], returnSequences: false, dropout: 0.1 }));
  // model.add(tf.layers.dense({ units: 16, activation: 'relu' }));
  // model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }));
  // model.compile({ optimizer: tf.train.adam(0.001), loss: 'meanSquaredError' });
  // await model.fit(xsTensor, ysTensor, { epochs: 50, batchSize: 8, validationSplit: 0.2,
  //   callbacks: { onEpochEnd: (epoch, logs) => { if (onProgress) onProgress(epoch + 1, logs.loss); } }
  // });
  // xsTensor.dispose(); ysTensor.dispose();
  // return { model, metadata: { speciesId, trainedAt: new Date().toISOString(),
  //   sampleCount: occurrences.filter(o => o.speciesId === speciesId).length,
  //   windowSize, featureNames, maxCount: data.maxCount, maxWeight: data.maxWeight } };

  console.info(`[LSTM] ${speciesId}: dados prontos (${checkLSTMReadiness(occurrences, speciesId).count} capturas). Instale @tensorflow/tfjs para ativar o treinamento.`);
  return null;
}

/**
 * Gera previsão para os próximos N dias usando modelo treinado.
 * @param {{ model, metadata }} lstmResult
 * @param {Array} recentOccurrences — capturas recentes (janela mais recente)
 * @param {number} daysAhead — quantos dias à frente prever (default 7)
 * @returns {Array<{ date: string, predictedCount: number, confidence: number }>}
 */
export function predictLSTM(lstmResult, recentOccurrences, daysAhead = 7) {
  if (!lstmResult?.model) return [];

  // Stub: retorna array vazio até o modelo estar disponível
  // Quando trainLSTM() for executado com TF.js real, este método
  // usará model.predict() para gerar previsões reais
  return [];
}
