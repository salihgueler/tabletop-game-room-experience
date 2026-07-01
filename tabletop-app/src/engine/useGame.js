// Client-side mock DnD engine. Manages a party of players + one AI DM, rotates
// turns, rolls a d20, resolves the chosen action against a difficulty class, and
// produces DM narration. Bot players auto-act on their turn; the human picks.

import { useReducer, useEffect, useRef, useCallback } from 'react'
import { CLASSES } from '../data/classes.js'
import { narrate, promptFor, OPENERS } from '../data/narration.js'
import { spriteForRoll } from '../data/dice.js'

// Simple seeded RNG (mulberry32) so a session is reproducible.
function makeRng(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Board positions (percent of board) matching the gamepage layout: 2x2 quadrants.
const SLOTS = [
  { x: 33, y: 34 },
  { x: 66, y: 34 },
  { x: 33, y: 66 },
  { x: 66, y: 66 },
]

function buildPlayers(human, seed) {
  // Human first, then 3 bots — one of each remaining core class — to fill the
  // 4-seat party (matching the board's 2x2 layout in the design).
  const rng = makeRng(seed + 7)
  const botClasses = ['paladin', 'sorcerer', 'rogue', 'ranger'].filter(
    (c) => c !== human.classKey,
  )
  const botNames = ['Zara', 'Thorn', 'Lyra', 'Kael', 'Fen', 'Mira']
  const chosen = []
  const players = [
    {
      id: 'you',
      name: human.name,
      classKey: human.classKey,
      sprite: human.sprite,
      color: CLASSES[human.classKey].color,
      isHuman: true,
      hp: 20,
      slot: 0,
    },
  ]
  for (let i = 0; i < 3; i++) {
    const ck = botClasses[i % botClasses.length]
    const variant = CLASSES[ck].variants[Math.floor(rng() * 4)]
    let name
    do {
      name = botNames[Math.floor(rng() * botNames.length)]
    } while (chosen.includes(name))
    chosen.push(name)
    players.push({
      id: `bot${i}`,
      name,
      classKey: ck,
      sprite: `/sprites/characters/${variant}.png`,
      color: CLASSES[ck].color,
      isHuman: false,
      hp: 20,
      slot: i + 1,
    })
  }
  return players
}

function initState({ human, scenario, dmName, seed }) {
  const players = buildPlayers(human, seed)
  const opener = OPENERS[scenario] || OPENERS['Cave Crypt']
  return {
    seed,
    scenario,
    dmName,
    players,
    turnIndex: 0, // index into players; AI DM acts between full rounds
    round: 1,
    phase: 'player', // 'player' | 'resolving' | 'dm'
    lastRoll: null, // { value, sprite, dc, success, actor, action }
    dc: 12,
    log: [
      { kind: 'dm', who: `AI DM: ${dmName}`, text: opener },
      { kind: 'dm', who: `AI DM: ${dmName}`, text: promptFor(players[0].name, makeRng(seed)) },
    ],
    chat: [
      { who: 'Kael', color: 'var(--paladin)', text: 'Let me check for traps first!' },
      { who: 'Zara', color: 'var(--sorcerer)', text: 'I want to cast Bless on the group.' },
    ],
    inventory: ['scroll', 'potion', 'key', 'gem', 'map'],
    rngState: seed,
  }
}

function reducer(state, action) {
  switch (action.type) {
    case 'ACT': {
      // A player takes an action: roll d20, resolve, append narration.
      const rng = makeRng(state.rngState + state.round * 31 + state.turnIndex * 7)
      const value = 1 + Math.floor(rng() * 20)
      const actor = state.players[state.turnIndex]
      const success = value >= state.dc
      const text = narrate(action.action, actor.name, value, state.dc)
      const roll = {
        value,
        sprite: spriteForRoll(value),
        color: actor.isHuman ? diceColorFor(actor.classKey) : diceColorFor(actor.classKey),
        dc: state.dc,
        success,
        actor: actor.name,
        action: action.action,
      }
      const log = [
        ...state.log,
        { kind: 'action', who: actor.name, color: actor.color, text: `${actor.name} chooses **${action.action}**.` },
        { kind: 'roll', who: actor.name, color: actor.color, text: `rolls a d20 → ${value} vs DC ${state.dc} (${success ? 'SUCCESS' : 'fail'})` },
        { kind: 'dm', who: `AI DM: ${state.dmName}`, text },
      ]
      return { ...state, lastRoll: roll, log, phase: 'resolving' }
    }
    case 'ADVANCE': {
      // Move to the next player; after the last player, the AI DM narrates and
      // a new round begins.
      const next = state.turnIndex + 1
      const rng = makeRng(state.rngState + state.round * 101 + next * 13)
      if (next >= state.players.length) {
        // DM interlude then wrap to round start
        const dmLine = promptFor(state.players[0].name, rng)
        return {
          ...state,
          turnIndex: 0,
          round: state.round + 1,
          phase: 'player',
          lastRoll: null,
          dc: 10 + Math.floor(rng() * 8), // 10..17
          log: [
            ...state.log,
            { kind: 'dm', who: `AI DM: ${state.dmName}`, text: `Round ${state.round + 1}. ${dmLine}` },
          ],
        }
      }
      return {
        ...state,
        turnIndex: next,
        phase: 'player',
        lastRoll: null,
        log: [
          ...state.log,
          { kind: 'dm', who: `AI DM: ${state.dmName}`, text: promptFor(state.players[next].name, rng) },
        ],
      }
    }
    case 'CHAT':
      return { ...state, chat: [...state.chat, action.message] }
    default:
      return state
  }
}

function diceColorFor(classKey) {
  // Warm classes roll red dice, cool classes roll blue — purely cosmetic.
  return ['paladin', 'sorcerer'].includes(classKey) ? 'blue' : 'red'
}

export function useGame(config) {
  const [state, dispatch] = useReducer(reducer, config, initState)
  const timers = useRef([])

  const clearTimers = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }
  useEffect(() => () => clearTimers(), [])

  const current = state.players[state.turnIndex]

  const act = useCallback((chosen) => {
    if (state.phase !== 'player') return
    const actor = state.players[state.turnIndex]
    const action = chosen || CLASSES[actor.classKey].actions[0]
    dispatch({ type: 'ACT', action })
    // resolve visually, then advance
    const t = setTimeout(() => dispatch({ type: 'ADVANCE' }), 1600)
    timers.current.push(t)
  }, [state.phase, state.turnIndex, state.players])

  // Bots auto-act on their turn.
  useEffect(() => {
    if (state.phase === 'player' && current && !current.isHuman) {
      const rng = makeRng(state.rngState + state.round * 53 + state.turnIndex * 17)
      const options = CLASSES[current.classKey].actions
      const choice = options[Math.floor(rng() * options.length)]
      const t = setTimeout(() => {
        dispatch({ type: 'ACT', action: choice })
        const t2 = setTimeout(() => dispatch({ type: 'ADVANCE' }), 1600)
        timers.current.push(t2)
      }, 900)
      timers.current.push(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.turnIndex, state.phase, state.round])

  const sendChat = useCallback((text) => {
    if (!text.trim()) return
    dispatch({
      type: 'CHAT',
      message: { who: state.players[0].name, color: state.players[0].color, text },
    })
  }, [state.players])

  return { state, current, act, sendChat }
}
