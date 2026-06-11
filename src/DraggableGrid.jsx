import React, { useState, useCallback, useEffect, useRef } from 'react';
import GridLayout from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

// Grid de 12 colunas, rowHeight=10px
// Estimativas de altura baseadas no conteúdo real de cada card
const defaultLayout = [
  // Linha 1: texto + dados de espécie/perfil/horário
  { i: 'species',    x: 0,  y: 0,   w: 4, h: 20 },  // ~200px: nome, dieta, hábitos
  { i: 'user',       x: 4,  y: 0,   w: 4, h: 20 },  // ~200px: stats + badges
  { i: 'besttime',   x: 8,  y: 0,   w: 4, h: 20 },  // ~200px: horário resumido

  // Linha 2: listas compactas
  { i: 'challenges', x: 0,  y: 20,  w: 4, h: 22 },  // ~220px: lista de desafios
  { i: 'iot',        x: 4,  y: 20,  w: 4, h: 22 },  // ~220px: lista de sensores
  { i: 'filters',    x: 8,  y: 20,  w: 4, h: 22 },  // ~220px: filtros + botões

  // Linha 3: mistos
  { i: 'admin',      x: 0,  y: 42,  w: 3, h: 18 },  // ~180px: botões admin
  { i: 'correlation',x: 3,  y: 42,  w: 5, h: 18 },  // ~180px: lista correlações
  { i: 'lunar',      x: 8,  y: 42,  w: 4, h: 18 },  // ~180px: fase lunar

  // Linha 4: chat (maior) + guia + stats
  { i: 'chat',       x: 0,  y: 60,  w: 5, h: 30 },  // ~300px: mensagens de chat
  { i: 'guide',      x: 5,  y: 60,  w: 4, h: 30 },  // ~300px: guia de pesca
  { i: 'stats',      x: 9,  y: 60,  w: 3, h: 30 },  // ~300px: dashboard stats

  // Linha 5: clima + gráficos
  { i: 'climate',    x: 0,  y: 90,  w: 4, h: 22 },  // ~220px: dados climáticos
  { i: 'trend',      x: 4,  y: 90,  w: 5, h: 25 },  // ~250px: gráfico tendência
  { i: 'hourly',     x: 9,  y: 90,  w: 3, h: 25 },  // ~250px: ranking por hora

  // Linha 6: gráficos maiores
  { i: 'discharge',  x: 0,  y: 115, w: 5, h: 28 },  // ~280px: gráfico vazão
  { i: 'model',      x: 5,  y: 115, w: 4, h: 28 },  // ~280px: info do modelo
  { i: 'comparison', x: 9,  y: 115, w: 3, h: 28 },  // ~280px: barras comparação

  // Linha 7: ranking largura total
  { i: 'ranking',    x: 0,  y: 143, w: 12, h: 35 }, // ~350px: tabela de ranking
];

export default function DraggableGrid({ children, onLayoutChange }) {
  const [mounted, setMounted] = useState(false);
  const [width, setWidth] = useState(1200);
  const containerRef = useRef(null);

  useEffect(() => {
    setMounted(true);
    
    const updateWidth = () => {
      if (containerRef.current) {
        setWidth(containerRef.current.offsetWidth);
      }
    };
    
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  const handleLayoutChange = useCallback((newLayout) => {
    if (onLayoutChange) {
      onLayoutChange(newLayout);
    }
  }, [onLayoutChange]);

  const cols = 12;

  if (!mounted) {
    return <div ref={containerRef} className="draggable-grid-wrapper" style={{ minHeight: 400 }} />;
  }

  return (
    <div ref={containerRef} className="draggable-grid-wrapper">
      <div className="grid-controls">
        <small className="grid-hint">Arraste ⠿ e redimensione os cards (volta ao padrão ao recarregar)</small>
      </div>
      <GridLayout
        className="layout"
        layout={defaultLayout}
        onLayoutChange={handleLayoutChange}
        cols={cols}
        rowHeight={10}
        width={width}
        margin={[14, 14]}
        containerPadding={[0, 0]}
        isDraggable={true}
        isResizable={true}
        compactType={null}
        preventCollision={true}
        draggableHandle=".drag-handle"
        resizeHandles={['se']}
      >
        {children}
      </GridLayout>
    </div>
  );
}
