import { PlaylistSong } from "./playlist-types";

/**
 * Extracts the YouTube Playlist ID (list=XXX) from a standard URL string
 */
export function getPlaylistId(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const listId = urlObj.searchParams.get("list");
    if (listId) return listId;
    
    // If it's just the ID dumped in the box
    if (url.length > 10 && !url.includes("youtube.com")) return url;
    return null;
  } catch (e) {
    return null;
  }
}


/**
 * Resolves the actual playable audio URL (`.m4a` or `.webm`) for a given YouTube Video ID.
 * The stream is verified to inject generic CORS headers by the Piped API nodes!
 */
export async function getYoutubeAudioStream(videoId: string): Promise<string | null> {
  if (!videoId) return null;
  
  try {
    const res = await fetch(`https://pipedapi.kavin.rocks/streams/${videoId}`);
    if (!res.ok) return null;
    const data = await res.json();
    
    const audioStreams = data.audioStreams || [];
    if (audioStreams.length === 0) return null;

    // Sort by highest bitrate
    audioStreams.sort((a: any, b: any) => b.bitrate - a.bitrate);
    
    // M4A supports broad native WebAudio decoding better on some OS than WebM
    const m4aStream = audioStreams.find((s: any) => s.mimeType?.includes("m4a") || s.codec === "m4a");
    if (m4aStream) return m4aStream.url;

    return audioStreams[0].url; // Fallback to highest bitrate WebM
  } catch (err) {
    console.error("Audio Stream Decode Error:", err);
    return null;
  }
}

/**
 * Searches for a YouTube track by name using our backend proxy (bypasses browser CORS).
 * Returns an array of the top 5 results formatted as PlaylistSongs.
 */
export async function searchYoutubeTrack(query: string): Promise<PlaylistSong[]> {
  if (!query) return [];
  
  try {
    const res = await fetch(`/api/youtube/search?query=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error(`Search Proxy returned ${res.status}`);
    const data = await res.json();
    
    if (!data.items || data.items.length === 0) return [];
    
    return data.items.map((track: any) => {
      const videoId = track.url.split("v=")[1];
      return {
        id: `yt-search-${videoId}`,
        title: track.title,
        artists: track.uploaderName ? [track.uploaderName] : ["YouTube Query"],
        album: "YouTube Track",
        durationMs: track.duration * 1000,
        artworkUrl: track.thumbnail || null,
        previewUrl: null, // Fetched on demand via backend proxy
        spotifyId: videoId, // Reusing spotifyId field to store YouTube videoId for extraction
        spotifyUrl: `https://youtube.com/watch?v=${videoId}`,
        uri: null,
      };
    });
  } catch (err) {
    console.error("YouTube Search Error:", err);
    return [];
  }
}

/**
 * Fetches an entire YouTube Playlist's videos by its list ID.
 * Returns an array of PlaylistSongs instantly parsed via yt-dlp `--flat-playlist`.
 */
export async function fetchYoutubePlaylist(listId: string): Promise<PlaylistSong[]> {
  if (!listId) return [];
  
  try {
    const res = await fetch(`/api/youtube/playlist?listId=${encodeURIComponent(listId)}`);
    if (!res.ok) throw new Error(`Playlist Proxy returned ${res.status}`);
    const data = await res.json();
    return data.items || [];
  } catch (err) {
    console.error("YouTube Playlist Error:", err);
    return [];
  }
}


