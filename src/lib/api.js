// src/lib/api.js
// Camada de comunicação com o Supabase
import { supabase } from './supabase'

// ─── HELPERS ────────────────────────────────────────────────
function stringToColor(str) {
  if (!str) return '#7A7A82'
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  const palette = ['#FF3B47', '#9333EA', '#F59E0B', '#DC2626', '#22D3EE', '#EC4899', '#10B981', '#A855F7', '#3B82F6', '#F97316']
  return palette[Math.abs(hash) % palette.length]
}

function profileFromDb(p) {
  return {
    id: p.id,
    tag: p.tag,
    name: p.display_name,
    avatarUrl: p.avatar_url,
    avatarColor: stringToColor(p.id),
    bio: p.bio,
    city: p.city,
    platform: p.platform,
    mains2002: p.mains_2002 || [],
    mainsUm: p.mains_um || [],
    twitch: p.twitch,
    youtube: p.youtube,
    discord: p.discord,
    joinedAt: p.joined_at,
    isAdmin: p.is_admin,
    isBanned: p.is_banned,
    banReason: p.ban_reason,
    bannedAt: p.banned_at,
    isDeleted: p.is_deleted,
    deletedAt: p.deleted_at,
  }
}

function matchFromDb(m) {
  return {
    id: m.id,
    player1Id: m.player1_id,
    player2Id: m.player2_id,
    version: m.version,
    status: m.status,
    winnerId: m.winner_id,
    score: m.score,
    streamUrl: m.stream_url,
    vodUrl: m.vod_url,
    vodTitle: m.vod_title,
    isBroadcasted: m.is_broadcasted,
    notes: m.notes,
    scheduledAt: m.scheduled_at,
    completedAt: m.completed_at,
    createdBy: m.created_by,
    createdAt: m.created_at,
  }
}

function matchToDb(m, partial = false) {
  const out = {}
  if (m.player1Id !== undefined) out.player1_id = m.player1Id
  if (m.player2Id !== undefined) out.player2_id = m.player2Id
  if (m.version !== undefined) out.version = m.version
  if (m.status !== undefined) out.status = m.status
  if (m.winnerId !== undefined) out.winner_id = m.winnerId
  if (m.score !== undefined) out.score = m.score
  if (m.streamUrl !== undefined) out.stream_url = m.streamUrl
  if (m.vodUrl !== undefined) out.vod_url = m.vodUrl
  if (m.vodTitle !== undefined) out.vod_title = m.vodTitle
  if (m.isBroadcasted !== undefined) out.is_broadcasted = m.isBroadcasted
  if (m.notes !== undefined) out.notes = m.notes
  if (m.scheduledAt !== undefined) out.scheduled_at = m.scheduledAt
  if (m.completedAt !== undefined) out.completed_at = m.completedAt
  if (m.createdBy !== undefined) out.created_by = m.createdBy
  return out
}

// ─── PROFILES (LUTADORES) ───────────────────────────────────
export async function fetchAllProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('joined_at')
  if (error) throw error
  return data.map(profileFromDb)
}

export async function updateMyProfile(userId, patch) {
  const dbPatch = {}
  if (patch.tag !== undefined) dbPatch.tag = patch.tag
  if (patch.name !== undefined) dbPatch.display_name = patch.name
  if (patch.bio !== undefined) dbPatch.bio = patch.bio
  if (patch.avatarUrl !== undefined) dbPatch.avatar_url = patch.avatarUrl
  if (patch.city !== undefined) dbPatch.city = patch.city
  if (patch.platform !== undefined) dbPatch.platform = patch.platform
  if (patch.mains2002 !== undefined) dbPatch.mains_2002 = patch.mains2002
  if (patch.mainsUm !== undefined) dbPatch.mains_um = patch.mainsUm
  if (patch.twitch !== undefined) dbPatch.twitch = patch.twitch
  if (patch.youtube !== undefined) dbPatch.youtube = patch.youtube
  if (patch.discord !== undefined) dbPatch.discord = patch.discord

  const { data, error } = await supabase
    .from('profiles')
    .update(dbPatch)
    .eq('id', userId)
    .select()
    .single()
  if (error) throw error
  return profileFromDb(data)
}

export async function adminUpdateProfile(userId, patch) {
  const dbPatch = {}
  if (patch.tag !== undefined) dbPatch.tag = patch.tag
  if (patch.name !== undefined) dbPatch.display_name = patch.name
  if (patch.bio !== undefined) dbPatch.bio = patch.bio
  if (patch.avatarUrl !== undefined) dbPatch.avatar_url = patch.avatarUrl
  if (patch.isBanned !== undefined) dbPatch.is_banned = patch.isBanned
  if (patch.banReason !== undefined) dbPatch.ban_reason = patch.banReason
  if (patch.bannedAt !== undefined) dbPatch.banned_at = patch.bannedAt
  if (patch.isDeleted !== undefined) dbPatch.is_deleted = patch.isDeleted
  if (patch.deletedAt !== undefined) dbPatch.deleted_at = patch.deletedAt

  const { data, error } = await supabase
    .from('profiles')
    .update(dbPatch)
    .eq('id', userId)
    .select()
    .single()
  if (error) throw error
  return profileFromDb(data)
}

// ─── MATCHES (DUELOS) ───────────────────────────────────────
export async function fetchAllMatches() {
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .order('scheduled_at', { ascending: false })
  if (error) throw error
  return data.map(matchFromDb)
}

export async function createMatch(match) {
  const { data, error } = await supabase
    .from('matches')
    .insert(matchToDb(match))
    .select()
    .single()
  if (error) throw error
  return matchFromDb(data)
}

export async function updateMatch(id, patch) {
  const dbPatch = matchToDb(patch, true)
  const { data, error } = await supabase
    .from('matches')
    .update(dbPatch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return matchFromDb(data)
}

export async function deleteMatch(id) {
  const { error } = await supabase.from('matches').delete().eq('id', id)
  if (error) throw error
}

// ─── BRACKETS (CAMPEONATO POR VERSÃO) ───────────────────────
export async function fetchBracket(year, version) {
  const { data, error } = await supabase
    .from('brackets')
    .select('data')
    .eq('year', year)
    .eq('version', version)
    .maybeSingle()
  if (error) throw error
  return data?.data ?? null
}

export async function saveBracket(year, version, bracketData) {
  if (bracketData === null) {
    await supabase
      .from('brackets')
      .delete()
      .eq('year', year)
      .eq('version', version)
    return
  }
  const { error } = await supabase
    .from('brackets')
    .upsert({ year, version, data: bracketData }, { onConflict: 'year,version' })
  if (error) throw error
}

// ─── AUTH ───────────────────────────────────────────────────
export async function signInWith(provider) {
  return supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: window.location.origin },
  })
}

export async function signOut() {
  await supabase.auth.signOut()
}

export function onAuthChange(callback) {
  return supabase.auth.onAuthStateChange((_event, session) => callback(session))
}

export async function getSession() {
  const { data } = await supabase.auth.getSession()
  return data.session
}