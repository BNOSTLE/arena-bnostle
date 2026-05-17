import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase, hasSupabase } from './lib/supabase';
import * as api from './lib/api';

// ════════════════════════════════════════════════════════════
// ARENA BNOSTLE — KOF 2002/UM — v0.5
// + Versões separadas (2002 Clássica / UM Steam)
// + Login simulado com Google/Discord/Twitch
// + Admin único, lutadores só editam perfil
// ════════════════════════════════════════════════════════════

// ─── CONFIGURAÇÃO DE DOAÇÃO PIX ─────────────────────────────
// Pra trocar o QR code: sobe nova imagem em public/pix-qr.png
// Pra trocar a chave PIX: muda 'pixKey' aqui embaixo
// Pra desativar a doação: muda 'enabled' pra false
const PIX_CONFIG = {
  enabled: true,
  qrImageUrl: '/pix-qr.png',          // arquivo em public/pix-qr.png
  pixKey: 'buenoky@hotmail.com',
  beneficiary: 'Arena Bnostle',
  purpose: [
    'Manter o servidor e o domínio no ar',
    'Premiação dos campeonatos anuais',
    'Equipamento de transmissão',
    'Custos operacionais do canal',
  ],
};

// ─── CONFIGURAÇÃO DE INTEGRAÇÃO COM DISCORD ─────────────────
// Pra ativar: crie um webhook no seu servidor Discord
// (Server Settings → Integrations → Webhooks → New Webhook)
// Copia a URL e cole aqui. Pra desativar: deixa string vazia.
const DISCORD_WEBHOOK = {
  url: '', // exemplo: 'https://discord.com/api/webhooks/123456/abcdef'
  notifyOnScheduled: true,  // posta quando admin agenda novo duelo
  notifyOnLive: true,       // posta quando admin marca como AO VIVO
  notifyOnCompleted: true,  // posta resultado quando termina
};

// Envia mensagem pro Discord via webhook (silencioso se falhar)
async function notifyDiscord(payload) {
  if (!DISCORD_WEBHOOK.url) return;
  try {
    await fetch(DISCORD_WEBHOOK.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.log('Discord webhook falhou:', e);
  }
}

const C = {
  bg: '#0E0E10', elevated: '#16161A', panel: '#1A1A20', overlay: '#1F1F25',
  border: '#2A2A30', borderBright: '#3F3F47',
  red: '#FF3B47', redDim: '#5A1F24',
  amber: '#FFB422', amberDim: '#5C4012',
  text: '#EDEAE0', muted: '#7A7A82', dim: '#4A4A52',
  green: '#34D399', cyan: '#22D3EE', purple: '#A855F7',
};
const FONTS = {
  display: '"Anton", "Bebas Neue", Impact, sans-serif',
  body: '"Manrope", system-ui, sans-serif',
  mono: '"JetBrains Mono", "SF Mono", Menlo, monospace',
};

// ─── RESPONSIVIDADE ─────────────────────────────────────────
const BREAKPOINTS = { mobile: 600, tablet: 900 };

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < BREAKPOINTS.mobile : false
  );
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < BREAKPOINTS.mobile);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

// ─── VERSÕES DO JOGO ────────────────────────────────────────
const VERSIONS = {
  '2002': { id: '2002', label: '2002', subtitle: 'Clássica',       color: C.red,    fullLabel: 'KOF 2002 (Clássica)' },
  'um':   { id: 'um',   label: 'UM',   subtitle: 'Steam',          color: C.cyan,   fullLabel: 'KOF 2002 UM (Steam)' },
  'xv':   { id: 'xv',   label: 'XV',   subtitle: 'Multi-plataforma', color: C.purple, fullLabel: 'KOF XV (PS/Xbox/Switch/Steam)' },
};
const VERSION_IDS = ['2002', 'um', 'xv'];

function VersionBadge({ version, size = 'md' }) {
  const v = VERSIONS[version];
  if (!v) return null;
  const dims = { sm: { font: 9, pad: '2px 6px' }, md: { font: 10, pad: '3px 8px' }, lg: { font: 12, pad: '4px 10px' } }[size];
  return (
    <span style={{ fontFamily: FONTS.mono, fontSize: dims.font, color: v.color, border: `1px solid ${v.color}`, padding: dims.pad, letterSpacing: '0.15em', whiteSpace: 'nowrap' }}>
      {v.label} · {v.subtitle.toUpperCase()}
    </span>
  );
}

// ─── RANK SYSTEM ────────────────────────────────────────────
// Curva progressiva: gaps crescentes pra ranks altos serem conquistas reais
// Sair de E vai rápido (incentiva iniciantes); chegar em Monarch leva meses
const RANKS = [
  { id: 'E',  name: 'E-Rank',         min: 0,    color: '#6B7280', glow: false, tier: 1 },
  { id: 'D',  name: 'D-Rank',         min: 1100, color: '#A16207', glow: false, tier: 2 }, // +100
  { id: 'C',  name: 'C-Rank',         min: 1250, color: '#16A34A', glow: false, tier: 3 }, // +150
  { id: 'B',  name: 'B-Rank',         min: 1450, color: '#2563EB', glow: false, tier: 4 }, // +200
  { id: 'A',  name: 'A-Rank',         min: 1700, color: '#9333EA', glow: false, tier: 5 }, // +250
  { id: 'S',  name: 'S-Rank',         min: 2000, color: '#F59E0B', glow: true,  tier: 6 }, // +300
  { id: 'NL', name: 'National Level', min: 2400, color: '#DC2626', glow: true,  tier: 7 }, // +400
  { id: 'MO', name: 'Monarch',        min: 2900, color: '#A855F7', glow: true,  tier: 8 }, // +500
  // ────────────────────────────────────────────────────────────
  // 🤫 RANK SECRETO — NÃO COMENTE COM NINGUÉM
  // The Architect — referência ao criador do Sistema em Solo Leveling.
  // ELO mínimo: 100.000 (praticamente impossível em condições normais).
  // O primeiro lutador que atingir merece um presente real do admin.
  // Filtrado da Legenda, do gráfico, dos rankings públicos.
  // Quando alguém atingir, dispara modal de revelação tela cheia
  // visível pra todos UMA ÚNICA VEZ.
  // ────────────────────────────────────────────────────────────
  { id: 'AR', name: 'The Architect', min: 100000, color: '#FFD700', glow: true, tier: 9, secret: true },
];
const STARTING_ELO = 1000;
const K_FACTOR = 24; // reduzido de 32 → 24: rankings mais estáveis, menos oscilação por partida

// ─── PERSONAGENS KOF 2002/UM ────────────────────────────────
// Lista de personagens jogáveis pra escolher mains no perfil
const KOF_CHARACTERS = [
  // Hero Team
  'Kyo Kusanagi', 'Benimaru Nikaido', 'Goro Daimon',
  // Fatal Fury Team
  'Terry Bogard', 'Andy Bogard', 'Joe Higashi',
  // Art of Fighting Team
  'Ryo Sakazaki', 'Robert Garcia', 'Takuma Sakazaki',
  // Ikari Warriors Team
  'Leona Heidern', 'Ralf Jones', 'Clark Still',
  // Psycho Soldier Team
  'Athena Asamiya', 'Sie Kensou', 'Chin Gentsai',
  // Women Fighters Team
  'Mai Shiranui', 'Yuri Sakazaki', 'King',
  // K\' Team
  'K\'', 'Maxima', 'Vanessa', 'Ramon',
  // Korea Team
  'Kim Kaphwan', 'Chang Koehan', 'Choi Bounge', 'Jhun Hoon',
  // Outros
  'Iori Yagami', 'Mature', 'Vice', 'Yashiro Nanakase', 'Shermie', 'Chris',
  'Kula Diamond', 'K9999', 'Angel', 'May Lee', 'Hinako Shijou',
  'Bao', 'Lin', 'Seth', 'Kusanagi',
  // Bosses
  'Rugal Bernstein', 'Goenitz', 'Krizalid', 'Orochi', 'Igniz', 'Zero', 'Original Zero',
  // UM extras
  'Geese Howard', 'Mr. Karate', 'Iori (Flames)', 'EX Kyo', 'EX Iori',
];

// Roster KOF XV (base game + DLC)
const KOF_CHARACTERS_XV = [
  // Hero Team
  'Shun\'ei', 'Meitenkun', 'Benimaru Nikaido',
  // K\' Team
  'K\'', 'Maxima', 'Whip',
  // Yagami Team
  'Iori Yagami', 'Mature', 'Vice',
  // Fatal Fury Team
  'Terry Bogard', 'Andy Bogard', 'Joe Higashi',
  // Art of Fighting Team
  'Ryo Sakazaki', 'Robert Garcia', 'King',
  // Ikari Team
  'Leona Heidern', 'Ralf Jones', 'Clark Still',
  // Kim Team
  'Kim Kaphwan', 'Gang-il', 'Dolores',
  // Super Heroine Team
  'Athena Asamiya', 'Mai Shiranui', 'Yuri Sakazaki',
  // Rival Team
  'Ash Crimson', 'Elisabeth Blanctorche', 'Kukri',
  // Sacred Treasures Team
  'Kyo Kusanagi', 'Iori Yagami (Orochinagi)', 'Chizuru Kagura',
  // Krohnen Team
  'Krohnen', 'Angel', 'Isla',
  // Secret Agent / Sacred Guardian
  'Blue Mary', 'Vanessa', 'Luong',
  // Awakened Orochi Team
  'Yashiro Nanakase', 'Shermie', 'Chris',
  // GAROU Team (DLC)
  'Rock Howard', 'B. Jenet', 'Gato',
  // Samurai Shodown (DLC)
  'Haohmaru', 'Nakoruru', 'Darli Dagger',
  // SF VI Crossover (DLC)
  'Geese Howard', 'Billy Kane', 'Ryuji Yamazaki',
  // Boss / Unlock
  'Omega Rugal', 'Goenitz', 'Verse', 'Re Kukri',
  // South Town Team (DLC)
  'Heidern', 'Najd', 'Sylvie Paula Paula',
];

function getCharactersForVersion(version) {
  if (version === 'xv') return KOF_CHARACTERS_XV;
  return KOF_CHARACTERS;
}

function getRank(elo) {
  for (let i = RANKS.length - 1; i >= 0; i--) if (elo >= RANKS[i].min) return RANKS[i];
  return RANKS[0];
}
function nextRankInfo(elo) {
  const cur = getRank(elo);
  // Não vaza o rank secreto na progressão: pra todo mundo abaixo de 100k,
  // Monarch parece ser o teto.
  const next = RANKS.find((r) => r.min > elo && !r.secret);
  return { current: cur, next: next || null, gap: next ? next.min - elo : 0 };
}

// ─── MODERAÇÃO ──────────────────────────────────────────────
// Helpers pra filtrar lutadores em listas públicas (ranking, agenda, etc).
// Banidos nunca aparecem em listas públicas, mas SUAS LUTAS PASSADAS continuam
// no histórico de quem lutou contra eles (com a tag BANIDO).
function isPublic(p) {
  // Em modo Supabase, admin é um perfil normal que TAMBÉM é lutador
  // Em modo demo, admin tinha ID 'admin' (fictício) e era excluído das listas
  return p && p.id !== 'admin' && !p.isBanned && !p.isDeleted;
}
function isCompetitor(p) {
  // Lutadores que aparecem em listas públicas E podem ser agendados pra novos duelos
  return isPublic(p);
}

// ─── ELO ENGINE (por versão!) ───────────────────────────────
function expectedScore(rA, rB) { return 1 / (1 + Math.pow(10, (rB - rA) / 400)); }

// Calcula K efetivo baseado no formato + placar de rounds
// Premia placares "domináveis" e protege placares "apertados"
// Lutas sem placar (formato 'casual' antigo) usam K cheio
function effectiveK(match) {
  const fmt = match.format || 'casual';
  const r1 = match.roundsWonP1;
  const r2 = match.roundsWonP2;
  if (fmt === 'casual' || r1 == null || r2 == null) return K_FACTOR;
  const maxRounds = fmt === 'FT3' ? 3 : fmt === 'FT5' ? 5 : fmt === 'FT10' ? 10 : 3;
  const winnerRounds = Math.max(r1, r2);
  const loserRounds = Math.min(r1, r2);
  if (winnerRounds !== maxRounds) return K_FACTOR; // placar inválido, fallback
  // dominância: 1.0 = vitória sem perder round | 0.5 = empate técnico no limite
  const dominance = (winnerRounds - loserRounds) / winnerRounds;
  // K vai de 50% (placar apertado, ex 3-2) a 100% (placar perfeito, ex 3-0)
  return Math.round(K_FACTOR * (0.5 + 0.5 * dominance));
}

// Ratings por versão — retorna { '2002': {playerId: {elo,w,l}}, 'um': {...} }
function computeRatingsByVersion(players, matches, atDate) {
  const result = {};
  for (const v of VERSION_IDS) {
    const state = {};
    for (const p of players) state[p.id] = { elo: STARTING_ELO, w: 0, l: 0, games: 0 };
    const completed = matches
      .filter((m) => m.version === v && m.status === 'completed' && m.winnerId)
      .filter((m) => atDate ? new Date(m.completedAt || m.scheduledAt) <= atDate : true)
      .sort((a, b) => new Date(a.completedAt || a.scheduledAt) - new Date(b.completedAt || b.scheduledAt));
    for (const m of completed) {
      const a = state[m.player1Id], b = state[m.player2Id];
      if (!a || !b) continue;
      const eA = expectedScore(a.elo, b.elo);
      const sA = m.winnerId === m.player1Id ? 1 : 0;
      const k = effectiveK(m);
      const dA = k * (sA - eA);
      a.elo += dA; b.elo -= dA;
      if (sA === 1) { a.w++; b.l++; } else { a.l++; b.w++; }
      a.games++; b.games++;
    }
    for (const id in state) state[id].elo = Math.round(state[id].elo);
    result[v] = state;
  }
  return result;
}

function computeEloHistory(playerId, version, players, matches) {
  const elos = {};
  for (const p of players) elos[p.id] = STARTING_ELO;
  const history = [{ date: null, elo: STARTING_ELO, type: 'start' }];
  let peak = STARTING_ELO, current = STARTING_ELO, streak = 0, maxStreak = 0;
  const completed = matches.filter((m) => m.version === version && m.status === 'completed' && m.winnerId)
    .sort((a, b) => new Date(a.completedAt || a.scheduledAt) - new Date(b.completedAt || b.scheduledAt));
  for (const m of completed) {
    const a = elos[m.player1Id], b = elos[m.player2Id];
    if (a == null || b == null) continue;
    const eA = expectedScore(a, b);
    const sA = m.winnerId === m.player1Id ? 1 : 0;
    const k = effectiveK(m);
    const dA = k * (sA - eA);
    elos[m.player1Id] += dA; elos[m.player2Id] -= dA;
    if (m.player1Id === playerId || m.player2Id === playerId) {
      current = Math.round(elos[playerId]);
      const won = m.winnerId === playerId;
      const opponentId = m.player1Id === playerId ? m.player2Id : m.player1Id;
      history.push({ date: m.completedAt || m.scheduledAt, elo: current, won, opponentId, matchId: m.id });
      if (current > peak) peak = current;
      if (won) streak = streak >= 0 ? streak + 1 : 1;
      else streak = streak <= 0 ? streak - 1 : -1;
      if (Math.abs(streak) > Math.abs(maxStreak)) maxStreak = streak;
    }
  }
  return { history, peak, current, currentStreak: streak, maxStreak };
}

function predictDelta(eloA, eloB) {
  const eA = expectedScore(eloA, eloB);
  return { aWins: Math.round(K_FACTOR * (1 - eA)), aLoses: Math.round(K_FACTOR * (0 - eA)) };
}

// ─── STORAGE ────────────────────────────────────────────────
const KEYS = {
  players: 'arena:players:v5',
  matches: 'arena:matches:v5',
  bracket: (y, v) => `arena:bracket:${y}:${v}:v5`,
  seeded: 'arena:seeded:v5',
  myLogin: 'arena:my_login:v5',  // local, simula sessão
  architectRevealSeen: 'arena:architect_seen:v5', // local: já vi o reveal?
  comments: (matchId) => `arena:comments:${matchId}:v5`,
  follows: 'arena:follows:v5', // lista de IDs seguidos (local)
  news: 'arena:news:v5', // posts/notícias do admin
};
async function loadJSON(key, fallback, shared = true) {
  try { const r = await window.storage.get(key, shared); return r && r.value ? JSON.parse(r.value) : fallback; }
  catch { return fallback; }
}
async function saveJSON(key, value, shared = true) {
  try { await window.storage.set(key, JSON.stringify(value), shared); }
  catch (e) { console.error('save failed', key, e); }
}

// ─── HELPERS ────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const MESES = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
const DIAS = ['DOM','SEG','TER','QUA','QUI','SEX','SÁB'];

const startOfMonth = (y, m) => new Date(y, m, 1, 0, 0, 0);
const endOfMonth = (y, m) => new Date(y, m + 1, 0, 23, 59, 59);
const startOfYear = (y) => new Date(y, 0, 1, 0, 0, 0);
const endOfYear = (y) => new Date(y, 11, 31, 23, 59, 59);

function fmtDate(iso) { if (!iso) return '—'; const d = new Date(iso); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`; }
function fmtDateTime(iso) { const d = new Date(iso); return `${DIAS[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}/${MESES[d.getMonth()]} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
function fmtRelative(iso) {
  const diff = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diff);
  if (abs < 3600000) { const m = Math.round(diff / 60000); return diff > 0 ? `em ${m} min` : `há ${-m} min`; }
  if (abs < 86400000) { const h = Math.round(diff / 3600000); return diff > 0 ? `em ${h}h` : `há ${-h}h`; }
  const d = Math.round(diff / 86400000);
  if (Math.abs(d) <= 6) return diff > 0 ? `em ${d} dia${d > 1 ? 's' : ''}` : `há ${-d} dia${-d > 1 ? 's' : ''}`;
  return fmtDate(iso);
}

function periodStats(playerId, matches, version, start, end) {
  let w = 0, l = 0;
  for (const m of matches) {
    if (m.version !== version || m.status !== 'completed' || !m.winnerId) continue;
    const d = new Date(m.completedAt || m.scheduledAt);
    if (start && d < start) continue;
    if (end && d > end) continue;
    if (m.winnerId === playerId) w++;
    else if (m.player1Id === playerId || m.player2Id === playerId) l++;
  }
  return { w, l, total: w + l };
}

function youtubeId(url) {
  if (!url) return null;
  const patterns = [/youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})/, /youtu\.be\/([A-Za-z0-9_-]{11})/, /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/, /youtube\.com\/live\/([A-Za-z0-9_-]{11})/];
  for (const p of patterns) { const m = url.match(p); if (m) return m[1]; }
  return null;
}
function twitchChannel(url) { if (!url) return null; const m = url.match(/twitch\.tv\/([a-zA-Z0-9_]+)/); return m ? m[1] : null; }
// ─── GRAVATAR ────────────────────────────────────────────────
// MD5 implementation (necessária pra gerar URL do Gravatar)
// Fightcade usa Gravatar, então usar o mesmo email = mesma foto
function md5(str) {
  // Implementação compacta de MD5 (RFC 1321)
  function r(n, s) { return (n << s) | (n >>> (32 - s)); }
  function add(x, y) { const l = (x & 0xFFFF) + (y & 0xFFFF); return (((x >> 16) + (y >> 16) + (l >> 16)) << 16) | (l & 0xFFFF); }
  function f(x, y, z) { return (x & y) | ((~x) & z); }
  function g(x, y, z) { return (x & z) | (y & (~z)); }
  function h(x, y, z) { return x ^ y ^ z; }
  function i(x, y, z) { return y ^ (x | (~z)); }
  function step(fn, a, b, c, d, x, s, t) { return add(r(add(add(a, fn(b, c, d)), add(x, t)), s), b); }
  function toBlocks(s) {
    const bin = []; const len = s.length * 8;
    for (let i = 0; i < len; i += 8) bin[i >> 5] |= (s.charCodeAt(i / 8) & 0xFF) << (i % 32);
    bin[len >> 5] |= 0x80 << (len % 32); bin[(((len + 64) >>> 9) << 4) + 14] = len;
    return bin;
  }
  function toHex(num) {
    let out = '';
    for (let j = 0; j < 4; j++) out += ((num >> (j * 8 + 4)) & 0x0F).toString(16) + ((num >> (j * 8)) & 0x0F).toString(16);
    return out;
  }
  const x = toBlocks(unescape(encodeURIComponent(str)));
  let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
  for (let k = 0; k < x.length; k += 16) {
    const oa = a, ob = b, oc = c, od = d;
    a = step(f, a, b, c, d, x[k+0] || 0, 7, -680876936); d = step(f, d, a, b, c, x[k+1] || 0, 12, -389564586); c = step(f, c, d, a, b, x[k+2] || 0, 17, 606105819); b = step(f, b, c, d, a, x[k+3] || 0, 22, -1044525330);
    a = step(f, a, b, c, d, x[k+4] || 0, 7, -176418897); d = step(f, d, a, b, c, x[k+5] || 0, 12, 1200080426); c = step(f, c, d, a, b, x[k+6] || 0, 17, -1473231341); b = step(f, b, c, d, a, x[k+7] || 0, 22, -45705983);
    a = step(f, a, b, c, d, x[k+8] || 0, 7, 1770035416); d = step(f, d, a, b, c, x[k+9] || 0, 12, -1958414417); c = step(f, c, d, a, b, x[k+10] || 0, 17, -42063); b = step(f, b, c, d, a, x[k+11] || 0, 22, -1990404162);
    a = step(f, a, b, c, d, x[k+12] || 0, 7, 1804603682); d = step(f, d, a, b, c, x[k+13] || 0, 12, -40341101); c = step(f, c, d, a, b, x[k+14] || 0, 17, -1502002290); b = step(f, b, c, d, a, x[k+15] || 0, 22, 1236535329);
    a = step(g, a, b, c, d, x[k+1] || 0, 5, -165796510); d = step(g, d, a, b, c, x[k+6] || 0, 9, -1069501632); c = step(g, c, d, a, b, x[k+11] || 0, 14, 643717713); b = step(g, b, c, d, a, x[k+0] || 0, 20, -373897302);
    a = step(g, a, b, c, d, x[k+5] || 0, 5, -701558691); d = step(g, d, a, b, c, x[k+10] || 0, 9, 38016083); c = step(g, c, d, a, b, x[k+15] || 0, 14, -660478335); b = step(g, b, c, d, a, x[k+4] || 0, 20, -405537848);
    a = step(g, a, b, c, d, x[k+9] || 0, 5, 568446438); d = step(g, d, a, b, c, x[k+14] || 0, 9, -1019803690); c = step(g, c, d, a, b, x[k+3] || 0, 14, -187363961); b = step(g, b, c, d, a, x[k+8] || 0, 20, 1163531501);
    a = step(g, a, b, c, d, x[k+13] || 0, 5, -1444681467); d = step(g, d, a, b, c, x[k+2] || 0, 9, -51403784); c = step(g, c, d, a, b, x[k+7] || 0, 14, 1735328473); b = step(g, b, c, d, a, x[k+12] || 0, 20, -1926607734);
    a = step(h, a, b, c, d, x[k+5] || 0, 4, -378558); d = step(h, d, a, b, c, x[k+8] || 0, 11, -2022574463); c = step(h, c, d, a, b, x[k+11] || 0, 16, 1839030562); b = step(h, b, c, d, a, x[k+14] || 0, 23, -35309556);
    a = step(h, a, b, c, d, x[k+1] || 0, 4, -1530992060); d = step(h, d, a, b, c, x[k+4] || 0, 11, 1272893353); c = step(h, c, d, a, b, x[k+7] || 0, 16, -155497632); b = step(h, b, c, d, a, x[k+10] || 0, 23, -1094730640);
    a = step(h, a, b, c, d, x[k+13] || 0, 4, 681279174); d = step(h, d, a, b, c, x[k+0] || 0, 11, -358537222); c = step(h, c, d, a, b, x[k+3] || 0, 16, -722521979); b = step(h, b, c, d, a, x[k+6] || 0, 23, 76029189);
    a = step(h, a, b, c, d, x[k+9] || 0, 4, -640364487); d = step(h, d, a, b, c, x[k+12] || 0, 11, -421815835); c = step(h, c, d, a, b, x[k+15] || 0, 16, 530742520); b = step(h, b, c, d, a, x[k+2] || 0, 23, -995338651);
    a = step(i, a, b, c, d, x[k+0] || 0, 6, -198630844); d = step(i, d, a, b, c, x[k+7] || 0, 10, 1126891415); c = step(i, c, d, a, b, x[k+14] || 0, 15, -1416354905); b = step(i, b, c, d, a, x[k+5] || 0, 21, -57434055);
    a = step(i, a, b, c, d, x[k+12] || 0, 6, 1700485571); d = step(i, d, a, b, c, x[k+3] || 0, 10, -1894986606); c = step(i, c, d, a, b, x[k+10] || 0, 15, -1051523); b = step(i, b, c, d, a, x[k+1] || 0, 21, -2054922799);
    a = step(i, a, b, c, d, x[k+8] || 0, 6, 1873313359); d = step(i, d, a, b, c, x[k+15] || 0, 10, -30611744); c = step(i, c, d, a, b, x[k+6] || 0, 15, -1560198380); b = step(i, b, c, d, a, x[k+13] || 0, 21, 1309151649);
    a = step(i, a, b, c, d, x[k+4] || 0, 6, -145523070); d = step(i, d, a, b, c, x[k+11] || 0, 10, -1120210379); c = step(i, c, d, a, b, x[k+2] || 0, 15, 718787259); b = step(i, b, c, d, a, x[k+9] || 0, 21, -343485551);
    a = add(a, oa); b = add(b, ob); c = add(c, oc); d = add(d, od);
  }
  return toHex(a) + toHex(b) + toHex(c) + toHex(d);
}

// Gera URL do Gravatar a partir de um email (mesmo formato usado pelo Fightcade)
// Se o email não tem conta no Gravatar, mostra avatar gerado automaticamente (estilo "identicon")
function gravatarUrl(email, size = 200) {
  if (!email || typeof email !== 'string') return null;
  const clean = email.trim().toLowerCase();
  const hash = md5(clean);
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=identicon`;
}

function streamEmbedUrl(url, autoplay = true) {
  if (!url) return null;
  const yt = youtubeId(url);
  if (yt) return `https://www.youtube.com/embed/${yt}${autoplay ? '?autoplay=1' : ''}`;
  const tw = twitchChannel(url);
  if (tw) {
    const parent = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    return `https://player.twitch.tv/?channel=${tw}&parent=${parent}${autoplay ? '&autoplay=true' : '&autoplay=false'}`;
  }
  return null;
}
function streamPlatform(url) { if (youtubeId(url)) return 'YouTube'; if (twitchChannel(url)) return 'Twitch'; return 'Externo'; }
async function fetchVodMeta(url) {
  if (!url) return null;
  try {
    const res = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.error) return null;
    return { title: data.title || null, author: data.author_name || null, thumbnail: data.thumbnail_url || null };
  } catch { return null; }
}

// ─── SEED (vazio — começamos do zero) ───────────────────────
function generateSeed() {
  // Apenas 4 lutadores demo + 1 admin pra ter algo na tela inicial
  const now = Date.now();
  const day = 86400000;
  const iso = (off) => new Date(now + off * day).toISOString();
  const players = [
    { id: 'admin', tag: 'BNOST', name: 'Admin BNOSTLE', joinedAt: iso(-100), avatarColor: '#A855F7', bio: 'Organizador da Arena · transmissões oficiais', email: 'admin@bnostle.gg', authProvider: 'google' },
    { id: 'h1', tag: 'KYOSAN', name: 'Lucas Almeida', joinedAt: iso(-30), avatarColor: '#FF3B47', bio: 'Main Kyo · arcade stick', email: 'lucas@example.com', authProvider: 'discord' },
    { id: 'h2', tag: 'IORIBR', name: 'Pedro Yagami', joinedAt: iso(-25), avatarColor: '#9333EA', bio: 'Iori puro', email: 'pedro@example.com', authProvider: 'twitch' },
    { id: 'h3', tag: 'TERRY',  name: 'Marcos Bogard', joinedAt: iso(-20), avatarColor: '#F59E0B', bio: 'Power Geyser specialist', email: 'marcos@example.com', authProvider: 'google' },
    { id: 'h4', tag: 'MAIBR',  name: 'Camila Shiranui', joinedAt: iso(-15), avatarColor: '#DC2626', bio: 'Mai · controle todo', email: 'camila@example.com', authProvider: 'google' },
  ];
  return { players, matches: [] };
}

// ─── PRIMITIVES ─────────────────────────────────────────────
function Btn({ children, onClick, variant = 'primary', disabled, size = 'md', style: extra, type = 'button' }) {
  const base = { fontFamily: FONTS.display, letterSpacing: '0.08em', border: '1px solid', cursor: disabled ? 'not-allowed' : 'pointer', transition: 'all 0.12s', textTransform: 'uppercase', opacity: disabled ? 0.4 : 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 };
  const sizes = { sm: { padding: '6px 12px', fontSize: 13 }, md: { padding: '10px 18px', fontSize: 15 }, lg: { padding: '14px 24px', fontSize: 18 } };
  const variants = {
    primary: { background: C.red, borderColor: C.red, color: '#fff' },
    ghost:   { background: 'transparent', borderColor: C.border, color: C.text },
    amber:   { background: C.amber, borderColor: C.amber, color: '#0A0A0A' },
    danger:  { background: 'transparent', borderColor: C.redDim, color: C.red },
    confirm: { background: 'transparent', borderColor: C.green, color: C.green },
    purple:  { background: C.purple, borderColor: C.purple, color: '#fff' },
    cyan:    { background: C.cyan, borderColor: C.cyan, color: '#0A0A0A' },
  };
  return (
    <button type={type} disabled={disabled} onClick={onClick} style={{ ...base, ...sizes[size], ...variants[variant], ...extra }}
      onMouseEnter={(e) => { if (!disabled && variant === 'ghost') e.currentTarget.style.borderColor = C.text; }}
      onMouseLeave={(e) => { if (!disabled && variant === 'ghost') e.currentTarget.style.borderColor = C.border; }}>
      {children}
    </button>
  );
}
function Input({ value, onChange, placeholder, type = 'text' }) {
  return <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
    style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, padding: '10px 12px', fontFamily: FONTS.body, fontSize: 14, width: '100%', outline: 'none' }}
    onFocus={(e) => (e.currentTarget.style.borderColor = C.red)} onBlur={(e) => (e.currentTarget.style.borderColor = C.border)} />;
}
function Textarea({ value, onChange, placeholder, rows = 2 }) {
  return <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows}
    style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, padding: '10px 12px', fontFamily: FONTS.body, fontSize: 14, width: '100%', outline: 'none', resize: 'vertical' }}
    onFocus={(e) => (e.currentTarget.style.borderColor = C.red)} onBlur={(e) => (e.currentTarget.style.borderColor = C.border)} />;
}
function Select({ value, onChange, children }) {
  return <select value={value} onChange={(e) => onChange(e.target.value)}
    style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, padding: '10px 12px', fontFamily: FONTS.body, fontSize: 14, width: '100%', outline: 'none', cursor: 'pointer' }}>{children}</select>;
}
function Panel({ children, title, accent, action }) {
  return (
    <div style={{ background: C.elevated, border: `1px solid ${C.border}` }}>
      {title && (
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}`, fontFamily: FONTS.display, letterSpacing: '0.12em', fontSize: 14, color: accent || C.muted, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {accent && <span style={{ width: 8, height: 8, background: accent, display: 'inline-block' }} />}{title}
          </span>
          {action}
        </div>
      )}
      <div style={{ padding: 18 }}>{children}</div>
    </div>
  );
}
function Empty({ msg }) { return <div style={{ padding: 30, textAlign: 'center', color: C.dim, fontFamily: FONTS.body, fontSize: 14, fontStyle: 'italic' }}>{msg}</div>; }
const lbl = { fontFamily: FONTS.mono, fontSize: 10, color: C.muted, letterSpacing: '0.15em', display: 'block', marginBottom: 6 };

// ─── AVATAR ─────────────────────────────────────────────────
function shade(hex, amt) {
  const num = parseInt(hex.slice(1), 16);
  let r = (num >> 16) + amt; let g = ((num >> 8) & 0xff) + amt; let b = (num & 0xff) + amt;
  r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}
function Avatar({ player, size = 36, onClick }) {
  if (!player) return <div style={{ width: size, height: size, background: C.border }} />;
  // Prioridade: avatarUrl explícito > Gravatar via fightcadeEmail > iniciais coloridas
  const resolvedUrl = player.avatarUrl || (player.fightcadeEmail ? gravatarUrl(player.fightcadeEmail, Math.max(size * 2, 96)) : null);
  if (resolvedUrl) {
    return <img src={resolvedUrl} alt={player.tag} onClick={onClick}
      style={{ width: size, height: size, objectFit: 'cover', cursor: onClick ? 'pointer' : 'default', flexShrink: 0 }} />;
  }
  const initials = (player.tag || player.name || '?').slice(0, 2).toUpperCase();
  return (
    <div onClick={onClick}
      style={{ width: size, height: size, background: `linear-gradient(135deg, ${player.avatarColor || C.muted}, ${shade(player.avatarColor || C.muted, -30)})`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONTS.display, fontSize: size * 0.4, letterSpacing: '0.02em', flexShrink: 0, cursor: onClick ? 'pointer' : 'default' }}>
      {initials}
    </div>
  );
}
function RankBadge({ elo, size = 'md' }) {
  const r = getRank(elo);
  const dims = { sm: { box: 28, font: 14 }, md: { box: 40, font: 20 }, lg: { box: 56, font: 28 } }[size];

  // 🤫 Render especial pro rank secreto
  if (r.secret) {
    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <div className="kof-architect-badge" style={{
          width: dims.box, height: dims.box,
          background: 'linear-gradient(135deg, #FFD700, #FF8C00, #FF1493, #9333EA, #00BFFF, #FFD700)',
          backgroundSize: '300% 300%',
          color: '#0A0A0A',
          fontFamily: FONTS.display,
          fontSize: dims.font,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          letterSpacing: '-0.05em',
          position: 'relative',
          fontWeight: 900,
          textShadow: '0 0 4px rgba(255,255,255,0.8)',
          flexShrink: 0,
        }}>
          {r.id}
          <div style={{ position: 'absolute', inset: -3, border: `2px solid #FFD700`, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', inset: -7, border: `1px solid #FFD700`, opacity: 0.5, pointerEvents: 'none' }} />
        </div>
        {size !== 'sm' && (
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
            <span style={{ fontFamily: FONTS.mono, fontSize: 11, color: '#FFD700', fontWeight: 700, textShadow: '0 0 8px rgba(255,215,0,0.6)' }}>{elo} ELO</span>
            <span style={{ fontFamily: FONTS.display, fontSize: 11, color: '#FFD700', letterSpacing: '0.15em' }}>THE ARCHITECT</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: dims.box, height: dims.box, background: r.glow ? `linear-gradient(135deg, ${r.color}, ${shade(r.color, -20)})` : 'transparent', border: `2px solid ${r.color}`, color: r.glow ? '#0A0A0A' : r.color, fontFamily: FONTS.display, fontSize: dims.font, display: 'flex', alignItems: 'center', justifyContent: 'center', letterSpacing: r.id.length > 1 ? '-0.05em' : '0.02em', boxShadow: r.glow ? `0 0 12px ${r.color}55` : 'none', position: 'relative', flexShrink: 0 }}>
        {r.id}
        {r.tier === 8 && <div style={{ position: 'absolute', inset: -4, border: `1px solid ${r.color}`, opacity: 0.5, pointerEvents: 'none' }} />}
      </div>
      {size !== 'sm' && (
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
          <span style={{ fontFamily: FONTS.mono, fontSize: 11, color: r.color, fontWeight: 600 }}>{elo} ELO</span>
          {r.tier >= 7 && <span style={{ fontFamily: FONTS.mono, fontSize: 9, color: C.muted, letterSpacing: '0.15em' }}>{r.name.toUpperCase()}</span>}
        </div>
      )}
    </div>
  );
}

// ─── RANK LEGEND ────────────────────────────────────────────
// Mostra todos os 8 níveis de rank com ELO mínimo
function RankLegend({ compact = false, currentElo = null }) {
  if (compact) {
    // Linha horizontal pra mostrar na home (versão enxuta)
    return (
      <Panel title="LEGENDA DE RANKS" accent={C.purple}>
        <div style={{ fontFamily: FONTS.body, fontSize: 12, color: C.muted, marginBottom: 12, lineHeight: 1.5 }}>
          Todo lutador começa em <span style={{ color: '#6B7280', fontFamily: FONTS.mono }}>E-Rank ({STARTING_ELO} ELO)</span> e evolui ganhando partidas. Cada vitória soma ELO, cada derrota subtrai. Os ranks são separados por versão (2002 e UM).
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
          {RANKS.filter((r) => !r.secret).map((r) => {
            const isCurrent = currentElo !== null && getRank(currentElo).id === r.id;
            return (
              <div key={r.id} style={{
                background: isCurrent ? r.color + '22' : C.bg,
                border: `1px solid ${isCurrent ? r.color : C.border}`,
                padding: '10px 12px',
                display: 'flex', alignItems: 'center', gap: 10,
                position: 'relative',
              }}>
                <div style={{
                  width: 32, height: 32,
                  background: r.glow ? `linear-gradient(135deg, ${r.color}, ${shade(r.color, -20)})` : 'transparent',
                  border: `2px solid ${r.color}`, color: r.glow ? '#0A0A0A' : r.color,
                  fontFamily: FONTS.display, fontSize: r.id.length > 1 ? 12 : 16,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  letterSpacing: r.id.length > 1 ? '-0.05em' : '0.02em',
                  boxShadow: r.glow ? `0 0 8px ${r.color}55` : 'none',
                  flexShrink: 0,
                }}>{r.id}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: FONTS.display, fontSize: 13, color: r.color, letterSpacing: '0.05em', lineHeight: 1 }}>{r.name}</div>
                  <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: C.muted, marginTop: 2 }}>{r.min}+ ELO</div>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
    );
  }
  // Versão expandida pra usar dentro da página de Lutadores
  return (
    <Panel title="LEGENDA DE RANKS · NÍVEIS POSSÍVEIS" accent={C.purple}>
      <div style={{ fontFamily: FONTS.body, fontSize: 13, color: C.muted, marginBottom: 16, lineHeight: 1.6 }}>
        Inspirados no sistema de Solo Leveling, os ranks vão de <strong style={{ color: '#6B7280' }}>E</strong> (iniciante) até <strong style={{ color: '#A855F7' }}>Monarch</strong> (lendário). Cada rank tem um ELO mínimo. Você ganha ELO vencendo lutas e perde quando é derrotado — quanto mais forte o oponente, mais ELO está em jogo. Os rankings de <strong style={{ color: C.red }}>2002 (Clássica)</strong> e <strong style={{ color: C.cyan }}>UM (Steam)</strong> são <strong>independentes</strong>: você pode ser S-Rank no 2002 e B-Rank no UM, por exemplo.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: C.border }}>
        {RANKS.filter((r) => !r.secret).map((r, i, arr) => {
          const next = arr[i + 1];
          const range = next ? `${r.min} – ${next.min - 1}` : `${r.min}+`;
          return (
            <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '60px 1fr 130px 60px', gap: 14, alignItems: 'center', padding: '14px 16px', background: C.elevated }}>
              <div style={{
                width: 44, height: 44,
                background: r.glow ? `linear-gradient(135deg, ${r.color}, ${shade(r.color, -20)})` : 'transparent',
                border: `2px solid ${r.color}`, color: r.glow ? '#0A0A0A' : r.color,
                fontFamily: FONTS.display, fontSize: r.id.length > 1 ? 16 : 22,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                letterSpacing: r.id.length > 1 ? '-0.05em' : '0.02em',
                boxShadow: r.glow ? `0 0 12px ${r.color}55` : 'none',
                position: 'relative',
              }}>
                {r.id}
                {r.tier === 8 && <div style={{ position: 'absolute', inset: -4, border: `1px solid ${r.color}`, opacity: 0.5, pointerEvents: 'none' }} />}
              </div>
              <div>
                <div style={{ fontFamily: FONTS.display, fontSize: 18, color: r.color, letterSpacing: '0.05em', lineHeight: 1 }}>{r.name}</div>
                <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: C.muted, marginTop: 4, letterSpacing: '0.1em' }}>{rankFlavor(r.id)}</div>
              </div>
              <div style={{ fontFamily: FONTS.mono, fontSize: 12, color: C.text, textAlign: 'right' }}>{range} ELO</div>
              <div style={{ textAlign: 'right' }}>
                {r.glow && <span style={{ fontFamily: FONTS.mono, fontSize: 9, color: r.color, letterSpacing: '0.15em', border: `1px solid ${r.color}`, padding: '2px 6px' }}>ELITE</span>}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 16, padding: 12, background: C.bg, border: `1px dashed ${C.border}`, fontFamily: FONTS.mono, fontSize: 11, color: C.muted, lineHeight: 1.6, letterSpacing: '0.05em' }}>
        ★ Os 8 melhores de cada versão se classificam para o <span style={{ color: C.amber }}>CAMPEONATO ANUAL</span>. O vencedor vira <span style={{ color: C.purple }}>SHADOW MONARCH</span> daquela versão pelo ano.
      </div>
    </Panel>
  );
}

// Texto descritivo curto pra cada rank
function rankFlavor(id) {
  const map = {
    'E':  'Iniciante · Todo mundo começa aqui',
    'D':  'Conhece o básico do jogo',
    'C':  'Defesa sólida · Combos consistentes',
    'B':  'Lutador competitivo · Domina matchups',
    'A':  'Avançado · Mind games e adaptação',
    'S':  'Elite · Top da cena local',
    'NL': 'Nível Nacional · Referência da comunidade',
    'MO': 'Lendário · Apenas os Monarchs chegam aqui',
  };
  return map[id] || '';
}

function HunterCompact({ p, rank, won, dim, onClick }) {
  if (!p) return <span style={{ color: C.dim }}>—</span>;
  const isDeleted = p.isDeleted;
  const isBanned = p.isBanned && !isDeleted;
  const clickable = onClick && !isDeleted; // perfil deletado não é clicável
  return (
    <span onClick={clickable ? onClick : null} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, opacity: dim ? 0.5 : 1, cursor: clickable ? 'pointer' : 'default' }}>
      <span style={{ width: 18, height: 18, border: `1.5px solid ${rank.color}`, color: rank.glow ? '#0A0A0A' : rank.color, background: rank.glow ? rank.color : 'transparent', fontFamily: FONTS.display, fontSize: 11, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{rank.id}</span>
      <span style={{ fontFamily: FONTS.display, color: isDeleted ? C.dim : (won ? C.amber : C.text), fontSize: 16, letterSpacing: '0.05em', textDecoration: (isBanned || isDeleted) ? 'line-through' : 'none', fontStyle: isDeleted ? 'italic' : 'normal' }}>
        {isDeleted ? '(perfil deletado)' : p.tag}
      </span>
      {isDeleted && <span style={{ fontFamily: FONTS.mono, fontSize: 9, color: C.dim, border: `1px solid ${C.dim}`, padding: '1px 5px', letterSpacing: '0.15em' }}>DELETADO</span>}
      {isBanned && <span style={{ fontFamily: FONTS.mono, fontSize: 9, color: C.red, border: `1px solid ${C.red}`, padding: '1px 5px', letterSpacing: '0.15em' }}>BANIDO</span>}
      {won && !isDeleted && <span style={{ color: C.amber, fontSize: 11 }}>★</span>}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════
// LOGIN SCREEN (simulated OAuth)
// ═══════════════════════════════════════════════════════════
function LoginScreen({ players, onLogin, onLoginAsAdmin }) {
  const [showDemo, setShowDemo] = useState(false);

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: FONTS.body, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(12px, 3vw, 24px)', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: `repeating-linear-gradient(0deg, transparent 0, transparent 2px, rgba(255,255,255,0.015) 2px, rgba(255,255,255,0.015) 3px)`, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: '20%', right: '-10%', width: 600, height: 600, background: `radial-gradient(circle, ${C.redDim} 0%, transparent 60%)`, opacity: 0.5, pointerEvents: 'none' }} />

      <div style={{ maxWidth: 480, width: '100%', position: 'relative', zIndex: 1 }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <span style={{ width: 32, height: 32, background: C.red, transform: 'rotate(45deg)' }} />
            <span style={{ fontFamily: FONTS.mono, fontSize: 11, color: C.muted, letterSpacing: '0.3em' }}>// CANAL OFICIAL</span>
          </div>
          <h1 style={{ fontFamily: FONTS.display, fontSize: 'clamp(56px, 10vw, 96px)', letterSpacing: '0.02em', lineHeight: 0.85, margin: 0, color: C.text }}>
            ARENA<br /><span style={{ color: C.red }}>BNOSTLE</span>
          </h1>
          <div style={{ fontFamily: FONTS.body, fontSize: 14, color: C.muted, marginTop: 16, letterSpacing: '0.04em' }}>
            KOF 2002 · UM · XV · LIGA OFICIAL
          </div>
        </div>

        <div style={{ background: C.elevated, border: `1px solid ${C.border}`, padding: 28 }}>
          <div style={{ fontFamily: FONTS.display, fontSize: 22, color: C.text, letterSpacing: '0.05em', marginBottom: 6, textAlign: 'center' }}>ENTRAR NA ARENA</div>
          <div style={{ fontFamily: FONTS.body, fontSize: 13, color: C.muted, textAlign: 'center', marginBottom: 24, lineHeight: 1.5 }}>
            Faça login pra ter seu perfil, ELO e aparecer no ranking. Ranqueamentos separados por versão (2002 · UM · XV).
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <SocialLoginBtn provider="google" onClick={() => onLogin('google')} />
            <SocialLoginBtn provider="discord" onClick={() => onLogin('discord')} />
            <SocialLoginBtn provider="twitch" onClick={() => onLogin('twitch')} />
          </div>

          <div style={{ marginTop: 20, padding: 12, background: C.bg, border: `1px dashed ${C.border}` }}>
            <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: C.muted, letterSpacing: '0.15em', marginBottom: 8 }}>
              ⚠ MODO DEMO · LOGIN SIMULADO
            </div>
            <div style={{ fontFamily: FONTS.body, fontSize: 12, color: C.dim, lineHeight: 1.5, marginBottom: 8 }}>
              Os botões acima abrem um seletor de lutador. Em produção (após deploy com Supabase), eles fazem login real OAuth.
            </div>
            <button onClick={() => setShowDemo((v) => !v)}
              style={{ background: 'transparent', border: 'none', color: C.cyan, cursor: 'pointer', fontFamily: FONTS.mono, fontSize: 11, letterSpacing: '0.1em', padding: 0 }}>
              {showDemo ? '▼' : '▶'} {showDemo ? 'OCULTAR' : 'MOSTRAR'} OPÇÕES DE DEMO
            </button>
          </div>

          {showDemo && (
            <div style={{ marginTop: 12, padding: 12, background: C.bg, border: `1px solid ${C.purple}` }}>
              <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: C.purple, letterSpacing: '0.15em', marginBottom: 8 }}>ENTRAR COMO:</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button onClick={onLoginAsAdmin}
                  style={{ background: C.purple, color: '#fff', border: 'none', padding: '10px 14px', cursor: 'pointer', fontFamily: FONTS.display, fontSize: 13, letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-start' }}>
                  <span>⚡</span> ADMIN (BNOSTLE)
                </button>
                {players.filter(isCompetitor).map((p) => (
                  <button key={p.id} onClick={() => onLogin(p.authProvider, p)}
                    style={{ background: 'transparent', color: C.text, border: `1px solid ${C.border}`, padding: '8px 14px', cursor: 'pointer', fontFamily: FONTS.body, fontSize: 13, display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-start' }}>
                    <Avatar player={p} size={24} />
                    <span style={{ fontFamily: FONTS.display, color: C.amber, letterSpacing: '0.05em' }}>{p.tag}</span>
                    <span style={{ color: C.muted, fontSize: 12 }}>{p.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: 20 }}>
            <Btn variant="ghost" size="sm" onClick={() => onLogin(null)} style={{ width: '100%' }}>CONTINUAR SEM LOGIN (VISITANTE)</Btn>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 24, fontFamily: FONTS.mono, fontSize: 11, color: C.dim, letterSpacing: '0.15em' }}>
          v0.5 · ARISE
        </div>
      </div>
    </div>
  );
}

function SocialLoginBtn({ provider, onClick }) {
  const configs = {
    google:  { label: 'Continuar com Google',  bg: '#fff', color: '#1f1f1f', icon: '🅖' },
    discord: { label: 'Continuar com Discord', bg: '#5865F2', color: '#fff', icon: '🎮' },
    twitch:  { label: 'Continuar com Twitch',  bg: '#9146FF', color: '#fff', icon: '📺' },
  };
  const cfg = configs[provider];
  return (
    <button onClick={onClick}
      style={{ background: cfg.bg, color: cfg.color, border: 'none', padding: '14px 18px', cursor: 'pointer', fontFamily: FONTS.body, fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center', transition: 'transform 0.1s' }}
      onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
      onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
      <span style={{ fontSize: 18 }}>{cfg.icon}</span>{cfg.label}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════
// LIVESTREAM POPUP (draggable)
// ═══════════════════════════════════════════════════════════
function useDrag(initial) {
  const [pos, setPos] = useState(initial);
  const drag = useRef(null);
  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    drag.current = { sx: e.clientX, sy: e.clientY, px: pos.x, py: pos.y };
    const move = (ev) => {
      if (!drag.current) return;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 380, drag.current.px + (ev.clientX - drag.current.sx))),
        y: Math.max(0, Math.min(window.innerHeight - 120, drag.current.py + (ev.clientY - drag.current.sy))),
      });
    };
    const up = () => { drag.current = null; document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
  };
  return { pos, dragHandlers: { onMouseDown } };
}

// ═══════════════════════════════════════════════════════════
// PIX DONATION MODAL
// ═══════════════════════════════════════════════════════════
function PixDonationModal({ onClose }) {
  const [copied, setCopied] = useState(false);
  const [imgError, setImgError] = useState(false);

  const copy = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(PIX_CONFIG.pixKey).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
      zIndex: 10500, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16, animation: 'kof-fade-bg 0.3s ease-out',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: C.elevated, border: `1px solid ${C.green}`,
        borderTop: `3px solid ${C.green}`, maxWidth: 480, width: '100%',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{ padding: 'clamp(14px, 4vw, 20px) clamp(16px, 4vw, 24px)', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <div>
            <div style={{ fontFamily: FONTS.mono, fontSize: 11, color: C.green, letterSpacing: '0.2em', marginBottom: 4 }}>💚 APOIE A ARENA</div>
            <h3 style={{ fontFamily: FONTS.display, fontSize: 26, letterSpacing: '0.05em', margin: 0, color: C.text, lineHeight: 1 }}>
              FAÇA UMA DOAÇÃO
            </h3>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: C.muted, fontSize: 24, cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
        </div>

        {/* Conteúdo */}
        <div style={{ padding: 'clamp(16px, 4vw, 24px)' }}>
          <div style={{ fontFamily: FONTS.body, fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 20, textAlign: 'center' }}>
            A ARENA BNOSTLE é <strong style={{ color: C.text }}>100% gratuita</strong> e sempre vai ser. Se você curte o projeto e quer ajudar a mantê-lo no ar, qualquer valor é muito bem-vindo. 🥊
          </div>

          {/* QR Code */}
          <div style={{ background: '#fff', padding: 16, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {imgError ? (
              <div style={{ width: '100%', aspectRatio: '1', maxWidth: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, color: '#666', textAlign: 'center', padding: 16 }}>
                <span style={{ fontSize: 32 }}>📱</span>
                <span style={{ fontFamily: FONTS.mono, fontSize: 11, letterSpacing: '0.1em' }}>QR CODE NÃO ENCONTRADO</span>
                <span style={{ fontFamily: FONTS.body, fontSize: 11, color: '#999' }}>(use a chave abaixo)</span>
              </div>
            ) : (
              <img
                src={PIX_CONFIG.qrImageUrl}
                alt="QR Code PIX para doação"
                onError={() => setImgError(true)}
                style={{ width: '100%', maxWidth: 280, height: 'auto', display: 'block' }}
              />
            )}
          </div>

          {/* Chave PIX copiável */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: C.muted, letterSpacing: '0.15em', marginBottom: 6 }}>
              CHAVE PIX (E-MAIL)
            </div>
            <div style={{ background: C.bg, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, border: `1px solid ${C.border}` }}>
              <span style={{ fontFamily: FONTS.mono, fontSize: 14, color: C.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {PIX_CONFIG.pixKey}
              </span>
              <Btn size="sm" variant={copied ? 'confirm' : 'ghost'} onClick={copy}>
                {copied ? '✓ COPIADO' : 'COPIAR'}
              </Btn>
            </div>
          </div>

          {/* Pra que serve */}
          {PIX_CONFIG.purpose && PIX_CONFIG.purpose.length > 0 && (
            <div style={{ background: C.bg, border: `1px dashed ${C.border}`, padding: '14px 16px' }}>
              <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: C.green, letterSpacing: '0.15em', marginBottom: 10 }}>
                PRA QUE SERVE SUA DOAÇÃO
              </div>
              <ul style={{ margin: 0, padding: '0 0 0 18px', fontFamily: FONTS.body, fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
                {PIX_CONFIG.purpose.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            </div>
          )}

          {/* Disclaimer */}
          <div style={{ marginTop: 16, fontFamily: FONTS.mono, fontSize: 10, color: C.dim, textAlign: 'center', letterSpacing: '0.1em', lineHeight: 1.6 }}>
            DOAÇÃO 100% VOLUNTÁRIA · NÃO DÁ ACESSO A NADA EXCLUSIVO<br />
            NÃO INFLUENCIA RANKING NEM CAMPEONATO
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 🤫 ARCHITECT REVEAL MODAL — easter egg
// Aparece UMA ÚNICA VEZ pra cada usuário quando o primeiro
// lutador atingir o rank secreto (ELO ≥ 100.000).
// ═══════════════════════════════════════════════════════════
function ArchitectRevealModal({ architect, version, onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 11000,
      background: 'rgba(0,0,0,0.92)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
      animation: 'kof-fade-bg 0.6s ease-out',
    }}>
      <div style={{
        maxWidth: 560, width: '100%',
        animation: 'kof-reveal-zoom 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)',
        textAlign: 'center',
      }}>
        <div style={{ fontFamily: FONTS.mono, fontSize: 11, color: '#FFD700', letterSpacing: '0.4em', marginBottom: 16, textShadow: '0 0 8px rgba(255,215,0,0.6)' }}>
          ━━━ SISTEMA · ALERTA ━━━
        </div>

        <div className="kof-architect-badge" style={{
          width: 140, height: 140, margin: '0 auto 24px',
          background: 'linear-gradient(135deg, #FFD700, #FF8C00, #FF1493, #9333EA, #00BFFF, #FFD700)',
          backgroundSize: '300% 300%',
          color: '#0A0A0A',
          fontFamily: FONTS.display, fontSize: 64,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          letterSpacing: '-0.05em', fontWeight: 900,
          textShadow: '0 0 8px rgba(255,255,255,0.9)',
          position: 'relative',
        }}>
          AR
          <div style={{ position: 'absolute', inset: -5, border: `3px solid #FFD700`, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', inset: -12, border: `1px solid #FFD700`, opacity: 0.5, pointerEvents: 'none' }} />
        </div>

        <h2 style={{ fontFamily: FONTS.display, fontSize: 'clamp(32px, 6vw, 56px)', color: '#FFD700', letterSpacing: '0.05em', margin: 0, lineHeight: 0.95, textShadow: '0 0 20px rgba(255,215,0,0.5)' }}>
          THE ARCHITECT<br />REVEALED
        </h2>

        <div style={{ fontFamily: FONTS.body, fontSize: 15, color: C.text, marginTop: 24, lineHeight: 1.7, padding: '0 16px' }}>
          Um lutador transcendeu o sistema. Para além de Monarch, existia um nível que nunca foi documentado — reservado para aquele que dominasse a arena por completo.
        </div>

        <div style={{ background: 'linear-gradient(135deg, rgba(255,215,0,0.15), rgba(255,140,0,0.05))', border: `1px solid #FFD700`, padding: 24, marginTop: 24 }}>
          <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: '#FFD700', letterSpacing: '0.25em', marginBottom: 8 }}>O PRIMEIRO ARCHITECT</div>
          <div style={{ fontFamily: FONTS.display, fontSize: 'clamp(28px, 5vw, 44px)', color: '#FFD700', letterSpacing: '0.05em', lineHeight: 1, textShadow: '0 0 12px rgba(255,215,0,0.5)' }}>
            {architect.tag}
          </div>
          <div style={{ fontFamily: FONTS.body, fontSize: 14, color: C.text, marginTop: 6 }}>{architect.name}</div>
          <div style={{ fontFamily: FONTS.mono, fontSize: 11, color: C.muted, marginTop: 10, letterSpacing: '0.1em' }}>
            {VERSIONS[version].fullLabel.toUpperCase()} · {architect.elo.toLocaleString('pt-BR')} ELO
          </div>
        </div>

        <div style={{ fontFamily: FONTS.body, fontStyle: 'italic', fontSize: 13, color: C.muted, marginTop: 20, padding: '0 16px' }}>
          "Arise."
        </div>

        <button onClick={onClose} style={{
          marginTop: 32, padding: '14px 40px',
          background: 'transparent', border: '1px solid #FFD700', color: '#FFD700',
          fontFamily: FONTS.display, fontSize: 14, letterSpacing: '0.2em', cursor: 'pointer',
          textShadow: '0 0 6px rgba(255,215,0,0.5)',
        }}>
          TESTEMUNHAR
        </button>
      </div>
    </div>
  );
}

function LivestreamPopup({ match, playerById, onClose, onMaximize }) {
  const isMobile = useIsMobile();
  const popupWidth = isMobile ? Math.min(window.innerWidth - 24, 320) : 360;
  const popupHeight = isMobile ? 220 : 280;
  const initialPos = useMemo(() => typeof window === 'undefined' ? { x: 20, y: 20 } : { x: window.innerWidth - popupWidth - 16, y: window.innerHeight - popupHeight - 16 }, [popupWidth, popupHeight]);
  const [minimized, setMinimized] = useState(false);
  const { pos, dragHandlers } = useDrag(initialPos);
  const p1 = playerById[match.player1Id], p2 = playerById[match.player2Id];
  const embed = streamEmbedUrl(match.streamUrl, true);
  const platform = streamPlatform(match.streamUrl);
  const v = VERSIONS[match.version];

  const width = minimized ? (isMobile ? 240 : 280) : popupWidth;
  const height = minimized ? 56 : popupHeight;

  return (
    <div style={{ position: 'fixed', left: pos.x, top: pos.y, width, height, background: C.bg, border: `1px solid ${C.red}`, boxShadow: `0 20px 60px rgba(0,0,0,0.6), 0 0 30px ${C.red}33`, zIndex: 9999, display: 'flex', flexDirection: 'column', animation: 'kof-slide-in 0.3s ease-out' }}>
      <div {...dragHandlers}
        style={{ background: `linear-gradient(90deg, ${C.redDim}, ${C.bg})`, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'move', userSelect: 'none', borderBottom: `1px solid ${C.red}` }}>
        <span style={{ width: 8, height: 8, background: C.red, borderRadius: '50%', animation: 'kof-pulse 1s infinite', flexShrink: 0 }} />
        <span style={{ fontFamily: FONTS.mono, fontSize: 10, color: '#fff', letterSpacing: '0.15em', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          AO VIVO · {p1?.tag} VS {p2?.tag}
        </span>
        {v && <span style={{ fontFamily: FONTS.mono, fontSize: 9, color: v.color, letterSpacing: '0.1em' }}>{v.label}</span>}
        <button onClick={(e) => { e.stopPropagation(); setMinimized((m) => !m); }} style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer', padding: 2, fontSize: 14, lineHeight: 1 }}>{minimized ? '◰' : '−'}</button>
        <button onClick={(e) => { e.stopPropagation(); onClose(); }} style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer', padding: 2, fontSize: 14, lineHeight: 1 }}>×</button>
      </div>
      {!minimized && (
        <>
          <div style={{ flex: 1, background: '#000', position: 'relative', overflow: 'hidden' }}>
            {embed ? (
              <iframe src={embed} title="Live" frameBorder="0" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen style={{ width: '100%', height: '100%', border: 'none' }} />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 8, padding: 16 }}>
                <span style={{ fontFamily: FONTS.mono, fontSize: 11, color: C.muted, letterSpacing: '0.15em' }}>{platform.toUpperCase()}</span>
                {match.streamUrl && <a href={match.streamUrl} target="_blank" rel="noopener noreferrer" style={{ background: C.red, color: '#fff', padding: '8px 14px', textDecoration: 'none', fontFamily: FONTS.display, fontSize: 13, letterSpacing: '0.1em' }}>▶ ABRIR STREAM</a>}
              </div>
            )}
          </div>
          <div style={{ padding: '6px 10px', borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: C.elevated }}>
            <span style={{ fontFamily: FONTS.mono, fontSize: 10, color: C.muted, letterSpacing: '0.1em' }}>{platform}</span>
            <button onClick={onMaximize} style={{ background: 'transparent', border: 'none', color: C.amber, cursor: 'pointer', fontFamily: FONTS.mono, fontSize: 10, letterSpacing: '0.1em' }}>VER NA HOME →</button>
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ELO CHART
// ═══════════════════════════════════════════════════════════
function EloChart({ history, color = C.amber, height = 200 }) {
  if (history.length < 2) return <Empty msg="Sem dados ainda — jogue algumas partidas nesta versão." />;
  const W = 700;
  const padding = { top: 16, bottom: 28, left: 50, right: 16 };
  const w = W - padding.left - padding.right;
  const h = height - padding.top - padding.bottom;
  const elos = history.map((p) => p.elo);
  let minElo = Math.min(...elos), maxElo = Math.max(...elos);
  const pad = Math.max(50, (maxElo - minElo) * 0.2);
  minElo = Math.floor((minElo - pad) / 50) * 50;
  maxElo = Math.ceil((maxElo + pad) / 50) * 50;
  const range = maxElo - minElo;
  const xFor = (i) => padding.left + (i / (history.length - 1)) * w;
  const yFor = (e) => padding.top + (1 - (e - minElo) / range) * h;
  const path = history.map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(i).toFixed(1)},${yFor(p.elo).toFixed(1)}`).join(' ');
  const area = `${path} L${xFor(history.length - 1).toFixed(1)},${(padding.top + h).toFixed(1)} L${padding.left},${(padding.top + h).toFixed(1)} Z`;
  const visibleRanks = RANKS.filter((r) => !r.secret && r.min <= maxElo);
  const gradId = `eloFill_${color.slice(1)}`;
  return (
    <svg viewBox={`0 0 ${W} ${height}`} style={{ width: '100%', height: 'auto' }} preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {visibleRanks.map((r, i) => {
        const next = visibleRanks[i + 1];
        const yTop = next ? yFor(Math.min(next.min, maxElo)) : padding.top;
        const yBottom = yFor(Math.max(r.min, minElo));
        if (yBottom <= yTop) return null;
        return <g key={r.id}>
          <rect x={padding.left} y={yTop} width={w} height={yBottom - yTop} fill={r.color} opacity={0.06} />
          <text x={padding.left + 4} y={yTop + 12} fill={r.color} fontSize="10" fontFamily={FONTS.mono} opacity={0.7} letterSpacing="0.15em">{r.id}</text>
        </g>;
      })}
      {[minElo, Math.round((minElo + maxElo) / 2), maxElo].map((v) => (
        <g key={v}>
          <text x={padding.left - 8} y={yFor(v) + 3} fill={C.muted} fontSize="10" textAnchor="end" fontFamily={FONTS.mono}>{v}</text>
          <line x1={padding.left} y1={yFor(v)} x2={padding.left + w} y2={yFor(v)} stroke={C.border} strokeDasharray="2 3" opacity={0.5} />
        </g>
      ))}
      <path d={area} fill={`url(#${gradId})`} />
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {history.map((p, i) => (
        <circle key={i} cx={xFor(i)} cy={yFor(p.elo)} r="3.5" fill={p.type === 'start' ? C.muted : p.won ? C.green : C.red} stroke={C.bg} strokeWidth="1.5" />
      ))}
      <text x={padding.left} y={height - 6} fill={C.muted} fontSize="10" fontFamily={FONTS.mono}>início</text>
      <text x={padding.left + w} y={height - 6} fill={C.muted} fontSize="10" textAnchor="end" fontFamily={FONTS.mono}>
        {history[history.length - 1].date ? fmtDate(history[history.length - 1].date) : 'agora'}
      </text>
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════
// SHARE MODAL
// ═══════════════════════════════════════════════════════════
function ShareModal({ url, title, onClose }) {
  const [copied, setCopied] = useState(false);
  const enc = (s) => encodeURIComponent(s);
  const links = [
    { label: 'WhatsApp', url: `https://wa.me/?text=${enc(title + ' ' + url)}`, color: '#25D366' },
    { label: 'X / Twitter', url: `https://twitter.com/intent/tweet?text=${enc(title)}&url=${enc(url)}`, color: '#000' },
    { label: 'Telegram', url: `https://t.me/share/url?url=${enc(url)}&text=${enc(title)}`, color: '#0088cc' },
  ];
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.elevated, border: `1px solid ${C.border}`, padding: 'clamp(16px, 4vw, 24px)', maxWidth: 460, width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <h3 style={{ fontFamily: FONTS.display, fontSize: 22, letterSpacing: '0.05em', margin: 0, color: C.text }}>COMPARTILHAR</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: C.muted, fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ background: C.bg, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, border: `1px solid ${C.border}` }}>
          <span style={{ fontFamily: FONTS.mono, fontSize: 12, color: C.muted, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url}</span>
          <Btn size="sm" variant={copied ? 'confirm' : 'ghost'} onClick={() => { navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }}>{copied ? '✓ COPIADO' : 'COPIAR'}</Btn>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {links.map((s) => (
            <a key={s.label} href={s.url} target="_blank" rel="noopener noreferrer" style={{ background: s.color, color: '#fff', padding: '12px', textAlign: 'center', textDecoration: 'none', fontFamily: FONTS.display, fontSize: 13, letterSpacing: '0.1em' }}>{s.label}</a>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// HEADER
// ═══════════════════════════════════════════════════════════
function Header({ playerCount, matchCount, liveCount, currentUser, onLogout, onProfile, onLogin, onDonate }) {
  const isMobile = useIsMobile();
  return (
    <div style={{ borderBottom: `1px solid ${C.border}`, background: C.bg, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: `repeating-linear-gradient(0deg, transparent 0, transparent 2px, rgba(255,255,255,0.015) 2px, rgba(255,255,255,0.015) 3px)`, pointerEvents: 'none' }} />
      <div style={{ padding: isMobile ? '16px 14px 12px' : '24px 28px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: isMobile ? 12 : 20, position: 'relative' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 14, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ width: isMobile ? 20 : 28, height: isMobile ? 20 : 28, background: C.red, transform: 'rotate(45deg)', flexShrink: 0 }} />
            <span style={{ fontFamily: FONTS.mono, fontSize: isMobile ? 9 : 11, color: C.muted, letterSpacing: isMobile ? '0.1em' : '0.2em' }}>// KOF 2002 · UM · XV · LIGA OFICIAL</span>
            {liveCount > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: FONTS.mono, fontSize: 10, color: '#fff', background: C.red, padding: '3px 8px', letterSpacing: '0.15em' }}>
                <span style={{ width: 6, height: 6, background: '#fff', borderRadius: '50%', animation: 'kof-pulse 1s infinite' }} />{liveCount} AO VIVO
              </span>
            )}
          </div>
          <h1 style={{ fontFamily: FONTS.display, fontSize: isMobile ? 'clamp(36px, 11vw, 52px)' : 'clamp(48px, 8vw, 88px)', letterSpacing: '0.02em', lineHeight: 0.9, margin: 0, color: C.text, wordBreak: 'break-word' }}>
            ARENA <span style={{ color: C.red }}>BNOSTLE</span>
          </h1>
          {!isMobile && (
            <div style={{ fontFamily: FONTS.body, fontSize: 13, color: C.muted, marginTop: 8, letterSpacing: '0.04em' }}>
              agenda · transmissões · rankings elo separados (2002 · um · xv) · campeonato anual
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: isMobile ? 8 : 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {!isMobile && (
            <div style={{ display: 'flex', gap: 16, fontFamily: FONTS.mono, fontSize: 12 }}>
              <Stat label="LUTADORES" value={String(playerCount).padStart(3, '0')} />
              <Stat label="DUELOS" value={String(matchCount).padStart(3, '0')} />
            </div>
          )}
          {PIX_CONFIG.enabled && (
            <button onClick={onDonate}
              style={{
                background: 'transparent', border: `1px solid ${C.green}`, color: C.green,
                padding: isMobile ? '5px 10px' : '6px 12px', cursor: 'pointer', fontFamily: FONTS.display,
                fontSize: isMobile ? 11 : 13, letterSpacing: '0.1em', display: 'inline-flex', alignItems: 'center', gap: 6,
                transition: 'all 0.12s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = C.green; e.currentTarget.style.color = '#0A0A0A'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.green; }}>
              💚 {isMobile ? '' : 'APOIAR'}
            </button>
          )}
          {currentUser ? (
            <UserMenu user={currentUser} onLogout={onLogout} onProfile={onProfile} compact={isMobile} />
          ) : (
            <Btn variant="primary" size="sm" onClick={onLogin}>ENTRAR</Btn>
          )}
        </div>
        {isMobile && (
          <div style={{ display: 'flex', gap: 16, fontFamily: FONTS.mono, fontSize: 11, width: '100%' }}>
            <Stat label="LUTADORES" value={String(playerCount).padStart(3, '0')} />
            <Stat label="DUELOS" value={String(matchCount).padStart(3, '0')} />
          </div>
        )}
      </div>
    </div>
  );
}
function Stat({ label, value, accent }) {
  return (
    <div style={{ borderLeft: `2px solid ${accent || C.border}`, paddingLeft: 12, flexShrink: 0 }}>
      <div style={{ color: C.muted, fontSize: 10, letterSpacing: '0.15em' }}>{label}</div>
      <div style={{ color: accent || C.text, fontSize: 18, fontFamily: FONTS.display, letterSpacing: '0.05em', marginTop: 2 }}>{value}</div>
    </div>
  );
}
function UserMenu({ user, onLogout, onProfile, compact }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen((v) => !v)}
        style={{ background: C.elevated, border: `1px solid ${user.isAdmin ? C.purple : C.border}`, padding: compact ? '4px 8px' : '6px 12px', display: 'flex', alignItems: 'center', gap: compact ? 6 : 10, cursor: 'pointer', color: C.text }}>
        <Avatar player={user} size={compact ? 24 : 28} />
        {!compact && (
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontFamily: FONTS.display, fontSize: 14, color: user.isAdmin ? C.purple : C.amber, letterSpacing: '0.05em', lineHeight: 1 }}>
              {user.tag}{user.isAdmin && ' ⚡'}
            </div>
            <div style={{ fontFamily: FONTS.mono, fontSize: 9, color: C.muted, letterSpacing: '0.1em' }}>{user.isAdmin ? 'ADMIN' : 'LUTADOR'}</div>
          </div>
        )}
        {compact && user.isAdmin && <span style={{ color: C.purple, fontSize: 12 }}>⚡</span>}
        <span style={{ color: C.muted, fontSize: 10 }}>▾</span>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 50 }} />
          <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: C.elevated, border: `1px solid ${C.border}`, minWidth: 180, zIndex: 51 }}>
            <button onClick={() => { onProfile(); setOpen(false); }}
              style={{ background: 'transparent', border: 'none', color: C.text, padding: '10px 14px', cursor: 'pointer', fontFamily: FONTS.body, fontSize: 13, width: '100%', textAlign: 'left', display: 'block' }}>
              MEU PERFIL
            </button>
            <button onClick={() => { onLogout(); setOpen(false); }}
              style={{ background: 'transparent', border: 'none', borderTop: `1px solid ${C.border}`, color: C.red, padding: '10px 14px', cursor: 'pointer', fontFamily: FONTS.body, fontSize: 13, width: '100%', textAlign: 'left', display: 'block' }}>
              SAIR
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB BAR
// ═══════════════════════════════════════════════════════════
function tabsForUser(user) {
  const base = [
    { id: 'home', label: 'INÍCIO', n: '00' },
    { id: 'agenda', label: 'AGENDA', n: '01' },
    { id: 'vods', label: 'TRANSMITIDAS', n: '02' },
    { id: 'hunters', label: 'LUTADORES', n: '03' },
    { id: 'mensal', label: 'RANKING MENSAL', n: '04' },
    { id: 'anual', label: 'RANKING ANUAL', n: '05' },
    { id: 'campeonato', label: 'CAMPEONATO', n: '06' },
    { id: 'noticias', label: 'NOTÍCIAS', n: '07' },
  ];
  if (user?.isAdmin) base.push({ id: 'admin', label: '⚡ PAINEL ADMIN', n: 'A1', admin: true });
  return base;
}
function TabBar({ active, onChange, user, pendingCount }) {
  const isMobile = useIsMobile();
  const tabs = tabsForUser(user);
  return (
    <div className="kof-tab-bar" style={{ borderBottom: `1px solid ${C.border}`, display: 'flex', overflowX: 'auto', background: C.bg, WebkitOverflowScrolling: 'touch' }}>
      {tabs.map((t) => {
        const isActive = active === t.id;
        const accent = t.admin ? C.purple : C.red;
        return (
          <button key={t.id} onClick={() => onChange(t.id)}
            style={{ padding: isMobile ? '12px 14px' : '16px 22px', background: 'transparent', border: 'none', borderBottom: `2px solid ${isActive ? accent : 'transparent'}`, color: isActive ? C.text : C.muted, fontFamily: FONTS.display, letterSpacing: isMobile ? '0.05em' : '0.1em', fontSize: isMobile ? 12 : 14, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 10, flexShrink: 0 }}
            onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = C.text; }}
            onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = C.muted; }}>
            <span style={{ fontFamily: FONTS.mono, fontSize: isMobile ? 9 : 10, color: isActive ? accent : C.dim }}>{t.n}</span>{t.label}
            {t.id === 'admin' && pendingCount > 0 && <span style={{ background: C.amber, color: '#0A0A0A', fontFamily: FONTS.mono, fontSize: 10, padding: '2px 6px', fontWeight: 700 }}>{pendingCount}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SCHEDULED ROW
// ═══════════════════════════════════════════════════════════
function ScheduledRow({ match, playerById, ratingsByVersion, expanded, onClickHunter, onClickMatch }) {
  const p1 = playerById[match.player1Id], p2 = playerById[match.player2Id];
  const e1 = ratingsByVersion[match.version]?.[match.player1Id]?.elo ?? STARTING_ELO;
  const e2 = ratingsByVersion[match.version]?.[match.player2Id]?.elo ?? STARTING_ELO;
  const r1 = getRank(e1), r2 = getRank(e2);
  const isPast = match.status === 'completed';
  const isLive = match.status === 'live';
  const winner = isPast && match.winnerId ? playerById[match.winnerId] : null;
  const v = VERSIONS[match.version];
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div style={{ background: C.elevated, border: `1px solid ${isLive ? C.red : C.border}`, borderLeft: `3px solid ${isLive ? C.red : isPast ? C.dim : C.amber}`, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
          {isLive ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: FONTS.mono, fontSize: 10, color: C.red, letterSpacing: '0.15em' }}>
              <span style={{ width: 6, height: 6, background: C.red, borderRadius: '50%', animation: 'kof-pulse 1s infinite' }} />AO VIVO
            </div>
          ) : (
            <div style={{ fontFamily: FONTS.display, fontSize: 13, color: C.text, letterSpacing: '0.05em' }}>{fmtDateTime(match.scheduledAt)}</div>
          )}
          {v && <VersionBadge version={match.version} size="sm" />}
        </div>
        {!isLive && <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: C.muted }}>{fmtRelative(match.scheduledAt)}</div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <HunterCompact p={p1} rank={r1} won={winner?.id === p1?.id} dim={isPast && winner?.id !== p1?.id} onClick={onClickHunter ? () => onClickHunter(p1?.id) : null} />
          <span style={{ color: C.dim, fontFamily: FONTS.mono, fontSize: 11 }}>VS</span>
          <HunterCompact p={p2} rank={r2} won={winner?.id === p2?.id} dim={isPast && winner?.id !== p2?.id} onClick={onClickHunter ? () => onClickHunter(p2?.id) : null} />
          {match.score && <span style={{ fontFamily: FONTS.mono, fontSize: 11, color: C.amber, marginLeft: 'auto' }}>{match.score}</span>}
        </div>
        {match.notes && expanded && <span style={{ color: C.muted, fontFamily: FONTS.body, fontSize: 11, fontStyle: 'italic' }}>"{match.notes}"</span>}
        {(isLive || match.vodUrl) && (
          <div style={{ display: 'flex', gap: 6 }}>
            {isLive && (
              onClickMatch ? (
                <button onClick={() => onClickMatch(match.id)} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: FONTS.mono, fontSize: 11, color: '#fff', background: C.red, border: 'none', padding: '6px 12px', letterSpacing: '0.1em', cursor: 'pointer', justifyContent: 'center' }}>● ASSISTIR LIVE</button>
              ) : match.streamUrl ? (
                <a href={match.streamUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: FONTS.mono, fontSize: 11, color: '#fff', background: C.red, textDecoration: 'none', padding: '6px 12px', letterSpacing: '0.1em', flex: 1, justifyContent: 'center' }}>● ASSISTIR LIVE</a>
              ) : null
            )}
            {match.vodUrl && (
              onClickMatch ? (
                <button onClick={() => onClickMatch(match.id)} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: FONTS.mono, fontSize: 11, color: C.red, background: 'transparent', border: `1px solid ${C.red}`, padding: '6px 12px', letterSpacing: '0.1em', cursor: 'pointer', justifyContent: 'center' }}>▶ VER VOD</button>
              ) : (
                <a href={match.vodUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: FONTS.mono, fontSize: 11, color: C.red, textDecoration: 'none', border: `1px solid ${C.red}`, padding: '6px 12px', letterSpacing: '0.1em', flex: 1, justifyContent: 'center' }}>▶ VER VOD</a>
              )
            )}
          </div>
        )}
        {isPast && !match.vodUrl && onClickMatch && (
          <button onClick={() => onClickMatch(match.id)} style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.muted, padding: '6px 12px', fontFamily: FONTS.mono, fontSize: 11, letterSpacing: '0.1em', cursor: 'pointer' }}>VER DETALHES →</button>
        )}
      </div>
    );
  }

  return (
    <div style={{ background: C.elevated, border: `1px solid ${isLive ? C.red : C.border}`, borderLeft: `3px solid ${isLive ? C.red : isPast ? C.dim : C.amber}`, padding: '14px 18px', display: 'grid', gridTemplateColumns: expanded ? '160px 1fr auto' : '120px 1fr auto', gap: 16, alignItems: 'center' }}>
      <div>
        {isLive ? (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: FONTS.mono, fontSize: 11, color: C.red, letterSpacing: '0.15em' }}>
            <span style={{ width: 6, height: 6, background: C.red, borderRadius: '50%', animation: 'kof-pulse 1s infinite' }} />AO VIVO
          </div>
        ) : (
          <>
            <div style={{ fontFamily: FONTS.display, fontSize: 16, color: C.text, letterSpacing: '0.05em' }}>{fmtDateTime(match.scheduledAt)}</div>
            <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: C.muted, marginTop: 2 }}>{fmtRelative(match.scheduledAt)}</div>
          </>
        )}
        {v && <div style={{ marginTop: 4 }}><VersionBadge version={match.version} size="sm" /></div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <HunterCompact p={p1} rank={r1} won={winner?.id === p1?.id} dim={isPast && winner?.id !== p1?.id} onClick={onClickHunter ? () => onClickHunter(p1?.id) : null} />
        <span style={{ color: C.dim, fontFamily: FONTS.mono, fontSize: 12 }}>VS</span>
        <HunterCompact p={p2} rank={r2} won={winner?.id === p2?.id} dim={isPast && winner?.id !== p2?.id} onClick={onClickHunter ? () => onClickHunter(p2?.id) : null} />
        {match.score && <span style={{ fontFamily: FONTS.mono, fontSize: 12, color: C.amber, marginLeft: 8 }}>{match.score}</span>}
        {match.notes && expanded && <span style={{ color: C.muted, fontFamily: FONTS.body, fontSize: 12, fontStyle: 'italic', flexBasis: '100%', marginTop: 4 }}>"{match.notes}"</span>}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {isLive && (
          onClickMatch ? (
            <button onClick={() => onClickMatch(match.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: FONTS.mono, fontSize: 11, color: '#fff', background: C.red, border: 'none', padding: '5px 10px', letterSpacing: '0.1em', cursor: 'pointer' }}>● LIVE</button>
          ) : match.streamUrl ? (
            <a href={match.streamUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: FONTS.mono, fontSize: 11, color: '#fff', background: C.red, textDecoration: 'none', padding: '5px 10px', letterSpacing: '0.1em' }}>● LIVE</a>
          ) : null
        )}
        {match.vodUrl && (
          onClickMatch ? (
            <button onClick={() => onClickMatch(match.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: FONTS.mono, fontSize: 11, color: C.red, background: 'transparent', border: `1px solid ${C.red}`, padding: '5px 10px', letterSpacing: '0.1em', cursor: 'pointer' }}>▶ VOD</button>
          ) : (
            <a href={match.vodUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: FONTS.mono, fontSize: 11, color: C.red, textDecoration: 'none', border: `1px solid ${C.red}`, padding: '5px 10px', letterSpacing: '0.1em' }}>▶ VOD</a>
          )
        )}
        {isPast && !match.vodUrl && onClickMatch && (
          <button onClick={() => onClickMatch(match.id)} style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.muted, padding: '5px 10px', fontFamily: FONTS.mono, fontSize: 11, letterSpacing: '0.1em', cursor: 'pointer' }}>VER →</button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// VIEW: HOME
// ═══════════════════════════════════════════════════════════
// 🤫 Banner permanente na home depois que o Architect foi revelado
function ArchitectBanner({ architect, onClick }) {
  const v = VERSIONS[architect.version];
  return (
    <div onClick={onClick} style={{
      background: 'linear-gradient(135deg, rgba(255,215,0,0.18), rgba(255,140,0,0.05), rgba(147,51,234,0.08))',
      border: `1px solid #FFD700`,
      padding: '20px 24px',
      cursor: 'pointer',
      display: 'flex', alignItems: 'center', gap: 20,
      flexWrap: 'wrap',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, right: 0, width: 200, height: '100%', background: 'radial-gradient(circle at right, rgba(255,215,0,0.15), transparent 70%)', pointerEvents: 'none' }} />
      <div className="kof-architect-badge" style={{
        width: 64, height: 64,
        background: 'linear-gradient(135deg, #FFD700, #FF8C00, #FF1493, #9333EA, #00BFFF, #FFD700)',
        backgroundSize: '300% 300%',
        color: '#0A0A0A', fontFamily: FONTS.display, fontSize: 28,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        letterSpacing: '-0.05em', fontWeight: 900, flexShrink: 0,
        textShadow: '0 0 4px rgba(255,255,255,0.9)',
        position: 'relative', zIndex: 1,
      }}>
        AR
        <div style={{ position: 'absolute', inset: -3, border: `2px solid #FFD700` }} />
      </div>
      <div style={{ flex: 1, minWidth: 200, position: 'relative', zIndex: 1 }}>
        <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: '#FFD700', letterSpacing: '0.25em', marginBottom: 4 }}>★ THE ARCHITECT</div>
        <div style={{ fontFamily: FONTS.display, fontSize: 26, color: '#FFD700', letterSpacing: '0.05em', lineHeight: 1, textShadow: '0 0 12px rgba(255,215,0,0.4)' }}>{architect.tag}</div>
        <div style={{ fontFamily: FONTS.body, fontSize: 13, color: C.muted, marginTop: 4 }}>
          {architect.name} · transcendeu o sistema em {v.fullLabel} · {architect.elo.toLocaleString('pt-BR')} ELO
        </div>
      </div>
      <span style={{ fontFamily: FONTS.mono, fontSize: 11, color: '#FFD700', letterSpacing: '0.15em', position: 'relative', zIndex: 1 }}>VER PERFIL →</span>
    </div>
  );
}

function HomeView({ players, matches, ratingsByVersion, playerById, onNavigate, onOpenHunter, onOpenMatch, architect }) {
  const liveMatch = matches.find((m) => m.status === 'live');
  const upcoming = matches.filter((m) => m.status === 'scheduled' && new Date(m.scheduledAt) > new Date()).sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
  const recentVods = matches.filter((m) => m.status === 'completed' && m.vodUrl).sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt)).slice(0, 3);

  // Top 3 por versão
  const topByVersion = useMemo(() => {
    const result = {};
    for (const v of VERSION_IDS) {
      result[v] = players.map((p) => ({ ...p, elo: ratingsByVersion[v]?.[p.id]?.elo ?? STARTING_ELO, games: ratingsByVersion[v]?.[p.id]?.games ?? 0 }))
        .filter((p) => p.games > 0)
        .sort((a, b) => b.elo - a.elo).slice(0, 3);
    }
    return result;
  }, [players, ratingsByVersion]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {architect && <ArchitectBanner architect={architect} onClick={() => onOpenHunter(architect.id)} />}
      {liveMatch ? (
        <LiveMatchHero match={liveMatch} playerById={playerById} ratingsByVersion={ratingsByVersion} onOpenHunter={onOpenHunter} />
      ) : upcoming[0] ? (
        <NextMatchHero match={upcoming[0]} playerById={playerById} ratingsByVersion={ratingsByVersion} onNavigate={onNavigate} onOpenHunter={onOpenHunter} />
      ) : (
        <Panel><Empty msg="Nenhuma luta agendada ainda. O admin pode agendar pelo painel." /></Panel>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
        <Panel title="PRÓXIMOS DUELOS" accent={C.amber} action={<Btn variant="ghost" size="sm" onClick={() => onNavigate('agenda')}>VER AGENDA →</Btn>}>
          {upcoming.length === 0 ? <Empty msg="Nenhum duelo agendado." /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {upcoming.slice(0, 4).map((m) => <ScheduledRow key={m.id} match={m} playerById={playerById} ratingsByVersion={ratingsByVersion} onClickHunter={onOpenHunter} onClickMatch={onOpenMatch} />)}
            </div>
          )}
        </Panel>
        <Panel title="ÚLTIMAS TRANSMITIDAS" accent={C.red} action={<Btn variant="ghost" size="sm" onClick={() => onNavigate('vods')}>VER TODAS →</Btn>}>
          {recentVods.length === 0 ? <Empty msg="Nenhuma luta transmitida ainda." /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {recentVods.map((m) => <VodCardCompact key={m.id} match={m} playerById={playerById} />)}
            </div>
          )}
        </Panel>
      </div>

      {/* Top lutadores POR VERSÃO */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 20 }}>
        {VERSION_IDS.map((v) => (
          <Panel key={v} title={`TOP ${VERSIONS[v].label} · ${VERSIONS[v].subtitle.toUpperCase()}`} accent={VERSIONS[v].color}
            action={<Btn variant="ghost" size="sm" onClick={() => onNavigate('anual')}>RANKING →</Btn>}>
            {topByVersion[v].length === 0 ? <Empty msg="Nenhum duelo nesta versão ainda." /> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {topByVersion[v].map((p, i) => {
                  const r = getRank(p.elo);
                  return (
                    <div key={p.id} onClick={() => onOpenHunter(p.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', border: `1px solid ${C.border}`, background: C.bg, cursor: 'pointer' }}>
                      <span style={{ fontFamily: FONTS.display, fontSize: 22, color: i === 0 ? C.amber : i < 3 ? C.text : C.dim, lineHeight: 1, minWidth: 24 }}>#{i + 1}</span>
                      <Avatar player={p} size={32} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: FONTS.display, fontSize: 15, color: r.color, letterSpacing: '0.05em' }}>{p.tag}</div>
                        <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: C.muted }}>{p.elo} ELO · {p.games} duelos</div>
                      </div>
                      <RankBadge elo={p.elo} size="sm" />
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        ))}
      </div>

      <RankLegend compact />
    </div>
  );
}

function LiveMatchHero({ match, playerById, ratingsByVersion, onOpenHunter }) {
  const p1 = playerById[match.player1Id], p2 = playerById[match.player2Id];
  const e1 = ratingsByVersion[match.version]?.[match.player1Id]?.elo ?? STARTING_ELO;
  const e2 = ratingsByVersion[match.version]?.[match.player2Id]?.elo ?? STARTING_ELO;
  const embed = streamEmbedUrl(match.streamUrl);
  const isMobile = useIsMobile();
  return (
    <div style={{ background: `linear-gradient(135deg, ${C.redDim}, ${C.bg})`, border: `1px solid ${C.red}`, padding: 'clamp(14px, 4vw, 24px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: FONTS.mono, fontSize: isMobile ? 10 : 11, color: '#fff', letterSpacing: '0.2em', marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ width: 8, height: 8, background: C.red, borderRadius: '50%', animation: 'kof-pulse 1s infinite' }} />AO VIVO AGORA
        <VersionBadge version={match.version} size={isMobile ? 'sm' : 'md'} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: embed && !isMobile ? 'minmax(260px, 1fr) minmax(300px, 2fr)' : '1fr', gap: isMobile ? 12 : 24, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 12 : 24, flexWrap: 'wrap', justifyContent: isMobile ? 'space-between' : 'flex-start' }}>
          <HunterFace p={p1} elo={e1} onClick={onOpenHunter ? () => onOpenHunter(p1.id) : null} compact={isMobile} />
          <span style={{ fontFamily: FONTS.display, fontSize: isMobile ? 24 : 40, color: C.amber, letterSpacing: '0.1em' }}>VS</span>
          <HunterFace p={p2} elo={e2} onClick={onOpenHunter ? () => onOpenHunter(p2.id) : null} compact={isMobile} />
        </div>
        {embed && <div style={{ aspectRatio: '16/9', background: '#000', position: 'relative' }}>
          <iframe src={embed} title="Live" frameBorder="0" allowFullScreen allow="autoplay; encrypted-media; picture-in-picture" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
        </div>}
      </div>
      {match.notes && <div style={{ fontFamily: FONTS.body, fontSize: 13, color: C.muted, marginTop: 12, fontStyle: 'italic' }}>"{match.notes}"</div>}
      {!embed && match.streamUrl && (
        <div style={{ marginTop: 12 }}>
          <a href={match.streamUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', background: C.red, color: '#fff', padding: '10px 18px', textDecoration: 'none', fontFamily: FONTS.display, fontSize: 14, letterSpacing: '0.1em' }}>▶ ASSISTIR EM {streamPlatform(match.streamUrl).toUpperCase()}</a>
        </div>
      )}
    </div>
  );
}
function NextMatchHero({ match, playerById, ratingsByVersion, onNavigate, onOpenHunter }) {
  const p1 = playerById[match.player1Id], p2 = playerById[match.player2Id];
  const e1 = ratingsByVersion[match.version]?.[match.player1Id]?.elo ?? STARTING_ELO;
  const e2 = ratingsByVersion[match.version]?.[match.player2Id]?.elo ?? STARTING_ELO;
  const isMobile = useIsMobile();
  return (
    <div style={{ background: C.elevated, border: `1px solid ${C.border}`, padding: 'clamp(14px, 4vw, 28px)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: FONTS.mono, fontSize: isMobile ? 10 : 11, color: C.amber, letterSpacing: '0.2em' }}>★ PRÓXIMA LUTA</span>
            <VersionBadge version={match.version} size={isMobile ? 'sm' : 'md'} />
          </div>
          <div style={{ fontFamily: FONTS.display, fontSize: isMobile ? 16 : 22, color: C.text, letterSpacing: '0.05em' }}>{fmtDateTime(match.scheduledAt)}</div>
          <div style={{ fontFamily: FONTS.mono, fontSize: 11, color: C.muted, marginTop: 2 }}>{fmtRelative(match.scheduledAt)}</div>
        </div>
        <Btn variant="amber" size="sm" onClick={() => onNavigate('agenda')}>{isMobile ? 'AGENDA →' : 'VER AGENDA COMPLETA →'}</Btn>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 12 : 24, flexWrap: 'wrap', justifyContent: isMobile ? 'space-between' : 'flex-start' }}>
        <HunterFace p={p1} elo={e1} onClick={onOpenHunter ? () => onOpenHunter(p1.id) : null} compact={isMobile} />
        <span style={{ fontFamily: FONTS.display, fontSize: isMobile ? 22 : 36, color: C.dim, letterSpacing: '0.1em' }}>VS</span>
        <HunterFace p={p2} elo={e2} onClick={onOpenHunter ? () => onOpenHunter(p2.id) : null} compact={isMobile} />
      </div>
      {match.notes && <div style={{ fontFamily: FONTS.body, fontSize: 13, color: C.muted, marginTop: 12, fontStyle: 'italic' }}>"{match.notes}"</div>}
    </div>
  );
}
function HunterFace({ p, elo, onClick, compact }) {
  if (!p) return null;
  const r = getRank(elo);
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: compact ? 8 : 12, cursor: onClick ? 'pointer' : 'default', minWidth: 0 }}>
      <Avatar player={p} size={compact ? 40 : 56} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: FONTS.display, fontSize: compact ? 18 : 26, color: r.color, letterSpacing: '0.05em', lineHeight: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.tag}</div>
        {!compact && <div style={{ fontFamily: FONTS.body, fontSize: 13, color: C.muted, marginTop: 2 }}>{p.name}</div>}
        <div style={{ fontFamily: FONTS.mono, fontSize: compact ? 9 : 11, color: r.color, marginTop: 2 }}>{r.id} · {elo}</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// VIEW: AGENDA
// ═══════════════════════════════════════════════════════════
function AgendaView({ matches, ratingsByVersion, playerById, onOpenHunter, onOpenMatch }) {
  const [filter, setFilter] = useState('upcoming');
  const [versionFilter, setVersionFilter] = useState('all');
  const now = new Date();
  const filtered = useMemo(() => {
    let list = matches.slice();
    if (versionFilter !== 'all') list = list.filter((m) => m.version === versionFilter);
    if (filter === 'upcoming') list = list.filter((m) => m.status === 'scheduled' && new Date(m.scheduledAt) >= now);
    else if (filter === 'live') list = list.filter((m) => m.status === 'live');
    else if (filter === 'past') list = list.filter((m) => m.status === 'completed' || (m.status === 'scheduled' && new Date(m.scheduledAt) < now));
    list.sort((a, b) => filter === 'past' ? new Date(b.scheduledAt) - new Date(a.scheduledAt) : new Date(a.scheduledAt) - new Date(b.scheduledAt));
    return list;
  }, [matches, filter, versionFilter]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {[{ id: 'upcoming', label: 'PRÓXIMOS' }, { id: 'live', label: 'AO VIVO' }, { id: 'past', label: 'HISTÓRICO' }].map((f) => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              style={{ background: filter === f.id ? C.red : 'transparent', color: filter === f.id ? '#fff' : C.muted, border: `1px solid ${filter === f.id ? C.red : C.border}`, padding: '8px 16px', fontFamily: FONTS.display, letterSpacing: '0.1em', fontSize: 13, cursor: 'pointer' }}>{f.label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setVersionFilter('all')} style={{ background: versionFilter === 'all' ? C.text : 'transparent', color: versionFilter === 'all' ? C.bg : C.muted, border: `1px solid ${versionFilter === 'all' ? C.text : C.border}`, padding: '6px 12px', fontFamily: FONTS.mono, fontSize: 11, cursor: 'pointer', letterSpacing: '0.1em' }}>TODAS</button>
          {VERSION_IDS.map((v) => (
            <button key={v} onClick={() => setVersionFilter(v)}
              style={{ background: versionFilter === v ? VERSIONS[v].color : 'transparent', color: versionFilter === v ? '#0A0A0A' : VERSIONS[v].color, border: `1px solid ${VERSIONS[v].color}`, padding: '6px 12px', fontFamily: FONTS.mono, fontSize: 11, cursor: 'pointer', letterSpacing: '0.1em' }}>
              {VERSIONS[v].label}
            </button>
          ))}
        </div>
      </div>
      {filtered.length === 0 ? <Panel><Empty msg="Nenhum duelo neste filtro." /></Panel> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map((m) => <ScheduledRow key={m.id} match={m} playerById={playerById} ratingsByVersion={ratingsByVersion} expanded onClickHunter={onOpenHunter} onClickMatch={onOpenMatch} />)}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// VIEW: VODS
// ═══════════════════════════════════════════════════════════
function VodsView({ matches, playerById, ratingsByVersion, onOpenHunter, onOpenMatch }) {
  const vods = useMemo(() => matches.filter((m) => m.status === 'completed' && m.vodUrl).sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt)), [matches]);
  if (vods.length === 0) return <Panel title="LUTAS TRANSMITIDAS" accent={C.red}><Empty msg="Nenhuma luta transmitida ainda." /></Panel>;
  return (
    <Panel title={`LUTAS TRANSMITIDAS · ${vods.length}`} accent={C.red}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
        {vods.map((m) => <VodCard key={m.id} match={m} playerById={playerById} ratingsByVersion={ratingsByVersion} onOpenHunter={onOpenHunter} />)}
      </div>
    </Panel>
  );
}
function VodCard({ match, playerById, ratingsByVersion, onOpenHunter }) {
  const yt = youtubeId(match.vodUrl);
  const p1 = playerById[match.player1Id], p2 = playerById[match.player2Id];
  const winner = match.winnerId ? playerById[match.winnerId] : null;
  const e1 = ratingsByVersion[match.version]?.[match.player1Id]?.elo ?? STARTING_ELO;
  const e2 = ratingsByVersion[match.version]?.[match.player2Id]?.elo ?? STARTING_ELO;
  return (
    <div style={{ background: C.bg, border: `1px solid ${C.border}` }}>
      {yt ? (
        <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, overflow: 'hidden' }}>
          <iframe src={`https://www.youtube.com/embed/${yt}`} title={match.vodTitle} frameBorder="0" allowFullScreen style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />
        </div>
      ) : (
        <a href={match.vodUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
          <div style={{ aspectRatio: '16/9', background: C.elevated, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.amber, fontFamily: FONTS.display, fontSize: 20 }}>▶ ABRIR VOD</div>
        </a>
      )}
      <div style={{ padding: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontFamily: FONTS.mono, fontSize: 10, color: C.muted, letterSpacing: '0.15em' }}>{fmtDate(match.completedAt)}</span>
          <VersionBadge version={match.version} size="sm" />
        </div>
        <div style={{ fontFamily: FONTS.display, fontSize: 16, color: C.text, letterSpacing: '0.03em', marginBottom: 8 }}>{match.vodTitle || `${p1?.tag} vs ${p2?.tag}`}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13 }}>
          <HunterCompact p={p1} rank={getRank(e1)} won={winner?.id === p1?.id} dim={winner && winner.id !== p1?.id} onClick={onOpenHunter ? () => onOpenHunter(p1.id) : null} />
          <span style={{ color: C.dim, fontFamily: FONTS.mono }}>VS</span>
          <HunterCompact p={p2} rank={getRank(e2)} won={winner?.id === p2?.id} dim={winner && winner.id !== p2?.id} onClick={onOpenHunter ? () => onOpenHunter(p2.id) : null} />
          {match.score && <span style={{ fontFamily: FONTS.mono, fontSize: 12, color: C.amber, marginLeft: 'auto' }}>{match.score}</span>}
        </div>
      </div>
    </div>
  );
}
function VodCardCompact({ match, playerById }) {
  const p1 = playerById[match.player1Id], p2 = playerById[match.player2Id];
  const winner = match.winnerId ? playerById[match.winnerId] : null;
  return (
    <a href={match.vodUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', gap: 12, padding: 10, background: C.bg, border: `1px solid ${C.border}`, textDecoration: 'none', alignItems: 'center' }}>
      <div style={{ width: 80, aspectRatio: '16/9', background: C.elevated, color: C.red, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>▶</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: FONTS.display, fontSize: 14, color: C.text, letterSpacing: '0.03em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{match.vodTitle || `${p1?.tag} vs ${p2?.tag}`}</div>
        <div style={{ fontFamily: FONTS.mono, fontSize: 11, color: C.muted, marginTop: 2, display: 'flex', gap: 6, alignItems: 'center' }}>
          <span>{p1?.tag} {winner?.id === p1?.id ? '★' : ''} vs {p2?.tag} {winner?.id === p2?.id ? '★' : ''}</span>
          <VersionBadge version={match.version} size="sm" />
        </div>
      </div>
    </a>
  );
}

// ═══════════════════════════════════════════════════════════
// VIEW: LUTADORES LIST
// ═══════════════════════════════════════════════════════════
function HuntersView({ players, ratingsByVersion, onOpenHunter }) {
  const [sortVersion, setSortVersion] = useState('2002');
  const isMobile = useIsMobile();
  const enriched = useMemo(() => players.filter(isCompetitor).map((p) => {
    const r2002 = ratingsByVersion['2002']?.[p.id] || { elo: STARTING_ELO, w: 0, l: 0 };
    const rum = ratingsByVersion['um']?.[p.id] || { elo: STARTING_ELO, w: 0, l: 0 };
    return { ...p, elo2002: r2002.elo, w2002: r2002.w, l2002: r2002.l, eloUm: rum.elo, wUm: rum.w, lUm: rum.l };
  }).sort((a, b) => sortVersion === '2002' ? b.elo2002 - a.elo2002 : b.eloUm - a.eloUm), [players, ratingsByVersion, sortVersion]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <RankLegend />
      <Panel title={`LUTADORES · ${enriched.length}`} action={
      <div style={{ display: 'flex', gap: 4 }}>
        {VERSION_IDS.map((v) => (
          <button key={v} onClick={() => setSortVersion(v)}
            style={{ background: sortVersion === v ? VERSIONS[v].color : 'transparent', color: sortVersion === v ? '#0A0A0A' : VERSIONS[v].color, border: `1px solid ${VERSIONS[v].color}`, padding: '4px 10px', fontFamily: FONTS.mono, fontSize: 10, cursor: 'pointer', letterSpacing: '0.15em' }}>
            {isMobile ? VERSIONS[v].label : `ORDENAR POR ${VERSIONS[v].label}`}
          </button>
        ))}
      </div>
    }>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: C.border }}>
        {enriched.map((p, i) => isMobile ? (
          <div key={p.id} onClick={() => onOpenHunter(p.id)}
            style={{ background: C.elevated, padding: 12, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: FONTS.mono, color: C.dim, fontSize: 11, minWidth: 24 }}>#{i + 1}</span>
              <Avatar player={p} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: FONTS.display, color: C.amber, fontSize: 16, letterSpacing: '0.05em' }}>{p.tag}</div>
                <div style={{ fontFamily: FONTS.body, color: C.muted, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <VersionEloCell version="2002" elo={p.elo2002} w={p.w2002} l={p.l2002} />
              <VersionEloCell version="um" elo={p.eloUm} w={p.wUm} l={p.lUm} />
            </div>
          </div>
        ) : (
          <div key={p.id} onClick={() => onOpenHunter(p.id)}
            style={{ display: 'grid', gridTemplateColumns: '40px 36px 80px 1fr 130px 130px', gap: 14, alignItems: 'center', padding: '12px 14px', background: C.elevated, cursor: 'pointer' }}>
            <span style={{ fontFamily: FONTS.mono, color: C.dim, fontSize: 12 }}>{String(i + 1).padStart(2, '0')}</span>
            <Avatar player={p} size={36} />
            <span style={{ fontFamily: FONTS.display, color: C.amber, fontSize: 18, letterSpacing: '0.05em' }}>{p.tag}</span>
            <span style={{ fontFamily: FONTS.body, color: C.text, fontSize: 14 }}>{p.name}</span>
            <VersionEloCell version="2002" elo={p.elo2002} w={p.w2002} l={p.l2002} />
            <VersionEloCell version="um" elo={p.eloUm} w={p.wUm} l={p.lUm} />
          </div>
        ))}
      </div>
    </Panel>
    </div>
  );
}

function VersionEloCell({ version, elo, w, l }) {
  const v = VERSIONS[version];
  const r = getRank(elo);
  const hasGames = w + l > 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: hasGames ? 1 : 0.4 }}>
      <div style={{ width: 28, height: 28, border: `2px solid ${r.color}`, color: r.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONTS.display, fontSize: 13 }}>{r.id}</div>
      <div>
        <div style={{ fontFamily: FONTS.mono, fontSize: 11, color: v.color, letterSpacing: '0.1em' }}>{v.label}</div>
        <div style={{ fontFamily: FONTS.mono, fontSize: 11, color: hasGames ? C.text : C.muted }}>{elo} · {w}V/{l}D</div>
      </div>
    </div>
  );
}

// ─── CHARACTER PICKER (mains do perfil) ─────────────────────
function CharacterPicker({ selected, onChange, max = 3, version }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const characterList = getCharactersForVersion(version);
  const filtered = useMemo(() =>
    characterList.filter((c) => c.toLowerCase().includes(search.toLowerCase().trim())),
  [search, characterList]);

  const toggle = (char) => {
    if (selected.includes(char)) {
      onChange(selected.filter((c) => c !== char));
    } else if (selected.length < max) {
      onChange([...selected, char]);
    }
  };

  return (
    <div>
      <div style={{ background: C.bg, border: `1px solid ${C.border}`, padding: 8, minHeight: 44, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', cursor: 'pointer' }}
        onClick={() => setOpen((v) => !v)}>
        {selected.length === 0 ? (
          <span style={{ color: C.dim, fontFamily: FONTS.body, fontSize: 13, padding: '2px 6px' }}>clique pra escolher…</span>
        ) : (
          selected.map((c) => (
            <span key={c} style={{ background: C.elevated, border: `1px solid ${C.amber}`, color: C.amber, padding: '4px 10px', fontFamily: FONTS.mono, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
              onClick={(e) => { e.stopPropagation(); toggle(c); }}>
              {c} <span style={{ opacity: 0.6 }}>×</span>
            </span>
          ))
        )}
        <span style={{ marginLeft: 'auto', color: C.muted, fontFamily: FONTS.mono, fontSize: 11 }}>{selected.length}/{max} {open ? '▴' : '▾'}</span>
      </div>
      {open && (
        <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderTop: 'none', padding: 10, maxHeight: 240, overflowY: 'auto' }}>
          <Input value={search} onChange={setSearch} placeholder="buscar personagem…" />
          <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {filtered.map((c) => {
              const isSelected = selected.includes(c);
              const isDisabled = !isSelected && selected.length >= max;
              return (
                <button key={c} type="button" disabled={isDisabled} onClick={() => toggle(c)}
                  style={{ background: isSelected ? C.amber : 'transparent', color: isSelected ? '#0A0A0A' : (isDisabled ? C.dim : C.text), border: `1px solid ${isSelected ? C.amber : C.border}`, padding: '4px 10px', fontFamily: FONTS.body, fontSize: 12, cursor: isDisabled ? 'not-allowed' : 'pointer', opacity: isDisabled ? 0.4 : 1 }}>
                  {c}
                </button>
              );
            })}
            {filtered.length === 0 && <span style={{ color: C.dim, fontStyle: 'italic', padding: 8 }}>Nenhum personagem encontrado.</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MATCH DETAIL VIEW — player embedado + dados completos da luta
// ═══════════════════════════════════════════════════════════
function MatchDetailView({ match, players, matches, playerById, ratingsByVersion, isAdmin, currentUser, onBack, onOpenHunter, onUpdateMatch, onDeleteMatch }) {
  const isMobile = useIsMobile();
  const [showShare, setShowShare] = useState(false);

  const p1 = playerById[match.player1Id];
  const p2 = playerById[match.player2Id];
  const v = VERSIONS[match.version];

  // ELO atual dos lutadores na versão da luta
  const e1Now = ratingsByVersion[match.version]?.[match.player1Id]?.elo ?? STARTING_ELO;
  const e2Now = ratingsByVersion[match.version]?.[match.player2Id]?.elo ?? STARTING_ELO;
  const r1 = getRank(e1Now);
  const r2 = getRank(e2Now);

  // Decidir qual URL embedar: stream se ao vivo, VOD se concluída
  const isLive = match.status === 'live';
  const isPast = match.status === 'completed';
  const embedUrl = isLive && match.streamUrl ? streamEmbedUrl(match.streamUrl) :
                   match.vodUrl ? streamEmbedUrl(match.vodUrl) : null;
  const externalUrl = isLive ? match.streamUrl : match.vodUrl;

  // Histórico head-to-head entre os 2 lutadores (versão da luta)
  const h2h = useMemo(() => {
    const others = matches.filter((m) =>
      m.id !== match.id &&
      m.version === match.version &&
      m.status === 'completed' &&
      m.winnerId &&
      ((m.player1Id === p1?.id && m.player2Id === p2?.id) ||
       (m.player1Id === p2?.id && m.player2Id === p1?.id))
    );
    let w1 = 0, w2 = 0;
    for (const m of others) {
      if (m.winnerId === p1?.id) w1++;
      else if (m.winnerId === p2?.id) w2++;
    }
    return { w1, w2, total: others.length, matches: others.sort((a, b) => new Date(b.completedAt || b.scheduledAt) - new Date(a.completedAt || a.scheduledAt)) };
  }, [match, matches, p1, p2]);

  const winner = match.winnerId === p1?.id ? p1 : match.winnerId === p2?.id ? p2 : null;
  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/?luta=${match.id}` : '';

  if (!p1 || !p2) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Btn variant="ghost" onClick={onBack}>← VOLTAR</Btn>
        <Empty msg="Luta não encontrada." />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <Btn variant="ghost" size="sm" onClick={onBack}>← VOLTAR</Btn>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <StatusBadge status={match.status} />
          <VersionBadge version={match.version} size="md" />
          <Btn variant="ghost" size="sm" onClick={() => setShowShare(true)}>📤 COMPARTILHAR</Btn>
        </div>
      </div>

      {/* Player embedado */}
      {embedUrl ? (
        <div style={{ background: '#000', aspectRatio: '16/9', position: 'relative', border: `1px solid ${isLive ? C.red : C.border}` }}>
          <iframe src={embedUrl} title={`${p1.tag} vs ${p2.tag}`} frameBorder="0" allowFullScreen
            allow="autoplay; encrypted-media; picture-in-picture"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
          {isLive && (
            <div style={{ position: 'absolute', top: 12, left: 12, background: C.red, color: '#fff', padding: '4px 10px', fontFamily: FONTS.mono, fontSize: 11, letterSpacing: '0.15em', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 6, height: 6, background: '#fff', borderRadius: '50%', animation: 'kof-pulse 1s infinite' }} />AO VIVO
            </div>
          )}
        </div>
      ) : externalUrl ? (
        <div style={{ background: C.elevated, border: `1px dashed ${C.border}`, padding: 32, textAlign: 'center' }}>
          <div style={{ fontFamily: FONTS.body, fontSize: 14, color: C.muted, marginBottom: 12 }}>
            O player embedado não está disponível pra essa URL.
          </div>
          <a href={externalUrl} target="_blank" rel="noopener noreferrer"
            style={{ display: 'inline-block', background: C.red, color: '#fff', padding: '10px 20px', textDecoration: 'none', fontFamily: FONTS.display, fontSize: 14, letterSpacing: '0.1em' }}>
            ▶ ASSISTIR EM {streamPlatform(externalUrl).toUpperCase()}
          </a>
        </div>
      ) : (
        <div style={{ background: C.elevated, border: `1px dashed ${C.border}`, padding: 32, textAlign: 'center', fontFamily: FONTS.body, fontSize: 13, color: C.muted }}>
          {match.status === 'scheduled' ? '⏳ Duelo agendado. Player aparece quando começar a transmissão.' : '📺 Sem VOD disponível pra essa luta.'}
        </div>
      )}

      {/* Hero dos 2 lutadores */}
      <div style={{ background: C.elevated, border: `1px solid ${C.border}`, padding: 'clamp(16px, 4vw, 24px)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr auto 1fr', gap: 'clamp(12px, 3vw, 24px)', alignItems: 'center' }}>
          <MatchDetailFighter player={p1} elo={e1Now} rank={r1} isWinner={winner?.id === p1.id} isLoser={isPast && winner?.id === p2.id} side="left" isMobile={isMobile} onClick={() => onOpenHunter(p1.id)} />
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div style={{ fontFamily: FONTS.display, fontSize: isMobile ? 36 : 56, color: C.amber, letterSpacing: '0.1em', lineHeight: 0.9 }}>VS</div>
            {match.score && <div style={{ fontFamily: FONTS.mono, fontSize: isMobile ? 16 : 22, color: C.text, letterSpacing: '0.1em' }}>{match.score}</div>}
            {match.format && <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: C.amber, letterSpacing: '0.2em', marginTop: 4 }}>· {match.format} ·</div>}
          </div>
          <MatchDetailFighter player={p2} elo={e2Now} rank={r2} isWinner={winner?.id === p2.id} isLoser={isPast && winner?.id === p1.id} side="right" isMobile={isMobile} onClick={() => onOpenHunter(p2.id)} />
        </div>
      </div>

      {/* Dados da luta */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <InfoCard label="DATA / HORA" value={fmtDateTime(match.scheduledAt)} sub={fmtRelative(match.scheduledAt)} />
        <InfoCard label="VERSÃO" value={v?.fullLabel || match.version} accent={v?.color} />
        {match.completedAt && <InfoCard label="CONCLUÍDA EM" value={fmtDateTime(match.completedAt)} />}
        {winner && <InfoCard label="VENCEDOR" value={winner.tag} accent={C.green} />}
      </div>

      {/* Notas */}
      {match.notes && (
        <div style={{ background: C.elevated, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.amber}`, padding: 14 }}>
          <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: C.amber, letterSpacing: '0.15em', marginBottom: 6 }}>NOTAS DO ADMIN</div>
          <div style={{ fontFamily: FONTS.body, fontSize: 14, color: C.text, fontStyle: 'italic' }}>"{match.notes}"</div>
        </div>
      )}

      {/* Head-to-head */}
      {h2h.total > 0 && (
        <Panel title={`HISTÓRICO ENTRE OS DOIS · ${v?.label}`} accent={C.amber}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, padding: '12px 0 16px', borderBottom: `1px solid ${C.border}`, marginBottom: 12 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: FONTS.display, fontSize: 36, color: h2h.w1 > h2h.w2 ? C.green : (h2h.w1 < h2h.w2 ? C.red : C.text), letterSpacing: '0.05em', lineHeight: 1 }}>{h2h.w1}</div>
              <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: C.muted, marginTop: 4 }}>{p1.tag}</div>
            </div>
            <span style={{ fontFamily: FONTS.display, fontSize: 24, color: C.dim }}>×</span>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: FONTS.display, fontSize: 36, color: h2h.w2 > h2h.w1 ? C.green : (h2h.w2 < h2h.w1 ? C.red : C.text), letterSpacing: '0.05em', lineHeight: 1 }}>{h2h.w2}</div>
              <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: C.muted, marginTop: 4 }}>{p2.tag}</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {h2h.matches.slice(0, 5).map((m) => (
              <ScheduledRow key={m.id} match={m} playerById={playerById} ratingsByVersion={ratingsByVersion} onClickHunter={onOpenHunter} onClickMatch={onOpenMatch} />
            ))}
          </div>
        </Panel>
      )}

      {/* Painel admin inline */}
      {isAdmin && (match.status === 'scheduled' || match.status === 'live') && (
        <Panel title="CONTROLES ADMIN" accent={C.purple}>
          <AdminMatchEditor match={match} playerById={playerById} ratingsByVersion={ratingsByVersion} onUpdate={onUpdateMatch} onDelete={onDeleteMatch} />
        </Panel>
      )}

      {/* Comentários */}
      <CommentsSection matchId={match.id} currentUser={currentUser} playerById={playerById} />

      {showShare && <ShareModal url={shareUrl} title={`${p1.tag} vs ${p2.tag} — ARENA BNOSTLE`} onClose={() => setShowShare(false)} />}
    </div>
  );
}

function CommentsSection({ matchId, currentUser, playerById }) {
  const [comments, setComments] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);

  // Carregar comentários do storage
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await window.storage.get(KEYS.comments(matchId));
        const data = res?.value ? JSON.parse(res.value) : [];
        if (mounted) setComments(data);
      } catch {
        if (mounted) setComments([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [matchId]);

  const saveAll = async (next) => {
    setComments(next);
    try { await window.storage.set(KEYS.comments(matchId), JSON.stringify(next)); } catch {}
  };

  const submit = () => {
    if (!draft.trim() || !currentUser) return;
    const newComment = {
      id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      authorId: currentUser.id,
      authorTag: currentUser.tag,
      authorIsAdmin: !!currentUser.isAdmin,
      text: draft.trim().slice(0, 500),
      createdAt: new Date().toISOString(),
    };
    saveAll([newComment, ...comments]);
    setDraft('');
  };

  const remove = (id) => {
    if (!currentUser) return;
    const c = comments.find((x) => x.id === id);
    if (!c) return;
    // só autor ou admin podem deletar
    if (c.authorId !== currentUser.id && !currentUser.isAdmin) return;
    if (!confirm('Apagar este comentário?')) return;
    saveAll(comments.filter((x) => x.id !== id));
  };

  return (
    <Panel title={`COMENTÁRIOS · ${comments.length}`} accent={C.cyan}>
      {currentUser ? (
        <div style={{ marginBottom: 16 }}>
          <Textarea value={draft} onChange={setDraft} placeholder="Comente sobre a luta..." rows={2} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <span style={{ fontFamily: FONTS.mono, fontSize: 10, color: C.muted }}>{draft.length}/500</span>
            <Btn variant="cyan" size="sm" onClick={submit} disabled={!draft.trim()}>COMENTAR</Btn>
          </div>
        </div>
      ) : (
        <div style={{ background: C.bg, border: `1px dashed ${C.border}`, padding: 12, marginBottom: 16, fontFamily: FONTS.body, fontSize: 13, color: C.muted, textAlign: 'center' }}>
          Faça login pra comentar.
        </div>
      )}

      {loading ? (
        <div style={{ padding: 12, fontFamily: FONTS.mono, fontSize: 11, color: C.muted, textAlign: 'center' }}>carregando...</div>
      ) : comments.length === 0 ? (
        <Empty msg="Nenhum comentário ainda. Seja o primeiro!" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {comments.map((c) => {
            const author = playerById[c.authorId];
            const canDelete = currentUser && (currentUser.id === c.authorId || currentUser.isAdmin);
            return (
              <div key={c.id} style={{ background: C.bg, border: `1px solid ${C.border}`, padding: 12, display: 'flex', gap: 12 }}>
                {author && <Avatar player={author} size={32} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: FONTS.display, fontSize: 14, color: c.authorIsAdmin ? C.purple : C.amber, letterSpacing: '0.05em' }}>{c.authorTag}</span>
                    {c.authorIsAdmin && <span style={{ fontFamily: FONTS.mono, fontSize: 9, color: C.purple, border: `1px solid ${C.purple}`, padding: '1px 5px', letterSpacing: '0.15em' }}>ADMIN</span>}
                    <span style={{ fontFamily: FONTS.mono, fontSize: 10, color: C.muted }}>{fmtRelative(c.createdAt)}</span>
                    {canDelete && (
                      <button onClick={() => remove(c.id)} style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 14, padding: 0, marginLeft: 'auto' }}>×</button>
                    )}
                  </div>
                  <div style={{ fontFamily: FONTS.body, fontSize: 14, color: C.text, lineHeight: 1.5, wordBreak: 'break-word' }}>{c.text}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function MatchDetailFighter({ player, elo, rank, isWinner, isLoser, side, isMobile, onClick }) {
  return (
    <div onClick={onClick} style={{
      display: 'flex', flexDirection: isMobile ? 'row' : 'column', alignItems: 'center', gap: 12,
      textAlign: isMobile ? 'left' : 'center', cursor: 'pointer',
      opacity: isLoser ? 0.5 : 1,
      padding: 12,
      border: `1px solid ${isWinner ? C.amber : 'transparent'}`,
      background: isWinner ? C.amber + '15' : 'transparent',
    }}>
      <Avatar player={player} size={isMobile ? 56 : 80} />
      <div style={{ flex: isMobile ? 1 : 'initial', minWidth: 0 }}>
        <div style={{ fontFamily: FONTS.display, fontSize: isMobile ? 22 : 32, color: rank.color, letterSpacing: '0.05em', lineHeight: 1 }}>{player.tag}</div>
        <div style={{ fontFamily: FONTS.body, fontSize: 13, color: C.muted, marginTop: 2 }}>{player.name}</div>
        <div style={{ fontFamily: FONTS.mono, fontSize: 11, color: rank.color, marginTop: 6 }}>{rank.id} · {elo} ELO</div>
        {isWinner && <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: C.amber, letterSpacing: '0.15em', marginTop: 6 }}>★ VENCEDOR</div>}
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const config = {
    scheduled: { label: 'AGENDADO', color: C.amber },
    live: { label: 'AO VIVO', color: C.red },
    completed: { label: 'CONCLUÍDO', color: C.green },
  }[status] || { label: status?.toUpperCase() || '—', color: C.muted };
  return (
    <span style={{ fontFamily: FONTS.mono, fontSize: 10, color: config.color, border: `1px solid ${config.color}`, padding: '4px 10px', letterSpacing: '0.2em' }}>
      {config.label}
    </span>
  );
}

function InfoCard({ label, value, sub, accent }) {
  return (
    <div style={{ background: C.elevated, border: `1px solid ${C.border}`, borderLeft: `3px solid ${accent || C.border}`, padding: '12px 14px' }}>
      <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: C.muted, letterSpacing: '0.15em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: FONTS.display, fontSize: 18, color: accent || C.text, letterSpacing: '0.03em' }}>{value}</div>
      {sub && <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: C.muted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// LUTADOR PROFILE (public + own)
// ═══════════════════════════════════════════════════════════
function HunterProfileView({ hunter, isOwn, players, matches, ratingsByVersion, playerById, currentUser, onBack, onOpenHunter, onOpenMatch, onUpdateProfile }) {
  const isMobileProfile = useIsMobile();
  const [showShare, setShowShare] = useState(false);
  const [editing, setEditing] = useState(false);
  const [follows, setFollows] = useState([]); // IDs seguidos pelo currentUser

  // Carrega lista de seguidos
  useEffect(() => {
    if (!currentUser) { setFollows([]); return; }
    (async () => {
      try {
        const res = await window.storage.get(KEYS.follows);
        const data = res?.value ? JSON.parse(res.value) : {};
        setFollows(data[currentUser.id] || []);
      } catch { setFollows([]); }
    })();
  }, [currentUser]);

  const toggleFollow = async (targetId) => {
    if (!currentUser) return;
    try {
      const res = await window.storage.get(KEYS.follows);
      const data = res?.value ? JSON.parse(res.value) : {};
      const myList = data[currentUser.id] || [];
      const next = myList.includes(targetId) ? myList.filter((id) => id !== targetId) : [...myList, targetId];
      data[currentUser.id] = next;
      await window.storage.set(KEYS.follows, JSON.stringify(data));
      setFollows(next);
    } catch (e) { console.error(e); }
  };

  const isFollowing = follows.includes(hunter.id);
  const [draft, setDraft] = useState(() => ({
    tag: hunter.tag,
    name: hunter.name,
    bio: hunter.bio || '',
    avatarUrl: hunter.avatarUrl || '',
    city: hunter.city || '',
    platform: hunter.platform || '',
    mains2002: hunter.mains2002 || [],
    mainsUm: hunter.mainsUm || [],
    mainsXv: hunter.mainsXv || [],
    twitch: hunter.twitch || '',
    youtube: hunter.youtube || '',
    discord: hunter.discord || '',
    fightcadeEmail: hunter.fightcadeEmail || '',
  }));
  const [activeVersion, setActiveVersion] = useState('2002');

  const eloData = useMemo(() => computeEloHistory(hunter.id, activeVersion, players, matches), [hunter.id, activeVersion, players, matches]);
  const stats = ratingsByVersion[activeVersion]?.[hunter.id] || { elo: STARTING_ELO, w: 0, l: 0 };
  const rank = getRank(stats.elo);
  const next = nextRankInfo(stats.elo);

  // HEAD-TO-HEAD: confrontos do hunter contra cada oponente (na versão ativa)
  const headToHead = useMemo(() => {
    const map = {}; // opponentId -> { wins, losses }
    for (const m of matches) {
      if (m.version !== activeVersion || m.status !== 'completed' || !m.winnerId) continue;
      if (m.player1Id !== hunter.id && m.player2Id !== hunter.id) continue;
      const oppId = m.player1Id === hunter.id ? m.player2Id : m.player1Id;
      if (!map[oppId]) map[oppId] = { wins: 0, losses: 0, last: null };
      if (m.winnerId === hunter.id) map[oppId].wins++;
      else map[oppId].losses++;
      const md = m.completedAt || m.scheduledAt;
      if (!map[oppId].last || new Date(md) > new Date(map[oppId].last)) map[oppId].last = md;
    }
    return Object.entries(map)
      .map(([oppId, data]) => ({ oppId, opp: playerById[oppId], ...data, total: data.wins + data.losses }))
      .filter((h) => h.opp)
      .sort((a, b) => b.total - a.total || new Date(b.last) - new Date(a.last))
      .slice(0, 8);
  }, [hunter.id, activeVersion, matches, playerById]);

  // ESTATÍSTICAS DETALHADAS: streaks, win rate, performance recente
  const detailedStats = useMemo(() => {
    const sorted = matches
      .filter((m) => (m.player1Id === hunter.id || m.player2Id === hunter.id) &&
                     m.version === activeVersion && m.status === 'completed' && m.winnerId)
      .sort((a, b) => new Date(a.completedAt || a.scheduledAt) - new Date(b.completedAt || b.scheduledAt));

    let currentStreak = 0;
    let currentStreakType = null; // 'W' or 'L'
    let bestWinStreak = 0;
    let bestLossStreak = 0;
    let tempW = 0, tempL = 0;
    const byMonth = {}; // 'YYYY-MM' -> {w, l}

    for (const m of sorted) {
      const won = m.winnerId === hunter.id;
      // monthly
      const d = new Date(m.completedAt || m.scheduledAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!byMonth[key]) byMonth[key] = { w: 0, l: 0 };
      if (won) byMonth[key].w++; else byMonth[key].l++;
      // streaks
      if (won) {
        tempW++; tempL = 0;
        if (tempW > bestWinStreak) bestWinStreak = tempW;
      } else {
        tempL++; tempW = 0;
        if (tempL > bestLossStreak) bestLossStreak = tempL;
      }
    }
    // current streak = no fim do sorted
    if (sorted.length > 0) {
      const lastWon = sorted[sorted.length - 1].winnerId === hunter.id;
      currentStreakType = lastWon ? 'W' : 'L';
      currentStreak = lastWon ? tempW : tempL;
    }

    const last10 = sorted.slice(-10).reverse(); // pega últimas 10, mais recente primeiro
    const last10Won = last10.filter((m) => m.winnerId === hunter.id).length;

    const months = Object.entries(byMonth).map(([k, v]) => ({
      month: k,
      ...v,
      total: v.w + v.l,
      wr: v.w + v.l > 0 ? Math.round(v.w / (v.w + v.l) * 100) : 0,
    })).sort((a, b) => a.month.localeCompare(b.month));

    return { currentStreak, currentStreakType, bestWinStreak, bestLossStreak, last10, last10Won, byMonth: months, totalMatches: sorted.length };
  }, [hunter.id, activeVersion, matches]);
  const myMatches = matches.filter((m) => (m.player1Id === hunter.id || m.player2Id === hunter.id) && m.status === 'completed' && m.version === activeVersion)
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt)).slice(0, 10);
  const winRate = stats.w + stats.l > 0 ? Math.round((stats.w / (stats.w + stats.l)) * 100) : 0;
  const shareUrl = (typeof window !== 'undefined' ? window.location.origin : 'https://arena-bnostle.app') + `/h/${hunter.tag}`;

  const save = () => {
    const newTag = draft.tag.toUpperCase().slice(0, 10);
    if (newTag.length < 2) { alert('Tag precisa ter no mínimo 2 letras.'); return; }
    onUpdateProfile({
      tag: newTag,
      name: draft.name.trim(),
      bio: draft.bio.trim() || null,
      avatarUrl: draft.avatarUrl.trim() || null,
      city: draft.city.trim() || null,
      platform: draft.platform.trim() || null,
      mains2002: draft.mains2002.length ? draft.mains2002 : null,
      mainsUm: draft.mainsUm.length ? draft.mainsUm : null,
      mainsXv: draft.mainsXv.length ? draft.mainsXv : null,
      twitch: draft.twitch.trim() || null,
      youtube: draft.youtube.trim() || null,
      discord: draft.discord.trim() || null,
      fightcadeEmail: draft.fightcadeEmail.trim().toLowerCase() || null,
    });
    setEditing(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <Btn variant="ghost" size="sm" onClick={onBack}>← VOLTAR</Btn>
        <div style={{ display: 'flex', gap: 8 }}>
          {isOwn && !editing && <Btn variant="cyan" size="sm" onClick={() => setEditing(true)}>EDITAR PERFIL</Btn>}
          {!isOwn && currentUser && (
            <Btn variant={isFollowing ? 'confirm' : 'ghost'} size="sm" onClick={() => toggleFollow(hunter.id)}>
              {isFollowing ? '★ SEGUINDO' : '☆ SEGUIR'}
            </Btn>
          )}
          <Btn variant="amber" size="sm" onClick={() => setShowShare(true)}>↗ COMPARTILHAR</Btn>
        </div>
      </div>

      {/* Hero */}
      {editing ? (
        <Panel title="EDITAR PERFIL" accent={C.cyan}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobileProfile ? '1fr' : 'auto 1fr', gap: 20, alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
              <Avatar player={{ ...hunter, avatarUrl: draft.avatarUrl, avatarColor: hunter.avatarColor }} size={isMobileProfile ? 80 : 120} />
              <span style={{ fontFamily: FONTS.mono, fontSize: 10, color: C.muted, letterSpacing: '0.15em' }}>PRÉ-VISUALIZAÇÃO</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div><label style={lbl}>URL DA FOTO (OPCIONAL)</label>
                <Input value={draft.avatarUrl} onChange={(v) => setDraft((d) => ({ ...d, avatarUrl: v }))} placeholder="https://... (deixe vazio pra usar iniciais)" />
              </div>
              <div><label style={lbl}>NOME COMPLETO</label>
                <Input value={draft.name} onChange={(v) => setDraft((d) => ({ ...d, name: v }))} />
              </div>
              <div><label style={lbl}>TAG (2-10 LETRAS)</label>
                <Input value={draft.tag} onChange={(v) => setDraft((d) => ({ ...d, tag: v.toUpperCase() }))} />
              </div>
              <div><label style={lbl}>BIO (OPCIONAL)</label>
                <Textarea value={draft.bio} onChange={(v) => setDraft((d) => ({ ...d, bio: v }))} placeholder="ex: main Kyo · arcade stick · desde 2018" rows={3} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                <div><label style={lbl}>CIDADE (OPCIONAL)</label>
                  <Input value={draft.city} onChange={(v) => setDraft((d) => ({ ...d, city: v }))} placeholder="ex: Pouso Alegre, MG" />
                </div>
                <div><label style={lbl}>PLATAFORMA</label>
                  <Select value={draft.platform} onChange={(v) => setDraft((d) => ({ ...d, platform: v }))}>
                    <option value="">— escolher —</option>
                    <option value="PC">PC</option>
                    <option value="Steam">Steam</option>
                    <option value="PS4">PlayStation 4</option>
                    <option value="PS5">PlayStation 5</option>
                    <option value="Xbox">Xbox</option>
                    <option value="Switch">Nintendo Switch</option>
                    <option value="Arcade">Arcade Stick</option>
                    <option value="Outro">Outro</option>
                  </Select>
                </div>
              </div>

              <div><label style={lbl}>MAINS NO 2002 (CLÁSSICA) — ATÉ 3</label>
                <CharacterPicker selected={draft.mains2002} onChange={(arr) => setDraft((d) => ({ ...d, mains2002: arr }))} max={3} />
              </div>
              <div><label style={lbl}>MAINS NO 2002 UM (STEAM) — ATÉ 3</label>
                <CharacterPicker selected={draft.mainsUm} onChange={(arr) => setDraft((d) => ({ ...d, mainsUm: arr }))} max={3} />
              </div>
              <div><label style={lbl}>MAINS NO KOF XV — ATÉ 3</label>
                <CharacterPicker selected={draft.mainsXv} onChange={(arr) => setDraft((d) => ({ ...d, mainsXv: arr }))} max={3} version="xv" />
              </div>

              <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.purple}`, padding: 12, marginBottom: 10 }}>
                <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: C.purple, letterSpacing: '0.15em', marginBottom: 8 }}>📸 FOTO AUTOMÁTICA (FIGHTCADE / GRAVATAR)</div>
                <div style={{ fontFamily: FONTS.body, fontSize: 12, color: C.muted, marginBottom: 8, lineHeight: 1.5 }}>
                  Coloque o email da sua conta Fightcade e a foto será carregada automaticamente (mesma foto do seu perfil no Fightcade). Este email é privado, só você vê.
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <Input value={draft.fightcadeEmail} onChange={(v) => setDraft((d) => ({ ...d, fightcadeEmail: v }))} placeholder="seuemail@exemplo.com" />
                  </div>
                  {draft.fightcadeEmail && draft.fightcadeEmail.includes('@') && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <img src={gravatarUrl(draft.fightcadeEmail, 64)} alt="Preview"
                        style={{ width: 48, height: 48, objectFit: 'cover', border: `1px solid ${C.border}` }} />
                      <span style={{ fontFamily: FONTS.mono, fontSize: 9, color: C.muted, letterSpacing: '0.1em' }}>PREVIEW</span>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                <div><label style={lbl}>TWITCH (USUÁRIO)</label>
                  <Input value={draft.twitch} onChange={(v) => setDraft((d) => ({ ...d, twitch: v.replace(/^@/, '') }))} placeholder="seuusername" />
                </div>
                <div><label style={lbl}>YOUTUBE (CANAL)</label>
                  <Input value={draft.youtube} onChange={(v) => setDraft((d) => ({ ...d, youtube: v }))} placeholder="@seucanal" />
                </div>
                <div><label style={lbl}>DISCORD</label>
                  <Input value={draft.discord} onChange={(v) => setDraft((d) => ({ ...d, discord: v }))} placeholder="seuusername" />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <Btn variant="amber" onClick={save}>✓ SALVAR</Btn>
                <Btn variant="ghost" onClick={() => { setDraft({
                  tag: hunter.tag, name: hunter.name, bio: hunter.bio || '', avatarUrl: hunter.avatarUrl || '',
                  city: hunter.city || '', platform: hunter.platform || '',
                  mains2002: hunter.mains2002 || [], mainsUm: hunter.mainsUm || [], mainsXv: hunter.mainsXv || [],
                  twitch: hunter.twitch || '', youtube: hunter.youtube || '', discord: hunter.discord || '',
                  fightcadeEmail: hunter.fightcadeEmail || '',
                }); setEditing(false); }}>CANCELAR</Btn>
              </div>
            </div>
          </div>
        </Panel>
      ) : (
        <div style={{ background: `linear-gradient(135deg, ${rank.color}22, ${C.bg})`, border: `1px solid ${rank.color}`, borderTop: `3px solid ${rank.color}`, padding: 'clamp(16px, 4vw, 28px)', display: 'flex', alignItems: 'center', gap: 'clamp(12px, 3vw, 24px)', flexWrap: 'wrap' }}>
          <Avatar player={hunter} size={isMobileProfile ? 64 : 96} />
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontFamily: FONTS.display, fontSize: 'clamp(32px, 8vw, 48px)', color: rank.color, letterSpacing: '0.05em', lineHeight: 0.9 }}>{hunter.tag}</div>
            <div style={{ fontFamily: FONTS.body, fontSize: 18, color: C.text, marginTop: 4 }}>{hunter.name}</div>
            {hunter.bio && <div style={{ fontFamily: FONTS.body, fontSize: 13, color: C.muted, marginTop: 8, fontStyle: 'italic' }}>"{hunter.bio}"</div>}

            {/* Metadados: cidade, plataforma, mains */}
            {(hunter.city || hunter.platform || (hunter.mains2002 && hunter.mains2002.length) || (hunter.mainsUm && hunter.mainsUm.length) || (hunter.mainsXv && hunter.mainsXv.length)) && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                {hunter.city && (
                  <span style={{ fontFamily: FONTS.mono, fontSize: 11, color: C.text, background: C.bg, border: `1px solid ${C.border}`, padding: '3px 8px', letterSpacing: '0.05em' }}>
                    📍 {hunter.city}
                  </span>
                )}
                {hunter.platform && (
                  <span style={{ fontFamily: FONTS.mono, fontSize: 11, color: C.text, background: C.bg, border: `1px solid ${C.border}`, padding: '3px 8px', letterSpacing: '0.05em' }}>
                    🎮 {hunter.platform}
                  </span>
                )}
              </div>
            )}

            {/* Mains por versão */}
            {hunter.mains2002 && hunter.mains2002.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <span style={{ fontFamily: FONTS.mono, fontSize: 10, color: C.red, letterSpacing: '0.15em' }}>MAINS 2002:</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                  {hunter.mains2002.map((c) => (
                    <span key={c} style={{ fontFamily: FONTS.body, fontSize: 11, color: C.red, border: `1px solid ${C.red}`, padding: '2px 8px' }}>{c}</span>
                  ))}
                </div>
              </div>
            )}
            {hunter.mainsUm && hunter.mainsUm.length > 0 && (
              <div style={{ marginTop: 6 }}>
                <span style={{ fontFamily: FONTS.mono, fontSize: 10, color: C.cyan, letterSpacing: '0.15em' }}>MAINS UM:</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                  {hunter.mainsUm.map((c) => (
                    <span key={c} style={{ fontFamily: FONTS.body, fontSize: 11, color: C.cyan, border: `1px solid ${C.cyan}`, padding: '2px 8px' }}>{c}</span>
                  ))}
                </div>
              </div>
            )}
            {hunter.mainsXv && hunter.mainsXv.length > 0 && (
              <div style={{ marginTop: 6 }}>
                <span style={{ fontFamily: FONTS.mono, fontSize: 10, color: C.purple, letterSpacing: '0.15em' }}>MAINS XV:</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                  {hunter.mainsXv.map((c) => (
                    <span key={c} style={{ fontFamily: FONTS.body, fontSize: 11, color: C.purple, border: `1px solid ${C.purple}`, padding: '2px 8px' }}>{c}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Redes sociais */}
            {(hunter.twitch || hunter.youtube || hunter.discord) && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                {hunter.twitch && (
                  <a href={`https://twitch.tv/${hunter.twitch}`} target="_blank" rel="noopener noreferrer"
                    style={{ fontFamily: FONTS.mono, fontSize: 11, color: '#9146FF', textDecoration: 'none', border: `1px solid #9146FF`, padding: '4px 10px', letterSpacing: '0.05em' }}>
                    📺 Twitch
                  </a>
                )}
                {hunter.youtube && (
                  <a href={hunter.youtube.startsWith('http') ? hunter.youtube : `https://youtube.com/${hunter.youtube}`} target="_blank" rel="noopener noreferrer"
                    style={{ fontFamily: FONTS.mono, fontSize: 11, color: '#FF0000', textDecoration: 'none', border: `1px solid #FF0000`, padding: '4px 10px', letterSpacing: '0.05em' }}>
                    ▶ YouTube
                  </a>
                )}
                {hunter.discord && (
                  <span style={{ fontFamily: FONTS.mono, fontSize: 11, color: '#5865F2', border: `1px solid #5865F2`, padding: '4px 10px', letterSpacing: '0.05em' }}>
                    💬 {hunter.discord}
                  </span>
                )}
              </div>
            )}

            <div style={{ fontFamily: FONTS.mono, fontSize: 11, color: C.muted, marginTop: 10 }}>LUTADOR DESDE {fmtDate(hunter.joinedAt)}</div>
          </div>
        </div>
      )}

      {/* Version selector + ELO panel */}
      {!editing && (
        <>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            {VERSION_IDS.map((v) => {
              const r = ratingsByVersion[v]?.[hunter.id] || { elo: STARTING_ELO, w: 0, l: 0 };
              const isActive = activeVersion === v;
              return (
                <button key={v} onClick={() => setActiveVersion(v)}
                  style={{ background: isActive ? VERSIONS[v].color : 'transparent', color: isActive ? '#0A0A0A' : VERSIONS[v].color, border: `1px solid ${VERSIONS[v].color}`, padding: '10px 20px', fontFamily: FONTS.display, fontSize: 14, cursor: 'pointer', letterSpacing: '0.1em', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <span>{VERSIONS[v].fullLabel}</span>
                  <span style={{ fontFamily: FONTS.mono, fontSize: 10, opacity: 0.8 }}>{r.elo} ELO · {r.w}V/{r.l}D</span>
                </button>
              );
            })}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            <BigStat label={`RANK ${VERSIONS[activeVersion].label}`} value={rank.id} color={rank.color} sub={`${stats.elo} ELO`} />
            <BigStat label="VITÓRIAS" value={stats.w} color={C.green} />
            <BigStat label="DERROTAS" value={stats.l} color={C.red} />
            <BigStat label="WIN RATE" value={`${winRate}%`} color={C.amber} />
            <BigStat label="PEAK ELO" value={eloData.peak} color={rank.color} />
          </div>

          <Panel title={`EVOLUÇÃO DE ELO · ${VERSIONS[activeVersion].label}`} accent={VERSIONS[activeVersion].color}>
            <EloChart history={eloData.history} color={VERSIONS[activeVersion].color} />
          </Panel>

          {/* MEUS RIVAIS — só no próprio perfil */}
          {isOwn && follows.length > 0 && (
            <Panel title={`MEUS RIVAIS · ${follows.length}`} accent={C.amber}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: C.border }}>
                {follows.map((fid) => {
                  const r = playerById[fid];
                  if (!r || !isCompetitor(r)) return null;
                  const rElo = ratingsByVersion[activeVersion]?.[r.id]?.elo ?? STARTING_ELO;
                  const rRank = getRank(rElo);
                  return (
                    <div key={fid} onClick={() => onOpenHunter(r.id)}
                      style={{ background: C.elevated, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                      <Avatar player={r} size={32} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: FONTS.display, fontSize: 14, color: rRank.color, letterSpacing: '0.05em' }}>{r.tag}</div>
                        <div style={{ fontFamily: FONTS.body, fontSize: 12, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
                      </div>
                      <div style={{ fontFamily: FONTS.mono, fontSize: 11, color: rRank.color }}>{rRank.id} · {rElo}</div>
                      <button onClick={(e) => { e.stopPropagation(); toggleFollow(fid); }} style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 16 }}>×</button>
                    </div>
                  );
                })}
              </div>
            </Panel>
          )}

          {detailedStats.totalMatches > 0 && (
            <Panel title={`ESTATÍSTICAS DETALHADAS · ${VERSIONS[activeVersion].label}`}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
                <BigStat label="SEQUÊNCIA ATUAL"
                  value={detailedStats.currentStreak > 0 ? `${detailedStats.currentStreak}${detailedStats.currentStreakType}` : '—'}
                  color={detailedStats.currentStreakType === 'W' ? C.green : detailedStats.currentStreakType === 'L' ? C.red : C.muted} />
                <BigStat label="MELHOR SEQ. VITÓRIAS" value={detailedStats.bestWinStreak} color={C.green} />
                <BigStat label="PIOR SEQ. DERROTAS" value={detailedStats.bestLossStreak} color={C.red} />
                <BigStat label="ÚLTIMAS 10"
                  value={`${detailedStats.last10Won}-${detailedStats.last10.length - detailedStats.last10Won}`}
                  color={detailedStats.last10Won >= 5 ? C.green : C.red} />
              </div>

              {/* Últimas 10 partidas (formato visual W/L em sequência) */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: C.muted, letterSpacing: '0.15em', marginBottom: 8 }}>FORMA RECENTE (mais antiga → mais nova)</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {[...detailedStats.last10].reverse().map((m, i) => {
                    const won = m.winnerId === hunter.id;
                    return (
                      <span key={m.id} title={`vs ${playerById[won ? (m.player1Id === hunter.id ? m.player2Id : m.player1Id) : (m.player1Id === hunter.id ? m.player2Id : m.player1Id)]?.tag} - ${fmtDate(m.completedAt || m.scheduledAt)}`}
                        style={{ width: 28, height: 28, background: won ? C.green : C.red, color: '#0A0A0A', fontFamily: FONTS.display, fontSize: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                        {won ? 'V' : 'D'}
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Performance por mês */}
              {detailedStats.byMonth.length > 0 && (
                <div>
                  <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: C.muted, letterSpacing: '0.15em', marginBottom: 8 }}>PERFORMANCE POR MÊS</div>
                  <div className="kof-scroll-x" style={{ paddingBottom: 4 }}>
                    <div style={{ display: 'flex', gap: 6, minWidth: 'max-content' }}>
                      {detailedStats.byMonth.map((mo) => (
                        <div key={mo.month} style={{ background: C.bg, border: `1px solid ${C.border}`, padding: '8px 10px', minWidth: 100 }}>
                          <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: C.muted, letterSpacing: '0.1em' }}>{mo.month}</div>
                          <div style={{ fontFamily: FONTS.display, fontSize: 18, color: mo.wr >= 50 ? C.green : C.red, marginTop: 4 }}>{mo.wr}%</div>
                          <div style={{ fontFamily: FONTS.mono, fontSize: 10, marginTop: 2 }}>
                            <span style={{ color: C.green }}>{mo.w}V</span>·<span style={{ color: C.red }}>{mo.l}D</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </Panel>
          )}

          {headToHead.length > 0 && (
            <Panel title={`HEAD-TO-HEAD · ${VERSIONS[activeVersion].label}`} accent={C.amber}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {headToHead.map((h) => {
                  const opp = h.opp;
                  const oppElo = ratingsByVersion[activeVersion]?.[opp.id]?.elo ?? STARTING_ELO;
                  const oppRank = getRank(oppElo);
                  const winRate = h.total > 0 ? Math.round((h.wins / h.total) * 100) : 0;
                  const dominant = h.wins > h.losses ? 'win' : h.wins < h.losses ? 'loss' : 'even';
                  return (
                    <div key={h.oppId} onClick={() => onOpenHunter && onOpenHunter(opp.id)}
                      style={{ display: 'grid', gridTemplateColumns: isMobileProfile ? '36px 1fr auto' : '36px 1fr auto auto', gap: 12, alignItems: 'center', padding: '10px 12px', background: C.bg, border: `1px solid ${C.border}`, borderLeft: `3px solid ${dominant === 'win' ? C.green : dominant === 'loss' ? C.red : C.muted}`, cursor: 'pointer' }}>
                      <Avatar player={opp} size={32} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontFamily: FONTS.display, fontSize: 15, color: oppRank.color, letterSpacing: '0.05em' }}>{opp.tag}</div>
                        <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: C.muted }}>último confronto: {fmtDate(h.last)}</div>
                      </div>
                      <div style={{ fontFamily: FONTS.display, fontSize: 18, letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                        <span style={{ color: C.green }}>{h.wins}</span>
                        <span style={{ color: C.dim, margin: '0 4px' }}>×</span>
                        <span style={{ color: C.red }}>{h.losses}</span>
                      </div>
                      {!isMobileProfile && (
                        <span style={{ fontFamily: FONTS.mono, fontSize: 10, color: dominant === 'win' ? C.green : dominant === 'loss' ? C.red : C.muted, letterSpacing: '0.1em', minWidth: 50, textAlign: 'right' }}>
                          {winRate}% WR
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </Panel>
          )}

          <Panel title={`HISTÓRICO ${VERSIONS[activeVersion].label}`}>
            {myMatches.length === 0 ? <Empty msg={`Nenhuma partida concluída em ${VERSIONS[activeVersion].fullLabel} ainda.`} /> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {myMatches.map((m) => <ScheduledRow key={m.id} match={m} playerById={playerById} ratingsByVersion={ratingsByVersion} onClickHunter={onOpenHunter} onClickMatch={onOpenMatch} />)}
              </div>
            )}
          </Panel>
        </>
      )}

      {showShare && <ShareModal url={shareUrl} title={`${hunter.tag} — ARENA BNOSTLE`} onClose={() => setShowShare(false)} />}
    </div>
  );
}

function BigStat({ label, value, color, sub }) {
  return (
    <div style={{ background: C.elevated, border: `1px solid ${C.border}`, borderTop: `2px solid ${color}`, padding: '14px 16px' }}>
      <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: C.muted, letterSpacing: '0.15em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: FONTS.display, fontSize: 28, color, letterSpacing: '0.02em', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: C.muted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ADMIN PANEL
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// VIEW: NOTÍCIAS / GUIAS
// ═══════════════════════════════════════════════════════════
function useNewsList() {
  const [news, setNews] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(KEYS.news);
        const data = res?.value ? JSON.parse(res.value) : [];
        setNews(data);
      } catch { setNews([]); }
      setLoaded(true);
    })();
  }, []);

  const save = async (next) => {
    setNews(next);
    try { await window.storage.set(KEYS.news, JSON.stringify(next)); } catch {}
  };

  return { news, setNews: save, loaded };
}

function NewsView({ currentUser, onOpenHunter }) {
  const { news, setNews } = useNewsList();
  const [editing, setEditing] = useState(null); // null | 'new' | newsId
  const isAdmin = !!currentUser?.isAdmin;
  const isMobile = useIsMobile();

  const sorted = useMemo(() => [...news].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)), [news]);

  const startNew = () => setEditing('new');
  const startEdit = (id) => setEditing(id);

  const remove = (id) => {
    if (!confirm('Apagar este post?')) return;
    setNews(news.filter((n) => n.id !== id));
  };

  const submit = (data) => {
    if (editing === 'new') {
      const post = {
        id: `n_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        ...data,
        authorId: currentUser.id,
        authorTag: currentUser.tag,
        createdAt: new Date().toISOString(),
        updatedAt: null,
      };
      setNews([post, ...news]);
    } else {
      setNews(news.map((n) => n.id === editing ? { ...n, ...data, updatedAt: new Date().toISOString() } : n));
    }
    setEditing(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontFamily: FONTS.mono, fontSize: 11, color: C.muted, letterSpacing: '0.2em' }}>// CONTEÚDO OFICIAL</div>
          <h2 style={{ fontFamily: FONTS.display, fontSize: isMobile ? 28 : 40, letterSpacing: '0.05em', color: C.text, margin: '4px 0 0' }}>NOTÍCIAS & GUIAS</h2>
        </div>
        {isAdmin && !editing && <Btn variant="primary" onClick={startNew}>+ NOVO POST</Btn>}
      </div>

      {editing && (
        <NewsEditor
          initial={editing === 'new' ? null : news.find((n) => n.id === editing)}
          onSave={submit}
          onCancel={() => setEditing(null)} />
      )}

      {sorted.length === 0 && !editing ? (
        <Panel><Empty msg="Nenhum post publicado ainda. Volte mais tarde!" /></Panel>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {sorted.map((post) => (
            <NewsCard key={post.id} post={post} isAdmin={isAdmin} onEdit={() => startEdit(post.id)} onDelete={() => remove(post.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function NewsCard({ post, isAdmin, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const tooLong = post.body.length > 360;
  const display = !expanded && tooLong ? post.body.slice(0, 360) + '…' : post.body;
  return (
    <article style={{ background: C.elevated, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.amber}`, padding: 'clamp(14px, 4vw, 20px)' }}>
      {post.imageUrl && (
        <img src={post.imageUrl} alt="" style={{ width: '100%', maxHeight: 280, objectFit: 'cover', marginBottom: 14, display: 'block' }} onError={(e) => { e.target.style.display = 'none'; }} />
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
        <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: C.muted, letterSpacing: '0.15em' }}>
          {post.category?.toUpperCase() || 'NOTÍCIA'} · {fmtRelative(post.createdAt)} · POR {post.authorTag}
          {post.updatedAt && <span style={{ color: C.dim }}> · editado</span>}
        </div>
        {isAdmin && (
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={onEdit} style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer', fontFamily: FONTS.mono, fontSize: 11, letterSpacing: '0.1em' }}>EDITAR</button>
            <button onClick={onDelete} style={{ background: 'transparent', border: 'none', color: C.red, cursor: 'pointer', fontFamily: FONTS.mono, fontSize: 11, letterSpacing: '0.1em' }}>×</button>
          </div>
        )}
      </div>
      <h3 style={{ fontFamily: FONTS.display, fontSize: 'clamp(20px, 4vw, 28px)', color: C.text, letterSpacing: '0.03em', margin: '0 0 10px', lineHeight: 1.2 }}>{post.title}</h3>
      <div style={{ fontFamily: FONTS.body, fontSize: 15, color: C.text, lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{display}</div>
      {tooLong && (
        <button onClick={() => setExpanded(!expanded)}
          style={{ background: 'transparent', border: 'none', color: C.amber, cursor: 'pointer', fontFamily: FONTS.mono, fontSize: 11, marginTop: 10, padding: 0, letterSpacing: '0.1em' }}>
          {expanded ? '← MOSTRAR MENOS' : 'LER MAIS →'}
        </button>
      )}
    </article>
  );
}

function NewsEditor({ initial, onSave, onCancel }) {
  const [title, setTitle] = useState(initial?.title || '');
  const [body, setBody] = useState(initial?.body || '');
  const [category, setCategory] = useState(initial?.category || 'Notícia');
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl || '');

  const save = () => {
    if (!title.trim() || !body.trim()) {
      alert('Título e conteúdo são obrigatórios.'); return;
    }
    onSave({
      title: title.trim().slice(0, 120),
      body: body.trim(),
      category: category || 'Notícia',
      imageUrl: imageUrl.trim() || null,
    });
  };

  return (
    <Panel title={initial ? 'EDITAR POST' : 'NOVO POST'} accent={C.amber}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
          <div><label style={lbl}>CATEGORIA</label>
            <Select value={category} onChange={setCategory}>
              <option value="Notícia">📰 Notícia</option>
              <option value="Guia">📖 Guia</option>
              <option value="Aviso">⚠️ Aviso</option>
              <option value="Resultado">🏆 Resultado</option>
              <option value="Bastidores">🎬 Bastidores</option>
            </Select>
          </div>
          <div><label style={lbl}>URL DA IMAGEM (OPCIONAL)</label>
            <Input value={imageUrl} onChange={setImageUrl} placeholder="https://..." />
          </div>
        </div>
        <div><label style={lbl}>TÍTULO ({title.length}/120)</label>
          <Input value={title} onChange={(v) => setTitle(v.slice(0, 120))} placeholder="ex: Sorteio das oitavas do Campeonato 2026" />
        </div>
        <div><label style={lbl}>CONTEÚDO</label>
          <Textarea value={body} onChange={setBody} placeholder="Escreva o conteúdo do post. Quebras de linha são preservadas." rows={10} />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Btn variant="ghost" onClick={onCancel}>CANCELAR</Btn>
          <Btn variant="amber" onClick={save}>✓ {initial ? 'SALVAR ALTERAÇÕES' : 'PUBLICAR'}</Btn>
        </div>
      </div>
    </Panel>
  );
}

function AdminPanel({ players, matches, ratingsByVersion, playerById, onScheduleMatch, onUpdateMatch, onDeleteMatch, onReopenMatch, onResetDemo, onBanPlayer, onUnbanPlayer, onAdminEditProfile, onDeletePlayer }) {
  const [adminTab, setAdminTab] = useState('duelos');
  const pending = useMemo(() => matches.filter((m) => (m.status === 'scheduled' && new Date(m.scheduledAt) < new Date()) || m.status === 'live')
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt)), [matches]);
  const upcoming = useMemo(() => matches.filter((m) => m.status === 'scheduled' && new Date(m.scheduledAt) > new Date())
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt)), [matches]);
  const completed = useMemo(() => matches.filter((m) => m.status === 'completed')
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt)).slice(0, 10), [matches]);
  const bannedCount = useMemo(() => players.filter((p) => p.isBanned).length, [players]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ background: C.purple + '15', border: `1px solid ${C.purple}`, padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <span style={{ fontFamily: FONTS.mono, fontSize: 12, color: C.purple, letterSpacing: '0.15em' }}>⚡ MODO ADMIN · CONTROLE TOTAL</span>
        <Btn variant="ghost" size="sm" onClick={() => { if (confirm('Resetar todos os dados de demo?')) onResetDemo(); }}>RESET DEMO</Btn>
      </div>

      {/* Sub-tabs do admin */}
      <div style={{ display: 'flex', gap: 8, borderBottom: `1px solid ${C.border}`, paddingBottom: 0 }}>
        <button onClick={() => setAdminTab('duelos')}
          style={{ background: 'transparent', border: 'none', borderBottom: `2px solid ${adminTab === 'duelos' ? C.purple : 'transparent'}`, color: adminTab === 'duelos' ? C.text : C.muted, padding: '10px 18px', fontFamily: FONTS.display, fontSize: 14, letterSpacing: '0.1em', cursor: 'pointer' }}>
          🥊 DUELOS
          {pending.length > 0 && <span style={{ marginLeft: 8, background: C.amber, color: '#0A0A0A', fontFamily: FONTS.mono, fontSize: 10, padding: '2px 6px' }}>{pending.length}</span>}
        </button>
        <button onClick={() => setAdminTab('moderacao')}
          style={{ background: 'transparent', border: 'none', borderBottom: `2px solid ${adminTab === 'moderacao' ? C.red : 'transparent'}`, color: adminTab === 'moderacao' ? C.text : C.muted, padding: '10px 18px', fontFamily: FONTS.display, fontSize: 14, letterSpacing: '0.1em', cursor: 'pointer' }}>
          🛡️ MODERAÇÃO
          {bannedCount > 0 && <span style={{ marginLeft: 8, background: C.red, color: '#fff', fontFamily: FONTS.mono, fontSize: 10, padding: '2px 6px' }}>{bannedCount}</span>}
        </button>
      </div>

      {adminTab === 'duelos' && (
        <>
          <AdminScheduleForm players={players} ratingsByVersion={ratingsByVersion} onSchedule={onScheduleMatch} />

          <Panel title={`DUELOS AGENDADOS · ${pending.length + upcoming.length}`} accent={C.amber}>
            {(pending.length + upcoming.length) === 0 ? <Empty msg="Nenhum duelo agendado. Use o formulário acima." /> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Pendentes (passou da hora ou ao vivo) primeiro */}
                {pending.map((m) => <AdminMatchEditor key={m.id} match={m} playerById={playerById} ratingsByVersion={ratingsByVersion} onUpdate={onUpdateMatch} onDelete={onDeleteMatch} />)}
                {/* Próximos depois */}
                {upcoming.map((m) => <AdminMatchEditor key={m.id} match={m} playerById={playerById} ratingsByVersion={ratingsByVersion} onUpdate={onUpdateMatch} onDelete={onDeleteMatch} />)}
              </div>
            )}
          </Panel>

          <Panel title="CONCLUÍDOS RECENTES (editar VOD)">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {completed.map((m) => <AdminVodEditor key={m.id} match={m} playerById={playerById} onUpdate={onUpdateMatch} onDelete={onDeleteMatch} onReopen={onReopenMatch} />)}
            </div>
          </Panel>
        </>
      )}

      {adminTab === 'moderacao' && (
        <ModerationPanel players={players} matches={matches} ratingsByVersion={ratingsByVersion} onBanPlayer={onBanPlayer} onUnbanPlayer={onUnbanPlayer} onAdminEditProfile={onAdminEditProfile} onDeletePlayer={onDeletePlayer} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MODERATION PANEL — admin only
// ═══════════════════════════════════════════════════════════
function ModerationPanel({ players, matches, ratingsByVersion, onBanPlayer, onUnbanPlayer, onAdminEditProfile, onDeletePlayer }) {
  const [search, setSearch] = useState('');
  const [showBanned, setShowBanned] = useState(false);
  const [editing, setEditing] = useState(null); // playerId
  const [banning, setBanning] = useState(null); // { player, reason }
  const [deleting, setDeleting] = useState(null); // player

  const list = useMemo(() => {
    const q = search.toLowerCase().trim();
    return players
      .filter((p) => p.id !== 'admin')
      .filter((p) => showBanned ? (p.isBanned || p.isDeleted) : !p.isBanned && !p.isDeleted)
      .filter((p) => !q || p.tag.toLowerCase().includes(q) || p.name.toLowerCase().includes(q))
      .map((p) => {
        const r2002 = ratingsByVersion['2002']?.[p.id] || { elo: STARTING_ELO, w: 0, l: 0 };
        const rum = ratingsByVersion['um']?.[p.id] || { elo: STARTING_ELO, w: 0, l: 0 };
        const totalGames = r2002.w + r2002.l + rum.w + rum.l;
        return { ...p, elo2002: r2002.elo, eloUm: rum.elo, totalGames };
      })
      .sort((a, b) => new Date(b.joinedAt) - new Date(a.joinedAt));
  }, [players, ratingsByVersion, search, showBanned]);

  const activeCount = players.filter((p) => p.id !== 'admin' && !p.isBanned && !p.isDeleted).length;
  const inactiveCount = players.filter((p) => p.isBanned || p.isDeleted).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ background: C.red + '08', border: `1px solid ${C.redDim}`, padding: 14, fontFamily: FONTS.body, fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
        <strong style={{ color: C.text }}>🛡️ Painel de Moderação.</strong> Aqui você gerencia os lutadores da Arena. Banir um lutador o remove de todas as listas públicas (ranking, hunters, agenda), mas <strong>preserva o histórico</strong> das lutas dele com outros — eles aparecem com a tag <code style={{ color: C.red, padding: '1px 5px', border: `1px solid ${C.red}`, fontFamily: FONTS.mono, fontSize: 11 }}>BANIDO</code>. Você pode desbanir a qualquer momento.
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={lbl}>BUSCAR LUTADOR</label>
          <Input value={search} onChange={setSearch} placeholder="tag ou nome..." />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setShowBanned(false)}
            style={{ background: !showBanned ? C.green : 'transparent', color: !showBanned ? '#0A0A0A' : C.green, border: `1px solid ${C.green}`, padding: '8px 14px', fontFamily: FONTS.display, fontSize: 13, cursor: 'pointer', letterSpacing: '0.1em' }}>
            ATIVOS · {activeCount}
          </button>
          <button onClick={() => setShowBanned(true)}
            style={{ background: showBanned ? C.red : 'transparent', color: showBanned ? '#fff' : C.red, border: `1px solid ${C.red}`, padding: '8px 14px', fontFamily: FONTS.display, fontSize: 13, cursor: 'pointer', letterSpacing: '0.1em' }}>
            INATIVOS · {inactiveCount}
          </button>
        </div>
      </div>

      {/* Lista */}
      {list.length === 0 ? (
        <Panel><Empty msg={showBanned ? 'Nenhum lutador banido ou deletado.' : (search ? 'Nenhum lutador encontrado com essa busca.' : 'Nenhum lutador cadastrado ainda.')} /></Panel>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: C.border }}>
          {list.map((p) => (
            <ModerationRow key={p.id} player={p} ratingsByVersion={ratingsByVersion}
              onEdit={() => setEditing(p.id)}
              onBan={() => setBanning({ player: p, reason: '' })}
              onUnban={() => { if (confirm(`Desbanir ${p.tag}?`)) onUnbanPlayer(p.id); }}
              onDelete={() => setDeleting(p)} />
          ))}
        </div>
      )}

      {/* Modal: editar perfil */}
      {editing && (
        <AdminEditProfileModal
          player={players.find((p) => p.id === editing)}
          onSave={(patch) => { onAdminEditProfile(editing, patch); setEditing(null); }}
          onClose={() => setEditing(null)} />
      )}

      {/* Modal: banir */}
      {banning && (
        <BanModal player={banning.player}
          onConfirm={(reason) => { onBanPlayer(banning.player.id, reason); setBanning(null); }}
          onClose={() => setBanning(null)} />
      )}

      {/* Modal: deletar permanentemente */}
      {deleting && (
        <DeletePlayerModal player={deleting}
          onConfirm={() => { onDeletePlayer(deleting.id); setDeleting(null); }}
          onClose={() => setDeleting(null)} />
      )}
    </div>
  );
}

function ModerationRow({ player, ratingsByVersion, onEdit, onBan, onUnban, onDelete }) {
  const isMobile = useIsMobile();
  const isDeleted = player.isDeleted;
  if (isMobile) {
    return (
      <div style={{ background: C.elevated, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar player={player} size={36} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: FONTS.display, color: isDeleted ? C.dim : (player.isBanned ? C.dim : C.amber), fontSize: 16, letterSpacing: '0.05em', textDecoration: (player.isBanned || isDeleted) ? 'line-through' : 'none', fontStyle: isDeleted ? 'italic' : 'normal' }}>
              {isDeleted ? '(perfil deletado)' : player.tag}
            </div>
            <div style={{ fontFamily: FONTS.body, color: C.text, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {isDeleted ? '—' : player.name}
            </div>
          </div>
          {isDeleted && <span style={{ fontFamily: FONTS.mono, fontSize: 9, color: C.dim, border: `1px solid ${C.dim}`, padding: '2px 6px', letterSpacing: '0.15em' }}>DELETADO</span>}
        </div>
        <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: C.muted, lineHeight: 1.5 }}>
          desde {fmtDate(player.joinedAt)} · {player.totalGames} duelos<br/>
          <span style={{ color: C.red }}>{player.elo2002}</span> · 2002  ·  <span style={{ color: C.cyan }}>{player.eloUm}</span> · UM
          {!isDeleted && player.isBanned && player.banReason && <><br/><span style={{ color: C.red }}>razão: "{player.banReason}"</span></>}
          {!isDeleted && player.isBanned && player.bannedAt && <><br/><span style={{ color: C.dim }}>banido em {fmtDate(player.bannedAt)}</span></>}
          {isDeleted && player.deletedAt && <><br/><span style={{ color: C.dim }}>deletado em {fmtDate(player.deletedAt)}</span></>}
        </div>
        {!isDeleted && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Btn variant="ghost" size="sm" onClick={onEdit} style={{ flex: 1 }}>EDITAR</Btn>
            {player.isBanned ? (
              <Btn variant="confirm" size="sm" onClick={onUnban} style={{ flex: 1 }}>✓ DESBANIR</Btn>
            ) : (
              <Btn variant="danger" size="sm" onClick={onBan} style={{ flex: 1 }}>🚫 BANIR</Btn>
            )}
            <Btn variant="danger" size="sm" onClick={onDelete} style={{ flex: '1 1 100%' }}>🗑️ EXCLUIR PERMANENTE</Btn>
          </div>
        )}
      </div>
    );
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '36px 80px 1fr 100px 100px auto', gap: 14, alignItems: 'center', padding: '12px 14px', background: C.elevated }}>
      <Avatar player={player} size={36} />
      <span style={{ fontFamily: FONTS.display, color: isDeleted ? C.dim : (player.isBanned ? C.dim : C.amber), fontSize: 16, letterSpacing: '0.05em', textDecoration: (player.isBanned || isDeleted) ? 'line-through' : 'none', fontStyle: isDeleted ? 'italic' : 'normal' }}>
        {isDeleted ? 'DELETED' : player.tag}
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: FONTS.body, color: C.text, fontSize: 14, fontStyle: isDeleted ? 'italic' : 'normal' }}>
          {isDeleted ? '(perfil deletado)' : player.name}
        </div>
        <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: C.muted, marginTop: 2 }}>
          desde {fmtDate(player.joinedAt)} · {player.totalGames} duelos
          {!isDeleted && player.isBanned && player.banReason && <span style={{ color: C.red, marginLeft: 8 }}>· "{player.banReason}"</span>}
          {!isDeleted && player.isBanned && player.bannedAt && <span style={{ color: C.dim, marginLeft: 8 }}>· banido em {fmtDate(player.bannedAt)}</span>}
          {isDeleted && player.deletedAt && <span style={{ color: C.dim, marginLeft: 8 }}>· deletado em {fmtDate(player.deletedAt)}</span>}
        </div>
      </div>
      <div style={{ fontFamily: FONTS.mono, fontSize: 11, color: C.muted, textAlign: 'right' }}>
        <span style={{ color: C.red }}>{player.elo2002}</span> · 2002
      </div>
      <div style={{ fontFamily: FONTS.mono, fontSize: 11, color: C.muted, textAlign: 'right' }}>
        <span style={{ color: C.cyan }}>{player.eloUm}</span> · UM
      </div>
      {isDeleted ? (
        <span style={{ fontFamily: FONTS.mono, fontSize: 10, color: C.dim, letterSpacing: '0.15em' }}>DELETADO</span>
      ) : (
        <div style={{ display: 'flex', gap: 6 }}>
          <Btn variant="ghost" size="sm" onClick={onEdit}>EDITAR</Btn>
          {player.isBanned ? (
            <Btn variant="confirm" size="sm" onClick={onUnban}>✓ DESBANIR</Btn>
          ) : (
            <Btn variant="danger" size="sm" onClick={onBan}>🚫 BANIR</Btn>
          )}
          <Btn variant="danger" size="sm" onClick={onDelete}>🗑️</Btn>
        </div>
      )}
    </div>
  );
}

function BanModal({ player, onConfirm, onClose }) {
  const [reason, setReason] = useState('');
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 10500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.elevated, border: `1px solid ${C.red}`, borderTop: `3px solid ${C.red}`, maxWidth: 480, width: '100%' }}>
        <div style={{ padding: 'clamp(14px, 4vw, 20px) clamp(16px, 4vw, 24px)', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontFamily: FONTS.mono, fontSize: 11, color: C.red, letterSpacing: '0.2em', marginBottom: 4 }}>🚫 BANIR LUTADOR</div>
            <h3 style={{ fontFamily: FONTS.display, fontSize: 24, letterSpacing: '0.05em', margin: 0, color: C.text }}>{player.tag}</h3>
            <div style={{ fontFamily: FONTS.body, fontSize: 13, color: C.muted, marginTop: 2 }}>{player.name}</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: C.muted, fontSize: 24, cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: 'clamp(16px, 4vw, 24px)' }}>
          <div style={{ fontFamily: FONTS.body, fontSize: 13, color: C.muted, marginBottom: 16, lineHeight: 1.6 }}>
            Este lutador vai sumir de todas as listas públicas, mas o <strong style={{ color: C.text }}>histórico de lutas dele será preservado</strong>. Você pode desbanir a qualquer momento.
          </div>
          <label style={lbl}>RAZÃO DO BAN (OPCIONAL · SÓ ADMIN VÊ)</label>
          <Textarea value={reason} onChange={setReason} placeholder="ex: spam de palavrões na bio, trollagem em rankeada..." rows={3} />
          <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
            <Btn variant="ghost" onClick={onClose}>CANCELAR</Btn>
            <Btn variant="primary" onClick={() => onConfirm(reason.trim())}>🚫 CONFIRMAR BAN</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

function DeletePlayerModal({ player, onConfirm, onClose }) {
  const [confirmText, setConfirmText] = useState('');
  const expected = player.tag;
  const ok = confirmText === expected;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 10500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.elevated, border: `2px solid ${C.red}`, borderTop: `4px solid ${C.red}`, maxWidth: 480, width: '100%' }}>
        <div style={{ padding: 'clamp(14px, 4vw, 20px) clamp(16px, 4vw, 24px)', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontFamily: FONTS.mono, fontSize: 11, color: C.red, letterSpacing: '0.2em', marginBottom: 4 }}>🗑️ EXCLUSÃO PERMANENTE</div>
            <h3 style={{ fontFamily: FONTS.display, fontSize: 22, letterSpacing: '0.05em', margin: 0, color: C.text }}>{player.tag}</h3>
            <div style={{ fontFamily: FONTS.body, fontSize: 13, color: C.muted, marginTop: 2 }}>{player.name}</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: C.muted, fontSize: 24, cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: 'clamp(16px, 4vw, 24px)' }}>
          <div style={{ background: C.red + '15', border: `1px solid ${C.red}`, padding: 14, marginBottom: 16, fontFamily: FONTS.body, fontSize: 13, color: C.text, lineHeight: 1.6 }}>
            <strong style={{ color: C.red }}>⚠️ ATENÇÃO — AÇÃO IRREVERSÍVEL.</strong><br/>
            Você está prestes a <strong>excluir permanentemente</strong> o lutador <strong>{player.tag}</strong>. Isso vai:
            <ul style={{ margin: '8px 0 0 20px', padding: 0, color: C.muted }}>
              <li>Remover o nome, foto, bio e contato</li>
              <li>Bloquear ele de fazer login de novo</li>
              <li>Manter as lutas antigas, mas com <em>"(perfil deletado)"</em> no lugar do nome</li>
            </ul>
          </div>
          <div style={{ background: C.amberDim, border: `1px solid ${C.amber}`, padding: 12, marginBottom: 16, fontFamily: FONTS.body, fontSize: 12, color: C.text, lineHeight: 1.6 }}>
            💡 <strong>Pra moderação normal, prefira BANIR</strong> — fica reversível. Use exclusão só pra spam, bots ou contas criadas por engano.
          </div>
          <label style={lbl}>PARA CONFIRMAR, DIGITE A TAG <strong style={{ color: C.text }}>{expected}</strong></label>
          <Input value={confirmText} onChange={setConfirmText} placeholder={expected} />
          <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
            <Btn variant="ghost" onClick={onClose}>CANCELAR</Btn>
            <Btn variant="primary" onClick={() => { if (ok) onConfirm(); }} disabled={!ok}>
              🗑️ EXCLUIR PERMANENTEMENTE
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminEditProfileModal({ player, onSave, onClose }) {
  const [draft, setDraft] = useState({
    tag: player.tag,
    name: player.name,
    bio: player.bio || '',
    avatarUrl: player.avatarUrl || '',
  });
  const save = () => {
    const tag = draft.tag.toUpperCase().slice(0, 10);
    if (tag.length < 2) { alert('Tag precisa ter no mínimo 2 letras.'); return; }
    onSave({ tag, name: draft.name.trim(), bio: draft.bio.trim() || null, avatarUrl: draft.avatarUrl.trim() || null });
  };
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 10500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.elevated, border: `1px solid ${C.cyan}`, borderTop: `3px solid ${C.cyan}`, maxWidth: 520, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ padding: 'clamp(14px, 4vw, 20px) clamp(16px, 4vw, 24px)', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontFamily: FONTS.mono, fontSize: 11, color: C.cyan, letterSpacing: '0.2em', marginBottom: 4 }}>✏️ EDITAR PERFIL</div>
            <h3 style={{ fontFamily: FONTS.display, fontSize: 24, letterSpacing: '0.05em', margin: 0, color: C.text }}>{player.tag}</h3>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: C.muted, fontSize: 24, cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: 'clamp(16px, 4vw, 24px)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontFamily: FONTS.body, fontSize: 12, color: C.muted, marginBottom: 4, lineHeight: 1.5 }}>
            Use isso pra corrigir conteúdo inadequado (palavrões, ofensas, etc) sem precisar banir o lutador.
          </div>
          <div><label style={lbl}>TAG (2-10 LETRAS)</label>
            <Input value={draft.tag} onChange={(v) => setDraft((d) => ({ ...d, tag: v.toUpperCase() }))} />
          </div>
          <div><label style={lbl}>NOME</label>
            <Input value={draft.name} onChange={(v) => setDraft((d) => ({ ...d, name: v }))} />
          </div>
          <div><label style={lbl}>BIO</label>
            <Textarea value={draft.bio} onChange={(v) => setDraft((d) => ({ ...d, bio: v }))} rows={3} />
          </div>
          <div><label style={lbl}>URL DA FOTO</label>
            <Input value={draft.avatarUrl} onChange={(v) => setDraft((d) => ({ ...d, avatarUrl: v }))} placeholder="https://..." />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
            <Btn variant="ghost" onClick={onClose}>CANCELAR</Btn>
            <Btn variant="cyan" onClick={save}>✓ SALVAR</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminScheduleForm({ players, ratingsByVersion, onSchedule }) {
  const [version, setVersion] = useState('2002');
  const [format, setFormat] = useState('FT3');
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [datetime, setDatetime] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(20, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [notes, setNotes] = useState('');
  const eligible = players.filter(isCompetitor);
  const prediction = useMemo(() => {
    if (!p1 || !p2 || p1 === p2) return null;
    return predictDelta(ratingsByVersion[version]?.[p1]?.elo ?? STARTING_ELO, ratingsByVersion[version]?.[p2]?.elo ?? STARTING_ELO);
  }, [p1, p2, version, ratingsByVersion]);

  const submit = (e) => {
    e.preventDefault();
    if (!p1 || !p2 || !datetime || p1 === p2) return;
    onSchedule({
      id: uid(), player1Id: p1, player2Id: p2, version, format,
      scheduledAt: new Date(datetime).toISOString(),
      status: 'scheduled', streamUrl: null, isBroadcasted: false,
      notes: notes.trim() || null, createdBy: 'admin', createdAt: new Date().toISOString(),
    });
    setP1(''); setP2(''); setNotes('');
  };

  return (
    <Panel title="AGENDAR NOVO DUELO" accent={C.purple}>
      <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={lbl}>VERSÃO DO JOGO</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {VERSION_IDS.map((v) => (
              <button key={v} type="button" onClick={() => setVersion(v)}
                style={{
                  background: version === v ? VERSIONS[v].color : 'transparent',
                  color: version === v ? '#0A0A0A' : VERSIONS[v].color,
                  border: `1px solid ${VERSIONS[v].color}`,
                  padding: '12px 8px',
                  fontFamily: FONTS.display,
                  fontSize: 14,
                  cursor: 'pointer',
                  letterSpacing: '0.05em',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 2,
                  transition: 'all 0.15s',
                }}>
                <span style={{ fontSize: 18, letterSpacing: '0.08em' }}>{VERSIONS[v].label}</span>
                <span style={{ fontFamily: FONTS.mono, fontSize: 9, opacity: 0.85, letterSpacing: '0.1em' }}>{VERSIONS[v].subtitle.toUpperCase()}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <label style={lbl}>FORMATO</label>
          <Select value={format} onChange={setFormat}>
            <option value="FT3">FT3 (Best of 5)</option>
            <option value="FT5">FT5 (Best of 9)</option>
            <option value="FT10">FT10 (Best of 19)</option>
          </Select>
        </div>
        <div>
          <label style={lbl}>LUTADOR 1</label>
          <Select value={p1} onChange={setP1}>
            <option value="">— escolher —</option>
            {eligible.map((p) => <option key={p.id} value={p.id}>{p.tag} · {p.name} ({ratingsByVersion[version]?.[p.id]?.elo ?? STARTING_ELO})</option>)}
          </Select>
        </div>
        <div>
          <label style={lbl}>LUTADOR 2</label>
          <Select value={p2} onChange={setP2}>
            <option value="">— escolher —</option>
            {eligible.filter((p) => p.id !== p1).map((p) => <option key={p.id} value={p.id}>{p.tag} · {p.name} ({ratingsByVersion[version]?.[p.id]?.elo ?? STARTING_ELO})</option>)}
          </Select>
        </div>
        <div>
          <label style={lbl}>DATA E HORÁRIO</label>
          <Input type="datetime-local" value={datetime} onChange={setDatetime} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={lbl}>NOTA (OPCIONAL)</label>
          <Textarea value={notes} onChange={setNotes} placeholder="ex: especial de aniversário, revanche da final..." />
        </div>
        {prediction && (
          <div style={{ gridColumn: '1 / -1', background: C.bg, border: `1px solid ${C.border}`, padding: 12 }}>
            <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: C.muted, letterSpacing: '0.15em', marginBottom: 6 }}>PREVISÃO DE ELO ({VERSIONS[version].label}) · K máx={K_FACTOR}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: FONTS.mono, fontSize: 13, gap: 16, flexWrap: 'wrap' }}>
              <span style={{ color: C.text }}>Se vencer {p1 ? players.find(x => x.id === p1)?.tag : '?'}: <span style={{ color: C.green }}>+{prediction.aWins}</span></span>
              <span style={{ color: C.text }}>Se vencer {p2 ? players.find(x => x.id === p2)?.tag : '?'}: <span style={{ color: C.green }}>+{-prediction.aLoses}</span></span>
            </div>
            <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: C.muted, marginTop: 6 }}>
              Valores acima são pra placar "perfeito" (sem perder round). Placar apertado reduz ELO.
            </div>
          </div>
        )}
        <div style={{ gridColumn: '1 / -1' }}>
          <Btn variant="purple" type="submit" disabled={!p1 || !p2 || !datetime || p1 === p2}>+ AGENDAR DUELO</Btn>
        </div>
      </form>
    </Panel>
  );
}

function AdminMatchEditor({ match, playerById, ratingsByVersion, onUpdate, onDelete }) {
  const [winnerId, setWinnerId] = useState(match.winnerId || '');
  const [format, setFormat] = useState(match.format && match.format !== 'casual' ? match.format : 'FT3');
  const [r1, setR1] = useState(match.roundsWonP1 != null ? String(match.roundsWonP1) : '');
  const [r2, setR2] = useState(match.roundsWonP2 != null ? String(match.roundsWonP2) : '');
  const [vodUrl, setVodUrl] = useState(match.vodUrl || '');
  const [vodTitle, setVodTitle] = useState(match.vodTitle || '');
  const [streamUrl, setStreamUrl] = useState(match.streamUrl || '');
  const [fetchingMeta, setFetchingMeta] = useState(false);

  // Auto-detectar vencedor pelo placar quando ambos rounds preenchidos
  useEffect(() => {
    const n1 = parseInt(r1, 10), n2 = parseInt(r2, 10);
    if (!isNaN(n1) && !isNaN(n2) && n1 !== n2) {
      const inferredWinner = n1 > n2 ? match.player1Id : match.player2Id;
      if (winnerId !== inferredWinner) setWinnerId(inferredWinner);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r1, r2]);

  const fetchMeta = async () => {
    if (!vodUrl.trim()) return;
    setFetchingMeta(true);
    const meta = await fetchVodMeta(vodUrl);
    if (meta?.title) setVodTitle(meta.title);
    setFetchingMeta(false);
  };
  const setLive = () => {
    if (!streamUrl.trim()) { alert('Cole o link da live primeiro.'); return; }
    onUpdate(match.id, { status: 'live', streamUrl: streamUrl.trim() });
  };

  const maxRounds = format === 'FT3' ? 3 : format === 'FT5' ? 5 : format === 'FT10' ? 10 : 3;
  const n1 = parseInt(r1, 10), n2 = parseInt(r2, 10);
  const hasRounds = !isNaN(n1) && !isNaN(n2);
  const winnerRounds = hasRounds ? Math.max(n1, n2) : null;
  const loserRounds = hasRounds ? Math.min(n1, n2) : null;

  // Validação do placar
  let scoreError = null;
  if (hasRounds) {
    if (n1 === n2) scoreError = 'Empate não é permitido.';
    else if (winnerRounds !== maxRounds) scoreError = `O vencedor precisa chegar a ${maxRounds} vitórias (formato ${format}).`;
    else if (loserRounds >= maxRounds) scoreError = `Placar inválido pro formato ${format}.`;
  }

  // Calcular K efetivo que será aplicado (preview)
  let kPreview = null;
  if (hasRounds && !scoreError) {
    const dominance = (winnerRounds - loserRounds) / winnerRounds;
    kPreview = Math.round(24 * (0.5 + 0.5 * dominance));
  }

  const scoreText = hasRounds ? `${n1}-${n2}` : '';

  const save = () => {
    if (!winnerId) { alert('Selecione o vencedor.'); return; }
    if (scoreError) { alert(scoreError); return; }
    if (!hasRounds) { alert('Preencha o placar de rounds.'); return; }

    onUpdate(match.id, {
      status: 'completed',
      winnerId,
      score: scoreText || null,
      format,
      roundsWonP1: hasRounds ? n1 : null,
      roundsWonP2: hasRounds ? n2 : null,
      vodUrl: vodUrl.trim() || null,
      vodTitle: vodTitle.trim() || null,
      streamUrl: null,
      isBroadcasted: !!vodUrl.trim(),
      completedAt: new Date().toISOString(),
    });
  };

  const p1 = playerById[match.player1Id];
  const p2 = playerById[match.player2Id];

  return (
    <div style={{ background: C.bg, border: `1px solid ${C.border}`, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontFamily: FONTS.mono, fontSize: 11, color: C.muted, letterSpacing: '0.15em', display: 'flex', alignItems: 'center', gap: 8 }}>
          {match.status === 'live' ? <span style={{ color: C.red }}>● AO VIVO</span> : '⌛ AGENDADO'} · {fmtDateTime(match.scheduledAt)}
          <VersionBadge version={match.version} />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {match.status !== 'live' && <Btn variant="purple" size="sm" onClick={setLive} disabled={!streamUrl.trim()}>● COLOCAR LIVE</Btn>}
          <Btn variant="amber" size="sm" onClick={save}>✓ LANÇAR RESULTADO</Btn>
          <button onClick={() => { if (confirm('Apagar este duelo?')) onDelete(match.id); }} style={{ background: 'transparent', border: `1px solid ${C.redDim}`, color: C.red, cursor: 'pointer', padding: '6px 10px', fontFamily: FONTS.display, fontSize: 13 }}>×</button>
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={lbl}>LINK DA LIVE (YOUTUBE / TWITCH)</label>
        <Input value={streamUrl} onChange={setStreamUrl} placeholder="https://www.youtube.com/watch?v=... ou https://www.twitch.tv/seu_canal" />
      </div>

      {/* Formato + Placar */}
      <div style={{ background: C.elevated, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.amber}`, padding: 12, marginBottom: 12 }}>
        <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: C.amber, letterSpacing: '0.15em', marginBottom: 8 }}>FORMATO & PLACAR</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
          <div>
            <label style={lbl}>FORMATO</label>
            <Select value={format} onChange={setFormat}>
              <option value="FT3">FT3 (Best of 5)</option>
              <option value="FT5">FT5 (Best of 9)</option>
              <option value="FT10">FT10 (Best of 19)</option>
            </Select>
          </div>
          <div>
            <label style={lbl}>{p1?.tag || 'P1'}</label>
            <Input value={r1} onChange={(v) => setR1(v.replace(/[^0-9]/g, '').slice(0, 2))} placeholder="0" />
          </div>
          <div>
            <label style={lbl}>{p2?.tag || 'P2'}</label>
            <Input value={r2} onChange={(v) => setR2(v.replace(/[^0-9]/g, '').slice(0, 2))} placeholder="0" />
          </div>
          {kPreview && (
            <div style={{ background: C.bg, border: `1px solid ${C.green}`, padding: '6px 10px', minWidth: 80 }}>
              <div style={{ fontFamily: FONTS.mono, fontSize: 9, color: C.muted, letterSpacing: '0.15em' }}>ELO ±</div>
              <div style={{ fontFamily: FONTS.display, fontSize: 18, color: C.green }}>{kPreview}</div>
            </div>
          )}
        </div>
        {scoreError && (
          <div style={{ marginTop: 8, fontFamily: FONTS.mono, fontSize: 11, color: C.red }}>⚠ {scoreError}</div>
        )}
        {!scoreError && hasRounds && (
          <div style={{ marginTop: 8, fontFamily: FONTS.mono, fontSize: 10, color: C.muted }}>
            Placar: <strong style={{ color: C.text }}>{scoreText}</strong> ({format}) · K efetivo: <strong style={{ color: C.green }}>{kPreview}</strong>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        {[match.player1Id, match.player2Id].map((id) => {
          const p = playerById[id]; if (!p) return null;
          const isW = winnerId === id;
          const rank = getRank(ratingsByVersion[match.version]?.[id]?.elo ?? STARTING_ELO);
          return (
            <button key={id} type="button" onClick={() => setWinnerId(id)}
              style={{ padding: 14, background: isW ? C.amberDim : 'transparent', border: `1px solid ${isW ? C.amber : C.border}`, color: isW ? C.amber : C.text, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar player={p} size={32} />
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontFamily: FONTS.display, fontSize: 18, color: isW ? C.amber : rank.color, letterSpacing: '0.05em' }}>{p.tag} {isW && '★'}</div>
                <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: C.muted }}>{p.name}</div>
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
        <Input value={vodTitle} onChange={setVodTitle} placeholder="Título do VOD" />
        <Btn variant="ghost" size="sm" onClick={fetchMeta} disabled={!vodUrl.trim() || fetchingMeta}>{fetchingMeta ? '…' : '⤓ AUTO'}</Btn>
      </div>
      <div style={{ marginTop: 8 }}>
        <Input value={vodUrl} onChange={setVodUrl} placeholder="Link do VOD após a luta · YouTube" />
      </div>
    </div>
  );
}

function AdminUpcomingEditor({ match, playerById, ratingsByVersion, onUpdate, onDelete }) {
  const [streamUrl, setStreamUrl] = useState(match.streamUrl || '');
  const [showStream, setShowStream] = useState(false);
  return (
    <div style={{ background: C.bg, border: `1px solid ${C.border}`, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}><ScheduledRow match={match} playerById={playerById} ratingsByVersion={ratingsByVersion} /></div>
        <Btn variant="ghost" size="sm" onClick={() => setShowStream((s) => !s)}>{streamUrl ? 'EDITAR LIVE' : '+ STREAM'}</Btn>
        <Btn variant="purple" size="sm" onClick={() => {
          if (!streamUrl.trim()) { alert('Defina o link da live antes.'); return; }
          onUpdate(match.id, { status: 'live', streamUrl: streamUrl.trim() });
        }} disabled={!streamUrl.trim()}>● COLOCAR LIVE</Btn>
        <button onClick={() => { if (confirm('Cancelar?')) onDelete(match.id); }} style={{ background: 'transparent', border: 'none', color: C.dim, cursor: 'pointer', fontSize: 18, padding: 4 }}>×</button>
      </div>
      {(showStream || streamUrl) && (
        <div style={{ marginTop: 10 }}>
          <label style={lbl}>LINK DA LIVE</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <Input value={streamUrl} onChange={setStreamUrl} placeholder="https://..." />
            <Btn size="sm" onClick={() => onUpdate(match.id, { streamUrl: streamUrl.trim() || null })}>SALVAR</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminVodEditor({ match, playerById, onUpdate, onDelete, onReopen }) {
  const [vodUrl, setVodUrl] = useState(match.vodUrl || '');
  const [vodTitle, setVodTitle] = useState(match.vodTitle || '');
  const [editing, setEditing] = useState(false);
  const [fetching, setFetching] = useState(false);
  const p1 = playerById[match.player1Id], p2 = playerById[match.player2Id];
  const winner = match.winnerId === p1?.id ? p1 : match.winnerId === p2?.id ? p2 : null;

  const fetchMeta = async () => {
    if (!vodUrl.trim()) return;
    setFetching(true);
    const meta = await fetchVodMeta(vodUrl);
    if (meta?.title) setVodTitle(meta.title);
    setFetching(false);
  };

  const reopen = () => {
    if (!confirm(`Reabrir esta luta? O resultado será apagado e o ELO recalculado. Você poderá lançar novo resultado.`)) return;
    onReopen(match.id);
  };

  const remove = () => {
    if (!confirm(`APAGAR PERMANENTEMENTE esta luta?\n\n${p1?.tag} vs ${p2?.tag} (${match.score || '—'})\n\nEsta ação não pode ser desfeita e o ELO será recalculado.`)) return;
    onDelete(match.id);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, background: C.bg, border: `1px solid ${C.border}`, flexWrap: 'wrap' }}>
      <span style={{ fontFamily: FONTS.mono, fontSize: 11, color: C.muted, minWidth: 60 }}>{fmtDate(match.completedAt)}</span>
      <VersionBadge version={match.version} size="sm" />
      <span style={{ fontFamily: FONTS.display, fontSize: 14, color: C.text, flex: 1, minWidth: 200 }}>
        {p1?.tag} vs {p2?.tag} · <span style={{ color: C.amber }}>{match.score || '—'}</span>
        {match.format && <span style={{ fontFamily: FONTS.mono, fontSize: 10, color: C.muted, marginLeft: 6 }}>({match.format})</span>}
        {winner && <span style={{ fontFamily: FONTS.mono, fontSize: 10, color: C.green, marginLeft: 6 }}>★ {winner.tag}</span>}
      </span>
      {editing ? (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', flex: '1 1 100%' }}>
          <Input value={vodUrl} onChange={setVodUrl} placeholder="YouTube URL" />
          <Btn variant="ghost" size="sm" onClick={fetchMeta} disabled={!vodUrl.trim() || fetching}>{fetching ? '…' : '⤓ AUTO'}</Btn>
          <Input value={vodTitle} onChange={setVodTitle} placeholder="Título" />
          <Btn size="sm" onClick={() => { onUpdate(match.id, { vodUrl: vodUrl.trim() || null, vodTitle: vodTitle.trim() || null, isBroadcasted: !!vodUrl.trim() }); setEditing(false); }}>SALVAR</Btn>
        </div>
      ) : (
        <>
          {match.vodUrl ? <span style={{ fontFamily: FONTS.mono, fontSize: 11, color: C.green }}>✓ COM VOD</span> : <span style={{ fontFamily: FONTS.mono, fontSize: 11, color: C.muted }}>SEM VOD</span>}
          <Btn variant="ghost" size="sm" onClick={() => setEditing(true)}>{match.vodUrl ? 'EDITAR VOD' : '+ VOD'}</Btn>
          <Btn variant="amber" size="sm" onClick={reopen}>↻ REABRIR</Btn>
          <button onClick={remove} style={{ background: 'transparent', border: `1px solid ${C.red}`, color: C.red, cursor: 'pointer', padding: '4px 10px', fontFamily: FONTS.mono, fontSize: 11, letterSpacing: '0.1em' }}>× APAGAR</button>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// VIEW: RANKING (com abas por versão)
// ═══════════════════════════════════════════════════════════
function RankingView({ players, matches, mode, onOpenHunter }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [activeVersion, setActiveVersion] = useState('2002');
  const isAnnual = mode === 'anual';
  const years = useMemo(() => {
    const ys = new Set([now.getFullYear()]);
    matches.forEach((m) => ys.add(new Date(m.scheduledAt).getFullYear()));
    return Array.from(ys).sort((a, b) => b - a);
  }, [matches]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Panel>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: '0 0 140px' }}>
            <label style={lbl}>{isAnnual ? 'ANO' : 'PERÍODO'}</label>
            <Select value={year} onChange={(v) => setYear(Number(v))}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</Select>
          </div>
          {!isAnnual && (
            <div style={{ flex: '0 0 140px' }}>
              <label style={lbl}>MÊS</label>
              <Select value={month} onChange={(v) => setMonth(Number(v))}>{MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}</Select>
            </div>
          )}
          <div style={{ flex: 1, minWidth: 200, paddingBottom: 4 }}>
            <span style={{ fontFamily: FONTS.mono, fontSize: 11, color: C.muted, letterSpacing: '0.1em' }}>
              {isAnnual ? `RANKING ANUAL ${year} — TOP 8 DE CADA VERSÃO QUALIFICAM PRO CAMPEONATO` : `RANKING MENSAL · ${MESES[month]} ${year} — VARIAÇÃO DE ELO NO MÊS`}
            </span>
          </div>
        </div>
      </Panel>

      {/* Tabs de versão */}
      <div style={{ display: 'flex', gap: 0, background: C.elevated, border: `1px solid ${C.border}`, padding: 0, overflowX: 'auto' }}>
        {VERSION_IDS.map((v) => {
          const ver = VERSIONS[v];
          const isActive = activeVersion === v;
          return (
            <button key={v} onClick={() => setActiveVersion(v)}
              style={{
                flex: 1, minWidth: 100, background: isActive ? ver.color : 'transparent',
                color: isActive ? '#0A0A0A' : ver.color,
                border: 'none', borderRight: `1px solid ${C.border}`,
                padding: '14px 16px', fontFamily: FONTS.display, fontSize: 16,
                letterSpacing: '0.08em', cursor: 'pointer', whiteSpace: 'nowrap',
                transition: 'all 0.15s',
              }}>
              {ver.label}
              <span style={{ fontFamily: FONTS.mono, fontSize: 9, opacity: 0.8, marginLeft: 6, letterSpacing: '0.1em' }}>
                {ver.subtitle.toUpperCase()}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tabela da versão ativa */}
      <RankingTable version={activeVersion} players={players} matches={matches} year={year} month={month} isAnnual={isAnnual} onOpenHunter={onOpenHunter} />
    </div>
  );
}

function RankingTable({ version, players, matches, year, month, isAnnual, onOpenHunter }) {
  const v = VERSIONS[version];
  const data = useMemo(() => {
    const start = isAnnual ? startOfYear(year) : startOfMonth(year, month);
    const end = isAnnual ? endOfYear(year) : endOfMonth(year, month);
    const before = computeRatingsByVersion(players, matches, new Date(start.getTime() - 1));
    const after = computeRatingsByVersion(players, matches, end);
    return players.filter(isCompetitor).map((p) => {
      const beforeElo = before[version]?.[p.id]?.elo ?? STARTING_ELO;
      const afterElo = after[version]?.[p.id]?.elo ?? STARTING_ELO;
      const stats = periodStats(p.id, matches, version, start, end);
      return { ...p, beforeElo, currentElo: afterElo, delta: afterElo - beforeElo, stats };
    });
  }, [players, matches, year, month, isAnnual, version]);

  const ranked = useMemo(() => data.filter((p) => p.stats.total > 0 || (isAnnual && p.currentElo !== STARTING_ELO))
    .sort((a, b) => isAnnual ? b.currentElo - a.currentElo : b.delta - a.delta), [data, isAnnual]);

  return (
    <Panel title={`${v.fullLabel.toUpperCase()}`} accent={v.color}>
      {ranked.length === 0 ? <Empty msg={`Nenhum duelo em ${v.label} neste período.`} /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: C.border }}>
          {ranked.map((p, i) => {
            const qualified = isAnnual && i < 8;
            const r = getRank(p.currentElo);
            const podium = [C.amber, '#D9D9D9', '#CD7F32'][i];
            return (
              <div key={p.id} onClick={() => onOpenHunter(p.id)}
                style={{ display: 'grid', gridTemplateColumns: 'minmax(28px, auto) 28px 32px 1fr auto auto', gap: 8, alignItems: 'center', padding: '10px 12px', background: qualified ? `${C.amber}08` : C.elevated, borderLeft: qualified ? `2px solid ${C.amber}` : '2px solid transparent', cursor: 'pointer' }}>
                <span style={{ fontFamily: FONTS.display, fontSize: 16, color: i < 3 ? podium : C.text, letterSpacing: '0.05em' }}>{String(i + 1).padStart(2, '0')}</span>
                <div style={{ width: 26, height: 26, border: `2px solid ${r.color}`, color: r.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONTS.display, fontSize: 12 }}>{r.id}</div>
                <Avatar player={p} size={28} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: FONTS.display, fontSize: 14, color: r.color, letterSpacing: '0.05em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.tag}</div>
                  <div style={{ fontFamily: FONTS.mono, fontSize: 9, color: C.muted }}>
                    <span style={{ color: C.green }}>{p.stats.w}V</span>·<span style={{ color: C.red }}>{p.stats.l}D</span>
                    {qualified && <span style={{ color: C.amber, marginLeft: 4 }}>★</span>}
                  </div>
                </div>
                {!isAnnual && (
                  <span style={{ fontFamily: FONTS.mono, fontSize: 10, textAlign: 'right', color: p.delta > 0 ? C.green : p.delta < 0 ? C.red : C.muted }}>
                    {`${p.delta > 0 ? '+' : ''}${p.delta}`}
                  </span>
                )}
                <span style={{ fontFamily: FONTS.display, fontSize: 14, textAlign: 'right', color: r.color, letterSpacing: '0.02em' }}>{p.currentElo}</span>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

// ═══════════════════════════════════════════════════════════
// CAMPEONATO (por versão)
// ═══════════════════════════════════════════════════════════
function ChampionshipView({ players, matches, ratingsByVersion, isAdmin, onOpenHunter }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [version, setVersion] = useState('2002');
  const [bracket, setBracket] = useState(null);
  const years = useMemo(() => {
    const ys = new Set([now.getFullYear()]);
    matches.forEach((m) => ys.add(new Date(m.scheduledAt).getFullYear()));
    return Array.from(ys).sort((a, b) => b - a);
  }, [matches]);

  const top8 = useMemo(() => {
    return players.filter(isCompetitor).map((p) => ({
      ...p,
      elo: ratingsByVersion[version]?.[p.id]?.elo ?? STARTING_ELO,
      ys: periodStats(p.id, matches, version, startOfYear(year), endOfYear(year))
    })).filter((p) => p.ys.total > 0).sort((a, b) => b.elo - a.elo).slice(0, 8);
  }, [players, matches, year, version, ratingsByVersion]);

  useEffect(() => { loadJSON(KEYS.bracket(year, version), null).then(setBracket); }, [year, version]);

  const generateBracket = async () => {
    if (top8.length < 8) return;
    const s = top8;
    const nb = {
      year, version, created: new Date().toISOString(),
      seeds: s.map((p) => ({ id: p.id, tag: p.tag, name: p.name, elo: p.elo })),
      qf: [
        { id: 'qf1', a: s[0].id, b: s[7].id, winner: null },
        { id: 'qf2', a: s[3].id, b: s[4].id, winner: null },
        { id: 'qf3', a: s[1].id, b: s[6].id, winner: null },
        { id: 'qf4', a: s[2].id, b: s[5].id, winner: null },
      ],
      sf: [{ id: 'sf1', a: null, b: null, winner: null, fromA: 'qf1', fromB: 'qf2' }, { id: 'sf2', a: null, b: null, winner: null, fromA: 'qf3', fromB: 'qf4' }],
      final: { id: 'final', a: null, b: null, winner: null, fromA: 'sf1', fromB: 'sf2' },
    };
    setBracket(nb); await saveJSON(KEYS.bracket(year, version), nb);
  };
  const advance = async (round, mid, wid) => {
    if (!bracket) return;
    const next = JSON.parse(JSON.stringify(bracket));
    let m;
    if (round === 'qf') m = next.qf.find((x) => x.id === mid);
    else if (round === 'sf') m = next.sf.find((x) => x.id === mid);
    else m = next.final;
    m.winner = wid;
    if (round === 'qf') next.sf.forEach((sf) => { if (sf.fromA === mid) sf.a = wid; if (sf.fromB === mid) sf.b = wid; });
    else if (round === 'sf') { if (next.final.fromA === mid) next.final.a = wid; if (next.final.fromB === mid) next.final.b = wid; }
    setBracket(next); await saveJSON(KEYS.bracket(year, version), next);
  };
  const reset = async () => { if (!confirm('Resetar campeonato?')) return; setBracket(null); await saveJSON(KEYS.bracket(year, version), null); };
  const playerById = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p])), [players]);
  const v = VERSIONS[version];

  return (
    <Panel title={`CAMPEONATO ${v.fullLabel.toUpperCase()} · ${year}`} accent={v.color}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '0 0 120px' }}>
          <label style={lbl}>ANO</label>
          <Select value={year} onChange={(v) => setYear(Number(v))}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</Select>
        </div>
        <div>
          <label style={lbl}>VERSÃO</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {VERSION_IDS.map((vk) => (
              <button key={vk} onClick={() => setVersion(vk)}
                style={{ background: version === vk ? VERSIONS[vk].color : 'transparent', color: version === vk ? '#0A0A0A' : VERSIONS[vk].color, border: `1px solid ${VERSIONS[vk].color}`, padding: '8px 14px', fontFamily: FONTS.display, fontSize: 13, cursor: 'pointer', letterSpacing: '0.05em' }}>
                {VERSIONS[vk].fullLabel}
              </button>
            ))}
          </div>
        </div>
        {isAdmin && !bracket && <Btn variant="amber" onClick={generateBracket} disabled={top8.length < 8}>{top8.length < 8 ? `PRECISA DE 8 (${top8.length}/8)` : '★ INICIAR CAMPEONATO'}</Btn>}
        {isAdmin && bracket && <Btn variant="ghost" size="sm" onClick={reset}>RESETAR</Btn>}
      </div>
      {!bracket ? (
        top8.length > 0 ? (
          <div>
            <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: C.muted, letterSpacing: '0.15em', marginBottom: 10 }}>QUALIFICADOS ATUAIS · {v.label}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
              {top8.map((p, i) => (
                <div key={p.id} onClick={() => onOpenHunter(p.id)} style={{ border: `1px solid ${C.border}`, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                  <span style={{ fontFamily: FONTS.display, color: C.amber, fontSize: 28, lineHeight: 1 }}>#{i + 1}</span>
                  <Avatar player={p} size={32} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: FONTS.display, color: C.text, fontSize: 16, letterSpacing: '0.05em' }}>{p.tag}</div>
                    <div style={{ fontFamily: FONTS.mono, color: C.muted, fontSize: 10 }}>{p.elo} ELO</div>
                  </div>
                  <RankBadge elo={p.elo} size="sm" />
                </div>
              ))}
            </div>
          </div>
        ) : <Empty msg={`Nenhum duelo em ${v.label} neste ano ainda.`} />
      ) : <Bracket bracket={bracket} playerById={playerById} ratingsByVersion={ratingsByVersion} version={version} onAdvance={advance} canEdit={isAdmin} />}
    </Panel>
  );
}
function Bracket({ bracket, playerById, ratingsByVersion, version, onAdvance, canEdit }) {
  const isMobile = useIsMobile();
  const champion = bracket.final?.winner ? playerById[bracket.final.winner] : null;
  const champElo = champion ? (ratingsByVersion[version]?.[champion.id]?.elo ?? STARTING_ELO) : null;
  return (
    <div>
      {champion && (
        <div style={{ background: `linear-gradient(135deg, #A855F7, #6D28D9)`, color: '#fff', padding: isMobile ? '18px 20px' : '24px 28px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: isMobile ? 12 : 20, boxShadow: '0 0 30px rgba(168, 85, 247, 0.4)', flexWrap: 'wrap' }}>
          <span style={{ fontSize: isMobile ? 36 : 48 }}>👑</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: FONTS.mono, fontSize: isMobile ? 9 : 11, letterSpacing: '0.2em', opacity: 0.7 }}>SHADOW MONARCH · {VERSIONS[version].fullLabel.toUpperCase()} · {bracket.year}</div>
            <div style={{ fontFamily: FONTS.display, fontSize: isMobile ? 28 : 42, letterSpacing: '0.05em', lineHeight: 1 }}>{champion.tag}</div>
            <div style={{ fontFamily: FONTS.body, fontSize: isMobile ? 12 : 14, marginTop: 4 }}>{champion.name}</div>
          </div>
          {champElo && <RankBadge elo={champElo} size={isMobile ? 'md' : 'lg'} />}
        </div>
      )}
      {isMobile && (
        <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: C.muted, letterSpacing: '0.15em', marginBottom: 8, textAlign: 'center' }}>
          ← arraste para o lado para ver →
        </div>
      )}
      <div className="kof-scroll-x" style={{ paddingBottom: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: isMobile ? 12 : 24, minWidth: 760 }}>
          <BracketCol label="QUARTAS" matches={bracket.qf} round="qf" playerById={playerById} ratingsByVersion={ratingsByVersion} version={version} onAdvance={onAdvance} canEdit={canEdit} spacing={12} />
          <BracketCol label="SEMIFINAIS" matches={bracket.sf} round="sf" playerById={playerById} ratingsByVersion={ratingsByVersion} version={version} onAdvance={onAdvance} canEdit={canEdit} spacing={70} />
          <BracketCol label="FINAL" matches={[bracket.final]} round="final" playerById={playerById} ratingsByVersion={ratingsByVersion} version={version} onAdvance={onAdvance} canEdit={canEdit} spacing={170} />
        </div>
      </div>
    </div>
  );
}
function BracketCol({ label, matches, round, playerById, ratingsByVersion, version, onAdvance, canEdit, spacing }) {
  return (
    <div>
      <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: C.muted, letterSpacing: '0.15em', marginBottom: 12 }}>{label}</div>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-around', gap: spacing, paddingTop: spacing / 2 }}>
        {matches.map((m) => <BracketMatch key={m.id} m={m} round={round} playerById={playerById} ratingsByVersion={ratingsByVersion} version={version} onAdvance={onAdvance} canEdit={canEdit} />)}
      </div>
    </div>
  );
}
function BracketMatch({ m, round, playerById, ratingsByVersion, version, onAdvance, canEdit }) {
  const a = m.a ? playerById[m.a] : null;
  const b = m.b ? playerById[m.b] : null;
  const ready = a && b && !m.winner && canEdit;
  const cell = (player, isWin, side) => {
    if (!player) return <div style={{ padding: '10px 12px', borderBottom: side === 'a' ? `1px solid ${C.border}` : 'none', color: C.dim, fontFamily: FONTS.mono, fontSize: 12, fontStyle: 'italic' }}>aguardando…</div>;
    const elo = ratingsByVersion[version]?.[player.id]?.elo ?? STARTING_ELO;
    const r = getRank(elo);
    return (
      <button type="button" disabled={!ready && !isWin} onClick={() => ready && onAdvance(round, m.id, player.id)}
        style={{ padding: '10px 12px', background: isWin ? C.amberDim : 'transparent', color: isWin ? C.amber : C.text, border: 'none', borderBottom: side === 'a' ? `1px solid ${C.border}` : 'none', textAlign: 'left', cursor: ready ? 'pointer' : 'default', display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: 8 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 18, height: 18, border: `1.5px solid ${r.color}`, color: r.color, fontFamily: FONTS.display, fontSize: 11, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{r.id}</span>
          <span style={{ fontFamily: FONTS.display, fontSize: 16, letterSpacing: '0.05em', color: isWin ? C.amber : C.text }}>{player.tag}</span>
        </span>
        {isWin && <span style={{ color: C.amber }}>★</span>}
      </button>
    );
  };
  return <div style={{ border: `1px solid ${m.winner ? C.amberDim : C.border}`, background: C.elevated }}>{cell(a, m.winner === m.a, 'a')}{cell(b, m.winner === m.b, 'b')}</div>;
}

// ═══════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════
export default function App() {
  const [view, setView] = useState('home');
  const [viewingHunterId, setViewingHunterId] = useState(null);
  const [viewingMatchId, setViewingMatchId] = useState(null); // tela de detalhe da luta

  // Deep-link: ?luta=ID abre a tela de detalhe da luta direto
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const lutaId = params.get('luta');
    if (lutaId) setViewingMatchId(lutaId);
  }, []);
  const [players, setPlayers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [popupClosedFor, setPopupClosedFor] = useState(null);
  const [architectReveal, setArchitectReveal] = useState(null); // { hunter, version } | null
  const [showDonate, setShowDonate] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);

  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Anton&family=Manrope:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap';
    document.head.appendChild(link);
    const style = document.createElement('style');
    style.textContent = `
      @keyframes kof-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
      @keyframes kof-slide-in { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      @keyframes kof-rainbow { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
      @keyframes kof-architect-glow { 0%, 100% { box-shadow: 0 0 12px rgba(255,215,0,0.6), 0 0 24px rgba(255,215,0,0.3); } 50% { box-shadow: 0 0 24px rgba(255,215,0,0.9), 0 0 48px rgba(255,215,0,0.5), 0 0 72px rgba(255,140,0,0.3); } }
      .kof-architect-badge { animation: kof-rainbow 4s ease infinite, kof-architect-glow 2s ease-in-out infinite; }
      @keyframes kof-reveal-zoom { 0% { transform: scale(0.5); opacity: 0; } 60% { transform: scale(1.1); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
      @keyframes kof-fade-bg { from { background: rgba(0,0,0,0); } to { background: rgba(0,0,0,0.92); } }

      /* Responsivo */
      * { box-sizing: border-box; }
      html { -webkit-text-size-adjust: 100%; }
      input, textarea, select, button { font-size: 16px; } /* evita zoom em iOS */
      .kof-tab-bar::-webkit-scrollbar { display: none; }
      .kof-tab-bar { scrollbar-width: none; }
      .kof-scroll-x { overflow-x: auto; -webkit-overflow-scrolling: touch; }
      .kof-scroll-x::-webkit-scrollbar { height: 4px; }
      .kof-scroll-x::-webkit-scrollbar-thumb { background: ${C.border}; }

      @media (max-width: 600px) {
        .kof-hide-mobile { display: none !important; }
        .kof-stack-mobile { flex-direction: column !important; }
      }
      @media (min-width: 601px) {
        .kof-show-only-mobile { display: none !important; }
      }
    `;
    document.head.appendChild(style);

    (async () => {
      if (hasSupabase) {
        // MODO PRODUÇÃO: limpa dados residuais do modo demo (se houver)
        try {
          for (const key of Object.values(KEYS)) {
            if (typeof key === 'string') {
              await window.storage.delete(key).catch(() => {});
            }
          }
        } catch {}

        // Carrega do Supabase
        try {
          const [pl, ma, session] = await Promise.all([
            api.fetchAllProfiles(),
            api.fetchAllMatches(),
            api.getSession(),
          ]);
          setPlayers(pl);
          setMatches(ma);
          if (session?.user) setCurrentUserId(session.user.id);

          // Listener pra mudanças de login
          api.onAuthChange(async (session) => {
            setCurrentUserId(session?.user?.id || null);
            if (session?.user) {
              try { setPlayers(await api.fetchAllProfiles()); } catch {}
            }
          });
        } catch (e) {
          console.error('Erro carregando do Supabase:', e);
          alert('Erro de conexão. Abre o console (F12) pra detalhes.');
        }
      } else {
        // MODO DEMO: localStorage
        const seeded = await loadJSON(KEYS.seeded, false);
        if (!seeded) {
          const seed = generateSeed();
          await saveJSON(KEYS.players, seed.players);
          await saveJSON(KEYS.matches, seed.matches);
          await saveJSON(KEYS.seeded, true);
          setPlayers(seed.players); setMatches(seed.matches);
        } else {
          const [pl, ma] = await Promise.all([loadJSON(KEYS.players, []), loadJSON(KEYS.matches, [])]);
          setPlayers(pl); setMatches(ma);
        }
        const myLogin = await loadJSON(KEYS.myLogin, null, false);
        if (myLogin) setCurrentUserId(myLogin);
      }
      setLoaded(true);
    })();
  }, []);

  const ratingsByVersion = useMemo(() => computeRatingsByVersion(players, matches), [players, matches]);
  const playerById = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p])), [players]);

  // 🤫 Detectar primeiro lutador a atingir o rank secreto
  // Verifica em cada versão se algum jogador atravessou o threshold
  const architectThreshold = useMemo(() => {
    const secretRank = RANKS.find((r) => r.secret);
    if (!secretRank) return null;
    for (const v of VERSION_IDS) {
      const ratings = ratingsByVersion[v] || {};
      // Pega o primeiro com ELO >= threshold (ordem cronológica de quem chegou)
      const candidates = players
        .filter((p) => isCompetitor(p) && (ratings[p.id]?.elo ?? STARTING_ELO) >= secretRank.min)
        .map((p) => ({ ...p, elo: ratings[p.id].elo, version: v }));
      if (candidates.length > 0) {
        return candidates[0]; // o primeiro detectado em ordem de iteração
      }
    }
    return null;
  }, [players, ratingsByVersion]);

  // Trigger do reveal modal (uma vez por usuário/sessão)
  useEffect(() => {
    if (!architectThreshold || !loaded) return;
    (async () => {
      const seen = await loadJSON(KEYS.architectRevealSeen, null, false);
      if (seen !== architectThreshold.id) {
        setArchitectReveal({ hunter: architectThreshold, version: architectThreshold.version });
      }
    })();
  }, [architectThreshold, loaded]);

  const dismissArchitectReveal = async () => {
    if (architectReveal) {
      await saveJSON(KEYS.architectRevealSeen, architectReveal.hunter.id, false);
    }
    setArchitectReveal(null);
  };

  const persistMatches = async (next) => {
    setMatches(next);
    if (!hasSupabase) await saveJSON(KEYS.matches, next);
  };
  const persistPlayers = async (next) => {
    setPlayers(next);
    if (!hasSupabase) await saveJSON(KEYS.players, next);
  };

  const currentUser = currentUserId
    ? (hasSupabase
        ? (playerById[currentUserId] ? { ...playerById[currentUserId], isAdmin: !!playerById[currentUserId].isAdmin } : null)
        : (currentUserId === 'admin'
            ? { ...playerById['admin'], isAdmin: true }
            : playerById[currentUserId] ? { ...playerById[currentUserId], isAdmin: false } : null))
    : null;

  // Login handlers
  const handleLogin = async (provider, mockHunter = null) => {
    if (provider === null) { setShowLogin(false); return; }

    if (hasSupabase) {
      // OAuth REAL — abre popup do provider
      try {
        await api.signInWith(provider);
        // Vai redirecionar pro Google/Discord/Twitch e voltar
      } catch (e) {
        alert('Erro de login: ' + e.message);
      }
      return;
    }

    // MODO DEMO
    if (mockHunter) {
      if (mockHunter.isBanned) { alert('Este lutador foi banido da Arena.'); return; }
      setCurrentUserId(mockHunter.id);
      await saveJSON(KEYS.myLogin, mockHunter.id, false);
      setShowLogin(false);
      return;
    }
    const candidate = players.find((p) => p.id !== 'admin' && p.authProvider === provider && !p.isBanned);
    if (candidate) {
      setCurrentUserId(candidate.id);
      await saveJSON(KEYS.myLogin, candidate.id, false);
    } else {
      alert(`Em produção, isso abre o popup de OAuth do ${provider} e cria um perfil novo. Por ora, use as opções de demo.`);
    }
    setShowLogin(false);
  };
  const handleAdminLogin = async () => {
    if (hasSupabase) {
      alert('Em produção, vire admin pelo SQL no Supabase. Veja o guia SETUP.md.');
      return;
    }
    setCurrentUserId('admin');
    await saveJSON(KEYS.myLogin, 'admin', false);
    setShowLogin(false);
  };
  const handleLogout = async () => {
    if (hasSupabase) {
      await api.signOut();
    } else {
      await saveJSON(KEYS.myLogin, null, false);
    }
    setCurrentUserId(null);
    setView('home');
  };

  // Match operations (admin only - guarded by UI)
  const scheduleMatch = async (m) => {
    let savedMatch = m;
    if (hasSupabase) {
      try {
        savedMatch = await api.createMatch({ ...m, createdBy: currentUserId });
        setMatches((prev) => [savedMatch, ...prev]);
      } catch (e) { alert('Erro ao agendar: ' + e.message); return; }
    } else {
      persistMatches([m, ...matches]);
    }
    // Notifica Discord (silencioso se webhook desativado)
    if (DISCORD_WEBHOOK.notifyOnScheduled) {
      const p1 = playerById[savedMatch.player1Id], p2 = playerById[savedMatch.player2Id];
      const v = VERSIONS[savedMatch.version];
      if (p1 && p2 && v) {
        notifyDiscord({
          embeds: [{
            title: `🥊 NOVO DUELO AGENDADO`,
            description: `**${p1.tag}** vs **${p2.tag}**`,
            color: 0xDC2626,
            fields: [
              { name: '📅 Data', value: fmtDateTime(savedMatch.scheduledAt), inline: true },
              { name: '🎮 Versão', value: v.fullLabel, inline: true },
            ],
            footer: { text: 'ARENA BNOSTLE' },
            timestamp: new Date().toISOString(),
          }],
        });
      }
    }
  };

  const updateMatch = async (id, patch) => {
    const previous = matches.find((m) => m.id === id);
    if (hasSupabase) {
      try {
        const updated = await api.updateMatch(id, patch);
        setMatches((prev) => prev.map((m) => m.id === id ? updated : m));
      } catch (e) { alert('Erro ao atualizar: ' + e.message); return; }
    } else {
      persistMatches(matches.map((m) => m.id === id ? { ...m, ...patch } : m));
    }

    // Detectar transições e notificar Discord
    if (previous && patch.status && patch.status !== previous.status) {
      const p1 = playerById[previous.player1Id], p2 = playerById[previous.player2Id];
      const v = VERSIONS[previous.version];
      if (!p1 || !p2 || !v) return;

      if (patch.status === 'live' && DISCORD_WEBHOOK.notifyOnLive) {
        notifyDiscord({
          embeds: [{
            title: `🔴 AO VIVO AGORA`,
            description: `**${p1.tag}** vs **${p2.tag}** está acontecendo!\n\n[▶ Assistir](${patch.streamUrl || previous.streamUrl || ''})`,
            color: 0xDC2626,
            fields: [
              { name: '🎮 Versão', value: v.fullLabel, inline: true },
            ],
            footer: { text: 'ARENA BNOSTLE' },
            timestamp: new Date().toISOString(),
          }],
        });
      }
      if (patch.status === 'completed' && DISCORD_WEBHOOK.notifyOnCompleted) {
        const winnerId = patch.winnerId || previous.winnerId;
        const winner = winnerId === p1.id ? p1 : winnerId === p2.id ? p2 : null;
        const loser = winner?.id === p1.id ? p2 : p1;
        if (winner) {
          notifyDiscord({
            embeds: [{
              title: `🏆 RESULTADO`,
              description: `**${winner.tag}** venceu **${loser.tag}**!`,
              color: 0x16A34A,
              fields: [
                { name: '📊 Placar', value: patch.score || previous.score || '—', inline: true },
                { name: '🎮 Versão', value: v.fullLabel, inline: true },
              ],
              footer: { text: 'ARENA BNOSTLE' },
              timestamp: new Date().toISOString(),
            }],
          });
        }
      }
    }
  };

  const deleteMatch = async (id) => {
    if (hasSupabase) {
      try {
        await api.deleteMatch(id);
        setMatches((prev) => prev.filter((m) => m.id !== id));
      } catch (e) { alert('Erro ao deletar: ' + e.message); }
    } else {
      persistMatches(matches.filter((m) => m.id !== id));
    }
  };

  // Reabrir luta concluída: limpa resultado e volta pra status agendado
  const reopenMatch = async (id) => {
    const patch = {
      status: 'scheduled',
      winnerId: null,
      score: null,
      roundsWonP1: null,
      roundsWonP2: null,
      completedAt: null,
    };
    if (hasSupabase) {
      try {
        const updated = await api.updateMatch(id, patch);
        setMatches((prev) => prev.map((m) => m.id === id ? updated : m));
      } catch (e) { alert('Erro ao reabrir: ' + e.message); }
    } else {
      persistMatches(matches.map((m) => m.id === id ? { ...m, ...patch } : m));
    }
  };

  // Profile updates (own only)
  const updateOwnProfile = async (patch) => {
    if (!currentUser) return;
    if (patch.tag && patch.tag !== currentUser.tag && players.some((p) => p.tag === patch.tag)) {
      alert(`Tag "${patch.tag}" já está em uso.`); return;
    }
    if (hasSupabase) {
      try {
        const updated = await api.updateMyProfile(currentUser.id, patch);
        setPlayers((prev) => prev.map((p) => p.id === currentUser.id ? updated : p));
      } catch (e) { alert('Erro ao salvar: ' + e.message); }
    } else {
      persistPlayers(players.map((p) => p.id === currentUser.id ? { ...p, ...patch } : p));
    }
  };

  // ─── HANDLERS DE MODERAÇÃO (admin only) ─────────────────
  const banPlayer = async (playerId, reason) => {
    if (!currentUser?.isAdmin) return;
    const patch = { isBanned: true, banReason: reason || null, bannedAt: new Date().toISOString() };
    if (hasSupabase) {
      try {
        const updated = await api.adminUpdateProfile(playerId, patch);
        setPlayers((prev) => prev.map((p) => p.id === playerId ? updated : p));
      } catch (e) { alert('Erro ao banir: ' + e.message); }
    } else {
      persistPlayers(players.map((p) => p.id === playerId ? { ...p, ...patch } : p));
    }
  };
  const unbanPlayer = async (playerId) => {
    if (!currentUser?.isAdmin) return;
    const patch = { isBanned: false, banReason: null, bannedAt: null };
    if (hasSupabase) {
      try {
        const updated = await api.adminUpdateProfile(playerId, patch);
        setPlayers((prev) => prev.map((p) => p.id === playerId ? updated : p));
      } catch (e) { alert('Erro ao desbanir: ' + e.message); }
    } else {
      persistPlayers(players.map((p) => p.id === playerId ? { ...p, ...patch } : p));
    }
  };
  const adminEditProfile = async (playerId, patch) => {
    if (!currentUser?.isAdmin) return;
    if (patch.tag && players.some((p) => p.id !== playerId && p.tag === patch.tag)) {
      alert(`Tag "${patch.tag}" já está em uso por outro lutador.`); return;
    }
    if (hasSupabase) {
      try {
        const updated = await api.adminUpdateProfile(playerId, patch);
        setPlayers((prev) => prev.map((p) => p.id === playerId ? updated : p));
      } catch (e) { alert('Erro ao salvar: ' + e.message); }
    } else {
      persistPlayers(players.map((p) => p.id === playerId ? { ...p, ...patch } : p));
    }
  };

  // EXCLUSÃO PERMANENTE — irreversível, com cautela
  const deletePlayer = async (playerId) => {
    if (!currentUser?.isAdmin) return;
    const target = players.find((p) => p.id === playerId);
    if (!target || target.id === 'admin') return;
    const patch = {
      isDeleted: true,
      isBanned: true,
      tag: 'DELETED' + String(Date.now()).slice(-3),
      name: '(perfil deletado)',
      bio: null,
      avatarUrl: null,
      banReason: null,
      bannedAt: null,
      deletedAt: new Date().toISOString(),
    };
    if (hasSupabase) {
      try {
        const updated = await api.adminUpdateProfile(playerId, patch);
        setPlayers((prev) => prev.map((p) => p.id === playerId ? updated : p));
      } catch (e) { alert('Erro ao deletar: ' + e.message); }
    } else {
      persistPlayers(players.map((p) => p.id === playerId ? { ...p, ...patch } : p));
    }
  };

  const resetDemo = async () => {
    const seed = generateSeed();
    await saveJSON(KEYS.players, seed.players);
    await saveJSON(KEYS.matches, seed.matches);
    for (const v of VERSION_IDS) await saveJSON(KEYS.bracket(new Date().getFullYear(), v), null);
    setPlayers(seed.players); setMatches(seed.matches);
    setPopupClosedFor(null);
  };

  const liveMatch = matches.find((m) => m.status === 'live' && m.streamUrl);
  const showPopup = liveMatch && popupClosedFor !== liveMatch.id && view !== 'home';
  const pendingResultsCount = useMemo(() => matches.filter((m) =>
    (m.status === 'scheduled' && new Date(m.scheduledAt) < new Date()) || m.status === 'live'
  ).length, [matches]);

  const allowedTabs = tabsForUser(currentUser).map((t) => t.id);
  useEffect(() => { if (!allowedTabs.includes(view) && view !== 'profile' && !viewingHunterId) setView('home'); }, [currentUser]); // eslint-disable-line

  const openHunter = (id) => { setViewingHunterId(id); setViewingMatchId(null); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const closeHunterView = () => setViewingHunterId(null);
  const openMyProfile = () => { if (currentUser) setViewingHunterId(currentUser.id); };
  const openMatch = (id) => { setViewingMatchId(id); setViewingHunterId(null); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const closeMatchView = () => setViewingMatchId(null);

  if (!loaded) return <div style={{ minHeight: '100vh', background: C.bg, color: C.muted, fontFamily: FONTS.mono, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ letterSpacing: '0.2em' }}>// CARREGANDO ARENA…</span></div>;

  if (showLogin) {
    return <LoginScreen players={players} onLogin={handleLogin} onLoginAsAdmin={handleAdminLogin} />;
  }

  const viewingHunter = viewingHunterId ? playerById[viewingHunterId] : null;
  const viewingMatch = viewingMatchId ? matches.find((m) => m.id === viewingMatchId) : null;
  const isOwnProfile = viewingHunter && currentUser && viewingHunter.id === currentUser.id;
  const isAdmin = !!currentUser?.isAdmin;

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: FONTS.body }}>
      <Header
        playerCount={players.filter(isCompetitor).length}
        matchCount={matches.filter((m) => m.status === 'completed').length}
        liveCount={matches.filter((m) => m.status === 'live').length}
        currentUser={currentUser}
        onLogout={handleLogout}
        onProfile={openMyProfile}
        onLogin={() => setShowLogin(true)}
        onDonate={() => setShowDonate(true)}
      />
      {!viewingHunter && !viewingMatch && <TabBar active={view} onChange={(v) => { setView(v); setViewingHunterId(null); setViewingMatchId(null); }} user={currentUser} pendingCount={pendingResultsCount} />}
      <div style={{ padding: 'clamp(12px, 3vw, 24px)', maxWidth: 1400, margin: '0 auto' }}>
        {viewingMatch ? (
          <MatchDetailView match={viewingMatch} players={players} matches={matches} playerById={playerById} ratingsByVersion={ratingsByVersion} isAdmin={isAdmin} currentUser={currentUser} onBack={closeMatchView} onOpenHunter={openHunter} onUpdateMatch={updateMatch} onDeleteMatch={(id) => { deleteMatch(id); closeMatchView(); }} />
        ) : viewingHunter ? (
          <HunterProfileView hunter={viewingHunter} isOwn={isOwnProfile} players={players} matches={matches} ratingsByVersion={ratingsByVersion} playerById={playerById} currentUser={currentUser} onBack={closeHunterView} onOpenHunter={openHunter} onOpenMatch={openMatch} onUpdateProfile={updateOwnProfile} />
        ) : (
          <>
            {view === 'home' && <HomeView players={players} matches={matches} ratingsByVersion={ratingsByVersion} playerById={playerById} onNavigate={setView} onOpenHunter={openHunter} onOpenMatch={openMatch} architect={architectThreshold} />}
            {view === 'agenda' && <AgendaView matches={matches} ratingsByVersion={ratingsByVersion} playerById={playerById} onOpenHunter={openHunter} onOpenMatch={openMatch} />}
            {view === 'vods' && <VodsView matches={matches} playerById={playerById} ratingsByVersion={ratingsByVersion} onOpenHunter={openHunter} onOpenMatch={openMatch} />}
            {view === 'hunters' && <HuntersView players={players} ratingsByVersion={ratingsByVersion} onOpenHunter={openHunter} />}
            {view === 'mensal' && <RankingView players={players} matches={matches} mode="mensal" onOpenHunter={openHunter} />}
            {view === 'anual' && <RankingView players={players} matches={matches} mode="anual" onOpenHunter={openHunter} />}
            {view === 'campeonato' && <ChampionshipView players={players} matches={matches} ratingsByVersion={ratingsByVersion} isAdmin={isAdmin} onOpenHunter={openHunter} />}
            {view === 'noticias' && <NewsView currentUser={currentUser} onOpenHunter={openHunter} />}
            {view === 'admin' && isAdmin && <AdminPanel players={players} matches={matches} ratingsByVersion={ratingsByVersion} playerById={playerById} onScheduleMatch={scheduleMatch} onUpdateMatch={updateMatch} onDeleteMatch={deleteMatch} onReopenMatch={reopenMatch} onResetDemo={resetDemo} onBanPlayer={banPlayer} onUnbanPlayer={unbanPlayer} onAdminEditProfile={adminEditProfile} onDeletePlayer={deletePlayer} onOpenMatch={openMatch} />}
          </>
        )}
      </div>
      {showPopup && <LivestreamPopup match={liveMatch} playerById={playerById} onClose={() => setPopupClosedFor(liveMatch.id)} onMaximize={() => { setView('home'); setViewingHunterId(null); }} />}
      {architectReveal && <ArchitectRevealModal architect={architectReveal.hunter} version={architectReveal.version} onClose={dismissArchitectReveal} />}
      {showDonate && <PixDonationModal onClose={() => setShowDonate(false)} />}
      <Footer onDonate={() => setShowDonate(true)} />
    </div>
  );
}

function Footer({ onDonate }) {
  return (
    <div style={{ borderTop: `1px solid ${C.border}`, padding: '20px 24px', marginTop: 40 }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <span style={{ fontFamily: FONTS.mono, fontSize: 11, color: C.dim, letterSpacing: '0.15em' }}>// ARENA BNOSTLE · KOF 2002 · UM · XV · LIGA OFICIAL</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {PIX_CONFIG.enabled && onDonate && (
            <button onClick={onDonate}
              style={{
                background: 'transparent', border: 'none', color: C.green,
                cursor: 'pointer', fontFamily: FONTS.mono, fontSize: 11,
                letterSpacing: '0.15em', padding: 0,
                textDecoration: 'underline', textDecorationColor: 'transparent',
                transition: 'text-decoration-color 0.15s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.textDecorationColor = C.green}
              onMouseLeave={(e) => e.currentTarget.style.textDecorationColor = 'transparent'}>
              💚 APOIE A ARENA VIA PIX
            </button>
          )}
          <span style={{ fontFamily: FONTS.mono, fontSize: 11, color: C.dim, letterSpacing: '0.15em' }}>v0.5 · ARISE</span>
        </div>
      </div>
    </div>
  );
}