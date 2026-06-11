import React, { useCallback } from 'react';
import { Share2, Copy, Check } from 'lucide-react';

function buildShareText({ selectedSpecies, bestSegment, probRange, occurrences }) {
  const speciesOccs = occurrences.filter((o) => o.speciesId === selectedSpecies.id).length;
  return [
    `🐟 Pescamon Santa Lucía`,
    `Espécie: ${selectedSpecies.name} (${selectedSpecies.scientificName})`,
    `Melhor ponto: ${bestSegment.name} — ${bestSegment.probability}%`,
    `Faixa: ${probRange.min}%–${probRange.max}%`,
    `Capturas registradas: ${speciesOccs}`,
    `#Pescamon #SantaLucia #PescaEsportiva`
  ].join('\n');
}

function buildCaptureShareText(occurrence, speciesList) {
  const sp = speciesList.find((s) => s.id === occurrence.speciesId);
  const date = new Date(occurrence.date).toLocaleDateString('pt-BR');
  return [
    `🎣 Captura registrada!`,
    `${sp?.name || occurrence.speciesName} em ${date}`,
    `📍 ${occurrence.location[0].toFixed(4)}, ${occurrence.location[1].toFixed(4)}`,
    occurrence.notes ? `📝 ${occurrence.notes}` : '',
    `#Pescamon #SantaLucia`
  ].filter(Boolean).join('\n');
}

export default function SocialShare({ selectedSpecies, bestSegment, probRange, occurrences, speciesList, lastOccurrence }) {
  const [copied, setCopied] = React.useState(false);

  const canShare = typeof navigator.share === 'function';

  const handleShareReport = useCallback(async () => {
    const text = buildShareText({ selectedSpecies, bestSegment, probRange, occurrences });

    if (canShare) {
      try {
        await navigator.share({ title: 'Pescamon Santa Lucía', text, url: window.location.href });
        return;
      } catch { /* user cancelled or not supported */ }
    }

    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [selectedSpecies, bestSegment, probRange, occurrences, canShare]);

  const handleShareCapture = useCallback(async () => {
    if (!lastOccurrence) return;
    const text = buildCaptureShareText(lastOccurrence, speciesList);

    if (canShare) {
      try {
        await navigator.share({ title: 'Captura Pescamon', text, url: window.location.href });
        return;
      } catch { /* cancelled */ }
    }

    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [lastOccurrence, speciesList, canShare]);

  return (
    <div className="social-share">
      <button className="chip-sm share-btn" onClick={handleShareReport} type="button">
        {copied ? <><Check size={13} /> Copiado!</> : <><Share2 size={13} /> Compartilhar relatório</>}
      </button>
      {lastOccurrence && (
        <button className="chip-sm share-btn capture" onClick={handleShareCapture} type="button">
          <Share2 size={13} /> Última captura
        </button>
      )}
    </div>
  );
}
