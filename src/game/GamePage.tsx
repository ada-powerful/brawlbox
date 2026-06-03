import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.tsx';
import type { Character } from '@/engine/schema.ts';
import { Headshot } from '@/creator/Headshot.tsx';
import { Match } from '@/game/Match.tsx';
import type { FighterSpec } from '@/game/mountGame.ts';
import { CPU_LEVELS, type CpuLevel } from '@/runtime/ai.ts';
import { BASE_ATLAS_URL, BASE_CHARACTER, P1_COLOR, P2_COLOR } from '@/creator/defaults.ts';
import { AUTH_ENABLED, CAN_CLOUD } from '@/app/config.ts';
import { useSession } from '@/app/session.ts';
import { login } from '@/auth/auth.ts';

interface RosterEntry {
  id: string;
  name: string;
  character: Character;
  atlasUrl?: string;
  headshotUrl?: string;
}

// The built-in roster. Currently just the hand-authored base fighter; structured
// as a list so more bundled characters can be added later.
const BUILTINS: RosterEntry[] = [
  { id: 'base', name: 'Base', character: BASE_CHARACTER, atlasUrl: BASE_ATLAS_URL },
];

export function GamePage() {
  const { user, saved } = useSession();

  // Built-ins + the user's (non-archived) saved characters.
  const roster: RosterEntry[] = [
    ...BUILTINS,
    ...saved
      .filter((c) => !c.archived)
      .map((c) => ({
        id: c.characterId,
        name: c.name,
        character: c.character,
        atlasUrl: c.atlasUrl,
        headshotUrl: c.portraitHeadshotUrl,
      })),
  ];

  const [p1Id, setP1Id] = useState('base');
  const [p2Id, setP2Id] = useState('base');
  const [cpuLevel, setCpuLevel] = useState<CpuLevel>('normal');
  const [fighting, setFighting] = useState(false);

  const entry = (id: string): RosterEntry => roster.find((r) => r.id === id) ?? BUILTINS[0]!;

  if (fighting) {
    const p1: FighterSpec = {
      character: entry(p1Id).character,
      atlasUrl: entry(p1Id).atlasUrl,
      color: P1_COLOR,
    };
    const p2: FighterSpec = {
      character: entry(p2Id).character,
      atlasUrl: entry(p2Id).atlasUrl,
      color: P2_COLOR,
    };
    return (
      <Card className="flex flex-col">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>
            {entry(p1Id).name} <span className="text-muted-foreground">vs</span> {entry(p2Id).name}
          </CardTitle>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              You (P1): WASD + J/K/L · CPU opponent: {cpuLevel} · R restart · F1 debug
            </span>
            <Button variant="secondary" size="sm" onClick={() => setFighting(false)}>
              ← Character select
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Online versus isn't built yet: the human plays P1, the CPU plays P2. */}
          <Match p1={p1} p2={p2} cpuP2 cpuLevel={cpuLevel} />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SlotPicker label="Player 1 (pink)" roster={roster} selectedId={p1Id} onSelect={setP1Id} />
      <SlotPicker
        label="Opponent — CPU (blue)"
        roster={roster}
        selectedId={p2Id}
        onSelect={setP2Id}
      />

      <Card>
        <CardHeader>
          <CardTitle>CPU difficulty</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {CPU_LEVELS.map((lvl) => (
            <button
              key={lvl.id}
              onClick={() => setCpuLevel(lvl.id)}
              className={`rounded-md border px-3 py-1 text-sm transition-colors hover:bg-secondary/60 ${
                cpuLevel === lvl.id
                  ? 'border-primary bg-secondary/60 font-semibold'
                  : 'border-border'
              }`}
            >
              {lvl.label}
            </button>
          ))}
        </CardContent>
      </Card>

      <div className="flex items-center gap-4">
        <Button onClick={() => setFighting(true)}>Fight</Button>
        <span className="text-sm text-muted-foreground">
          Want your own fighter?{' '}
          <Link to="/create" className="text-primary hover:underline">
            Create one
          </Link>
          .
        </span>
      </div>

      {CAN_CLOUD && !user && AUTH_ENABLED && (
        <p className="text-sm text-muted-foreground">
          <button className="text-primary hover:underline" onClick={() => void login()}>
            Sign in
          </button>{' '}
          to play as the characters you've created.
        </p>
      )}
    </div>
  );
}

function SlotPicker({
  label,
  roster,
  selectedId,
  onSelect,
}: {
  label: string;
  roster: RosterEntry[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {roster.map((r) => (
          <button
            key={r.id}
            onClick={() => onSelect(r.id)}
            className={`flex items-center gap-2 rounded-md border px-2 py-1 text-sm transition-colors hover:bg-secondary/60 ${
              selectedId === r.id ? 'border-primary bg-secondary/60 font-semibold' : 'border-border'
            }`}
          >
            <Headshot
              character={r.character}
              atlasUrl={r.atlasUrl}
              headshotUrl={r.headshotUrl}
              name={r.name}
            />
            <span className="truncate">{r.name}</span>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}
