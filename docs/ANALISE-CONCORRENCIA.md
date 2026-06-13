# Análise de concorrência — Pescamon

> Revisão de mercado (jun/2026): concorrentes, vantagens deles, vantagens nossas e
> como melhorar. Disparada pela observação de que o **windy.app** parece ter um
> heatmap "mais interessante e detalhado".

## Panorama dos concorrentes

| App | Foco | "Heatmap" deles | Força principal | Fraqueza p/ o nosso mercado |
|---|---|---|---|---|
| **Windy.app** | Meteorologia náutica global | Camadas ambientais animadas (vento, ondas, pressão, temp. da água via MyOcean/Copernicus) + **"Fish Activity"** (% em 4 blocos de 6h, base solunar+clima) | Visualização ambiental linda; global | Não é por espécie nem por trecho de rio; sem rede hidrográfica interior; sem legislação |
| **Fishbrain** | Rede social de pesca (15M+) | "Spot Prediction" por **dados de captura** crowdsourced + BiteTime (IA) | Efeito de rede; Fish ID 300+; Top Baits | Dados quase nulos no Cone Sul; sem veda/áreas; foco em registro |
| **Navionics (Garmin)** | Cartas náuticas/batimetria | best-times preditivo | Profundidade HD; navegação | Marinho/barco; ignora rios interiores |
| **Deeper** | Sonar (hardware) + app | Mapa do fundo via sonar | Visão real subaquática | Depende de comprar o sonar |
| **Salty Offshore / SatFish** | Offshore por satélite | SST + clorofila + correntes empilhadas | Camadas oceânicas detalhadas | Só offshore/marinho |

Fontes: windy.app/activities/fishing, windy.app/news/introducing-fish-pro-weather-profile, fishbrain.com/features, fishingbooker.com/blog/best-fishing-apps, satfish.com.

## O "heatmap" do windy vs o nosso (distinção-chave)

São **complementares**, não a mesma coisa:
- **Windy = riqueza visual + temporal.** Camadas ambientais animadas + score de atividade *no tempo* (quando morder). Genérico: não diz **onde** nem **qual espécie** em cada trecho.
- **Pescamon = inteligência espacial + por espécie.** Dizemos **em qual trecho do rio e para qual espécie** a probabilidade é maior (morfologia do habitat + ecologia da espécie + clima/vazão/pressão + bayesiano calibrado por ocorrências). Nenhum concorrente faz isso para rios.

Falta-nos o **polimento visual ambiental** do Windy — e ele é factível porque **já buscamos esses dados** (Open-Meteo: vento, pressão, temp. da água, vazão; Marine API: ondas).

## Vantagens dos concorrentes sobre nós
1. **Visualização ambiental "uau"** (Windy): camadas animadas/gradientes.
2. **Efeito de rede de dados** (Fishbrain): milhões de capturas → spots, baits, prova social.
3. **Batimetria e sonar** (Navionics/Deeper): profundidade/estrutura reais; o nosso é heurístico.
4. **App nativo + descoberta nas lojas + marketing** maduro (somos PWA).
5. **Camadas offshore por satélite** (SatFish): SST/clorofila no mar.

## Vantagens nossas (o fosso)
1. **Heatmap por trecho de rio E por espécie** — ninguém faz para pesca interior.
2. **Hidrografia oficial do governo local** (ANA/IBGE/DINAGUA) — rede completa e precisa.
3. **Conformidade legal** (áreas protegidas + vedas/defeso por região) — pilar único.
4. **Foco regional** (UY + RS + SC, expandindo): espécies, ecorregiões, legislação, PT/ES.
5. **Modelo preditivo "científico"** em vez de score genérico.
6. **Proposta ampla e gratuita no core**: previsão + comunidade + academia + legalidade.

## Como melhorar (priorizado, reaproveitando a arquitetura atual)

**🥇 Curto prazo — fechar o gap visual sem perder a substância**
1. **Camadas ambientais sobre o mapa** (estilo Windy): temperatura da água (gradiente), intensidade de vazão, vento, pressão — dados Open-Meteo que já buscamos. Toggle + legenda.
2. **Timeline de atividade ("bite time")** por local/espécie: score temporal (tipo 4×6h do Windy) com solunar + pressão (`pressureSensitivity`) + clima.
3. **Polir o heatmap de espécie**: gradiente contínuo + legenda + **slider de tempo** (varrer o forecast recolorindo o mapa) — une o nosso espacial com o temporal do Windy.

**🥈 Médio prazo — fosso de dados e alcance**
4. **Flywheel de ocorrências**: usar a gamificação para incentivar registro → 2ª camada "spots reais" ao lado da preditiva.
5. **App nativo** (Capacitor — já no roadmap): lojas + push nativo.

**🥉 Oportunista**
6. **Litoral/marinho** (RS/SC/UY): SST + clorofila (Open-Meteo Marine/Copernicus) para competir com SatFish na região.

## Recomendação estratégica
Não imitar o Windy e virar mais um app de meteorologia genérico. **Adotar o brilho visual dele (camadas ambientais + timeline) POR CIMA do nosso diferencial real** (heatmap por trecho e por espécie + legalidade + dados oficiais). Isso dá o "uau" sem diluir o que nos torna únicos.

---
_Status: item 🥇.1 (camada ambiental de temperatura da água) iniciado em jun/2026._
