export type PlaylistSong = {
  album: string;
  artists: string[];
  artworkUrl: string | null;
  durationMs: number;
  id: string;
  spotifyId: string | null;
  spotifyUrl: string | null;
  title: string;
  uri: string | null;
};

export type PlaylistData = {
  description: string | null;
  id: string;
  imageUrl: string | null;
  owner: string;
  songs: PlaylistSong[];
  spotifyUrl: string;
  title: string;
};

export type PublishedPlaylistRecord = {
  code: string;
  createdAt: string;
  playlist: PlaylistData;
  sourceUrl: string;
};
