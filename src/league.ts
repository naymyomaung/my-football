export type Player = {
  name: string
  position: string
  number: number
  age: number
  country: string
}

export type Club = {
  id: string
  name: string
  city: string
  nickname: string
  ground: string
  founded: number
  colors: [string, string]
  players: Player[]
}

export type Competition = 'league' | 'cup' | 'winter'

export type Fixture = {
  id: string
  competition: Competition
  round: number
  roundName: string
  home: string
  away: string
  date: string
  kickoffAt?: number
  homeGoals: number | null
  awayGoals: number | null
  homeCorners?: number
  awayCorners?: number
  homeYellows?: number
  awayYellows?: number
  homeReds?: number
  awayReds?: number
}

export type Standing = {
  club: Club
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  points: number
  form: string[]
}

const seeds = [
  ['nosh-united', 'NOSH United', 'Northbridge', 'The Founders', 'Founders Park', 1908, '#d6ff3f', '#15382a'],
  ['harbor-city', 'Harbor City', 'Harbor City', 'The Mariners', 'Harbor Ground', 1897, '#20a6a6', '#12383b'],
  ['redmont-fc', 'Redmont FC', 'Redmont', 'The Reds', 'Redmont Stadium', 1889, '#e44b49', '#7d2728'],
  ['eastvale-athletic', 'Eastvale Athletic', 'Eastvale', 'The Vale', 'Eastvale Lane', 1912, '#f2c94c', '#343b46'],
  ['northcastle', 'Northcastle', 'Northcastle', 'The Magpies', 'Castlefield', 1894, '#d9dde1', '#222a32'],
  ['westford-rovers', 'Westford Rovers', 'Westford', 'The Rovers', 'Riverside Park', 1901, '#ed6b37', '#25372d'],
  ['oldchester', 'Oldchester Town', 'Oldchester', 'The Town', 'Oldchester Common', 1886, '#9177c7', '#2c2348'],
  ['lakeside', 'Lakeside FC', 'Lakeside', 'The Lakers', 'Lakeview Stadium', 1920, '#68addb', '#1d3655'],
  ['ironbridge', 'Ironbridge United', 'Ironbridge', 'The Irons', 'Foundry Ground', 1899, '#bd7650', '#34312b'],
  ['southport', 'Southport Albion', 'Southport', 'The Seagulls', 'Southport Arena', 1904, '#f2f1e7', '#355b83'],
  ['ashbourne', 'Ashbourne City', 'Ashbourne', 'The Oaks', 'Oakfield', 1911, '#3eaa76', '#174c3d'],
  ['kingsmere', 'Kingsmere FC', 'Kingsmere', 'The Royals', 'Kingsmere Park', 1878, '#74a3e4', '#23345e'],
  ['brighton-hill', 'Brighton Hill', 'Brighton Hill', 'The Beacon', 'Beacon Ground', 1907, '#e5c148', '#315888'],
  ['millhaven', 'Millhaven Athletic', 'Millhaven', 'The Millers', 'Millbank Stadium', 1892, '#f17460', '#5a3030'],
  ['redcliffe', 'Redcliffe Rovers', 'Redcliffe', 'The Cliff', 'Redcliffe Park', 1922, '#779562', '#2a3c30'],
  ['stormwich', 'Stormwich FC', 'Stormwich', 'The Storm', 'Tempest Stadium', 1906, '#7787b6', '#26304c'],
  ['goldenford', 'Goldenford', 'Goldenford', 'The Gold', 'Goldsmiths Ground', 1882, '#e4b947', '#634827'],
  ['newborough', 'Newborough United', 'Newborough', 'The Borough', 'Borough Lane', 1918, '#d989b5', '#482d48'],
  ['woodgate', 'Woodgate Town', 'Woodgate', 'The Foxes', 'Woodgate Field', 1895, '#d99743', '#4b3529'],
  ['moorfield', 'Moorfield FC', 'Moorfield', 'The Moor', 'Moorfield Park', 1903, '#809985', '#31463c'],
] as const

function currentYangonDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Yangon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

const firstNames = ['Elliot', 'Noah', 'Jude', 'Callum', 'Mason', 'Oscar', 'Theo', 'Rory', 'Isaac', 'Finn', 'Leo', 'Aiden', 'Max', 'Reuben', 'Toby', 'Harry', 'Jamie', 'Arlo', 'Ethan', 'Alfie']
const lastNames = ['Bennett', 'Clarke', 'Foster', 'Hayes', 'Miller', 'Parker', 'Reed', 'Shaw', 'Turner', 'Walker', 'Brooks', 'Carter', 'Ellis', 'Griffiths', 'Morgan', 'Price', 'Watson', 'Hughes', 'Ward', 'Young']
const positions = ['GK', 'RB', 'CB', 'CB', 'LB', 'DM', 'CM', 'CM', 'AM', 'RW', 'ST', 'LW']
const countries = ['ENG', 'SCO', 'WAL', 'IRL', 'FRA', 'ESP', 'NED', 'GHA']

function makePlayers(seed: number): Player[] {
  return Array.from({ length: 18 }, (_, index) => ({
    name: `${firstNames[(index * 3 + seed) % firstNames.length]} ${lastNames[(index * 7 + seed * 2) % lastNames.length]}`,
    position: positions[index % positions.length],
    number: index < 11 ? index + 1 : index + 3,
    age: 19 + ((index * 5 + seed) % 14),
    country: countries[(index + seed) % countries.length],
  }))
}

export function createClubs(): Club[] {
  return seeds.map(([id, name, city, nickname, ground, founded, primary, secondary], index) => ({
    id, name, city, nickname, ground, founded,
    colors: [primary, secondary],
    players: makePlayers(index),
  }))
}

function matchDate(startDate: string, round: number) {
  const date = new Date(`${startDate}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + round - 1)
  return date.toISOString().slice(0, 10)
}

function dayDate(startDate: string, dayOffset: number) {
  const start = new Date(`${startDate}T12:00:00Z`)
  start.setUTCDate(start.getUTCDate() + dayOffset)
  return start.toISOString().slice(0, 10)
}

function shuffleClubs(clubs: Club[], seed: number) {
  const shuffled = [...clubs]
  let state = seed >>> 0 || 1
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    state = (state * 1664525 + 1013904223) >>> 0
    const swapIndex = state % (index + 1)
    const current = shuffled[index]
    shuffled[index] = shuffled[swapIndex]
    shuffled[swapIndex] = current
  }
  return shuffled
}

function createLeagueFixtures(clubs: Club[], startDate: string): Fixture[] {
  const ids = clubs.map(({ id }) => id)
  let rotation = [...ids]
  const firstLeg: Fixture[] = []
  for (let round = 0; round < 19; round += 1) {
    for (let match = 0; match < 10; match += 1) {
      const first = rotation[match]
      const second = rotation[19 - match]
      const home = (round + match) % 2 === 0 ? first : second
      const away = home === first ? second : first
      firstLeg.push({
        id: `league-${round + 1}-${match + 1}`,
        competition: 'league', round: round + 1,
        roundName: `Matchday ${round + 1}`, home, away,
        date: matchDate(startDate, round + 1),
        homeGoals: null,
        awayGoals: null,
      })
    }
    rotation = [rotation[0], rotation[19], ...rotation.slice(1, 19)]
  }
  const returnLeg = firstLeg.map((fixture) => ({
    ...fixture,
    id: `league-${fixture.round + 19}-${fixture.id.split('-')[2]}`,
    round: fixture.round + 19,
    roundName: `Matchday ${fixture.round + 19}`,
    home: fixture.away,
    away: fixture.home,
    date: matchDate(startDate, fixture.round + 19),
    homeGoals: null,
    awayGoals: null,
  }))
  return [...firstLeg, ...returnLeg]
}

export function createFixtures(clubs: Club[], startDate = currentYangonDate(), scheduleSeed = 1, openingKickoffAt?: number): Fixture[] {
  const scheduleClubs = shuffleClubs(clubs, scheduleSeed)
  const leagueFixtures = createLeagueFixtures(scheduleClubs, startDate).map((fixture) =>
    fixture.id === 'league-1-1' && openingKickoffAt !== undefined ? { ...fixture, kickoffAt: openingKickoffAt } : fixture,
  )
  const cup: Fixture[] = [
    ...Array.from({ length: 4 }, (_, index) => ({
      id: `cup-1-${index + 1}`, competition: 'cup' as const, round: 1,
      roundName: 'Round of 20', home: scheduleClubs[12 + index].id, away: scheduleClubs[19 - index].id,
      date: dayDate(startDate, 0), homeGoals: null, awayGoals: null,
    })),
    ...Array.from({ length: 8 }, (_, index) => ({
      id: `cup-2-${index + 1}`, competition: 'cup' as const, round: 2,
      roundName: 'Round of 16',
      home: scheduleClubs[([0, 3, 1, 2, 4, 7, 5, 6][index])].id,
      away: index < 4 ? `tbd-cup-r1-${index + 1}` : scheduleClubs[([11, 8, 10, 9][index - 4])].id,
      date: dayDate(startDate, 1), homeGoals: null, awayGoals: null,
    })),
    ...Array.from({ length: 4 }, (_, index) => ({
      id: `cup-3-${index + 1}`, competition: 'cup' as const, round: 3,
      roundName: 'Quarter-final', home: `tbd-cup-r2-${index * 2 + 1}`, away: `tbd-cup-r2-${index * 2 + 2}`,
      date: dayDate(startDate, 2), homeGoals: null, awayGoals: null,
    })),
    ...Array.from({ length: 2 }, (_, index) => ({
      id: `cup-4-${index + 1}`, competition: 'cup' as const, round: 4,
      roundName: 'Semi-final', home: `tbd-cup-r3-${index * 2 + 1}`, away: `tbd-cup-r3-${index * 2 + 2}`,
      date: dayDate(startDate, 3), homeGoals: null, awayGoals: null,
    })),
    { id: 'cup-5-1', competition: 'cup', round: 5, roundName: 'Final', home: 'tbd-cup-r4-1', away: 'tbd-cup-r4-2', date: dayDate(startDate, 4), homeGoals: null, awayGoals: null },
  ]
  const winter: Fixture[] = [
    { id: 'winter-semi-1', competition: 'winter', round: 1, roundName: 'Winter Series · Semi-final', home: 'tbd-league-1', away: 'tbd-league-4', date: dayDate(startDate, 267), homeGoals: null, awayGoals: null },
    { id: 'winter-semi-2', competition: 'winter', round: 1, roundName: 'Winter Series · Semi-final', home: 'tbd-league-2', away: 'tbd-league-3', date: dayDate(startDate, 267), homeGoals: null, awayGoals: null },
    { id: 'winter-final', competition: 'winter', round: 2, roundName: 'Winter Series · Final', home: 'tbd-winter-semi-1', away: 'tbd-winter-semi-2', date: dayDate(startDate, 268), homeGoals: null, awayGoals: null },
  ]
  return [...leagueFixtures, ...cup, ...winter]
}

export function getStandings(clubs: Club[], fixtures: Fixture[]): Standing[] {
  const table = new Map(clubs.map((club) => [club.id, {
    club, played: 0, won: 0, drawn: 0, lost: 0,
    goalsFor: 0, goalsAgainst: 0, points: 0, form: [] as string[],
  }]))
  const results = new Map<string, { date: string; result: string }[]>()
  for (const fixture of fixtures) {
    if (fixture.competition !== 'league' || fixture.homeGoals === null || fixture.awayGoals === null) continue
    const home = table.get(fixture.home)
    const away = table.get(fixture.away)
    if (!home || !away) continue
    home.played += 1; away.played += 1
    home.goalsFor += fixture.homeGoals; home.goalsAgainst += fixture.awayGoals
    away.goalsFor += fixture.awayGoals; away.goalsAgainst += fixture.homeGoals
    const homeResult = fixture.homeGoals > fixture.awayGoals ? 'W' : fixture.homeGoals === fixture.awayGoals ? 'D' : 'L'
    const awayResult = homeResult === 'W' ? 'L' : homeResult === 'L' ? 'W' : 'D'
    if (homeResult === 'W') { home.won += 1; home.points += 3; away.lost += 1 }
    else if (homeResult === 'L') { away.won += 1; away.points += 3; home.lost += 1 }
    else { home.drawn += 1; away.drawn += 1; home.points += 1; away.points += 1 }
    results.set(home.club.id, [...(results.get(home.club.id) ?? []), { date: fixture.date, result: homeResult }])
    results.set(away.club.id, [...(results.get(away.club.id) ?? []), { date: fixture.date, result: awayResult }])
  }
  for (const standing of table.values()) {
    standing.form = (results.get(standing.club.id) ?? []).sort((a, b) => a.date.localeCompare(b.date)).slice(-5).map(({ result }) => result)
  }
  return [...table.values()].sort((a, b) =>
    b.points - a.points ||
    (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst) ||
    b.goalsFor - a.goalsFor || a.club.name.localeCompare(b.club.name),
  )
}