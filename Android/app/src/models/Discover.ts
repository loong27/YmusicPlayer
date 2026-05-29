import type { Track } from './Track';

export type DiscoverQuery = {
  title: string;
  artist: string;
  album?: string;
  searchQuery: string;
  reason: string;
  evidence: string[];
  confidence: number;
};

export type DiscoverRecommendation = {
  query: DiscoverQuery;
  track?: Track;
  reason: string;
  confidence: number;
  evidence: string[];
};

export type DiscoverCache = {
  generatedAt?: string;
  summary?: string;
  remoteQueries: DiscoverQuery[];
  resolvedRemoteQueries: string[];
  remoteRecommendations: DiscoverRecommendation[];
  warnings: string[];
};
