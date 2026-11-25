export type Kind = 'file' | 'routine' | 'call' | 'visitor';

export interface Activity {
  label: string;
  at: string;
  kind: Kind;
}

export interface BotStatus {
  id: string;
  sprite: string | null;
  activity: Activity | null;
}

export interface Service {
  id: string;
  label: string;
  at: string | null;
  ok: boolean;
  count?: number;
}

export interface Status {
  generatedAt: string | null;
  bots: BotStatus[];
  services: Service[];
}

export interface RosterBot {
  id: string;
  name: string;
  job: string;
  place: string;
  kind: string;
  color: string;
  slot: [number, number];
  visitor?: boolean;
}
