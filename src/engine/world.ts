import type { HitDef, ThrowDef } from './schema.ts';
import type { Vec2 } from './vec.ts';
import { vec } from './vec.ts';

export const STAGE_WIDTH = 960;
export const STAGE_HEIGHT = 540;
export const GROUND_Y_SCREEN = 460;
export const STAGE_LEFT_X = 40;
export const STAGE_RIGHT_X = 920;

/** Round length in simulation ticks (60Hz). 30 seconds. */
export const ROUND_TIME_TICKS = 30 * 60;

/** Maximum power-meter value. */
export const MAX_POWER = 3000;

export const Btn = {
  Up: 1 << 0,
  Down: 1 << 1,
  Left: 1 << 2,
  Right: 1 << 3,
  A: 1 << 4,
  B: 1 << 5,
  C: 1 << 6,
  X: 1 << 7,
  Y: 1 << 8,
  Z: 1 << 9,
} as const;

export interface PlayerInput {
  buttons: number;
}

export interface Inputs {
  players: PlayerInput[];
}

/**
 * A victim's "being thrown" state: position-locked to `thrower` at `pos`
 * (facing-relative offset) for `time` more ticks, then released with
 * `releaseVel` (x is facing-relative) into `releaseState`.
 */
export interface BindState {
  thrower: number;
  time: number;
  pos: Vec2;
  releaseVel: Vec2;
  releaseState: string;
}

export interface Player {
  characterId: string;
  pos: Vec2;
  vel: Vec2;
  facing: 1 | -1;
  stateId: string;
  stateTime: number;
  ctrl: boolean;
  animId: string;
  animFrame: number;
  animTime: number;
  inputBuffer: number[];
  life: number;
  power: number;
  /** Half of the player's collision/body width, used for body-distance refs. */
  halfWidth: number;
  hitPause: number;
  activeHitDef: HitDef | null;
  /** Armed grab attempt (mirrors activeHitDef); resolved by detectThrows. */
  activeThrow: ThrowDef | null;
  /** Non-null while this player is held in an opponent's throw. */
  bind: BindState | null;
}

export interface World {
  tick: number;
  players: Player[];
  matchOver: boolean;
  winner: number | null;
  /** Ticks remaining in the round; counts down from ROUND_TIME_TICKS to 0. */
  roundTime: number;
}

export function createWorld(p1Char = 'base', p2Char = 'base'): World {
  return {
    tick: 0,
    matchOver: false,
    winner: null,
    roundTime: ROUND_TIME_TICKS,
    players: [
      {
        characterId: p1Char,
        pos: vec(360, 0),
        vel: vec(0, 0),
        facing: 1,
        stateId: 'stand',
        stateTime: 0,
        ctrl: true,
        animId: 'stand',
        animFrame: 0,
        animTime: 0,
        inputBuffer: [],
        life: 1000,
        power: 0,
        halfWidth: 30,
        hitPause: 0,
        activeHitDef: null,
        activeThrow: null,
        bind: null,
      },
      {
        characterId: p2Char,
        pos: vec(600, 0),
        vel: vec(0, 0),
        facing: -1,
        stateId: 'stand',
        stateTime: 0,
        ctrl: true,
        animId: 'stand',
        animFrame: 0,
        animTime: 0,
        inputBuffer: [],
        life: 1000,
        power: 0,
        halfWidth: 30,
        hitPause: 0,
        activeHitDef: null,
        activeThrow: null,
        bind: null,
      },
    ],
  };
}
