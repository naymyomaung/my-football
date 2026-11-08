import { useEffect, useState, type CSSProperties } from 'react'
import { Activity, ArrowRight, ArrowUpRight, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Clock3, MapPin, Menu, ReceiptText, RotateCcw, Search, Shield, Sparkles, Trophy, UsersRound, Wallet, X } from 'lucide-react'
import Swal from 'sweetalert2'
import { createClubs, createFixtures, getStandings, type Club, type Competition, type Fixture, type Player, type Standing } from './league'
import './App.css'

const CLUBS_KEY = 'nosh-league-clubs-v2'
const FIXTURES_KEY = 'nosh-league-fixtures-v6'
const LIVE_MATCH_KEY = 'nosh-league-live-match-v6'
const WALLET_KEY = 'nosh-league-wallet-v1'
const BETS_KEY = 'nosh-league-bets-v1'
const BET_SLIP_KEY = 'nosh-league-slip-v1'
const MATCH_DURATION = 10 * 60
const MINIMUM_BET = 500
const MAX_SLIP_LEGS = 10
const YANGON_TIME_ZONE = 'Asia/Yangon'

type Outcome = 'home' | 'draw' | 'away'
type BetMarket = 'result' | 'goals' | 'corners' | 'btts' | 'half-result' | 'double-chance' | 'team-goals' | 'cards' | 'first-goal' | 'correct-score'
type BetSelection = Outcome | 'goals-over-1.5' | 'goals-under-1.5' | 'goals-over-2.5' | 'goals-under-2.5' | 'goals-over-3.5' | 'goals-under-3.5' | 'corners-over-8.5' | 'corners-under-8.5' | 'corners-over-9.5' | 'corners-under-9.5' | 'corners-over-10.5' | 'corners-under-10.5' | 'btts-yes' | 'btts-no' | 'half-home' | 'half-draw' | 'half-away' | 'double-1x' | 'double-12' | 'double-x2' | 'home-goals-over' | 'home-goals-under' | 'away-goals-over' | 'away-goals-under' | 'cards-over' | 'cards-under' | 'first-home' | 'first-away' | 'first-none' | 'score-0-0' | 'score-1-0' | 'score-0-1' | 'score-2-1' | 'score-1-2'
type LiveMatch = { fixtureId: string; startedAt: number }
type BetLeg = { id: string; fixtureId: string; fixtureName: string; market: BetMarket; marketLabel: string; selection: BetSelection; selectionLabel: string; odds: number }
type Bet = { id: string; legs: BetLeg[]; stake: number; combinedOdds: number; status: 'open' | 'won' | 'lost'; payout: number; createdAt: number }
type BetOption = { market: BetMarket; marketLabel: string; selection: BetSelection; label: string; odds: number }
type MatchEvent = { minute: number; side: 'home' | 'away'; kind: 'goal' | 'corner' | 'yellow' | 'red' | 'substitution'; player: Player; detail: string }
type MatchStats = { homeGoals: number; awayGoals: number; halfHomeGoals: number; halfAwayGoals: number; homeCorners: number; awayCorners: number; homeYellows: number; awayYellows: number; homeReds: number; awayReds: number; firstGoalSide: 'home' | 'away' | null }

function readBets(): Bet[] {
  const saved = readStorage<Record<string, unknown>[]>(BETS_KEY, () => [])
  return saved.flatMap((entry) => {
    if (Array.isArray(entry.legs)) return [entry as unknown as Bet]
    if (typeof entry.fixtureId !== 'string' || typeof entry.selection !== 'string') return []
    const odds = typeof entry.odds === 'number' ? entry.odds : 1
    return [{
      id: typeof entry.id === 'string' ? entry.id : `legacy-${Date.now()}`,
      legs: [{
        id: `legacy-leg-${entry.id ?? 'pick'}`,
        fixtureId: entry.fixtureId,
        fixtureName: 'NOSH League match',
        market: entry.market as BetMarket,
        marketLabel: typeof entry.marketLabel === 'string' ? entry.marketLabel : 'Match result',
        selection: entry.selection as BetSelection,
        selectionLabel: typeof entry.selectionLabel === 'string' ? entry.selectionLabel : 'Previous pick',
        odds,
      }],
      stake: typeof entry.stake === 'number' ? entry.stake : MINIMUM_BET,
      combinedOdds: odds,
      status: entry.status === 'won' || entry.status === 'lost' ? entry.status : 'open',
      payout: typeof entry.payout === 'number' ? entry.payout : 0,
      createdAt: typeof entry.createdAt === 'number' ? entry.createdAt : 0,
    }]
  })
}

function readStorage<T>(key: string, fallback: () => T): T {
  try {
    const saved = localStorage.getItem(key)
    return saved ? JSON.parse(saved) as T : fallback()
  } catch {
    return fallback()
  }
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

function dateInYangon(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: YANGON_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

function kickoffInYangon(date: string) {
  return new Date(`${date}T12:00:00+06:30`).getTime()
}

function scheduleFixtureKickoffs(fixtures: Fixture[]) {
  const leagueByRound = new Map<number, Fixture[]>()
  for (const fixture of fixtures) {
    if (fixture.competition !== 'league') continue
    const roundFixtures = leagueByRound.get(fixture.round) ?? []
    roundFixtures.push(fixture)
    leagueByRound.set(fixture.round, roundFixtures)
  }
  const kickoffById = new Map<string, number>()
  for (const roundFixtures of leagueByRound.values()) {
    const ordered = [...roundFixtures].sort((a, b) => Number(a.id.split('-').at(-1)) - Number(b.id.split('-').at(-1)))
    const firstKickoff = ordered[0]?.kickoffAt ?? kickoffInYangon(ordered[0]?.date ?? '')
    ordered.forEach((fixture, index) => {
      kickoffById.set(fixture.id, fixture.kickoffAt ?? firstKickoff + index * 45 * 60 * 1000)
    })
  }
  return fixtures.map((fixture) => {
    const kickoffAt = kickoffById.get(fixture.id)
    return kickoffAt === undefined ? fixture : { ...fixture, kickoffAt }
  })
}

function formatYangonTime(date: Date | number) {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: YANGON_TIME_ZONE,
  }).format(date instanceof Date ? date : new Date(date))
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: YANGON_TIME_ZONE }).format(new Date(`${value}T00:00:00Z`))
}

function formatSeasonDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: YANGON_TIME_ZONE }).format(new Date(`${value}T00:00:00Z`)).toUpperCase()
}

function createMatchEvents(fixture: Fixture, home: Club, away: Club): MatchEvent[] {
  let seed = [...fixture.id].reduce((value, char) => value + char.charCodeAt(0), 0)
  const random = (max: number) => {
    seed = (seed * 9301 + 49297) % 233280
    return Math.floor((seed / 233280) * max)
  }
  const events: MatchEvent[] = []
  const sides: { side: 'home' | 'away'; club: Club }[] = [{ side: 'home', club: home }, { side: 'away', club: away }]
  const addEvent = (kind: MatchEvent['kind'], side: 'home' | 'away', club: Club, minute: number) => {
    const players = club.players.slice(0, 11)
    const player = players[random(players.length)]
    const detail = kind === 'goal' ? 'Goal' : kind === 'corner' ? 'Corner' : kind === 'yellow' ? 'Yellow card' : kind === 'red' ? 'Red card' : 'Substitution'
    events.push({ kind, side, minute, player, detail })
  }
  for (const { side, club } of sides) {
    const goals = random(4)
    const corners = 4 + random(5)
    const yellows = 1 + random(3)
    for (let index = 0; index < goals; index += 1) addEvent('goal', side, club, 5 + random(84))
    for (let index = 0; index < corners; index += 1) addEvent('corner', side, club, 2 + random(88))
    for (let index = 0; index < yellows; index += 1) addEvent('yellow', side, club, 10 + random(78))
    if (random(5) === 0) addEvent('red', side, club, 25 + random(68))
    for (let index = 0; index < 3; index += 1) addEvent('substitution', side, club, 52 + random(37))
  }
  return events.sort((a, b) => a.minute - b.minute)
}

function getMatchMinute(elapsed: number) {
  if (elapsed < 300) return Math.floor(elapsed / 300 * 45)
  if (elapsed < 580) return 45 + Math.floor((elapsed - 300) / 280 * 45)
  return Math.min(94, 90 + Math.ceil((elapsed - 580) / 5))
}

function matchPhase(elapsed: number) {
  if (elapsed < 300) return 'FIRST HALF'
  if (elapsed === 300) return 'HALF-TIME'
  if (elapsed < 580) return 'SECOND HALF'
  if (elapsed < MATCH_DURATION) return 'STOPPAGE TIME'
  return 'FULL TIME'
}

function getMatchStats(events: MatchEvent[], minute: number): MatchStats {
  const stats: MatchStats = { homeGoals: 0, awayGoals: 0, halfHomeGoals: 0, halfAwayGoals: 0, homeCorners: 0, awayCorners: 0, homeYellows: 0, awayYellows: 0, homeReds: 0, awayReds: 0, firstGoalSide: null }
  for (const event of events) {
    if (event.minute > minute) continue
    const prefix = event.side === 'home' ? 'home' : 'away'
    if (event.kind === 'goal') {
      stats[`${prefix}Goals`] += 1
      if (event.minute <= 45) stats[`${prefix === 'home' ? 'halfHome' : 'halfAway'}Goals`] += 1
      if (!stats.firstGoalSide) stats.firstGoalSide = event.side
    }
    if (event.kind === 'corner') stats[`${prefix}Corners`] += 1
    if (event.kind === 'yellow') stats[`${prefix}Yellows`] += 1
    if (event.kind === 'red') stats[`${prefix}Reds`] += 1
  }
  return stats
}

function marketOptions(fixture: Fixture, minute = 0, stats?: MatchStats, now = 0): BetOption[] {
  const seed = [...fixture.id].reduce((value, char) => value + char.charCodeAt(0), 0)
  const homeOdds = 1.65 + (seed % 8) / 10
  const drawOdds = 3.1 + (seed % 5) / 10
  const awayOdds = 2.25 + (seed % 12) / 10
  const options: BetOption[] = [
    { market: 'result', marketLabel: 'Match result', selection: 'home', label: '1', odds: homeOdds },
    { market: 'result', marketLabel: 'Match result', selection: 'draw', label: 'X', odds: drawOdds },
    { market: 'result', marketLabel: 'Match result', selection: 'away', label: '2', odds: awayOdds },
    ...([1.5, 2.5, 3.5] as const).flatMap((line, index) => [
      { market: 'goals' as const, marketLabel: `Total goals · ${line}`, selection: `goals-over-${line}` as BetSelection, label: `Over ${line}`, odds: 1.7 + index * 0.12 },
      { market: 'goals' as const, marketLabel: `Total goals · ${line}`, selection: `goals-under-${line}` as BetSelection, label: `Under ${line}`, odds: 2.04 - index * 0.09 },
    ]),
    ...([8.5, 9.5, 10.5] as const).flatMap((line, index) => [
      { market: 'corners' as const, marketLabel: `Total corners · ${line}`, selection: `corners-over-${line}` as BetSelection, label: `Over ${line}`, odds: 1.65 + index * 0.16 },
      { market: 'corners' as const, marketLabel: `Total corners · ${line}`, selection: `corners-under-${line}` as BetSelection, label: `Under ${line}`, odds: 2.08 - index * 0.12 },
    ]),
    { market: 'btts', marketLabel: 'Both teams to score', selection: 'btts-yes', label: 'Yes', odds: 1.82 },
    { market: 'btts', marketLabel: 'Both teams to score', selection: 'btts-no', label: 'No', odds: 1.98 },
    { market: 'half-result', marketLabel: 'Half-time result', selection: 'half-home', label: 'Home', odds: 2.35 },
    { market: 'half-result', marketLabel: 'Half-time result', selection: 'half-draw', label: 'Draw', odds: 2.05 },
    { market: 'half-result', marketLabel: 'Half-time result', selection: 'half-away', label: 'Away', odds: 2.75 },
    { market: 'double-chance', marketLabel: 'Double chance', selection: 'double-1x', label: '1X', odds: 1.28 },
    { market: 'double-chance', marketLabel: 'Double chance', selection: 'double-12', label: '12', odds: 1.34 },
    { market: 'double-chance', marketLabel: 'Double chance', selection: 'double-x2', label: 'X2', odds: 1.42 },
    { market: 'team-goals', marketLabel: 'Home team goals · 1.5', selection: 'home-goals-over', label: 'Home over 1.5', odds: 2.25 },
    { market: 'team-goals', marketLabel: 'Home team goals · 1.5', selection: 'home-goals-under', label: 'Home under 1.5', odds: 1.55 },
    { market: 'team-goals', marketLabel: 'Away team goals · 1.5', selection: 'away-goals-over', label: 'Away over 1.5', odds: 2.45 },
    { market: 'team-goals', marketLabel: 'Away team goals · 1.5', selection: 'away-goals-under', label: 'Away under 1.5', odds: 1.48 },
    { market: 'cards', marketLabel: 'Total cards · 3.5', selection: 'cards-over', label: 'Over 3.5', odds: 1.88 },
    { market: 'cards', marketLabel: 'Total cards · 3.5', selection: 'cards-under', label: 'Under 3.5', odds: 1.82 },
    { market: 'first-goal', marketLabel: 'First team to score', selection: 'first-home', label: 'Home', odds: 2.05 },
    { market: 'first-goal', marketLabel: 'First team to score', selection: 'first-away', label: 'Away', odds: 2.25 },
    { market: 'first-goal', marketLabel: 'First team to score', selection: 'first-none', label: 'No goal', odds: 5.2 },
    ...([['score-0-0', '0 - 0', 8.5], ['score-1-0', '1 - 0', 7.2], ['score-0-1', '0 - 1', 8.8], ['score-2-1', '2 - 1', 9.5], ['score-1-2', '1 - 2', 10.5]] as const).map(([selection, label, odds]) => ({ market: 'correct-score' as const, marketLabel: 'Correct score', selection, label, odds })),
  ]
  const scoreDiff = (stats?.homeGoals ?? 0) - (stats?.awayGoals ?? 0)
  const totalGoals = (stats?.homeGoals ?? 0) + (stats?.awayGoals ?? 0)
  const totalCorners = (stats?.homeCorners ?? 0) + (stats?.awayCorners ?? 0)
  return options.map((option) => {
    const optionSeed = [...option.selection].reduce((value, char) => value + char.charCodeAt(0), seed)
    let movement = Math.sin(now / 6500 + optionSeed) * (minute ? 0.014 : 0.025)
    if (minute && option.market === 'result') {
      movement += option.selection === 'home' ? -scoreDiff * 0.14 - minute * 0.002 : option.selection === 'away' ? scoreDiff * 0.14 - minute * 0.002 : Math.abs(scoreDiff) * 0.12 + minute * 0.002
    } else if (minute && option.market === 'half-result') {
      movement += option.selection === 'half-home' ? -scoreDiff * 0.1 : option.selection === 'half-away' ? scoreDiff * 0.1 : Math.abs(scoreDiff) * 0.08
    } else if (minute && option.selection.startsWith('goals-over-')) {
      movement += (Number(option.selection.slice(11)) - totalGoals - (90 - minute) / 45) * 0.035
    } else if (minute && option.selection.startsWith('goals-under-')) {
      movement -= (Number(option.selection.slice(12)) - totalGoals - (90 - minute) / 45) * 0.035
    } else if (minute && option.selection.startsWith('corners-over-')) {
      movement += (Number(option.selection.slice(13)) - totalCorners - (90 - minute) / 12) * 0.018
    } else if (minute && option.selection.startsWith('corners-under-')) {
      movement -= (Number(option.selection.slice(14)) - totalCorners - (90 - minute) / 12) * 0.018
    } else if (minute && option.market === 'btts' && totalGoals > 0) {
      movement += option.selection === 'btts-yes' ? -0.18 : 0.18
    }
    return { ...option, odds: Number(Math.max(1.05, option.odds * (1 + movement)).toFixed(2)) }
  })
}

function betWins(selection: BetSelection, stats: MatchStats) {
  if (selection === 'home') return stats.homeGoals > stats.awayGoals
  if (selection === 'draw') return stats.homeGoals === stats.awayGoals
  if (selection === 'away') return stats.homeGoals < stats.awayGoals
  if (selection.startsWith('goals-over-')) return stats.homeGoals + stats.awayGoals > Number(selection.slice(11))
  if (selection.startsWith('goals-under-')) return stats.homeGoals + stats.awayGoals < Number(selection.slice(12))
  if (selection.startsWith('corners-over-')) return stats.homeCorners + stats.awayCorners > Number(selection.slice(13))
  if (selection.startsWith('corners-under-')) return stats.homeCorners + stats.awayCorners < Number(selection.slice(14))
  if (selection === 'btts-yes') return stats.homeGoals > 0 && stats.awayGoals > 0
  if (selection === 'btts-no') return stats.homeGoals === 0 || stats.awayGoals === 0
  if (selection === 'half-home') return stats.halfHomeGoals > stats.halfAwayGoals
  if (selection === 'half-draw') return stats.halfHomeGoals === stats.halfAwayGoals
  if (selection === 'half-away') return stats.halfHomeGoals < stats.halfAwayGoals
  if (selection === 'double-1x') return stats.homeGoals >= stats.awayGoals
  if (selection === 'double-12') return stats.homeGoals !== stats.awayGoals
  if (selection === 'double-x2') return stats.homeGoals <= stats.awayGoals
  if (selection === 'home-goals-over') return stats.homeGoals >= 2
  if (selection === 'home-goals-under') return stats.homeGoals < 2
  if (selection === 'away-goals-over') return stats.awayGoals >= 2
  if (selection === 'away-goals-under') return stats.awayGoals < 2
  if (selection === 'cards-over') return stats.homeYellows + stats.awayYellows + stats.homeReds + stats.awayReds > 3.5
  if (selection === 'cards-under') return stats.homeYellows + stats.awayYellows + stats.homeReds + stats.awayReds < 3.5
  if (selection === 'first-home') return stats.firstGoalSide === 'home'
  if (selection === 'first-away') return stats.firstGoalSide === 'away'
  if (selection === 'first-none') return stats.homeGoals + stats.awayGoals === 0
  const score = `${stats.homeGoals}-${stats.awayGoals}`
  return selection.slice(6) === score
}

function recordedStats(fixture: Fixture, clubs: Club[]): MatchStats | null {
  if (fixture.homeGoals === null || fixture.awayGoals === null) return null
  const home = clubs.find((club) => club.id === fixture.home)
  const away = clubs.find((club) => club.id === fixture.away)
  if (!home || !away) return null
  const generated = getMatchStats(createMatchEvents(fixture, home, away), 94)
  return {
    ...generated,
    homeGoals: fixture.homeGoals,
    awayGoals: fixture.awayGoals,
    homeCorners: fixture.homeCorners ?? generated.homeCorners,
    awayCorners: fixture.awayCorners ?? generated.awayCorners,
    homeYellows: fixture.homeYellows ?? generated.homeYellows,
    awayYellows: fixture.awayYellows ?? generated.awayYellows,
    homeReds: fixture.homeReds ?? generated.homeReds,
    awayReds: fixture.awayReds ?? generated.awayReds,
  }
}

function accumulatorResult(bet: Bet, fixtures: Fixture[], clubs: Club[], currentFixtureId: string, currentStats: MatchStats): Bet['status'] | null {
  let allWon = true
  for (const leg of bet.legs) {
    const fixture = fixtures.find((item) => item.id === leg.fixtureId)
    if (!fixture) return 'lost'
    const stats = fixture.id === currentFixtureId ? currentStats : recordedStats(fixture, clubs)
    if (!stats) { allWon = false; continue }
    if (!betWins(leg.selection, stats)) return 'lost'
  }
  return allWon ? 'won' : null
}

function tournamentWinner(fixture: Fixture): string | null {
  if (fixture.homeGoals === null || fixture.awayGoals === null) return null
  if (fixture.homeGoals !== fixture.awayGoals) return fixture.homeGoals > fixture.awayGoals ? fixture.home : fixture.away
  const seed = [...fixture.id].reduce((total, char) => total + char.charCodeAt(0), 0)
  return seed % 2 === 0 ? fixture.home : fixture.away
}

function advanceBracket(fixtures: Fixture[], competition: Competition, completedRound: number): Fixture[] {
  const roundFixtures = fixtures.filter((fixture) => fixture.competition === competition && fixture.round === completedRound)
  if (!roundFixtures.length || roundFixtures.some((fixture) => fixture.homeGoals === null || fixture.awayGoals === null)) return fixtures
  const winners = roundFixtures.map(tournamentWinner)
  if (winners.some((winner) => winner === null)) return fixtures
  const nextRound = completedRound + 1
  const nextFixtures = fixtures.filter((fixture) => fixture.competition === competition && fixture.round === nextRound)
  if (!nextFixtures.length) return fixtures
  const updated = [...fixtures]
  const setTeams = (index: number, home: string, away: string) => {
    const target = updated.findIndex((fixture) => fixture.id === nextFixtures[index]?.id)
    if (target >= 0) updated[target] = { ...updated[target], home, away }
  }
  if (competition === 'cup' && completedRound === 1) {
    winners.forEach((winner, index) => { if (winner) setTeams(index, nextFixtures[index].home, winner) })
  } else if (competition === 'cup' || competition === 'winter') {
    for (let index = 0; index < winners.length; index += 2) {
      if (winners[index] && winners[index + 1]) setTeams(index / 2, winners[index]!, winners[index + 1]!)
    }
  }
  return updated
}

function clockText(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function Crest({ club, large = false }: { club: Club; large?: boolean }) {
  const mark = initials(club.name)
  const motif = [...club.id].reduce((value, char) => value + char.charCodeAt(0), 0) % 3
  const motifs = [
    <path d="M20 14l2 4 4 .6-3 3 .7 4.2-3.7-2-3.7 2 .7-4.2-3-3 4-.6z" />,
    <circle cx="20" cy="21" r="5" />,
    <path d="M16 17h8v8h-8z" />,
  ]
  return <span className={`crest ${large ? 'crest-large' : ''}`} style={{ '--main': club.colors[0], '--ink': club.colors[1] } as CSSProperties} role="img" aria-label={`${club.name} crest`}>
    <svg viewBox="0 0 40 48" aria-hidden="true">
      <path className="crest-shield" d="M4 4h32v24c0 8-7 13-16 17C11 41 4 36 4 28z" />
      <path className="crest-stripe" d={motif === 1 ? 'M9 8h5v25H9zm17 0h5v25h-5z' : 'M8 9h24v4H8zm0 22h24v4H8z'} />
      <g className="crest-motif">{motifs[motif]}</g>
      <text x="20" y="29" textAnchor="middle">{mark}</text>
    </svg>
  </span>
}

function CompetitionMark({ competition }: { competition: Competition }) {
  if (competition === 'league') return <span className="competition-mark league-mark" aria-hidden="true">N</span>
  const Icon = competition === 'cup' ? Trophy : Sparkles
  return <span className={`competition-mark ${competition}-mark`} aria-hidden="true"><Icon size={13} /></span>
}

function App() {
  const [clubs, setClubs] = useState(() => readStorage(CLUBS_KEY, createClubs))
  const [fixtures, setFixtures] = useState(() => scheduleFixtureKickoffs(readStorage(FIXTURES_KEY, () => createFixtures(createClubs()))))
  const [liveMatch, setLiveMatch] = useState<LiveMatch | null>(() => readStorage(LIVE_MATCH_KEY, () => null))
  const [balance, setBalance] = useState(() => readStorage(WALLET_KEY, () => 50000))
  const [bets, setBets] = useState<Bet[]>(readBets)
  const [slip, setSlip] = useState<BetLeg[]>(() => readStorage(BET_SLIP_KEY, () => []))
  const [slipOpen, setSlipOpen] = useState(false)
  const [slipStake, setSlipStake] = useState(MINIMUM_BET)
  const [clockNow, setClockNow] = useState(() => Date.now())
  const [page, setPage] = useState<'overview' | 'fixtures' | 'clubs' | 'bets'>('overview')
  const [competition, setCompetition] = useState<Competition>('league')
  const [round, setRound] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null)
  const [selectedFixtureId, setSelectedFixtureId] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const standings = getStandings(clubs, fixtures)
  const clubMap = new Map(clubs.map((club) => [club.id, club]))
  const nextRound = fixtures.find((fixture) => fixture.competition === 'league' && fixture.homeGoals === null)?.round ?? 38
  const nextFixtures = fixtures.filter((fixture) => fixture.homeGoals === null).sort((a, b) => a.date.localeCompare(b.date))
  const dailyFixture = liveMatch ? fixtures.find((fixture) => fixture.id === liveMatch.fixtureId) : nextFixtures.find((fixture) => fixture.competition === 'league')
  const scheduledKickoff = dailyFixture ? dailyFixture.kickoffAt ?? kickoffInYangon(dailyFixture.date) : null
  const elapsedSeconds = liveMatch ? Math.min(MATCH_DURATION, Math.floor((clockNow - liveMatch.startedAt) / 1000)) : 0
  const matchMinute = liveMatch ? getMatchMinute(elapsedSeconds) : 0
  const matchEvents = dailyFixture ? (() => {
    const home = clubs.find((club) => club.id === dailyFixture.home)
    const away = clubs.find((club) => club.id === dailyFixture.away)
    return home && away ? createMatchEvents(dailyFixture, home, away) : []
  })() : []
  const liveStats = getMatchStats(matchEvents, matchMinute)
  const activeRound = round ?? nextRound
  const seasonStart = fixtures.find((fixture) => fixture.competition === 'league' && fixture.round === 1)?.date ?? dateInYangon(new Date(clockNow))
  const seasonYear = Number(seasonStart.slice(0, 4))
  const seasonLabel = `${seasonYear}/${String((seasonYear + 1) % 100).padStart(2, '0')}`
  const cupKickoff = fixtures.find((fixture) => fixture.competition === 'cup')?.date
  const winterFixtures = fixtures.filter((fixture) => fixture.competition === 'winter').sort((a, b) => a.date.localeCompare(b.date))
  const seasonEnd = fixtures.find((fixture) => fixture.competition === 'league' && fixture.round === 38)?.date ?? seasonStart
  const leagueComplete = fixtures.filter((fixture) => fixture.competition === 'league').every((fixture) => fixture.homeGoals !== null && fixture.awayGoals !== null)
  const cupFinal = fixtures.find((fixture) => fixture.competition === 'cup' && fixture.round === 5)
  const winterFinal = fixtures.find((fixture) => fixture.competition === 'winter' && fixture.round === 2)
  const prizeAwards: PrizeAward[] = [
    { competition: 'league', name: 'NOSH League', trophy: 'The Championship Trophy', honor: 'League Champion', champion: leagueComplete ? standings[0]?.club : undefined, note: 'Awarded to the club finishing top of the 38-day league.' },
    { competition: 'cup', name: 'NOSH Cup', trophy: 'The Knockout Cup', honor: 'Cup Winner', champion: cupFinal ? clubMap.get(tournamentWinner(cupFinal) ?? '') : undefined, note: 'Awarded after the final knockout match.' },
    { competition: 'winter', name: 'Winter Series', trophy: 'The Winter Star', honor: 'Winter Champion', champion: winterFinal ? clubMap.get(tournamentWinner(winterFinal) ?? '') : undefined, note: 'Awarded after the top-four winter final.' },
  ]
  const displayedFixtures = fixtures.filter((fixture) => fixture.competition === competition && (competition !== 'league' || fixture.round === activeRound))
  const selectedClub = selectedClubId ? clubMap.get(selectedClubId) : undefined
  const selectedClubRecords = selectedClub ? clubs.filter((club) => club.id !== selectedClub.id).map((opponent) => {
    const record = fixtures.filter((fixture) => fixture.competition === 'league' && fixture.homeGoals !== null && fixture.awayGoals !== null &&
      ((fixture.home === selectedClub.id && fixture.away === opponent.id) || (fixture.away === selectedClub.id && fixture.home === opponent.id)))
      .reduce((total, fixture) => {
        const isHome = fixture.home === selectedClub.id
        const goalsFor = isHome ? fixture.homeGoals! : fixture.awayGoals!
        const goalsAgainst = isHome ? fixture.awayGoals! : fixture.homeGoals!
        total.played += 1
        total.wins += goalsFor > goalsAgainst ? 1 : 0
        total.draws += goalsFor === goalsAgainst ? 1 : 0
        total.losses += goalsFor < goalsAgainst ? 1 : 0
        total.goalsFor += goalsFor
        total.goalsAgainst += goalsAgainst
        return total
      }, { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 })
    return { opponent, ...record }
  }).sort((a, b) => a.opponent.name.localeCompare(b.opponent.name)) : []
  const selectedClubFixtures = selectedClub ? fixtures.filter((fixture) => fixture.competition === 'league' && (fixture.home === selectedClub.id || fixture.away === selectedClub.id)).sort((a, b) => a.date.localeCompare(b.date)) : []
  const clubRecentFixtures = selectedClubFixtures.filter((fixture) => fixture.homeGoals !== null).slice(-2)
  const clubUpcomingFixtures = selectedClubFixtures.filter((fixture) => fixture.homeGoals === null).slice(0, 3)
  const selectedFixture = selectedFixtureId ? fixtures.find((fixture) => fixture.id === selectedFixtureId) : undefined
  const selectedMatchLive = liveMatch?.fixtureId === selectedFixture?.id
  const selectedHome = selectedFixture ? clubMap.get(selectedFixture.home) : undefined
  const selectedAway = selectedFixture ? clubMap.get(selectedFixture.away) : undefined
  const selectedEvents = selectedFixture && selectedHome && selectedAway ? createMatchEvents(selectedFixture, selectedHome, selectedAway) : []
  const selectedMinute = selectedMatchLive ? matchMinute : selectedFixture?.homeGoals !== null && selectedFixture?.homeGoals !== undefined ? 94 : 0
  const selectedStats = selectedMatchLive || selectedFixture?.homeGoals === null ? getMatchStats(selectedEvents, selectedMinute) : {
    homeGoals: selectedFixture?.homeGoals ?? 0,
    awayGoals: selectedFixture?.awayGoals ?? 0,
    halfHomeGoals: 0,
    halfAwayGoals: 0,
    homeCorners: selectedFixture?.homeCorners ?? 0,
    awayCorners: selectedFixture?.awayCorners ?? 0,
    homeYellows: selectedFixture?.homeYellows ?? 0,
    awayYellows: selectedFixture?.awayYellows ?? 0,
    homeReds: selectedFixture?.homeReds ?? 0,
    awayReds: selectedFixture?.awayReds ?? 0,
    firstGoalSide: null,
  }
  const pricedSlip = slip.map((leg) => {
    const fixture = fixtures.find((item) => item.id === leg.fixtureId)
    if (!fixture) return leg
    const home = clubMap.get(fixture.home)
    const away = clubMap.get(fixture.away)
    if (!home || !away) return leg
    const inPlay = liveMatch?.fixtureId === fixture.id
    const stats = getMatchStats(createMatchEvents(fixture, home, away), inPlay ? matchMinute : 0)
    const option = marketOptions(fixture, inPlay ? matchMinute : 0, stats, clockNow).find((item) => item.selection === leg.selection)
    return option ? { ...leg, odds: option.odds } : leg
  })

  useEffect(() => { localStorage.setItem(CLUBS_KEY, JSON.stringify(clubs)) }, [clubs])
  useEffect(() => { localStorage.setItem(FIXTURES_KEY, JSON.stringify(fixtures)) }, [fixtures])
  useEffect(() => { localStorage.setItem(WALLET_KEY, JSON.stringify(balance)) }, [balance])
  useEffect(() => { localStorage.setItem(BETS_KEY, JSON.stringify(bets)) }, [bets])
  useEffect(() => { localStorage.setItem(BET_SLIP_KEY, JSON.stringify(slip)) }, [slip])
  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    if (liveMatch || !dailyFixture || dailyFixture.homeGoals !== null || scheduledKickoff === null) return
    const hasExactKickoff = dailyFixture.kickoffAt !== undefined
    if ((!hasExactKickoff && dateInYangon(new Date(scheduledKickoff)) !== dateInYangon(new Date(clockNow))) || clockNow < scheduledKickoff) return
    const timer = window.setTimeout(() => setLiveMatch({ fixtureId: dailyFixture.id, startedAt: Math.max(scheduledKickoff, clockNow) }), 0)
    return () => window.clearTimeout(timer)
  }, [liveMatch, dailyFixture, scheduledKickoff, clockNow])
  useEffect(() => {
    if (liveMatch) localStorage.setItem(LIVE_MATCH_KEY, JSON.stringify(liveMatch))
    else localStorage.removeItem(LIVE_MATCH_KEY)
  }, [liveMatch])
  useEffect(() => {
    if (!liveMatch) return
    const timer = window.setInterval(() => {
      const currentTime = Date.now()
      const elapsed = Math.floor((currentTime - liveMatch.startedAt) / 1000)
      if (elapsed < MATCH_DURATION) return
      const fixture = fixtures.find((item) => item.id === liveMatch.fixtureId)
      if (!fixture) { setLiveMatch(null); return }
      const home = clubs.find((club) => club.id === fixture.home)
      const away = clubs.find((club) => club.id === fixture.away)
      if (!home || !away) { setLiveMatch(null); return }
      const finalStats = getMatchStats(createMatchEvents(fixture, home, away), 94)
      const completedFixture = { ...fixture, ...finalStats }
      setFixtures((current) => {
        let updated = current.map((item) => item.id === fixture.id ? completedFixture : item)
        if (fixture.competition === 'league' && updated.filter((item) => item.competition === 'league').every((item) => item.homeGoals !== null && item.awayGoals !== null)) {
          const topFour = getStandings(clubs, updated).slice(0, 4).map((standing) => standing.club.id)
          if (topFour.length === 4) {
            updated = updated.map((item) => item.id === 'winter-semi-1' ? { ...item, home: topFour[0], away: topFour[3] } :
              item.id === 'winter-semi-2' ? { ...item, home: topFour[1], away: topFour[2] } : item)
          }
        }
        return fixture.competition === 'league' ? updated : advanceBracket(updated, fixture.competition, fixture.round)
      })
      const settled = bets.filter((bet) => bet.status === 'open').map((bet) => ({ id: bet.id, status: accumulatorResult(bet, fixtures, clubs, fixture.id, finalStats) })).filter((bet): bet is { id: string; status: 'won' | 'lost' } => bet.status !== null)
      const winnings = settled.reduce((total, result) => {
        const bet = bets.find((item) => item.id === result.id)
        return total + (result.status === 'won' && bet ? Math.round(bet.stake * bet.combinedOdds) : 0)
      }, 0)
      if (winnings) setBalance((current) => current + winnings)
      setBets((current) => current.map((bet) => {
        const result = settled.find((item) => item.id === bet.id)
        return result ? { ...bet, status: result.status, payout: result.status === 'won' ? Math.round(bet.stake * bet.combinedOdds) : 0 } : bet
      }))
      setLiveMatch(null)
      setSelectedFixtureId(fixture.id)
      void Swal.fire({ title: 'Full time', text: 'The AI match report, player stats, and demo picks have been settled.', icon: 'success', confirmButtonText: 'View result' })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [liveMatch, fixtures, clubs, bets])

  function goTo(next: 'overview' | 'fixtures' | 'clubs' | 'bets') {
    setPage(next)
    setMenuOpen(false)
  }

  function startMatch(fixture: Fixture) {
    if (fixture.homeGoals !== null) return
    if (liveMatch) {
      void Swal.fire({ title: 'Another match is live', text: 'Finish the current 10-minute AI match before starting another fixture.', icon: 'info' })
      return
    }
    if (fixture.competition !== 'league') {
      const previousRound = fixtures.filter((item) => item.competition === fixture.competition && item.round === fixture.round - 1)
      const leagueComplete = fixture.competition !== 'winter' || fixtures.filter((item) => item.competition === 'league').every((item) => item.homeGoals !== null && item.awayGoals !== null)
      if (!leagueComplete || (fixture.round > 1 && previousRound.some((item) => item.homeGoals === null || item.awayGoals === null))) {
        void Swal.fire({ title: 'Bracket not ready', text: 'Complete the league or previous knockout round before starting this match.', icon: 'info' })
        return
      }
    }
    setLiveMatch({ fixtureId: fixture.id, startedAt: clockNow })
    setSelectedFixtureId(null)
  }

  function addSlipPick(fixture: Fixture, option: BetOption) {
    if (fixture.homeGoals !== null) return
    if (balance < MINIMUM_BET) {
      void Swal.fire({ title: 'Not enough demo credits', text: `Your balance is ${balance.toLocaleString()} MK. The minimum pick is ${MINIMUM_BET} MK.`, icon: 'warning' })
      return
    }
    setSlip((current) => {
      const existing = current.findIndex((leg) => leg.fixtureId === fixture.id && leg.market === option.market)
      if (existing >= 0 && current[existing].selection === option.selection) return current.filter((_, index) => index !== existing)
      const leg: BetLeg = {
        id: `${fixture.id}-${option.market}-${option.selection}`,
        fixtureId: fixture.id,
        fixtureName: `${clubMap.get(fixture.home)?.name ?? 'Home'} vs ${clubMap.get(fixture.away)?.name ?? 'Away'}`,
        market: option.market,
        marketLabel: option.marketLabel,
        selection: option.selection,
        selectionLabel: option.label,
        odds: option.odds,
      }
      if (existing >= 0) return current.map((item, index) => index === existing ? leg : item)
      if (current.length >= MAX_SLIP_LEGS) {
        void Swal.fire({ title: 'Slip is full', text: `A multi can include up to ${MAX_SLIP_LEGS} selections.`, icon: 'info' })
        return current
      }
      return [...current, leg]
    })
    setSlipOpen(true)
  }

  function removeSlipPick(legId: string) {
    setSlip((current) => current.filter((leg) => leg.id !== legId))
  }

  async function placeBetSlip() {
    if (!pricedSlip.length) return
    if (!Number.isInteger(slipStake) || slipStake < MINIMUM_BET || slipStake > balance) {
      void Swal.fire({ title: 'Check your stake', text: `Enter a whole-number stake from ${MINIMUM_BET} MK to ${balance.toLocaleString()} MK.`, icon: 'warning' })
      return
    }
    const combinedOdds = pricedSlip.reduce((total, leg) => total * leg.odds, 1)
    const createdAt = clockNow
    setBalance((current) => current - slipStake)
    setBets((current) => [{
      id: `${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
      legs: pricedSlip,
      stake: slipStake,
      combinedOdds: Number(combinedOdds.toFixed(2)),
      status: 'open',
      payout: 0,
      createdAt,
    }, ...current])
    setSlip([])
    setSlipOpen(false)
    setSlipStake(MINIMUM_BET)
  }

  async function restartSeason() {
    const result = await Swal.fire({
      title: 'Start a new season?',
      text: 'This starts a fresh daily schedule for all 20 clubs, resets scores and demo bets, and schedules the opening match to auto-start in 30 minutes. You can also start it sooner.',
      icon: 'warning', showCancelButton: true, confirmButtonText: 'Start season', cancelButtonText: 'Keep current season',
    })
    if (!result.isConfirmed) return
    const freshClubs = createClubs()
    const startDate = dateInYangon(new Date())
    const seasonStartedAt = Date.now()
    const openingKickoffAt = seasonStartedAt + 30 * 60 * 1000
    const freshFixtures = scheduleFixtureKickoffs(createFixtures(freshClubs, startDate, seasonStartedAt, openingKickoffAt))
    const openingFixture = freshFixtures.find((fixture) => fixture.competition === 'league' && fixture.round === 1)
    setClubs(freshClubs)
    setFixtures(freshFixtures)
    setLiveMatch(null)
    setBalance(50000)
    setBets([])
    setSlip([])
    setSlipStake(MINIMUM_BET)
    setRound(null)
    setCompetition('league')
    setSelectedClubId(null)
    setSelectedFixtureId(openingFixture?.id ?? null)
    setPage('overview')
    void Swal.fire({ title: 'Season started', text: 'Your new schedule is ready. Matchday 1 begins automatically in 30 minutes, or you can start a match now.', icon: 'success', confirmButtonText: 'View season' })
  }

  const navigation = [
    { id: 'overview' as const, label: 'Overview', icon: Activity },
    { id: 'fixtures' as const, label: 'Fixtures & results', icon: CalendarDays },
    { id: 'clubs' as const, label: 'Clubs & players', icon: Shield },
    { id: 'bets' as const, label: 'My bets', icon: ReceiptText },
  ]

  return (
    <div className="app-shell flex min-h-screen">
      <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
        <button className="brand" onClick={() => goTo('overview')}><span className="brand-mark">N</span><span><b>NOSH</b><small>FOOTBALL LEAGUE</small></span></button>
        <div className="season-select"><i /> SEASON {seasonLabel} <ChevronDown size={14} /></div>
        <p className="nav-caption">LEAGUE OFFICE</p>
        <nav>{navigation.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-link ${page === id ? 'selected' : ''}`} onClick={() => goTo(id)}><Icon size={17} /><span>{label}</span>{id === 'fixtures' && <b>38</b>}</button>)}</nav>
        <hr />
        <p className="nav-caption">COMPETITIONS</p>
        <button className="nav-link" onClick={() => { setCompetition('league'); goTo('fixtures') }}><CompetitionMark competition="league" /><span>NOSH League</span></button>
        <button className="nav-link" onClick={() => { setCompetition('cup'); goTo('fixtures') }}><CompetitionMark competition="cup" /><span>NOSH Cup</span></button>
        <button className="nav-link" onClick={() => { setCompetition('winter'); goTo('fixtures') }}><CompetitionMark competition="winter" /><span>Winter Series</span></button>
        <div className="sidebar-fill" />
        <div className="break-card"><Sparkles size={16} /><span><b>Winter break</b><small>Dec 21 - Jan 9</small></span><i>ON</i></div>
        <button className="help-button" onClick={() => Swal.fire({ title: 'NOSH League', text: 'Twenty clubs. One champion. Your league data is saved in this browser.', icon: 'info', confirmButtonText: 'Got it' })}><CircleHelp size={16} /> League guide</button>
        <button className="manager-row" onClick={() => goTo('bets')}><span>20</span><b>Match bettor<small>All league clubs</small></b><i>MK {balance.toLocaleString()}</i><ArrowUpRight size={16} /></button>
      </aside>
      {menuOpen && <button className="mobile-scrim" aria-label="Close menu" onClick={() => setMenuOpen(false)} />}

      <main className="main-area">
        <header className="topbar"><button className="menu-button icon-button" aria-label="Open menu" onClick={() => setMenuOpen(true)}><Menu size={19} /></button><div className="breadcrumb">{seasonLabel} <ChevronRight size={14} /> <b>{page === 'overview' ? 'League overview' : page === 'fixtures' ? 'Fixtures & results' : page === 'clubs' ? 'Clubs & players' : 'My bets'}</b></div><span className="yangon-clock" aria-label="Current time in Yangon"><Clock3 size={13} /><time>{formatYangonTime(clockNow)} YGN</time></span><span className="season-status"><i /> SEASON IN PROGRESS</span><span className="wallet-chip"><Wallet size={14} /> MK {balance.toLocaleString()}</span><button className="slip-toggle" onClick={() => setSlipOpen(true)}><ReceiptText size={14} /> Slip {slip.length || ''}</button><button className="create-club" onClick={restartSeason}><RotateCcw size={14} /> Start season</button></header>

        {page === 'overview' && <section className="page-content">
          <div className="hero-panel"><div className="hero-copy"><span className="eyebrow"><i /> THE {seasonLabel} SEASON</span><h1>Every match.<br /><em>One champion.</em></h1><p>Twenty clubs. Compare every team and explore every match market.</p><div><button className="lime-button" onClick={() => goTo('fixtures')}>Explore fixtures <ArrowRight size={15} /></button><button className="plain-button" onClick={() => goTo('clubs')}>View all clubs <ArrowUpRight size={14} /></button></div></div><div className="hero-stamp"><small>EST.</small><b>20</b><small>CLUBS</small></div><div className="hero-round"><i /> NEXT MATCHDAY <b>{String(nextRound).padStart(2, '0')}</b></div><div className="hero-foot"><span>THE HOME OF NOSH FOOTBALL</span><span>38 DAILY MATCHDAYS <i /> 20 CLUBS <i /> 1 CHAMPION</span></div></div>
          <div className="section-heading"><div><small>YOUR SEASON, AT A GLANCE</small><h2>League dashboard</h2></div><button className="inline-link" onClick={() => goTo('fixtures')}>Full schedule <ArrowRight size={14} /></button></div>
          <div className="stats-grid"><Stat label="LEAGUE LEADER" icon={<Trophy size={15} />}><div className="stat-main"><Crest club={standings[0].club} /><b>{standings[0].club.name}</b></div><div className="stat-foot"><strong>{standings[0].points} pts</strong><span>after {standings[0].played} matches</span></div></Stat><Stat label="ALL CLUBS" icon={<UsersRound size={15} />}><div className="stat-main numeric"><b>20</b><span>teams</span></div><div className="stat-foot"><strong>Every side in play</strong><button onClick={() => goTo('clubs')}>Open table <ArrowUpRight size={12} /></button></div></Stat><Stat label="NEXT MATCHDAY" icon={<CalendarDays size={15} />}><div className="stat-main numeric"><b>{String(nextRound).padStart(2, '0')}</b><span>of 38</span></div><div className="stat-foot"><strong>{nextFixtures.filter((f) => f.competition === 'league' && f.round === nextRound).length} fixtures</strong><span>all on one day</span></div></Stat><Stat label="CUP NIGHT" icon={<Trophy size={15} />} lime><div className="stat-main numeric"><b>{cupKickoff ? formatDate(cupKickoff) : '--'}</b></div><div className="stat-foot"><strong>NOSH Cup</strong><span>Round of 20 begins</span></div></Stat></div>
          <DailyMatch fixture={dailyFixture} clubMap={clubMap} live={Boolean(liveMatch)} blocked={false} elapsed={elapsedSeconds} minute={matchMinute} phase={matchPhase(elapsedSeconds)} events={matchEvents.filter((event) => event.minute <= matchMinute)} stats={liveStats} balance={balance} bets={bets.filter((bet) => bet.legs.some((leg) => leg.fixtureId === dailyFixture?.id))} slip={slip} now={clockNow} onStart={() => dailyFixture && startMatch(dailyFixture)} onPick={(option) => dailyFixture && addSlipPick(dailyFixture, option)} onOpenBets={() => goTo('bets')} />
          <div className="dashboard-grid"><section className="panel"><PanelHeading kicker="THE RACE FOR THE TITLE" title="NOSH League table" action={() => goTo('clubs')} /><StandingsTable rows={standings.slice(0, 8)} clubMap={clubMap} onSelect={setSelectedClubId} /><button className="panel-link" onClick={() => goTo('clubs')}>View all 20 clubs <ArrowRight size={14} /></button></section><section className="panel"><PanelHeading kicker="UP NEXT" title="Coming up" action={() => goTo('fixtures')} /><div className="fixture-list">{nextFixtures.slice(0, 4).map((fixture) => <FixtureRow key={fixture.id} fixture={fixture} clubMap={clubMap} onClick={() => setSelectedFixtureId(fixture.id)} />)}</div><button className="winter-strip" onClick={() => { setCompetition('winter'); goTo('fixtures') }}><Sparkles size={17} /><span><b>Winter Series</b><small>Winter break · 4 clubs · 3 matches</small></span><ArrowRight size={15} /></button><button className="panel-link" onClick={() => goTo('fixtures')}>All fixtures & results <ArrowRight size={14} /></button></section></div>
          <footer className="page-footer"><span>NOSH LEAGUE · EST. 2025</span><span>MADE FOR THE LOVE OF THE GAME</span></footer>
        </section>}

          {page === 'fixtures' && <section className="page-content subpage">
            <div className="subpage-heading"><div><small>THE ROAD TO GLORY</small><h1>Fixtures <em>& results</em></h1><p>Every kick, every score. Follow the season as it unfolds.</p></div><button className="dark-button" onClick={() => { const next = fixtures.find((fixture) => fixture.competition === competition && fixture.homeGoals === null); if (next) setSelectedFixtureId(next.id) }}><Activity size={15} /> Open next match</button></div>
            <div className="competition-tabs">{(['league', 'cup', 'winter'] as Competition[]).map((item) => <button key={item} className={competition === item ? 'active' : ''} onClick={() => { setCompetition(item); if (item === 'league') setRound(null) }}><CompetitionMark competition={item} />{item === 'league' ? 'NOSH League' : item === 'cup' ? 'NOSH Cup' : 'Winter Series'}<small>{item === 'league' ? '38 DAYS' : item === 'cup' ? 'KNOCKOUT' : '3 MATCHES'}</small></button>)}</div>
            <PrizeShowcase awards={prizeAwards} />
            {competition === 'league' && <div className="round-switch"><button className="icon-button" aria-label="Previous matchday" disabled={activeRound <= 1} onClick={() => setRound(Math.max(1, activeRound - 1))}><ChevronLeft size={17} /></button><span><small>MATCHDAY</small><b>{String(activeRound).padStart(2, '0')}</b><small>of 38</small></span><button className="icon-button" aria-label="Next matchday" disabled={activeRound >= 38} onClick={() => setRound(Math.min(38, activeRound + 1))}><ChevronRight size={17} /></button><button className="current-week" onClick={() => setRound(null)}>Current day</button></div>}
            <div className="fixture-page-grid"><section className="panel"><PanelHeading kicker={competition === 'league' ? `GAME ${String(activeRound).padStart(2, '0')} · ALL MATCHES` : competition === 'cup' ? 'THE ROAD TO THE FINAL' : 'LEAGUE TOP FOUR'} title={competition === 'league' ? 'Match schedule' : competition === 'cup' ? 'NOSH Cup bracket' : 'Winter Series bracket'} /><div className="fixture-current-time"><Clock3 size={14} /><span>YANGON TIME NOW</span><b>{formatYangonTime(clockNow)} YGN</b></div>{competition === 'league' ? <div className="fixture-list large-list">{displayedFixtures.map((fixture) => <FixtureRow key={fixture.id} fixture={fixture} clubMap={clubMap} onClick={() => setSelectedFixtureId(fixture.id)} large />)}</div> : <TournamentBracket fixtures={displayedFixtures} clubMap={clubMap} onSelect={setSelectedFixtureId} /> }<p className="score-hint"><i /> All ten league fixtures share this date. Open a match for live markets, full-time score, and match report.</p></section>
              <aside><section className="panel season-card"><small>THE SEASON</small><h2>{seasonYear} <i>/</i> {String((seasonYear + 1) % 100).padStart(2, '0')}</h2><div className="progress"><i style={{ width: `${Math.min(100, Math.round((nextRound - 1) / 38 * 100))}%` }} /></div><SeasonDate label="SEASON KICK-OFF" date={formatSeasonDate(seasonStart)} /><SeasonDate label="WINTER SERIES" date={`${winterFixtures[0] ? formatDate(winterFixtures[0].date) : '--'} - ${winterFixtures.at(-1) ? formatDate(winterFixtures.at(-1)!.date) : '--'}`} /><SeasonDate label="FINAL MATCHDAY" date={formatSeasonDate(seasonEnd)} /></section><section className="winter-card"><Sparkles size={17} /><small>MID-SEASON SPECIAL</small><h2>Winter<br />Series</h2><p>Three matches. Four invited clubs. One winter champion.</p><button onClick={() => setCompetition('winter')}>See the fixtures <ArrowRight size={14} /></button></section></aside></div>
          </section>}

        {page === 'clubs' && <section className="page-content subpage"><div className="subpage-heading clubs-heading"><div><small>20 CLUBS. ONE LEAGUE.</small><h1>Clubs <em>& players</em></h1><p>Choose any row to open the club profile and head-to-head record.</p></div><label className="search-box"><Search size={15} /><input placeholder="Search clubs or cities" value={search} onChange={(event) => setSearch(event.target.value)} /><span>/</span></label></div><section className="panel club-table-panel"><PanelHeading kicker={`${standings.filter(({ club }) => `${club.name} ${club.city}`.toLowerCase().includes(search.toLowerCase())).length} CLUBS`} title="League standings" /><StandingsTable rows={standings.filter(({ club }) => `${club.name} ${club.city}`.toLowerCase().includes(search.toLowerCase()))} clubMap={clubMap} onSelect={setSelectedClubId} /></section></section>}
        {page === 'bets' && <section className="page-content subpage bets-page"><div className="subpage-heading"><div><small>YOUR PROFILE</small><h1>Wallet <em>& bet history</em></h1><p>Demo credits only. No deposits, withdrawals, or real-money betting.</p></div><span className="demo-chip">VIRTUAL MK</span></div><div className="wallet-overview"><span><Wallet size={19} /><small>AVAILABLE BALANCE</small><strong>MK {balance.toLocaleString()}</strong></span><span><ReceiptText size={18} /><small>TOTAL PICKS</small><strong>{bets.length}</strong></span><span><Activity size={18} /><small>OPEN PICKS</small><strong>{bets.filter((bet) => bet.status === 'open').length}</strong></span></div><section className="panel bet-history-panel"><PanelHeading kicker="YOUR MATCH PICKS" title="Bet history" />{bets.length === 0 ? <div className="empty-bets"><ReceiptText size={25} /><b>No picks yet</b><span>Choose an outcome from the daily match to add a demo pick.</span><button className="dark-button" onClick={() => goTo('overview')}>Go to today's match <ArrowRight size={14} /></button></div> : <div className="bet-history-list">{bets.map((bet) => { const firstLeg = bet.legs[0]; const fixture = firstLeg ? fixtures.find((item) => item.id === firstLeg.fixtureId) : undefined; const home = fixture ? clubMap.get(fixture.home) : undefined; const away = fixture ? clubMap.get(fixture.away) : undefined; const selections = bet.legs.map((leg) => `${leg.fixtureName}: ${leg.selectionLabel} @ ${leg.odds.toFixed(2)}`).join(' · '); return <article className="bet-history-row" key={bet.id}><div className="bet-market-info"><span className={`bet-status bet-${bet.status}`}>{bet.status}</span><b>{bet.legs.length > 1 ? `${bet.legs.length}-pick multi` : firstLeg?.marketLabel ?? 'Match pick'}</b><small>{selections}</small></div><div className="bet-event-info"><b>{home?.name ?? firstLeg?.fixtureName ?? 'NOSH League'}{bet.legs.length === 1 ? ` vs ${away?.name ?? 'Match'}` : ''}</b><small>{fixture ? formatDate(fixture.date) : 'Previous season'}</small></div><div className="bet-stake-info"><small>STAKE</small><b>MK {bet.stake.toLocaleString()}</b></div><div className="bet-return-info"><small>{bet.status === 'open' ? 'POSSIBLE RETURN' : 'PAYOUT'}</small><b>{bet.status === 'lost' ? 'MK 0' : `MK ${(bet.status === 'won' ? bet.payout : Math.round(bet.stake * bet.combinedOdds)).toLocaleString()}`}</b></div></article> })}</div>}</section></section>}
      </main>

      {slipOpen && <div className="slip-backdrop" onClick={() => setSlipOpen(false)}><section className="slip-dialog" role="dialog" aria-modal="true" aria-labelledby="slip-title" onClick={(event) => event.stopPropagation()}><header className="slip-dialog-head"><span><small>VIRTUAL BET SLIP</small><b id="slip-title">Your selections <i>{pricedSlip.length}</i></b></span><button className="icon-button" aria-label="Close bet slip" onClick={() => setSlipOpen(false)}><X size={18} /></button></header>{pricedSlip.length === 0 ? <div className="slip-empty"><ReceiptText size={25} /><b>Your slip is empty</b><span>Choose an outcome from a match market to add a selection.</span></div> : <><div className="slip-selections">{pricedSlip.map((leg) => <article className="slip-selection" key={leg.id}><span><small>{leg.fixtureName} · {leg.marketLabel}</small><b>{leg.selectionLabel}</b></span><strong>{leg.odds.toFixed(2)}</strong><button aria-label={`Remove ${leg.selectionLabel}`} onClick={() => removeSlipPick(leg.id)}><X size={15} /></button></article>)}</div><div className="slip-summary"><span>Combined odds <b>{pricedSlip.reduce((total, leg) => total * leg.odds, 1).toFixed(2)}</b></span><label>Stake · MK<input type="number" min={MINIMUM_BET} max={balance} step="100" value={slipStake} onChange={(event) => setSlipStake(Number(event.target.value))} /></label><small>Possible return · MK {Math.round(slipStake * pricedSlip.reduce((total, leg) => total * leg.odds, 1)).toLocaleString()} · Balance MK {balance.toLocaleString()}</small><button className="place-slip-button" onClick={() => void placeBetSlip()}>Place virtual pick{pricedSlip.length > 1 ? ' multi' : ''}</button></div></>}</section></div>}
      {selectedClub && <div className="drawer-backdrop" onClick={() => setSelectedClubId(null)}><aside className="team-drawer" onClick={(event) => event.stopPropagation()}><div className="drawer-head"><small>CLUB PROFILE</small><button className="icon-button" aria-label="Close profile" onClick={() => setSelectedClubId(null)}><X size={18} /></button></div><div className="drawer-title"><Crest club={selectedClub} large /><span><b>{selectedClub.name}</b><small>{selectedClub.nickname}</small></span></div><div className="club-facts"><span><MapPin size={14} /> {selectedClub.ground}</span><span><UsersRound size={14} /> {selectedClub.city}</span><span><Clock3 size={14} /> Est. {selectedClub.founded}</span></div><div className="drawer-stats"><span><small>POSITION</small><b>#{standings.findIndex((entry) => entry.club.id === selectedClub.id) + 1}</b></span><span><small>POINTS</small><b>{standings.find((entry) => entry.club.id === selectedClub.id)?.points}</b></span><span><small>SQUAD</small><b>{selectedClub.players.length}</b></span></div><div className="club-fixtures-heading"><span><small>BET MARKETS</small><b>{selectedClub.name} fixtures</b></span><button onClick={() => { setSelectedClubId(null); goTo('fixtures') }}>All fixtures <ArrowRight size={12} /></button></div><div className="club-fixture-list">{[...clubRecentFixtures, ...clubUpcomingFixtures].map((fixture) => <FixtureRow key={fixture.id} fixture={fixture} clubMap={clubMap} onClick={() => { setSelectedClubId(null); setSelectedFixtureId(fixture.id) }} />)}</div><div className="h2h-heading"><span><small>LEAGUE RIVAL RECORDS</small><b>Head-to-head</b></span><small>W · D · L</small></div><div className="h2h-table-wrap"><table className="h2h-table"><thead><tr><th>OPPONENT</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GF-GA</th></tr></thead><tbody>{selectedClubRecords.map((record) => <tr key={record.opponent.id}><td><span className="table-team"><Crest club={record.opponent} /><b>{record.opponent.name}</b></span></td><td>{record.played}</td><td>{record.wins}</td><td>{record.draws}</td><td>{record.losses}</td><td>{record.goalsFor}-{record.goalsAgainst}</td></tr>)}</tbody></table></div><div className="squad-title"><span><small>FIRST TEAM</small><b>Squad list</b></span><small>18 PLAYERS</small></div><div className="squad-list">{selectedClub.players.map((player) => <div className="player-row" key={player.number}><span>{String(player.number).padStart(2, '0')}</span><i>{player.position}</i><b>{player.name}</b><small>{player.age}</small><small>{player.country}</small></div>)}</div></aside></div>}
      {selectedFixture && <div className="match-drawer-backdrop" onClick={() => setSelectedFixtureId(null)}><section className="match-drawer" onClick={(event) => event.stopPropagation()}><header className="match-drawer-heading"><span><small>{selectedFixture.competition === 'league' ? 'NOSH LEAGUE' : selectedFixture.competition === 'cup' ? 'NOSH CUP' : 'WINTER SERIES'} · {selectedFixture.roundName}</small><b>{selectedHome?.name} vs {selectedAway?.name}</b></span><button className="icon-button" aria-label="Close match center" onClick={() => setSelectedFixtureId(null)}><X size={18} /></button></header><DailyMatch fixture={selectedFixture} clubMap={clubMap} live={Boolean(selectedMatchLive)} blocked={Boolean(liveMatch && !selectedMatchLive)} elapsed={selectedMatchLive ? elapsedSeconds : 0} minute={selectedMinute} phase={selectedMatchLive ? matchPhase(elapsedSeconds) : selectedFixture.homeGoals !== null ? 'FULL TIME' : 'PRE-MATCH'} events={selectedEvents.filter((event) => event.minute <= selectedMinute)} stats={selectedStats} balance={balance} bets={bets.filter((bet) => bet.legs.some((leg) => leg.fixtureId === selectedFixture.id))} slip={slip} now={clockNow} onStart={() => startMatch(selectedFixture)} onPick={(option) => addSlipPick(selectedFixture, option)} onOpenBets={() => { setSelectedFixtureId(null); goTo('bets') }} /></section></div>}
    </div>
  )
}

function Stat({ label, icon, children, lime = false }: { label: string; icon: React.ReactNode; children: React.ReactNode; lime?: boolean }) {
  return <article className={`stat-card ${lime ? 'stat-lime' : ''}`}><div className="stat-label">{label}{icon}</div>{children}</article>
}

function PanelHeading({ kicker, title, action }: { kicker: string; title: string; action?: () => void }) {
  return <header className="panel-heading"><div><small>{kicker}</small><h2>{title}</h2></div>{action && <button className="icon-button" aria-label={`Open ${title}`} onClick={action}><ArrowUpRight size={16} /></button>}</header>
}

function StandingsTable({ rows, clubMap, onSelect }: { rows: Standing[]; clubMap: Map<string, Club>; onSelect: (id: string) => void }) {
  return <div className="table-scroll"><table className="standings-table"><thead><tr><th>POS</th><th>CLUB</th><th>P</th><th>W</th><th>D</th><th>L</th><th className="hide-small">GD</th><th>PTS</th><th className="form-column">FORM</th></tr></thead><tbody>{rows.map((entry, index) => <tr key={entry.club.id} onClick={() => onSelect(entry.club.id)}><td className={index === 0 ? 'leader-number' : ''}>{String(index + 1).padStart(2, '0')}</td><td><span className="table-team"><Crest club={clubMap.get(entry.club.id)!} /><b>{entry.club.name}</b></span></td><td>{entry.played}</td><td>{entry.won}</td><td>{entry.drawn}</td><td>{entry.lost}</td><td className="hide-small">{entry.goalsFor - entry.goalsAgainst > 0 ? '+' : ''}{entry.goalsFor - entry.goalsAgainst}</td><td className="points">{entry.points}</td><td className="form-column"><span className="form-dots">{entry.form.map((value, i) => <i key={i} className={`form-${value.toLowerCase()}`} title={value} />)}</span></td></tr>)}</tbody></table></div>
}

function FixtureRow({ fixture, clubMap, onClick, large = false }: { fixture: Fixture; clubMap: Map<string, Club>; onClick: () => void; large?: boolean }) {
  const home = clubMap.get(fixture.home)
  const away = clubMap.get(fixture.away)
  if (!home || !away) return null
  const played = fixture.homeGoals !== null && fixture.awayGoals !== null
  const kickoffAt = fixture.kickoffAt ?? kickoffInYangon(fixture.date)
  const kickoffTime = formatYangonTime(kickoffAt)
  return <button className={`fixture-row ${large ? 'fixture-row-large' : ''}`} onClick={onClick}><div className="fixture-date"><b>{formatDate(fixture.date)}</b><small>{played ? 'FULL TIME' : `KICK-OFF · ${kickoffTime} YGN`}</small></div><div className="fixture-teams"><span><Crest club={home} /><b>{home.name}</b></span><span><Crest club={away} /><b>{away.name}</b></span></div><span className={`fixture-score ${played ? 'played' : ''}`}>{played ? <><b>{fixture.homeGoals}</b> - <b>{fixture.awayGoals}</b></> : 'VS'}</span><ArrowRight className="fixture-arrow" size={14} /></button>
}

function TournamentBracket({ fixtures, clubMap, onSelect }: { fixtures: Fixture[]; clubMap: Map<string, Club>; onSelect: (id: string) => void }) {
  const rounds = [...new Set(fixtures.map((fixture) => fixture.round))].sort((a, b) => a - b)
  return <div className="bracket-scroll"><div className="bracket-board">{rounds.map((round) => {
    const roundFixtures = fixtures.filter((fixture) => fixture.round === round)
    return <section className="bracket-round" key={round}><header><small>ROUND {String(round).padStart(2, '0')}</small><b>{roundFixtures[0]?.roundName.replace('Winter Series · ', '')}</b></header><div className="bracket-games">{roundFixtures.map((fixture) => {
      const home = clubMap.get(fixture.home)
      const away = clubMap.get(fixture.away)
      const complete = fixture.homeGoals !== null && fixture.awayGoals !== null
      const winner = complete ? tournamentWinner(fixture) : null
      const ready = Boolean(home && away)
      return <button className={`bracket-game ${complete ? 'bracket-complete' : ''}`} key={fixture.id} disabled={!ready} onClick={() => onSelect(fixture.id)}>
        {[{ club: home, id: fixture.home, score: fixture.homeGoals }, { club: away, id: fixture.away, score: fixture.awayGoals }].map((side, index) => <span className={`bracket-team ${winner === side.id ? 'bracket-winner' : ''}`} key={`${fixture.id}-${index}`}><span className="bracket-team-name">{side.club ? <Crest club={side.club} /> : <i className="bracket-tbd" />}<b>{side.club?.name ?? 'To be decided'}</b></span><strong>{complete ? side.score : '·'}</strong></span>)}
        <small>{complete ? 'FULL TIME' : ready ? 'VIEW MATCH' : 'AWAITING QUALIFIER'}</small>
      </button>
    })}</div></section>
  })}</div></div>
}

type PrizeAward = {
  competition: Competition
  name: string
  trophy: string
  honor: string
  champion: Club | undefined
  note: string
}

function PrizeShowcase({ awards }: { awards: PrizeAward[] }) {
  return <section className="prize-showcase" aria-label="Competition prizes">
    <header className="prize-showcase-heading"><span><small>THE HONOURS</small><b>What the champions win</b></span><i>VIRTUAL SEASON AWARDS</i></header>
    <div className="prize-grid">{awards.map((award, index) => <article className={`prize-card prize-${award.competition}`} key={award.competition}>
      <div className="prize-art" aria-hidden="true"><span className="prize-orbit" /><Trophy size={34} strokeWidth={1.7} /><i>{String(index + 1).padStart(2, '0')}</i></div>
      <div className="prize-copy"><small>{award.name.toUpperCase()}</small><h3>{award.trophy}</h3><span className="prize-honor">{award.honor}</span><p>{award.note}</p>
        <div className={`prize-winner ${award.champion ? 'prize-awarded' : ''}`}>{award.champion ? <><Crest club={award.champion} /><span><small>AWARDED TO</small><b>{award.champion.name}</b></span></> : <><span className="prize-pending-mark"><Trophy size={12} /></span><span><small>PRIZE STATUS</small><b>To be decided</b></span></>}</div>
      </div>
    </article>)}</div>
  </section>
}

function DailyMatch({ fixture, clubMap, live, blocked, elapsed, minute, phase, events, stats, balance, bets, slip, now, onStart, onPick, onOpenBets }: {
  fixture: Fixture | undefined
  clubMap: Map<string, Club>
  live: boolean
  blocked: boolean
  elapsed: number
  minute: number
  phase: string
  events: MatchEvent[]
  stats: MatchStats
  balance: number
  bets: Bet[]
  slip: BetLeg[]
  now: number
  onStart: () => void
  onPick: (option: BetOption) => void
  onOpenBets: () => void
}) {
  const [selectedMarket, setSelectedMarket] = useState<BetMarket>('result')
  const home = fixture ? clubMap.get(fixture.home) : undefined
  const away = fixture ? clubMap.get(fixture.away) : undefined
  if (!fixture || !home || !away) return <section className="daily-panel daily-finished"><Trophy size={20} /><div><small>DAILY MATCH</small><h2>Season complete</h2><p>Start a new season to play the next daily match.</p></div></section>
  const options = marketOptions(fixture, live ? minute : 0, stats, now).filter((option) => option.market === selectedMarket)
  const marketLabels: Record<BetMarket, string> = {
    result: 'Match result', goals: 'Total goals', corners: 'Total corners', btts: 'Both teams to score',
    'half-result': 'Half-time result', 'double-chance': 'Double chance', 'team-goals': 'Team goals', cards: 'Total cards',
    'first-goal': 'First team to score', 'correct-score': 'Correct score',
  }
  const competitionLabel = fixture.competition === 'league' ? 'NOSH LEAGUE' : fixture.competition === 'cup' ? 'NOSH CUP' : 'WINTER SERIES'
  const visibleEvents = [...events].reverse()
  const fullTime = fixture.homeGoals !== null && fixture.awayGoals !== null
  const minuteLabel = minute > 90 ? `90+${minute - 90}'` : `${minute}'`
  const kickoffAt = fixture.kickoffAt ?? kickoffInYangon(fixture.date)
  const kickoffTime = formatYangonTime(kickoffAt)
  const kickoffWait = Math.max(0, Math.ceil((kickoffAt - now) / 1000))
  const kickoffCountdown = `${String(Math.floor(kickoffWait / 3600)).padStart(2, '0')}:${String(Math.floor(kickoffWait % 3600 / 60)).padStart(2, '0')}:${String(kickoffWait % 60).padStart(2, '0')}`
  return <section className="daily-panel">
    <div className="daily-left-column">
      <div className="daily-match-main">
        <header className="daily-heading"><span><small>{live ? `LIVE ${competitionLabel} · SIMULATED MATCH` : `${competitionLabel} · SIMULATED MATCH`}</small><b>{formatDate(fixture.date)} · KICK-OFF {kickoffTime} YGN · {competitionLabel}</b></span><span className={`match-status ${live ? 'status-live' : ''}`}><i /> {live ? phase : fixture.homeGoals !== null ? 'FULL TIME' : now < kickoffAt ? `AUTO KICK-OFF IN ${kickoffCountdown}` : 'AUTO KICK-OFF SCHEDULED'}</span></header>
        <div className="daily-scoreboard"><div className="daily-team"><Crest club={home} large /><b>{home.name}</b></div><div className="daily-score-center"><strong>{live || fixture.homeGoals !== null ? `${stats.homeGoals} - ${stats.awayGoals}` : 'VS'}</strong><span>{live ? `${minuteLabel} · ${clockText(MATCH_DURATION - elapsed)} LEFT` : fixture.homeGoals !== null ? 'FULL-TIME SCORE' : '90 MIN · 10 REAL MIN'}</span></div><div className="daily-team"><Crest club={away} large /><b>{away.name}</b></div></div>
        {live && <div className="match-progress"><i style={{ width: `${Math.min(100, elapsed / MATCH_DURATION * 100)}%` }} /></div>}
        <div className="live-stats" aria-label="Match statistics">
          <div className="live-stat-row live-stat-heading"><span>STAT</span><b>{home.name}</b><b>{away.name}</b></div>
          <div className="live-stat-row"><span>Goals</span><b>{stats.homeGoals}</b><b>{stats.awayGoals}</b></div>
          <div className="live-stat-row"><span>Corners</span><b>{stats.homeCorners}</b><b>{stats.awayCorners}</b></div>
          <div className="live-stat-row"><span>Yellow cards</span><b>{stats.homeYellows}</b><b>{stats.awayYellows}</b></div>
          <div className="live-stat-row"><span>Red cards</span><b>{stats.homeReds}</b><b>{stats.awayReds}</b></div>
          <div className="live-clock-row"><span>{live ? 'LIVE MATCH CLOCK' : fullTime ? 'MATCH STATUS' : 'MATCH LENGTH'}</span><b>{live ? `${minuteLabel} · ${clockText(MATCH_DURATION - elapsed)} remaining` : fullTime ? 'FULL TIME · 90:00' : '90 minutes · 10 minutes real time'}</b></div>
        </div>
        <button className="start-match-button" disabled={live || blocked || fixture.homeGoals !== null} onClick={onStart}>{live ? <><span className="pulse-dot" /> Match in progress</> : blocked ? 'Another match is live' : fixture.homeGoals !== null ? 'Full time' : <><Activity size={15} /> Start match now</>}</button>
      </div>
      <section className="match-detail-panel">
        <section className="detail-section">
          <header className="detail-section-heading"><span><small>{live ? 'LIVE COMMENTARY' : fullTime ? 'FULL-TIME REPORT' : 'MATCH COMMENTARY'}</small><b>Match events</b></span><i>{visibleEvents.length} EVENTS</i></header>
          <div className="event-feed">{visibleEvents.length ? visibleEvents.map((event, index) => {
            const eventScore = getMatchStats(events, event.minute)
            return <div className={`event-row event-${event.kind}`} key={`${event.minute}-${event.side}-${event.kind}-${index}`}><time>{event.minute > 90 ? `90+${event.minute - 90}'` : `${event.minute}'`}</time><i>{event.kind === 'goal' ? 'G' : event.kind === 'corner' ? 'C' : event.kind === 'yellow' ? 'Y' : event.kind === 'red' ? 'R' : 'S'}</i><span><b>{event.kind === 'goal' ? `${event.player.name} · GOAL` : event.player.name}</b><small>{event.detail} · {event.side === 'home' ? home.name : away.name} · {event.player.position}</small></span><em>{eventScore.homeGoals}-{eventScore.awayGoals}</em></div>
          }) : <p className="event-empty">{live ? 'Kick-off. Commentary will appear here as the match plays.' : fullTime ? 'No match events were recorded.' : 'Start the match to follow goals, corners, cards, and substitutions.'}</p>}</div>
        </section>
        <section className="detail-section lineup-section">
          <header className="detail-section-heading"><span><small>TEAM SHEETS</small><b>Players & lineups</b></span><i>STARTING XI · SQUADS</i></header>
          <div className="lineup-grid">{[home, away].map((club) => <div className="lineup-team" key={club.id}><header><Crest club={club} /><b>{club.name}</b><small>{club.players.length} PLAYERS</small></header><div className="lineup-column-labels"><span>NO.</span><span>POS</span><span>PLAYER</span><span>ROLE</span></div>{club.players.map((player, index) => <div className={`lineup-player ${index >= 11 ? 'lineup-substitute' : ''}`} key={player.number}><span>{String(player.number).padStart(2, '0')}</span><i>{player.position}</i><b>{player.name}</b><small>{index < 11 ? 'STARTER' : 'SUB'}</small></div>)}</div>)}</div>
        </section>
      </section>
    </div>
    <aside className="odds-panel"><header><span><small>{live ? 'LIVE MARKETS · UPDATED EACH SECOND' : 'PRE-MATCH MARKETS · LIVE PRICING'}</small><b>{marketLabels[selectedMarket]}</b></span><span className="demo-chip">{live ? 'IN PLAY' : 'VIRTUAL MK'}</span></header><div className="market-tabs">{([{ id: 'result', label: '1X2' }, { id: 'double-chance', label: 'Double' }, { id: 'half-result', label: 'Half' }, { id: 'goals', label: 'Goals' }, { id: 'team-goals', label: 'Team' }, { id: 'corners', label: 'Corners' }, { id: 'cards', label: 'Cards' }, { id: 'btts', label: 'BTTS' }, { id: 'first-goal', label: 'First goal' }, { id: 'correct-score', label: 'Exact' }] as { id: BetMarket; label: string }[]).map((tab) => <button key={tab.id} className={selectedMarket === tab.id ? 'active' : ''} onClick={() => setSelectedMarket(tab.id)}>{tab.label}</button>)}</div><div className="odds-options">{options.map((option) => { const selected = slip.some((leg) => leg.fixtureId === fixture.id && leg.selection === option.selection); return <button key={option.selection} className={selected ? 'odds-selected' : ''} disabled={fixture.homeGoals !== null || balance < MINIMUM_BET} onClick={() => onPick(option)} title={`${option.label} @ ${option.odds.toFixed(2)}${selected ? ' · click to remove' : ' · add to multi slip'}`}><span>{option.market === 'result' ? option.selection === 'home' ? '1' : option.selection === 'draw' ? 'X' : '2' : option.label.startsWith('Over') ? 'O' : option.label.startsWith('Under') ? 'U' : option.label === 'Yes' ? 'Y' : option.label === 'No' ? 'N' : option.label}</span><small>{option.label}</small><b>{option.odds.toFixed(2)}</b></button> })}</div><p className="demo-note">MK {balance.toLocaleString()} available · Min MK {MINIMUM_BET} · Virtual picks only{live ? ' · In-play picks accepted' : ''}.</p><button className="view-bets-link" onClick={onOpenBets}>Bet history ({bets.length}) <ArrowRight size={13} /></button>{bets.slice(0, 2).map((bet) => <p className={`prediction-receipt receipt-${bet.status}`} key={bet.id}><b>{bet.status.toUpperCase()}</b><span>{bet.legs.length} leg{bet.legs.length === 1 ? '' : 's'} · MK {bet.stake.toLocaleString()}</span></p>)}</aside>
  </section>
}

function SeasonDate({ label, date }: { label: string; date: string }) {
  const year = new Date().getFullYear()
  const currentDate = date.replace('2025', String(year)).replace('2026', String(year + 1))
  return <div className="season-date"><small>{label}</small><b>{currentDate}</b></div>
}

export default App
