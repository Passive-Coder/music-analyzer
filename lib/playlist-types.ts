export type PlaylistSong = {
  album: string;
  artists: string[];
  artworkUrl: string | null;
  durationMs: number;
  id: string;
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

export type PublishedPlaylistRecord = {
  code: string;
  createdAt: string;
  playlist: PlaylistData;
  sourceUrl: string;
};
