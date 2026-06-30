// Compositions cycle on reload (Phase 3). Each entry is one display phrase.
// Haiku lines are joined with a single space for now; Phase 3 will handle
// multi-line layout.

export interface Composition {
  text: string
  kind: 'phrase' | 'haiku'
}

export const COMPOSITIONS: Composition[] = [
  { kind: 'phrase', text: 'motion creates form' },
  // composition 2: TBD
  {
    kind: 'haiku',
    text: 'the word shakes itself apart into its letters and back into form',
  },
  // composition 4: TBD
]
