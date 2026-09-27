export interface TrackEntry {
  path: string;
  permission: string | null;
  provider: string | null;
  created_at: Date;
}

export interface TrackerDocument {
  account_id: string;
  user_id: string;
  track: TrackEntry[];
}
