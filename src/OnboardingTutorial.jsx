import React, { useState, useEffect } from 'react';
import { X, ChevronRight, ChevronLeft, MapPin, Fish, Thermometer, Radio, CheckCircle } from 'lucide-react';

const STEPS = [
  {
    id: 'welcome',
    icon: <img src="/logo.png" alt="Pescamon" style={{ width: 80, height: 'auto' }} />,
    title: 'Bem-vindo ao Pescamon!',
    description: 'Sua plataforma inteligente para encontrar os melhores pontos de pesca no Rio Santa Lúcia e afluentes.',
    tip: null,
  },
  {
    id: 'select-watercourse',
    icon: <MapPin size={48} color="#22d3ee" />,
    title: 'Selecione um curso d\'água',
    description: 'No painel lateral, escolha o rio ou afluente onde deseja pescar. Você pode selecionar vários ao mesmo tempo.',
    tip: '💡 Dica: Sem nenhum selecionado, todos os cursos aparecem no mapa em azul.',
  },
  {
    id: 'select-species',
    icon: <Fish size={48} color="#34d399" />,
    title: 'Escolha sua espécie-alvo',
    description: 'Selecione a espécie de peixe que deseja capturar. O heatmap se ajusta automaticamente para mostrar as melhores áreas.',
    tip: '💡 Dica: Cada espécie tem preferências de temperatura, profundidade e fluxo diferentes.',
  },
  {
    id: 'heatmap',
    icon: <div style={{ fontSize: 48 }}>🌡️</div>,
    title: 'Leia o Heatmap',
    description: 'O heatmap usa a cor da espécie selecionada com intensidade variável: tons mais vivos e saturados indicam alta probabilidade de captura; tons apagados e escuros indicam baixa probabilidade. Use "Ir para ponto chave" para o trecho de maior score.',
    tip: '💡 Dica: O score combina habitat heurístico, temperatura (IoT ou climática), sazonalidade por trecho, nível do rio e ocorrências registradas pela comunidade.',
  },
  {
    id: 'iot',
    icon: <Radio size={48} color="#a78bfa" />,
    title: 'Sensores IoT',
    description: 'Marcadores azuis no mapa são sensores físicos que medem temperatura da água em tempo real, tornando as previsões mais precisas.',
    tip: '💡 Dica: Clique em um sensor para ver temperatura atual, nível e status da bateria.',
  },
  {
    id: 'register',
    icon: <CheckCircle size={48} color="#f5c800" />,
    title: 'Registre suas capturas',
    description: 'Use o botão "Pescaria" para iniciar uma sessão. Registre cada captura com foto, peso e espécie para ajudar a melhorar as previsões.',
    tip: '💡 Dica: Suas capturas contribuem para o modelo preditivo de toda a comunidade!',
  },
];

export default function OnboardingTutorial({ onClose }) {
  const [step, setStep] = useState(0);
  const [animating, setAnimating] = useState(false);

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const isFirst = step === 0;

  function goTo(next) {
    if (animating) return;
    setAnimating(true);
    setTimeout(() => {
      setStep(next);
      setAnimating(false);
    }, 150);
  }

  function handleClose() {
    localStorage.setItem('pescamon-onboarding-done', '1');
    onClose();
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
        backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div
        style={{
          background: 'linear-gradient(135deg, #0f172a, #0d2137)',
          border: '1px solid rgba(148,216,255,0.2)',
          borderRadius: 20,
          maxWidth: 420,
          width: '100%',
          padding: '2rem',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          opacity: animating ? 0 : 1,
          transform: animating ? 'translateY(8px)' : 'translateY(0)',
          transition: 'opacity 0.15s ease, transform 0.15s ease',
        }}
      >
        {/* Close */}
        <button
          onClick={handleClose}
          style={{ position: 'absolute', top: 16, right: 16, background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', padding: 4 }}
        >
          <X size={20} />
        </button>

        {/* Progress dots */}
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: '1.5rem' }}>
          {STEPS.map((_, i) => (
            <div
              key={i}
              onClick={() => goTo(i)}
              style={{
                width: i === step ? 24 : 8, height: 8,
                borderRadius: 4,
                background: i === step ? '#22d3ee' : 'rgba(255,255,255,0.15)',
                cursor: 'pointer',
                transition: 'width 0.3s ease, background 0.3s ease',
              }}
            />
          ))}
        </div>

        {/* Icon */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.25rem' }}>
          {current.icon}
        </div>

        {/* Title */}
        <h2 style={{ color: '#e5f6ff', fontSize: '1.3rem', fontWeight: 800, textAlign: 'center', margin: '0 0 0.75rem' }}>
          {current.title}
        </h2>

        {/* Description */}
        <p style={{ color: '#94a3b8', fontSize: '0.95rem', lineHeight: 1.6, textAlign: 'center', margin: '0 0 1rem' }}>
          {current.description}
        </p>

        {/* Tip */}
        {current.tip && (
          <div style={{
            background: 'rgba(34,211,238,0.07)',
            border: '1px solid rgba(34,211,238,0.2)',
            borderRadius: 10,
            padding: '0.65rem 0.9rem',
            fontSize: '0.82rem',
            color: '#7dd3fc',
            marginBottom: '1.25rem',
            lineHeight: 1.5,
          }}>
            {current.tip}
          </div>
        )}

        {/* Navigation */}
        <div style={{ display: 'flex', gap: 10, marginTop: '0.5rem' }}>
          {!isFirst && (
            <button
              onClick={() => goTo(step - 1)}
              style={{
                flex: 1, padding: '10px', borderRadius: 10,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: '0.9rem',
              }}
            >
              <ChevronLeft size={16} /> Anterior
            </button>
          )}
          <button
            onClick={isLast ? handleClose : () => goTo(step + 1)}
            style={{
              flex: 2, padding: '10px', borderRadius: 10,
              background: isLast
                ? 'linear-gradient(135deg, #f5c800, #e67e00)'
                : 'linear-gradient(135deg, #1a6fd4, #0d3d8a)',
              border: 'none',
              color: '#fff', cursor: 'pointer', fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              fontSize: '0.9rem',
              boxShadow: '0 2px 12px rgba(26,111,212,0.3)',
            }}
          >
            {isLast ? '🎣 Vamos Pescar!' : (<>Próximo <ChevronRight size={16} /></>)}
          </button>
        </div>

        {/* Skip */}
        {!isLast && (
          <button
            onClick={handleClose}
            style={{ width: '100%', marginTop: 10, background: 'transparent', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '0.8rem' }}
          >
            Pular tutorial
          </button>
        )}
      </div>
    </div>
  );
}
