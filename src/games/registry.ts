// Game modules. The session engine (codes, players, realtime, scoring events,
// lifecycle) is shared; each game brings its own content and host/player UI.
// Only Mystery Stories is implemented in the MVP.

export interface GameModule {
  id: string
  name: string
  tagline: string
  available: boolean
}

export const GAMES: GameModule[] = [
  {
    id: 'mystery_stories',
    name: 'Mystery Stories',
    tagline: 'Ask yes/no questions, uncover the clues, crack the story.',
    available: true,
  },
  { id: 'word_mystery', name: 'Word Mystery', tagline: 'Coming soon', available: false },
  { id: 'trivia_battle', name: 'Trivia Battle', tagline: 'Coming soon', available: false },
]
