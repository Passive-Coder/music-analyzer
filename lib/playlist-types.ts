export type PlaylistSong = {
  album: string;
  artists: string[];
  artworkUrl: string | null;
  durationMs: number;
  id: string;
  originPlaylistId?: string | null;
  originPlaylistTitle?: string | null;
  sourceId: string | null;
  sourceUrl: string | null;
  title: string;
};

export type PlaylistData = {
  description: string | null;
  id: string;
  imageUrl: string | null;
  owner: string;
  songs: PlaylistSong[];
  sourceUrl: string;
  title: string;
};

export type SongwiseVote = Record<string, number>;

export type ActivePlaylistSongVote = {
  songId: string;
  songName: string;
  vote: number;
};

export type PreviousPlaylistResults = {
  batch: PlaylistSong[];
  songList: ActivePlaylistSongVote[];
};

export type ActivePlaylistViewerSelection = {
  selectedSongId: string | null;
};

export type ActivePlaylistState = {
  code: string;
  currentBatch: PlaylistSong[];
  currentBatchIndex: number;
  currentSong: PlaylistSong | null;
  currentSongId: string | null;
  currentSongStartedAt: string | null;
  previousResults: PreviousPlaylistResults | null;
  playedSongs: PlaylistSong[];
  songList: ActivePlaylistSongVote[];
  updatedAt: string;
};

export type PublishedPlaylistRecord = {
  code: string;
  createdAt: string;
  currentSong: PlaylistSong | null;
  currentSongStartedAt: string | null;
  publisherEmail: string | null;
  currentBatch: PlaylistSong[];
  currentBatchIndex: number;
  batches: PlaylistSong[][];
  librarySongs: PlaylistSong[];
  loadedPlaylists: PlaylistData[];
  songwiseVote: SongwiseVote[];
  songsPlayedBefore: PlaylistSong[];
  updatedAt: string;
};

export type PublishPlaylistResult = {
  code: string;
  creatorToken: string;
  record: PublishedPlaylistRecord;
};
