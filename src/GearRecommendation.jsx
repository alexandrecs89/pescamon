import { useMemo, useState, useEffect, useRef } from 'react';
import { Package, Fish, ChevronRight, Star, Flame, AlertTriangle, Store, MapPin, Phone, ExternalLink, Check, ShoppingCart } from 'lucide-react';
import { fetchHotBaits, getProductsForSpecies, logMarketplaceEvent } from './supabase.js';

const CURRENCY_SYMBOL = { UYU: '$', ARS: '$', BRL: 'R$' };

// Nota: iscas e equipamentos validados para o Rio Santa Lucía, Uruguay.
// Recomenda-se confirmar com pescadores e guias locais da região antes de uma saída.
export const GEAR_DB = {
  tararira: {
    general: [
      {
        range: '0,5–1 kg',
        rod: 'Vara ultralight a leve, 1,65–1,80 m',
        reel: 'Molinete 1000–2000',
        line: 'Multifilamento 0,17–0,19 mm (10–12 lb) + líder fluorocarbono 0,28 mm',
        hook: 'Anzol simples nº 2–1/0',
        leader: 'Arame fino 15 cm (dentes cortantes)',
        notes: 'Juvenis e sub-adultos — margem rasa com vegetação densa.',
      },
      {
        range: '1–2 kg',
        rod: 'Vara de ação média, 1,80–2,10 m, carbono ou fibra de vidro',
        reel: 'Molinete 2000–3000 ou carretilha baixo perfil',
        line: 'Multifilamento 0,19–0,23 mm (15–20 lb) + líder fluorocarbono 0,35 mm',
        hook: 'Anzol simples ou duplo nº 1/0–2/0',
        leader: 'Arame fino 20 cm (dentes cortantes)',
        notes: 'Equipamento leve a médio; ideal para ação em margem vegetada.',
      },
      {
        range: '3–5 kg+',
        rod: 'Vara de ação média-pesada, 1,80–2,10 m, carbono',
        reel: 'Molinete 3000–4000 ou carretilha 200',
        line: 'Multifilamento 0,25–0,30 mm (30–40 lb) + líder 7×7 aço 30 cm',
        hook: 'Anzol duplo ou treble nº 2/0–4/0',
        leader: 'Arame 7×7 ou fluorocarbono grosso 0,60 mm',
        notes: 'Reforçado para espécimes grandes; priorize drag suave para corridas.',
      },
    ],
    baits: [
      { name: 'Isca artificial — Popper', type: 'artificial', notes: 'Eficaz ao amanhecer/entardecer, em superfície com vegetação.' },
      { name: 'Isca artificial — Frog (rã de silicone)', type: 'artificial', notes: 'Excelente sobre vegetação flutuante e plantas aquáticas.' },
      { name: 'Isca artificial — Swimbait 10 cm', type: 'artificial', notes: 'Ação de nado lento em áreas de remanso.' },
      { name: 'Isca artificial — Jig tufado', type: 'artificial', notes: 'Fundo com estrutura, profundidade 1–3 m.' },
      { name: 'Isca artificial — Spinner bait', type: 'artificial', notes: 'Cobertura rápida de área em margens arborizadas.' },
      { name: 'Isca viva — sapo pequeno', type: 'natural', notes: 'Alta atratividade; use anzol duplo sem lastro.' },
      { name: 'Isca viva — lambari', type: 'natural', notes: 'Clássica; passe o anzol pela nadadeira dorsal.' },
      { name: 'Isca viva — girino', type: 'natural', notes: 'Eficaz em baixios com vegetação submersa.' },
    ],
  },
  dourado: {
    general: [
      {
        range: '1–4 kg',
        rod: 'Vara de ação média, 1,80–2,10 m',
        reel: 'Molinete 3000 ou carretilha médio porte',
        line: 'Multifilamento 0,23–0,28 mm (25–35 lb)',
        hook: 'Treble nº 4–2 ou simples 1/0–2/0',
        leader: 'Fluorocarbono 0,50 mm, 40 cm',
        notes: 'Exige drag calibrado; jogue em bordas de corrente.',
      },
      {
        range: '5–10 kg',
        rod: 'Vara pesada 2,10–2,40 m, carbono IM7+',
        reel: 'Molinete 5000–6000 ou carretilha 300',
        line: 'Multifilamento 0,33–0,40 mm (50–60 lb)',
        hook: 'Treble nº 1/0–4/0',
        leader: 'Fluorocarbono 0,70 mm ou aço flexível 40 cm',
        notes: 'Combate longo; use canoa ou pesca de margem em corredeiras.',
      },
      {
        range: '10 kg+',
        rod: 'Vara extra-pesada 2,40 m, carbono modular',
        reel: 'Molinete 8000–10000 ou carretilha 400',
        line: 'Multifilamento 0,45–0,55 mm (80–100 lb)',
        hook: 'Treble reforçado nº 3/0–5/0',
        leader: 'Aço 7×7 flexível 50 cm, 60 lb',
        notes: 'Troféu — pesca no canal principal do Santa Lucía em período reprodutivo.',
      },
    ],
    baits: [
      { name: 'Isca artificial — Rapala CD-11 ou CD-14', type: 'artificial', notes: 'Mergulhante; arraste em correnteza moderada.' },
      { name: 'Isca artificial — Colher ondulante 20–30 g', type: 'artificial', notes: 'Ideal em canais com fluxo rápido.' },
      { name: 'Isca artificial — Minnow articulado 14 cm', type: 'artificial', notes: 'Ação realista em velocidade baixa.' },
      { name: 'Isca artificial — Jerkbait 12 cm suspending', type: 'artificial', notes: 'Twitch e pausa em bordas de corrente profunda.' },
      { name: 'Isca artificial — Colher giratória 15–25 g', type: 'artificial', notes: 'Flash metálico eficaz em água com turbidez baixa.' },
      { name: 'Isca viva — traíra pequena 10–15 cm', type: 'natural', notes: 'Isca de troféu; use gancho duplo.' },
      { name: 'Isca viva — lambari', type: 'natural', notes: 'Funciona bem em remansos logo após corredeiras.' },
      { name: 'Isca viva — sabalito 12–18 cm', type: 'natural', notes: 'Presa natural do dourado no Santa Lucía; alta eficácia.' },
    ],
  },
  boga: {
    general: [
      {
        range: '0,3–1 kg',
        rod: 'Vara leve, 1,65–1,80 m',
        reel: 'Molinete 1500–2000',
        line: 'Monofilamento 0,16–0,20 mm (8–12 lb)',
        hook: 'Anzol simples nº 8–4',
        leader: 'Fluorocarbono 0,20 mm, 25 cm',
        notes: 'Juvenis — margens rasas com fundo de areia ou cascalho.',
      },
      {
        range: '1–3 kg',
        rod: 'Vara leve a média, 1,80 m',
        reel: 'Molinete 2000–2500',
        line: 'Monofilamento ou multifilamento 0,18–0,22 mm (10–15 lb)',
        hook: 'Anzol simples nº 6–2',
        leader: 'Fluorocarbono 0,25 mm, 30 cm',
        notes: 'Pesca sutil; use iscas naturais perto do fundo.',
      },
      {
        range: '3 kg+',
        rod: 'Vara média 2,10 m',
        reel: 'Molinete 2500–3000',
        line: 'Multifilamento 0,22–0,25 mm (18–22 lb)',
        hook: 'Anzol simples nº 1–1/0',
        leader: 'Fluorocarbono 0,30 mm, 35 cm',
        notes: 'Espécimes grandes — fundos argilosos em remansos profundos.',
      },
    ],
    baits: [
      { name: 'Massa de milho ou farinha', type: 'natural', notes: 'Clássica para boga; molde no anzol.' },
      { name: 'Minhoca', type: 'natural', notes: 'Eficaz em margens vegetadas e fundos médios.' },
      { name: 'Fruta — figo ou amora', type: 'natural', notes: 'Use próximo a árvores que despejam frutos na água.' },
      { name: 'Manga madura picada', type: 'natural', notes: 'Muito eficaz no verão, quando a fruta cai naturalmente.' },
      { name: 'Algas verdes (cladófora)', type: 'natural', notes: 'Isca local do Santa Lucía — colete nas pedras rasas.' },
      { name: 'Isca artificial — micro jig 3–5 g', type: 'artificial', notes: 'Funciona bem em água clara com slow jigging.' },
      { name: 'Isca artificial — streamer de mosca nº 6–10', type: 'artificial', notes: 'Fly fishing em corredeiras rasas.' },
    ],
  },
  bagre: {
    general: [
      {
        range: '0,3–1 kg',
        rod: 'Vara média 1,80 m, ação lenta',
        reel: 'Molinete 2000–3000',
        line: 'Monofilamento 0,22–0,25 mm',
        hook: 'Anzol nº 1–1/0 com anticorrosivo',
        leader: 'Fluorocarbono 0,35 mm, 40 cm',
        notes: 'Fundo lodoso perto de vegetação submersa.',
      },
      {
        range: '1–3 kg',
        rod: 'Vara média 1,80–2,10 m, ação lenta-média',
        reel: 'Molinete 3000–4000',
        line: 'Multifilamento 0,23–0,28 mm',
        hook: 'Anzol nº 1/0–3/0 com mola antivirote',
        leader: 'Fluorocarbono 0,45 mm, 50 cm',
        notes: 'Pesca de fundo; use lastro leve em fundos lodosos.',
      },
      {
        range: '3 kg+',
        rod: 'Vara média-pesada 2,10 m',
        reel: 'Molinete 4000–5000',
        line: 'Multifilamento 0,30–0,35 mm (40–50 lb)',
        hook: 'Anzol nº 3/0–5/0',
        leader: 'Fluorocarbono 0,55 mm, 60 cm',
        notes: 'Noite no canal principal — grandes poços com fundo firme.',
      },
    ],
    baits: [
      { name: 'Minhoca ou minhocuçu', type: 'natural', notes: 'Mais eficaz à noite e entardecer.' },
      { name: 'Massa de fígado bovino', type: 'natural', notes: 'Alto poder de atração olfativa no fundo.' },
      { name: 'Camarão fresco', type: 'natural', notes: 'Excelente em áreas de remanso com fundo limpo.' },
      { name: 'Peixe cortado (carne branca)', type: 'natural', notes: 'Isca de corte — eficaz em fundos profundos à noite.' },
      { name: 'Queijo curado (descanso)', type: 'natural', notes: 'Isca tradicional local; alta atratividade olfativa.' },
      { name: 'Massa de farinha com alho', type: 'natural', notes: 'Receita local do Santa Lucía — excelente em remansos.' },
      { name: 'Isca artificial — grub de silicone 7–10 cm', type: 'artificial', notes: 'Jigging de fundo em profundidade 3–5 m.' },
      { name: 'Isca artificial — worm de silicone 12 cm', type: 'artificial', notes: 'Texas rig no fundo lodoso próximo a raízes.' },
    ],
  },
  pejerrey: {
    general: [
      {
        range: '0,1–0,3 kg',
        rod: 'Vara ultralight 1,50–1,65 m',
        reel: 'Molinete 500–1000',
        line: 'Monofilamento 0,12–0,14 mm (4–6 lb)',
        hook: 'Anzol simples nº 10–14',
        leader: 'Fluorocarbono 0,14 mm, 15 cm',
        notes: 'Juvenis em cardumes — pesca de superfície com boia.',
      },
      {
        range: '0,3–0,8 kg',
        rod: 'Vara ultralight 1,60–1,80 m',
        reel: 'Molinete 1000–2000',
        line: 'Monofilamento 0,14–0,18 mm (6–8 lb)',
        hook: 'Anzol simples nº 8–12',
        leader: 'Fluorocarbono 0,20 mm, 20 cm',
        notes: 'Pesca ultralight; use cortiça ou boia pequena.',
      },
      {
        range: '0,8 kg+',
        rod: 'Vara leve 1,80–2,10 m',
        reel: 'Molinete 2000',
        line: 'Monofilamento 0,18–0,20 mm (8–10 lb)',
        hook: 'Anzol simples nº 6–8',
        leader: 'Fluorocarbono 0,22 mm, 25 cm',
        notes: 'Espécimes grandes — água aberta em dias frios com vento moderado.',
      },
    ],
    baits: [
      { name: 'Isca artificial — micro spinner 3–5 g', type: 'artificial', notes: 'Ação em velocidade lenta em água aberta.' },
      { name: 'Isca viva — artêmia ou plâncton (farpado)', type: 'natural', notes: 'Pesca com lanterna à noite na superfície.' },
      { name: 'Isca artificial — micro jig colorido 2–4 g', type: 'artificial', notes: 'Funciona bem em água clara com twitch.' },
      { name: 'Larva de mosca ou chironomídeo', type: 'natural', notes: 'Fly fishing — eficaz em condições de luz baixa.' },
      { name: 'Pedaço de minhoca (pequeno)', type: 'natural', notes: 'Isca acessível — boa em tardes de outono/inverno.' },
      { name: 'Isca artificial — micro crankbait 4–6 cm', type: 'artificial', notes: 'Ação de wobbling lento em água aberta fria.' },
    ],
  },
  mojarra: {
    general: [
      {
        range: '0,05–0,15 kg',
        rod: 'Vara ultralight 1,40–1,65 m ou cana simples',
        reel: 'Molinete 500–1000 ou carretilhão',
        line: 'Monofilamento 0,10–0,14 mm (4–6 lb)',
        hook: 'Anzol simples nº 10–14',
        leader: 'Sem líder ou fluorocarbono 0,12 mm',
        notes: 'Pesca recreativa e de iniciação; ideal para crianças.',
      },
      {
        range: '0,15–0,3 kg',
        rod: 'Vara ultralight 1,65–1,80 m',
        reel: 'Molinete 500–1000',
        line: 'Monofilamento 0,12–0,16 mm',
        hook: 'Anzol simples nº 8–12',
        leader: 'Fluorocarbono 0,14 mm, 15 cm',
        notes: 'Cardumes em margem vegetada — tardes de primavera/verão.',
      },
    ],
    baits: [
      { name: 'Minhoca picada', type: 'natural', notes: 'Pedaços pequenos no anzol fino.' },
      { name: 'Pão ou miolo de pão', type: 'natural', notes: 'Funciona em cardumes visíveis na margem.' },
      { name: 'Inseto (mosca, besouro)', type: 'natural', notes: 'Isca de superfície — eficaz no verão ao entardecer.' },
      { name: 'Milho cozido', type: 'natural', notes: 'Coloque 1–2 grãos no anzol — boa atratividade visual.' },
      { name: 'Mosca seca ou ninfa (fly fishing)', type: 'artificial', notes: 'Ação precisa em água rasa vegetada.' },
      { name: 'Isca artificial — micro streamer branco nº 10', type: 'artificial', notes: 'Fly fishing — imita larva em água clara.' },
    ],
  },
  sabalito: {
    general: [
      {
        range: '0,5–2 kg',
        rod: 'Vara média 1,80–2,10 m',
        reel: 'Molinete 2000–3000',
        line: 'Multifilamento 0,20–0,25 mm (15–25 lb)',
        hook: 'Anzol simples nº 2–1/0',
        leader: 'Fluorocarbono 0,30 mm, 30 cm',
        notes: 'Fundo de corredeira ou canal; use lastre para manter a isca no fundo.',
      },
      {
        range: '2–5 kg+',
        rod: 'Vara média-pesada 2,10 m',
        reel: 'Molinete 3000–4000',
        line: 'Multifilamento 0,28–0,33 mm (30–40 lb)',
        hook: 'Anzol simples nº 1/0–3/0',
        leader: 'Fluorocarbono 0,40 mm, 40 cm',
        notes: 'Migrador — maior abundância na primavera ao subir o rio.',
      },
    ],
    baits: [
      { name: 'Massa de farelo de trigo', type: 'natural', notes: 'Isca clássica para sabalito — molde firme no anzol.' },
      { name: 'Minhoca', type: 'natural', notes: 'Eficaz no fundo de canais com corrente moderada.' },
      { name: 'Pasta de milho fermentado', type: 'natural', notes: 'Receita local com alta atratividade olfativa.' },
      { name: 'Algas filamentosas', type: 'natural', notes: 'Isca natural — colete no local e prenda no anzol.' },
      { name: 'Isca artificial — micro jig 5–8 g', type: 'artificial', notes: 'Jigging leve em corredeiras rasas.' },
    ],
  },
  'patí': {
    general: [
      {
        range: '1–3 kg',
        rod: 'Vara pesada 2,10 m, ação lenta',
        reel: 'Molinete 4000–5000',
        line: 'Multifilamento 0,30–0,35 mm (40–50 lb)',
        hook: 'Anzol nº 2/0–4/0 com anticorrosivo',
        leader: 'Fluorocarbono 0,55 mm, 60 cm',
        notes: 'Pesca noturna de fundo; use chocalho no varal para sentir a tomada.',
      },
      {
        range: '3 kg+',
        rod: 'Vara extra-pesada 2,10–2,40 m',
        reel: 'Molinete 5000–8000',
        line: 'Multifilamento 0,40–0,50 mm (60–80 lb)',
        hook: 'Anzol nº 4/0–6/0',
        leader: 'Fluorocarbono 0,70 mm ou aço flexível 50 cm',
        notes: 'Grandes poços noturnos — drag bem ajustado para corridas longas.',
      },
    ],
    baits: [
      { name: 'Minhocuçu', type: 'natural', notes: 'Isca preferida — use maço inteiro no anzol grosso.' },
      { name: 'Peixe cortado (sabalito ou lambari)', type: 'natural', notes: 'Alta eficácia à noite em poços profundos.' },
      { name: 'Camarão de rio', type: 'natural', notes: 'Excelente em fundos argilosos com pouca correnteza.' },
      { name: 'Massa de fígado bovino', type: 'natural', notes: 'Forte atração olfativa — troque a cada 30 min.' },
      { name: 'Isca artificial — worm de silicone 15 cm escuro', type: 'artificial', notes: 'Texas rig em fundo profundo, recuperação lenta.' },
    ],
  },
  'surubí': {
    general: [
      {
        range: '2–8 kg',
        rod: 'Vara pesada 2,10–2,40 m, carbono modular',
        reel: 'Molinete 6000–8000 ou carretilha 300–400',
        line: 'Multifilamento 0,40–0,50 mm (60–80 lb)',
        hook: 'Treble reforçado nº 2/0–4/0 ou simples 5/0',
        leader: 'Aço 7×7 flexível 60 cm, 80 lb',
        notes: 'Espécie escassa no Santa Lucía — pesca no canal principal em noites sem vento.',
      },
      {
        range: '8 kg+',
        rod: 'Vara extra-pesada 2,40 m',
        reel: 'Molinete 10000+ ou carretilha 400',
        line: 'Multifilamento 0,55–0,65 mm (100 lb+)',
        hook: 'Simples 6/0–8/0 reforçado',
        leader: 'Aço flexível 80 cm, 100 lb',
        notes: 'Troféu raro — requer combate de embarcação; observe regulamentação local.',
      },
    ],
    baits: [
      { name: 'Isca viva — sabalito 15–25 cm', type: 'natural', notes: 'Presa natural — use gancho no dorso sem perfurar coluna.' },
      { name: 'Isca viva — tararira pequena 20 cm', type: 'natural', notes: 'Alta eficácia para surubí de grande porte.' },
      { name: 'Isca artificial — minnow articulado 18 cm', type: 'artificial', notes: 'Troling lento no canal profundo ao entardecer.' },
      { name: 'Peixe cortado de corte generoso', type: 'natural', notes: 'Isca de corte — fundo de canal profundo à noite.' },
    ],
  },
  vieja_agua: {
    general: [
      {
        range: '0,3–1 kg',
        rod: 'Vara leve a média 1,80 m',
        reel: 'Molinete 2000–3000',
        line: 'Multifilamento 0,20–0,25 mm (15–20 lb)',
        hook: 'Anzol nº 1–2/0 com olhal grande',
        leader: 'Fluorocarbono 0,35 mm, 40 cm',
        notes: 'Pesca noturna em pedras e troncos submersos; a tomada é lenta e firme.',
      },
      {
        range: '1–3 kg+',
        rod: 'Vara média-pesada 2,10 m',
        reel: 'Molinete 3000–4000',
        line: 'Multifilamento 0,28–0,33 mm (30–40 lb)',
        hook: 'Anzol nº 2/0–3/0',
        leader: 'Fluorocarbono 0,45 mm, 50 cm',
        notes: 'Espécimes grandes em substratos rochosos com corrente moderada.',
      },
    ],
    baits: [
      { name: 'Minhoca com massa de farelo', type: 'natural', notes: 'Combinação que simula o biofilme do substrato.' },
      { name: 'Pasta de alga e farinha', type: 'natural', notes: 'Isca vegetariana — molde ao redor do anzol.' },
      { name: 'Camarão fresco', type: 'natural', notes: 'Eficaz em rochas com fundo firme.' },
      { name: 'Isca artificial — grub claro 5 cm', type: 'artificial', notes: 'Jigging leve sobre substrato rochoso.' },
    ],
  },
  palometa: {
    general: [
      {
        range: '0,2–0,8 kg',
        rod: 'Vara de ação média 1,80 m',
        reel: 'Molinete 2000–3000',
        line: 'Multifilamento 0,22–0,28 mm (20–30 lb)',
        hook: 'Treble nº 4–2 com reforço anti-mordida',
        leader: 'Arame fino 20 cm ou fluorocarbono 0,60 mm (dentes cortantes!)',
        notes: '⚠️ Manuseie com luva — dentes extremamente afiados.',
      },
    ],
    baits: [
      { name: 'Isca viva — lambari ou mojarra', type: 'natural', notes: 'Alta eficácia; o cardume ataca em grupo.' },
      { name: 'Peixe cortado (pedaço sangrento)', type: 'natural', notes: 'O sangue atrai rapidamente em remansos.' },
      { name: 'Isca artificial — spinner bait vermelho 10 g', type: 'artificial', notes: 'Flash + vibração em água aberta com vegetação.' },
      { name: 'Isca artificial — popper pequeno', type: 'artificial', notes: 'Ataque violento em superfície — ação contínua.' },
    ],
  },
  armado: {
    general: [
      {
        range: '0,5–2 kg',
        rod: 'Vara média 1,80–2,10 m, ação lenta',
        reel: 'Molinete 3000–4000',
        line: 'Multifilamento 0,25–0,30 mm',
        hook: 'Anzol nº 1/0–3/0 com mola antivirote',
        leader: 'Fluorocarbono 0,45 mm, 50 cm',
        notes: 'Pesca de fundo noturna em poços lodosos e meandros.',
      },
      {
        range: '2 kg+',
        rod: 'Vara pesada 2,10 m',
        reel: 'Molinete 4000–5000',
        line: 'Multifilamento 0,33–0,40 mm (50–60 lb)',
        hook: 'Anzol nº 3/0–5/0',
        leader: 'Fluorocarbono 0,55 mm, 60 cm',
        notes: 'Espécimes grandes em banhados profundos no inverno.',
      },
    ],
    baits: [
      { name: 'Molusco fresco (marisco ou mexilhão)', type: 'natural', notes: 'Isca preferida — passe pelo anzol sem cozinhar.' },
      { name: 'Camarão fresco inteiro', type: 'natural', notes: 'Excelente em fundos lodosos calmos.' },
      { name: 'Minhocuçu', type: 'natural', notes: 'Funciona bem à noite em meandros.' },
      { name: 'Massa de farinha com camarão triturado', type: 'natural', notes: 'Alta atratividade olfativa em água turva.' },
    ],
  },
  corvina: {
    general: [
      {
        range: '0,3–1,5 kg',
        rod: 'Vara média 1,80–2,10 m',
        reel: 'Molinete 2000–3000',
        line: 'Multifilamento 0,20–0,25 mm (15–25 lb)',
        hook: 'Anzol nº 1–2/0',
        leader: 'Fluorocarbono 0,35 mm, 40 cm',
        notes: 'Mais frequente na porção baixa do rio e no estuário do Santa Lucía.',
      },
      {
        range: '1,5 kg+',
        rod: 'Vara média-pesada 2,10 m',
        reel: 'Molinete 3000–4000',
        line: 'Multifilamento 0,28–0,33 mm',
        hook: 'Anzol nº 2/0–3/0',
        leader: 'Fluorocarbono 0,45 mm, 50 cm',
        notes: 'Pesca ao entardecer ou noite em canais com influência estuarina.',
      },
    ],
    baits: [
      { name: 'Camarão fresco', type: 'natural', notes: 'Isca mais eficaz — use inteiro com casca.' },
      { name: 'Peixe cortado (sardinha ou lambari)', type: 'natural', notes: 'Corte oblíquo com pele — boa liberação de odor.' },
      { name: 'Isca artificial — jig 10–15 g prata', type: 'artificial', notes: 'Jigging vertical em canais com corrente de maré.' },
      { name: 'Isca artificial — minnow flutuante 9 cm', type: 'artificial', notes: 'Arraste lento na superfície ao entardecer.' },
    ],
  },
  anguilas: {
    general: [
      {
        range: '0,2–1 kg',
        rod: 'Vara média 1,80 m, ação lenta',
        reel: 'Molinete 2000–3000',
        line: 'Multifilamento 0,22–0,28 mm (20–30 lb)',
        hook: 'Anzol simples nº 1–2/0 longo (tipo Kirby)',
        leader: 'Fluorocarbono 0,40 mm, 40 cm',
        notes: '⚠️ Use luva para manusear — corpo escorregadio e pode morder. Pesca noturna exclusiva.',
      },
    ],
    baits: [
      { name: 'Minhocuçu', type: 'natural', notes: 'Isca principal — maço enrolado no anzol longo.' },
      { name: 'Peixe cortado pequeno', type: 'natural', notes: 'Pedaço com vísceras — alto odor no fundo raso.' },
      { name: 'Camarão com casca', type: 'natural', notes: 'Excelente em margens com buracos e raízes.' },
    ],
  },
  carpa: {
    general: [
      {
        range: '1–4 kg',
        rod: 'Vara média 2,10–3,60 m (vara de carpfishing)',
        reel: 'Molinete 4000–6000 com porta-vara',
        line: 'Monofilamento 0,30–0,35 mm (25–35 lb)',
        hook: 'Anzol Boilie nº 4–8 ou simples nº 1–2',
        leader: 'Fluorocarbono 0,40 mm, 50 cm com chumbada pêra 60–100 g',
        notes: 'Pesca de espera com alarme de mordida — método hair rig recomendado.',
      },
      {
        range: '4 kg+',
        rod: 'Vara de carpfishing 3,60 m, test curve 3–3,5 lb',
        reel: 'Molinete baitrunner 6000–8000',
        line: 'Monofilamento 0,40 mm (40 lb) ou linha de chumbo 50 lb',
        hook: 'Anzol Boilie nº 2–4',
        leader: 'Fluorocarbono 0,55 mm, 60 cm + chumbada 80–120 g',
        notes: 'Hair rig com boilies de 18–20 mm ou massa de milho.',
      },
    ],
    baits: [
      { name: 'Milho cozido', type: 'natural', notes: 'Isca clássica — use 2–3 grãos no anzol ou hair rig.' },
      { name: 'Massa de pão e farelo', type: 'natural', notes: 'Bola grande de massa — isca acessível e eficaz.' },
      { name: 'Boilie de sabor frutal 15–20 mm', type: 'artificial', notes: 'Carpfishing técnico — hair rig com stopper.' },
      { name: 'Grão de soja cozido', type: 'natural', notes: 'Alta durabilidade no anzol — bom para espera longa.' },
      { name: 'Minhoca grande', type: 'natural', notes: 'Funciona bem em água turva com fundo lodoso.' },
    ],
  },
  dientudo: {
    general: [
      {
        range: '0,05–0,3 kg',
        rod: 'Vara ultralight 1,65–1,80 m',
        reel: 'Molinete 1000–2000',
        line: 'Multifilamento 0,15–0,19 mm (8–12 lb)',
        hook: 'Anzol simples nº 6–10',
        leader: 'Fluorocarbono 0,20 mm, 20 cm',
        notes: 'Pesca leve em margens vegetadas; mordida rápida e vigorosa.',
      },
    ],
    baits: [
      { name: 'Isca artificial — micro spinner 3–5 g', type: 'artificial', notes: 'Ação em água aberta com corrente suave.' },
      { name: 'Isca artificial — micro minnow 5 cm', type: 'artificial', notes: 'Arraste lento paralelo à margem vegetada.' },
      { name: 'Minhoca picada', type: 'natural', notes: 'Pedaços pequenos no anzol fino.' },
      { name: 'Larva de inseto', type: 'natural', notes: 'Fly fishing com ninfa — muito eficaz ao entardecer.' },
      { name: 'Isca artificial — streamer pequeno branco', type: 'artificial', notes: 'Imita lambari jovem — puxada rápida e curta.' },
    ],
  },
  tachuela: {
    general: [
      {
        range: '0,05–0,2 kg',
        rod: 'Vara ultralight 1,50 m ou cana simples',
        reel: 'Molinete 500–1000',
        line: 'Monofilamento 0,14–0,18 mm',
        hook: 'Anzol simples nº 8–12',
        leader: 'Sem líder',
        notes: 'Pesca noturna em banhados rasos — principalmente captura acessória.',
      },
    ],
    baits: [
      { name: 'Minhoca picada', type: 'natural', notes: 'Isca principal — pedaço pequeno no fundo lamacento.' },
      { name: 'Massa de farinha com detritos', type: 'natural', notes: 'Imita o alimento natural nos banhados.' },
    ],
  },
};

// ⚠️ Nota de validação: as recomendações acima foram compiladas com base em
// fontes bibliográficas e relatos de pescadores da bacia do Rio Santa Lucía.
// Confirme sempre com guias e pescadores locais, pois condições sazonais,
// nível do rio e regulamentações podem alterar as melhores práticas.

function weightFromOccurrences(occurrences, cellId, speciesId) {
  const relevant = occurrences.filter(
    (o) => o.speciesId === speciesId && o.cellId === cellId && o.weightKg > 0
  );
  if (relevant.length === 0) return null;
  const avg = relevant.reduce((s, o) => s + o.weightKg, 0) / relevant.length;
  const max = Math.max(...relevant.map((o) => o.weightKg));
  return { avg: Math.round(avg * 10) / 10, max: Math.round(max * 10) / 10, count: relevant.length };
}

function getHotBaits(occurrences, speciesId, cellId) {
  const relevant = occurrences.filter(
    (o) => o.speciesId === speciesId && o.baitUsed && (cellId ? o.cellId === cellId : true)
  );
  if (relevant.length === 0) return [];

  const counts = {};
  for (const o of relevant) {
    const key = o.baitUsed.trim().toLowerCase();
    counts[key] = (counts[key] || 0) + 1;
  }

  const sorted = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const total = relevant.length;
  return sorted.map(([name, count]) => ({
    name,
    count,
    pct: Math.round((count / total) * 100),
  }));
}

function bestRangeForWeight(gearList, avgKg) {
  if (!avgKg || gearList.length === 1) return gearList[0];
  return gearList.find((g) => {
    const [lo] = g.range.split('–').map((s) => parseFloat(s));
    return avgKg <= lo + 2;
  }) || gearList[gearList.length - 1];
}

export default function GearRecommendation({ selectedSpeciesList, focusedCell, occurrences, userLocation, buyerCountry = null }) {
  const [remoteHotBaits, setRemoteHotBaits] = useState({});
  const [ownedGear, setOwnedGear] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pescamon_owned_gear') || '{}'); } catch { return {}; }
  });
  const [storeProducts, setStoreProducts] = useState([]);
  const [storesLoading, setStoresLoading] = useState(false);
  const [buyClicked, setBuyClicked] = useState({}); // productId -> true (mostra "checkout em breve")
  const viewedRef = useRef(new Set()); // dedupe de eventos 'view' por produto

  useEffect(() => {
    if (selectedSpeciesList.length === 0) return;
    let cancelled = false;
    async function loadRemote() {
      const result = {};
      for (const sp of selectedSpeciesList) {
        try {
          const remote = await fetchHotBaits(sp.id, focusedCell?.id || null);
          if (!cancelled) result[sp.id] = remote;
        } catch { /* silencioso — fallback para dados locais */ }
      }
      if (!cancelled) setRemoteHotBaits(result);
    }
    loadRemote();
    return () => { cancelled = true; };
  }, [selectedSpeciesList, focusedCell]);

  useEffect(() => {
    const ids = selectedSpeciesList.map(s => s.id);
    if (ids.length === 0) { setStoreProducts([]); return; }
    let cancelled = false;
    setStoresLoading(true);
    getProductsForSpecies(ids)
      .then(data => { if (!cancelled) setStoreProducts(data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setStoresLoading(false); });
    return () => { cancelled = true; };
  }, [selectedSpeciesList]);

  function toggleOwned(key) {
    setOwnedGear(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem('pescamon_owned_gear', JSON.stringify(next));
      return next;
    });
  }

  // Produtos de marketplace (curados/destaque e ativos) por espécie — "Acessório parceiro"
  const partnerBySpecies = useMemo(() => {
    const map = {};
    for (const p of storeProducts) {
      if (p.active === false) continue;        // inativos no marketplace não aparecem
      if (!p.featured) continue;               // a vitrine de acessório parceiro mostra só destaques
      if (!p.fishing_stores) continue;
      if (p.fishing_stores.active === false) continue;
      for (const spId of (p.species_ids || [])) {
        (map[spId] = map[spId] || []).push(p);
      }
    }
    // ordena por destaque (já são todos featured) e nome
    for (const k of Object.keys(map)) map[k].sort((a, b) => a.name.localeCompare(b.name));
    return map;
  }, [storeProducts]);

  // Funil: loga 'view' uma vez por produto parceiro exibido
  useEffect(() => {
    for (const list of Object.values(partnerBySpecies)) {
      for (const p of list) {
        if (viewedRef.current.has(p.id)) continue;
        viewedRef.current.add(p.id);
        logMarketplaceEvent('view', { productId: p.id, storeId: p.store_id, country: buyerCountry });
      }
    }
  }, [partnerBySpecies, buyerCountry]);

  function handleBuy(p) {
    logMarketplaceEvent('click_buy', { productId: p.id, storeId: p.store_id, country: buyerCountry });
    setBuyClicked(prev => ({ ...prev, [p.id]: true }));
  }

  const recommendations = useMemo(() => {
    return selectedSpeciesList.map((sp) => {
      const db = GEAR_DB[sp.id];
      if (!db) return null;

      const cellWeight = focusedCell
        ? weightFromOccurrences(occurrences, focusedCell.id, sp.id)
        : null;

      const highlightedGear = cellWeight
        ? bestRangeForWeight(db.general, cellWeight.avg)
        : null;

      const localHotBaits = getHotBaits(occurrences, sp.id, focusedCell ? focusedCell.id : null);
      const remote = remoteHotBaits[sp.id] || [];

      // Mescla: remote tem prioridade; completa com locais não duplicados
      const merged = [...remote];
      for (const lb of localHotBaits) {
        if (!merged.some((r) => r.name === lb.name) && merged.length < 3) {
          merged.push({ ...lb, source: 'local' });
        }
      }

      const hotBaits = merged;
      const hotBaitScope = focusedCell ? 'célula' : 'todos os usuários';

      return { sp, db, cellWeight, highlightedGear, hotBaits, hotBaitScope };
    }).filter(Boolean);
  }, [selectedSpeciesList, focusedCell, occurrences, remoteHotBaits]);

  if (recommendations.length === 0) {
    return (
      <div className="gear-empty">
        <Package size={28} />
        <p>Selecione ao menos uma espécie para ver recomendações de equipamento.</p>
      </div>
    );
  }

  return (
    <div className="gear-content">
      {recommendations.map(({ sp, db, cellWeight, highlightedGear, hotBaits, hotBaitScope }) => (
        <div key={sp.id} className="gear-species-block">
          <div className="gear-species-header">
            <span className="gear-swatch" style={{ background: sp.color }} />
            <strong>{sp.name}</strong>
            <em>{sp.scientificName}</em>
          </div>

          <div className="gear-section-label" style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <span><Package size={13} /> Equipamentos</span>
            <span style={{fontSize:'0.68rem',color:'#64748b',fontWeight:400}}>✅ = já possuo</span>
          </div>

          {cellWeight && highlightedGear && (
            <div className="gear-highlight">
              <div className="gear-highlight-badge"><Star size={11} /> Recomendado para esta célula</div>
              <p className="gear-cell-info">
                Média histórica nesta célula: <strong>{cellWeight.avg} kg</strong>
                {cellWeight.max !== cellWeight.avg && <> · máx. {cellWeight.max} kg</>}
                {' '}({cellWeight.count} registro{cellWeight.count !== 1 ? 's' : ''})
              </p>
              <GearCard gear={highlightedGear} highlighted ownedGear={ownedGear} onToggleOwned={toggleOwned} />
            </div>
          )}

          <div className="gear-ranges">
            {db.general.map((gear) => (
              <GearCard key={gear.range} gear={gear} ownedGear={ownedGear} onToggleOwned={toggleOwned} />
            ))}
          </div>

          <div className="gear-section-label"><Fish size={13} /> Iscas recomendadas</div>

          {hotBaits.length > 0 && (
            <div className="hot-baits-block">
              <div className="hot-baits-label"><Flame size={12} /> Mais usadas — {hotBaitScope}</div>
              <div className="hot-baits-list">
                {hotBaits.map((hb, i) => (
                  <div key={hb.name} className="hot-bait-item">
                    <span className="hot-bait-rank">#{i + 1}</span>
                    <Flame size={12} className="hot-bait-flame" />
                    <strong className="hot-bait-name">{hb.name}</strong>
                    <span className="hot-bait-pct">{hb.pct}% ({hb.count}x)</span>
                    <span className="hot-bait-source">{hb.source === 'remote' ? '☁️' : '📱'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bait-list">
            {db.baits.map((bait) => {
              const isHot = hotBaits.some(
                (hb) => bait.name.toLowerCase().includes(hb.name) || hb.name.includes(bait.name.toLowerCase())
              );
              return (
                <div key={bait.name} className={`bait-item bait-${bait.type}${isHot ? ' bait-hot' : ''}`}>
                  <div className="bait-name">
                    {isHot ? <Flame size={11} className="hot-bait-flame" /> : <ChevronRight size={11} />}
                    <strong>{bait.name}</strong>
                    {isHot && <span className="bait-tag bait-tag-hot">HOT</span>}
                    <span className={`bait-tag bait-tag-${bait.type}`}>{bait.type === 'artificial' ? 'Artificial' : 'Natural'}</span>
                  </div>
                  <p className="bait-notes">{bait.notes}</p>
                </div>
              );
            })}
          </div>
          {/* Acessório parceiro (marketplace) */}
          {(partnerBySpecies[sp.id] || []).length > 0 && (
            <div style={{marginTop:12}}>
              <div className="gear-section-label"><ShoppingCart size={13} /> Acessório parceiro</div>
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {partnerBySpecies[sp.id].map(p => {
                  const s = p.fishing_stores;
                  const sym = CURRENCY_SYMBOL[p.currency] || '$';
                  const price = (p.price ?? p.price_uyu);
                  return (
                    <div key={p.id} style={{background:'#0f172a',borderRadius:8,padding:'10px 12px',border:'1px solid #78350f'}}>
                      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:8}}>
                        <div style={{minWidth:0}}>
                          <div style={{fontWeight:700,fontSize:'0.82rem',color:'#f1f5f9',display:'flex',alignItems:'center',gap:5}}>
                            <Star size={11} fill="#f59e0b" color="#f59e0b" style={{flexShrink:0}} />
                            <span style={{overflow:'hidden',textOverflow:'ellipsis'}}>{p.name}</span>
                          </div>
                          <div style={{fontSize:'0.7rem',color:'#94a3b8',marginTop:2}}>
                            {s?.name && <>🏪 {s.name}</>}
                            {p.brand && <> · {p.brand}</>}
                          </div>
                          <div style={{fontSize:'0.68rem',color:'#64748b',marginTop:3,fontStyle:'italic'}}>
                            Acessório que se soma à vara + linha (não as substitui).
                          </div>
                        </div>
                        <div style={{textAlign:'right',flexShrink:0}}>
                          {price != null && <div style={{fontWeight:700,fontSize:'0.85rem',color:'#f59e0b'}}>{sym}{price} {p.currency || 'UYU'}</div>}
                          <button
                            type="button"
                            onClick={() => handleBuy(p)}
                            style={{marginTop:5,fontSize:'0.72rem',padding:'5px 12px',borderRadius:6,border:'none',background:'#d97706',color:'#fff',fontWeight:700,cursor:'pointer',display:'inline-flex',alignItems:'center',gap:4}}
                          >
                            <ShoppingCart size={11} /> Comprar
                          </button>
                        </div>
                      </div>
                      {buyClicked[p.id] && (
                        <div style={{marginTop:8,fontSize:'0.7rem',color:'#fbbf24',background:'#1c1917',borderRadius:6,padding:'6px 9px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
                          <span>🛒 Checkout em breve — pagamento via Mercado Pago será habilitado em breve.</span>
                          {s?.whatsapp && (
                            <a href={`https://wa.me/${s.whatsapp.replace(/\D/g,'')}`} target="_blank" rel="noreferrer"
                              style={{color:'#4ade80',textDecoration:'none',whiteSpace:'nowrap'}}>💬 Falar com a loja</a>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Lojas próximas */}
          {(() => {
            const neededGearTypes = ['rod','reel','line','hook','leader'].filter(gt => {
              const ranges = (db.general || []).map(g => g.range);
              if (ranges.length === 0) return true;
              const allOwned = ranges.every(r => ownedGear[`_range_${r}_${gt}`]);
              return !allOwned;
            });
            const relevant = storeProducts.filter(p =>
              (p.species_ids || []).includes(sp.id) &&
              neededGearTypes.includes(p.gear_type) &&
              p.in_stock &&
              p.fishing_stores
            );
            if (relevant.length === 0 && !storesLoading) return null;
            const byStore = {};
            for (const prod of relevant) {
              const sid = prod.fishing_stores.id;
              if (!byStore[sid]) byStore[sid] = { store: prod.fishing_stores, products: [] };
              byStore[sid].products.push(prod);
            }
            const storeEntries = Object.values(byStore).map(entry => {
              const s = entry.store;
              if (s.lat && s.lng && userLocation) {
                const d = Math.hypot(s.lat - userLocation.lat, s.lng - userLocation.lon) * 111.32;
                return { ...entry, distKm: d };
              }
              return { ...entry, distKm: Infinity };
            }).sort((a, b) => a.distKm - b.distKm);
            return (
              <div style={{marginTop:12}}>
                <div className="gear-section-label">
                  <Store size={13} /> Lojas próximas com itens que você precisa
                  {storesLoading && <span style={{marginLeft:6,fontSize:'0.68rem',color:'#64748b'}}>carregando...</span>}
                </div>
                {storeEntries.length === 0 && !storesLoading && (
                  <p style={{fontSize:'0.75rem',color:'#475569',margin:'4px 0 0'}}>Nenhuma loja parceira cadastrada para esta espécie ainda.</p>
                )}
                {storeEntries.map(({ store: s, products: prods, distKm }) => (
                  <div key={s.id} style={{background:'#0f172a',borderRadius:8,padding:'10px 12px',marginBottom:8,border:'1px solid #1e3a5f'}}>
                    <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:8,marginBottom:6}}>
                      <div>
                        <div style={{fontWeight:700,fontSize:'0.82rem',color:'#f1f5f9'}}>
                          🏪 {s.name}
                          {distKm < 9999 && <span style={{marginLeft:6,fontSize:'0.68rem',color:'#64748b',fontWeight:400}}>{distKm < 1 ? `${Math.round(distKm*1000)}m` : `${distKm.toFixed(1)}km`}</span>}
                        </div>
                        {s.city && <div style={{fontSize:'0.7rem',color:'#64748b'}}><MapPin size={9} style={{marginRight:3,verticalAlign:-1}} />{s.city}</div>}
                      </div>
                      <div style={{display:'flex',gap:6}}>
                        {s.whatsapp && <a href={`https://wa.me/${s.whatsapp.replace(/\D/g,'')}`} target="_blank" rel="noreferrer" style={{fontSize:'0.72rem',color:'#4ade80',textDecoration:'none',padding:'3px 7px',border:'1px solid #14532d',borderRadius:5}}>💬 WhatsApp</a>}
                        {s.phone && <a href={`tel:${s.phone}`} style={{fontSize:'0.72rem',color:'#94a3b8',textDecoration:'none',padding:'3px 7px',border:'1px solid #334155',borderRadius:5}}><Phone size={9} style={{verticalAlign:-1}} /> Ligar</a>}
                        {s.website && <a href={s.website} target="_blank" rel="noreferrer" style={{fontSize:'0.72rem',color:'#60a5fa',textDecoration:'none',padding:'3px 7px',border:'1px solid #1e3a5f',borderRadius:5}}><ExternalLink size={9} style={{verticalAlign:-1}} /> Site</a>}
                      </div>
                    </div>
                    <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
                      {prods.map(p => (
                        <span key={p.id} style={{fontSize:'0.7rem',padding:'2px 8px',background:'#1e293b',borderRadius:12,color:'#cbd5e1',border:'1px solid #334155'}}>
                          {p.name}{p.price_uyu ? ` · $${p.price_uyu}` : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      ))}
      <div className="gear-disclaimer">
        <AlertTriangle size={12} />
        Recomendações baseadas em dados bibliográficos e relatos da bacia do Rio Santa Lucía.
        Confirme sempre com pescadores e guias locais — condições sazonais e regulamentações podem variar.
      </div>
    </div>
  );
}

function GearCard({ gear, highlighted, ownedGear, onToggleOwned }) {
  const FIELDS = [
    { label: 'Vara',     key: 'rod',    value: gear.rod },
    { label: 'Molinete', key: 'reel',   value: gear.reel },
    { label: 'Linha',    key: 'line',   value: gear.line },
    { label: 'Anzol',    key: 'hook',   value: gear.hook },
    { label: 'Líder',    key: 'leader', value: gear.leader },
  ];
  return (
    <div className={`gear-item${highlighted ? ' gear-card-highlighted' : ''}`}>
      <div className="gear-range-badge">{gear.range}</div>
      <div className="gear-rows">
        {FIELDS.map(({ label, key, value }) => {
          if (!value) return null;
          const ownedKey = `_range_${gear.range}_${key}`;
          const owned = ownedGear?.[ownedKey];
          return (
            <div key={key} className="gear-row" style={{display:'flex',alignItems:'flex-start',gap:6}}>
              {onToggleOwned && (
                <button
                  type="button"
                  onClick={() => onToggleOwned(ownedKey)}
                  title={owned ? 'Marcar como não possuo' : 'Marcar como já possuo'}
                  style={{flexShrink:0,marginTop:2,width:16,height:16,borderRadius:4,border:`1px solid ${owned ? '#16a34a' : '#475569'}`,background:owned ? '#16a34a' : 'transparent',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}
                >
                  {owned && <Check size={10} color="#fff" />}
                </button>
              )}
              <span className="gear-row-label" style={{opacity: owned ? 0.4 : 1}}>{label}</span>
              <span className="gear-row-value" style={{opacity: owned ? 0.4 : 1, textDecoration: owned ? 'line-through' : 'none'}}>{value}</span>
            </div>
          );
        })}
        {gear.notes && <p className="gear-note">{gear.notes}</p>}
      </div>
    </div>
  );
}

function GearRow({ label, value }) {
  return (
    <div className="gear-row">
      <span className="gear-row-label">{label}</span>
      <span className="gear-row-value">{value}</span>
    </div>
  );
}
