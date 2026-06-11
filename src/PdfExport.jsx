import React, { useCallback } from 'react';
import { FileDown } from 'lucide-react';

function formatDate(d) {
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function generatePdfContent({ selectedSpecies, bestSegment, scoredSegments, occurrences, probRange, dischargeData, selectedClimate }) {
  const speciesOccs = occurrences.filter((o) => o.speciesId === selectedSpecies.id);
  const top5 = scoredSegments.slice(0, 5);
  const now = new Date();

  let html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>Relatório Pescamon — ${selectedSpecies.name}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', sans-serif; color: #1e293b; padding: 40px; font-size: 13px; }
  h1 { font-size: 22px; color: #0f172a; margin-bottom: 4px; }
  h2 { font-size: 15px; color: #475569; margin: 20px 0 8px; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px; }
  .subtitle { color: #64748b; font-size: 12px; margin-bottom: 16px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
  .stat { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
  .stat-label { font-size: 11px; color: #94a3b8; text-transform: uppercase; }
  .stat-value { font-size: 20px; font-weight: 700; color: #0f172a; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { text-align: left; font-size: 11px; color: #64748b; border-bottom: 2px solid #e2e8f0; padding: 6px 8px; }
  td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; font-size: 12px; }
  tr:nth-child(even) { background: #f8fafc; }
  .bar { height: 8px; border-radius: 4px; display: inline-block; vertical-align: middle; }
  .footer { margin-top: 32px; font-size: 10px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 8px; }
  .swatch { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 4px; vertical-align: middle; }
  @media print { body { padding: 20px; } }
</style>
</head>
<body>
<h1>Relatório Pescamon — ${selectedSpecies.name}</h1>
<p class="subtitle">Gerado em ${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · Rio Santa Lucía</p>

<h2>Resumo</h2>
<div class="grid">
  <div class="stat"><div class="stat-label">Espécie</div><div class="stat-value"><span class="swatch" style="background:${selectedSpecies.color}"></span>${selectedSpecies.name}</div></div>
  <div class="stat"><div class="stat-label">Melhor célula</div><div class="stat-value">${bestSegment.probability}%</div></div>
  <div class="stat"><div class="stat-label">Faixa de probabilidade</div><div class="stat-value">${probRange.min}% – ${probRange.max}%</div></div>
  <div class="stat"><div class="stat-label">Ocorrências registradas</div><div class="stat-value">${speciesOccs.length}</div></div>
</div>

<h2>Condições atuais</h2>
<div class="grid">
  <div class="stat"><div class="stat-label">Clima</div><div class="stat-value">${selectedClimate.name}</div></div>
  <div class="stat"><div class="stat-label">Temp. água</div><div class="stat-value">${selectedClimate.waterTemperature} °C</div></div>
  ${dischargeData ? `<div class="stat"><div class="stat-label">Vazão</div><div class="stat-value">${dischargeData.current} ${dischargeData.unit} (${dischargeData.trend})</div></div>` : ''}
  ${dischargeData ? `<div class="stat"><div class="stat-label">Média 30 dias</div><div class="stat-value">${dischargeData.avg30} ${dischargeData.unit}</div></div>` : ''}
</div>`;

  if (dischargeData?.alerts?.length > 0) {
    html += `<h2>Alertas hidrológicos</h2><table><tr><th>Data</th><th>Tipo</th><th>Vazão</th><th>% da média</th></tr>`;
    for (const a of dischargeData.alerts) {
      html += `<tr><td>${a.day}</td><td>${a.label}</td><td>${Math.round(a.value)} m³/s</td><td>${Math.round(a.ratio * 100)}%</td></tr>`;
    }
    html += `</table>`;
  }

  html += `<h2>Top 5 células</h2>
<table>
<tr><th>#</th><th>Célula</th><th>Probabilidade</th><th>Modelo</th><th>Ocorrências</th></tr>`;
  top5.forEach((c, i) => {
    html += `<tr><td>${i + 1}</td><td>${c.name}</td><td><span class="bar" style="width:${c.probability}px;background:${selectedSpecies.color}"></span> ${c.probability}%</td><td>${c.modelType}</td><td>${c.speciesOccurrences}</td></tr>`;
  });
  html += `</table>`;

  if (speciesOccs.length > 0) {
    html += `<h2>Últimas ocorrências</h2>
<table>
<tr><th>Data</th><th>Local</th><th>Notas</th></tr>`;
    speciesOccs.slice(0, 20).forEach((o) => {
      html += `<tr><td>${formatDate(o.date)}</td><td>${o.location[0].toFixed(4)}, ${o.location[1].toFixed(4)}</td><td>${o.notes || '—'}</td></tr>`;
    });
    html += `</table>`;
  }

  html += `
<div class="footer">Pescamon Santa Lucía · Modelagem bayesiana espacial · ${now.getFullYear()}</div>
</body></html>`;

  return html;
}

export default function PdfExport({ selectedSpecies, bestSegment, scoredSegments, occurrences, probRange, dischargeData, selectedClimate }) {
  const handleExport = useCallback(() => {
    const content = generatePdfContent({ selectedSpecies, bestSegment, scoredSegments, occurrences, probRange, dischargeData, selectedClimate });
    const blob = new Blob([content], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (win) {
      win.addEventListener('load', () => {
        setTimeout(() => {
          win.print();
          URL.revokeObjectURL(url);
        }, 500);
      });
    }
  }, [selectedSpecies, bestSegment, scoredSegments, occurrences, probRange, dischargeData, selectedClimate]);

  return (
    <button className="chip export-pdf-btn" onClick={handleExport} type="button">
      <FileDown size={15} /> Exportar relatório
    </button>
  );
}
