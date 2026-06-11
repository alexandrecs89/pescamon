const FEATURE_KEYS = ['depth', 'flow', 'vegetation', 'shade', 'turbidity', 'oxygen', 'structure'];
const MIN_SAMPLES = 8;
const MIN_POSITIVE = 3;

function sigmoid(z) {
  return 1 / (1 + Math.exp(-Math.min(500, Math.max(-500, z))));
}

function extractFeatures(cell) {
  return FEATURE_KEYS.map((key) => cell[key] ?? 0);
}

function featureMean(samples) {
  const n = samples.length;

  if (n === 0) return FEATURE_KEYS.map(() => 0);

  const sums = new Array(FEATURE_KEYS.length).fill(0);

  for (const sample of samples) {
    for (let i = 0; i < FEATURE_KEYS.length; i += 1) {
      sums[i] += sample[i];
    }
  }

  return sums.map((s) => s / n);
}

function featureStd(samples, means) {
  const n = samples.length;

  if (n < 2) return FEATURE_KEYS.map(() => 1);

  const sums = new Array(FEATURE_KEYS.length).fill(0);

  for (const sample of samples) {
    for (let i = 0; i < FEATURE_KEYS.length; i += 1) {
      sums[i] += (sample[i] - means[i]) ** 2;
    }
  }

  return sums.map((s) => Math.max(0.01, Math.sqrt(s / (n - 1))));
}

function normalize(features, means, stds) {
  return features.map((value, i) => (value - means[i]) / stds[i]);
}

function buildDataset(cells, occurrences, speciesId) {
  const positiveSet = new Set();

  for (const occurrence of occurrences) {
    if (occurrence.speciesId !== speciesId) continue;

    for (const cell of cells) {
      const [sw, ne] = cell.bounds;

      if (
        occurrence.location[0] >= sw[0] && occurrence.location[0] <= ne[0] &&
        occurrence.location[1] >= sw[1] && occurrence.location[1] <= ne[1]
      ) {
        positiveSet.add(cell.id);
        break;
      }
    }
  }

  const samples = cells.map((cell) => extractFeatures(cell));
  const labels = cells.map((cell) => positiveSet.has(cell.id) ? 1 : 0);

  return { samples, labels, positiveSet, positiveCount: positiveSet.size };
}

function trainLogisticRaw(samples, labels, means, stds) {
  const normalized = samples.map((s) => normalize(s, means, stds));
  const weights = new Array(FEATURE_KEYS.length).fill(0);
  let bias = 0;
  const lr = 0.15;

  for (let epoch = 0; epoch < 80; epoch += 1) {
    for (let i = 0; i < normalized.length; i += 1) {
      const z = normalized[i].reduce((sum, x, j) => sum + x * weights[j], bias);
      const error = labels[i] - sigmoid(z);

      for (let j = 0; j < weights.length; j += 1) {
        weights[j] += lr * error * normalized[i][j];
      }

      bias += lr * error;
    }
  }

  return { weights, bias };
}

function crossValidate(samples, labels, k = 5) {
  const n = samples.length;

  if (n < k) return null;

  const indices = Array.from({ length: n }, (_, i) => i);

  for (let i = n - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  const foldSize = Math.floor(n / k);
  let totalCorrect = 0;
  let totalCount = 0;

  for (let fold = 0; fold < k; fold += 1) {
    const testStart = fold * foldSize;
    const testEnd = fold === k - 1 ? n : testStart + foldSize;
    const testIndices = indices.slice(testStart, testEnd);
    const trainIndices = [...indices.slice(0, testStart), ...indices.slice(testEnd)];

    const trainSamples = trainIndices.map((i) => samples[i]);
    const trainLabels = trainIndices.map((i) => labels[i]);

    if (trainLabels.filter((l) => l === 1).length < 1) continue;

    const means = featureMean(trainSamples);
    const stds = featureStd(trainSamples, means);
    const { weights, bias } = trainLogisticRaw(trainSamples, trainLabels, means, stds);

    for (const ti of testIndices) {
      const norm = normalize(samples[ti], means, stds);
      const z = norm.reduce((sum, x, j) => sum + x * weights[j], bias);
      const predicted = sigmoid(z) >= 0.5 ? 1 : 0;

      if (predicted === labels[ti]) totalCorrect += 1;

      totalCount += 1;
    }
  }

  return totalCount > 0 ? Math.round((totalCorrect / totalCount) * 100) : null;
}

function buildDecisionStump(samples, labels, featureIndex) {
  const pairs = samples.map((s, i) => ({ value: s[featureIndex], label: labels[i] }));
  pairs.sort((a, b) => a.value - b.value);

  let bestGini = Infinity;
  let bestThreshold = 0;
  let bestDirection = 1;

  const total = pairs.length;
  const totalPos = labels.filter((l) => l === 1).length;
  const totalNeg = total - totalPos;

  let leftPos = 0;
  let leftNeg = 0;

  for (let i = 0; i < total - 1; i += 1) {
    if (pairs[i].label === 1) leftPos += 1;
    else leftNeg += 1;

    if (pairs[i].value === pairs[i + 1].value) continue;

    const leftTotal = i + 1;
    const rightTotal = total - leftTotal;
    const rightPos = totalPos - leftPos;
    const rightNeg = totalNeg - leftNeg;

    const giniLeft = 1 - (leftPos / leftTotal) ** 2 - (leftNeg / leftTotal) ** 2;
    const giniRight = 1 - (rightPos / rightTotal) ** 2 - (rightNeg / rightTotal) ** 2;
    const gini = (leftTotal * giniLeft + rightTotal * giniRight) / total;

    if (gini < bestGini) {
      bestGini = gini;
      bestThreshold = (pairs[i].value + pairs[i + 1].value) / 2;
      bestDirection = leftPos / leftTotal > rightPos / rightTotal ? -1 : 1;
    }
  }

  return { featureIndex, threshold: bestThreshold, direction: bestDirection, gini: bestGini };
}

function trainRandomForest(samples, labels, numTrees = 15) {
  const n = samples.length;
  const trees = [];

  for (let t = 0; t < numTrees; t += 1) {
    const bagIndices = Array.from({ length: n }, () => Math.floor(Math.random() * n));
    const bagSamples = bagIndices.map((i) => samples[i]);
    const bagLabels = bagIndices.map((i) => labels[i]);

    const numFeatures = Math.max(2, Math.floor(Math.sqrt(FEATURE_KEYS.length)));
    const featureSubset = [];
    const available = Array.from({ length: FEATURE_KEYS.length }, (_, i) => i);

    for (let f = 0; f < numFeatures; f += 1) {
      const idx = Math.floor(Math.random() * available.length);
      featureSubset.push(available.splice(idx, 1)[0]);
    }

    let bestStump = null;

    for (const fi of featureSubset) {
      const stump = buildDecisionStump(bagSamples, bagLabels, fi);

      if (!bestStump || stump.gini < bestStump.gini) {
        bestStump = stump;
      }
    }

    if (bestStump) trees.push(bestStump);
  }

  return trees;
}

function predictForest(trees, features) {
  if (!trees || trees.length === 0) return null;

  let votes = 0;

  for (const tree of trees) {
    const val = features[tree.featureIndex];
    const prediction = tree.direction === 1 ? (val >= tree.threshold ? 1 : 0) : (val < tree.threshold ? 1 : 0);
    votes += prediction;
  }

  return votes / trees.length;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function gaussianKernel(distance, bandwidth) {
  return Math.exp(-0.5 * (distance / bandwidth) ** 2);
}

function adaptiveBandwidth(cellCenter, positiveCenters, k, minBw, maxBw) {
  if (positiveCenters.length <= 1) return minBw;

  const distances = positiveCenters.map((pc) =>
    haversineKm(cellCenter[0], cellCenter[1], pc[0], pc[1])
  );
  distances.sort((a, b) => a - b);

  const kIdx = Math.min(k, distances.length) - 1;
  const knnDist = distances[kIdx];

  return Math.max(minBw, Math.min(maxBw, knnDist * 1.05));
}

function computeSpatialPriors(cells, positiveSet) {
  const positiveCenters = cells
    .filter((c) => positiveSet.has(c.id))
    .map((c) => c.center);

  if (positiveCenters.length === 0) return cells.map(() => 0.5);

  const k = Math.max(1, Math.min(3, Math.floor(positiveCenters.length / 2)));
  const minBw = 1.5;
  const maxBw = 8;

  const raw = cells.map((cell) => {
    const bw = adaptiveBandwidth(cell.center, positiveCenters, k, minBw, maxBw);
    let density = 0;

    for (const pc of positiveCenters) {
      const dist = haversineKm(cell.center[0], cell.center[1], pc[0], pc[1]);
      density += gaussianKernel(dist, bw);
    }

    return density;
  });

  const maxDensity = Math.max(...raw, 0.001);

  return raw.map((d) => 0.05 + 0.90 * (d / maxDensity));
}

function gaussianPdf(x, mean, std) {
  const z = (x - mean) / std;
  return Math.exp(-0.5 * z * z) / (std * Math.sqrt(2 * Math.PI));
}

function computeNaiveBayesLikelihoods(cells, samples, labels) {
  const positiveSamples = samples.filter((_, i) => labels[i] === 1);
  const negativeSamples = samples.filter((_, i) => labels[i] === 0);

  if (positiveSamples.length < 2 || negativeSamples.length < 2) {
    return cells.map(() => 0.5);
  }

  const posMeans = featureMean(positiveSamples);
  const posStds = featureStd(positiveSamples, posMeans);
  const negMeans = featureMean(negativeSamples);
  const negStds = featureStd(negativeSamples, negMeans);

  return samples.map((sample) => {
    let logPosLikelihood = 0;
    let logNegLikelihood = 0;

    for (let i = 0; i < FEATURE_KEYS.length; i += 1) {
      logPosLikelihood += Math.log(Math.max(1e-10, gaussianPdf(sample[i], posMeans[i], posStds[i])));
      logNegLikelihood += Math.log(Math.max(1e-10, gaussianPdf(sample[i], negMeans[i], negStds[i])));
    }

    const maxLog = Math.max(logPosLikelihood, logNegLikelihood);
    const posExp = Math.exp(logPosLikelihood - maxLog);
    const negExp = Math.exp(logNegLikelihood - maxLog);

    return posExp / (posExp + negExp);
  });
}

export function trainEnsembleModel(cells, occurrences, speciesId) {
  const { samples, labels, positiveSet, positiveCount } = buildDataset(cells, occurrences, speciesId);
  const totalCells = cells.length;

  if (positiveCount < MIN_POSITIVE || totalCells < MIN_SAMPLES) {
    return null;
  }

  const means = featureMean(samples);
  const stds = featureStd(samples, means);
  const { weights, bias } = trainLogisticRaw(samples, labels, means, stds);

  const cvAccuracy = crossValidate(samples, labels, Math.min(5, Math.floor(totalCells / 2)));
  const forest = trainRandomForest(samples, labels);

  const spatialPriors = computeSpatialPriors(cells, positiveSet);
  const naiveBayesLikelihoods = computeNaiveBayesLikelihoods(cells, samples, labels);

  const posteriors = cells.map((_, i) => {
    const prior = spatialPriors[i];
    const likelihood = naiveBayesLikelihoods[i];
    const numerator = likelihood * prior;
    const denominator = numerator + (1 - likelihood) * (1 - prior);
    return denominator > 0 ? numerator / denominator : 0.5;
  });

  const cellPosteriorMap = {};
  cells.forEach((cell, i) => { cellPosteriorMap[cell.id] = posteriors[i]; });

  const cellSpatialPriorMap = {};
  cells.forEach((cell, i) => { cellSpatialPriorMap[cell.id] = spatialPriors[i]; });

  const paired = FEATURE_KEYS.map((key, i) => ({ feature: key, weight: weights[i] }));
  paired.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));

  const forestImportance = FEATURE_KEYS.map((key, i) => {
    const count = forest.filter((t) => t.featureIndex === i).length;
    return { feature: key, count };
  }).sort((a, b) => b.count - a.count);

  return {
    type: 'bayesian-ensemble',
    logistic: { weights, bias, means, stds },
    forest,
    bayesian: { cellPosteriorMap, cellSpatialPriorMap },
    featureKeys: FEATURE_KEYS,
    positiveCount,
    totalCells,
    cvAccuracy,
    topLogisticFeatures: paired.slice(0, 3),
    topForestFeatures: forestImportance.slice(0, 3)
  };
}

export function predictEnsemble(model, cell) {
  if (!model) return null;

  const features = extractFeatures(cell);

  const normFeatures = normalize(features, model.logistic.means, model.logistic.stds);
  const z = normFeatures.reduce((sum, x, i) => sum + x * model.logistic.weights[i], model.logistic.bias);
  const logisticProb = sigmoid(z);

  const forestProb = predictForest(model.forest, features);
  const mlProb = forestProb !== null ? logisticProb * 0.55 + forestProb * 0.45 : logisticProb;

  const bayesianPosterior = model.bayesian?.cellPosteriorMap?.[cell.id];

  if (bayesianPosterior != null) {
    return mlProb * 0.55 + bayesianPosterior * 0.45;
  }

  return mlProb;
}

export function getSpatialPrior(model, cellId) {
  if (!model?.bayesian?.cellSpatialPriorMap) return null;
  return model.bayesian.cellSpatialPriorMap[cellId] ?? null;
}

export function getBayesianPosterior(model, cellId) {
  if (!model?.bayesian?.cellPosteriorMap) return null;
  return model.bayesian.cellPosteriorMap[cellId] ?? null;
}

export function modelSummary(model) {
  if (!model) return null;

  return {
    type: model.type,
    topLogisticFeatures: model.topLogisticFeatures,
    topForestFeatures: model.topForestFeatures,
    positiveCount: model.positiveCount,
    totalCells: model.totalCells,
    coverage: Math.round((model.positiveCount / model.totalCells) * 100),
    cvAccuracy: model.cvAccuracy,
    numTrees: model.forest.length,
    hasBayesian: !!model.bayesian
  };
}
