import { PlaylistSong } from "./playlist-types";

interface ITunesResult {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName: string;
  trackTimeMillis: number;
  artworkUrl100: string;
  previewUrl: string;
  trackViewUrl: string;
}

export async function searchITunesSongs(query: string, limit: number = 10): Promise<PlaylistSong[]> {
  if (!query.trim()) return [];

  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=${limit}`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`iTunes API error: ${response.status}`);
    }

    const data = await response.json();
    if (!data.results || !Array.isArray(data.results)) {
      return [];
    }

    return data.results.map((result: ITunesResult) => {
      const highResArt = result.artworkUrl100 ? result.artworkUrl100.replace('100x100bb', '600x600bb') : null;

      return {
        id: `itunes-${result.trackId}`,
        title: result.trackName,
        artists: [result.artistName],
        album: result.collectionName || "Unknown Album",
        durationMs: result.trackTimeMillis || 0,
        artworkUrl: highResArt || result.artworkUrl100 || null,
        previewUrl: result.previewUrl || null,
        spotifyId: String(result.trackId), 
        spotifyUrl: result.trackViewUrl || null, 
        uri: null,
      };
    });
  } catch (err) {
    console.error("iTunes Search Error:", err);
    return [];
  }
}

