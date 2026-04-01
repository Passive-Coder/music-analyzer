export interface LyricWord {
  id: string;
  text: string;
  start: number;
  end: number;
}

export interface LyricLine {
  id: string;
  start: number;
  end: number;
  words: LyricWord[];
}

export interface TrackLyrics {
  synced: boolean;
  lines: LyricLine[];
}

/**
 * Parses time format MM:SS.xx or HH:MM:SS.xx into seconds
 */
function parseTimeStr(timeStr: string): number {
  const parts = timeStr.split(':');
  if (parts.length === 3) {
    return parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseFloat(parts[2]);
  }
  if (parts.length === 2) {
    return parseInt(parts[0], 10) * 60 + parseFloat(parts[1]);
  }
  return 0;
}

/**
 * Parses LRCLIB's syncedLyrics format (both standard and enhanced word-by-word).
 */
export function parseSyncedLyrics(lrcString: string): TrackLyrics {
  const lines: LyricLine[] = [];
  const rawLines = lrcString.split('\n');
  const lineRegex = /^\[(\d{1,3}:\d{2}(?:\.\d{1,3})?)\](.*)$/;
  const wordRegex = /<(\d{1,3}:\d{2}(?:\.\d{1,3})?)>([^<]*)/g;

  for (let i = 0; i < rawLines.length; i++) {
    const rawLine = rawLines[i].trim();
    if (!rawLine) continue;

    const lineMatch = rawLine.match(lineRegex);
    if (!lineMatch) continue;

    const lineStart = parseTimeStr(lineMatch[1]);
    const lineContent = lineMatch[2];
    
    // Check if the line uses enhanced word-by-word tags
    const words: LyricWord[] = [];
    let match;
    let lastWordEnd = lineStart;
    
    // If it has at least one word tag
    if (lineContent.includes('<')) {
      const parts = lineContent.split('<');
      const tempTags: { time: number, text: string }[] = [];
      
      for (const part of parts) {
        if (!part.trim()) continue;
        const tagMatch = part.match(/^(\d{2,3}:\d{2}\.\d{2,3})>(.*)$/);
        if (tagMatch) {
          tempTags.push({
            time: parseTimeStr(tagMatch[1]),
            text: tagMatch[2]
          });
        }
      }

      for (let j = 0; j < tempTags.length; j++) {
        const text = tempTags[j].text.trim();
        const start = tempTags[j].time;
        // The end time is the start time of the next tag, or lineStart + fallback if it's the absolute last
        const end = j < tempTags.length - 1 ? tempTags[j + 1].time : start + 1.0;
        
        // LRCLIB sometimes adds empty trailing tags specifically to denote the end time of the last word.
        // We only push non-empty text to the words array.
        if (text) {
          words.push({
            id: `w_${i}_${words.length}`,
            text: text + " ", // Preserve spacing visually
            start,
            end
          });
        }
      }
    } else {
      // Standard LRC fallback (just line timing)
      const text = lineContent.trim();
      if (text) {
        words.push({
          id: `w_${i}_0`,
          text,
          start: lineStart,
          // We don't know the exact end time, so we'll approximate based on the next line during final pass
          end: lineStart + 2
        });
      }
    }

    if (words.length > 0) {
      lines.push({
        id: `l_${i}`,
        start: lineStart,
        end: words[words.length - 1].end,
        words
      });
    }
  }

  // Final pass: fix up line ending times for standard LRC that don't have explicit end markers
  for (let i = 0; i < lines.length - 1; i++) {
    const currentLine = lines[i];
    const nextLine = lines[i + 1];
    if (currentLine.words.length === 1 && currentLine.end === currentLine.start + 2) {
      currentLine.end = Math.min(currentLine.start + 5, nextLine.start);
      currentLine.words[0].end = currentLine.end;
    }
  }

  return {
    synced: lines.length > 0,
    lines
  };
}

/**
 * Fetches lyrics from LRCLIB API based on song title and artist.
 */
export async function fetchLyrics(title: string, artist: string, duration?: number): Promise<TrackLyrics | null> {
  try {
    // If it's a local file, it likely has "Local Audio" as the artist and the filename as the title.
    // We should use the LRCLIB search endpoint instead to fuzzy match the filename.
    if (artist === "Local Audio") {
      const cleanName = title
        .replace(/\.[^/.]+$/, "") // Remove file extension
        .replace(/\(feat\..*?\)/i, "")
        .replace(/\[.*?\]/g, "") // Remove [Official Video]
        .replace(/^\d+[\s.-]+/g, ""); // Remove track numbers like "03 - "

      const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(cleanName)}`;
      const searchRes = await fetch(searchUrl, {
        headers: { "User-Agent": "MusicAnalyzerClient/0.1.0" }
      });

      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const bestMatch = searchData.find((track: any) => track.syncedLyrics);
        if (bestMatch) {
          return parseSyncedLyrics(bestMatch.syncedLyrics);
        }
      }
    }

    // Standard strict match for Spotify tracks
    const _trackName = encodeURIComponent(title.replace(/\(feat\..*?\)/i, "").trim());
    const _artistName = encodeURIComponent(artist.trim());
    let cleanedTitle = title;
    let cleanedArtist = artist;

    // 1. Remove artist from title if it starts with "Artist - "
    if (artist && title.toLowerCase().startsWith(artist.toLowerCase())) {
        cleanedTitle = title.substring(artist.length).replace(/^[\s\-_:=]+/, "");
    } else if (title.includes(" - ")) {
        // Handle common "Artist - Title" format from YouTube
        const parts = title.split(" - ");
        if (parts.length >= 2) {
            // If the first part looks like the artist we have, or artist is "YouTube", use second part as title
            if (!artist || artist === "YouTube" || artist.toLowerCase().includes(parts[0].toLowerCase())) {
                cleanedArtist = parts[0].trim();
                cleanedTitle = parts[1].trim();
            }
        }
    }

    // 2. Remove common YouTube suffixes
    cleanedTitle = cleanedTitle
        .replace(/\(feat\..*?\)/i, "")
        .replace(/\(Official.*?\)/i, "")
        .replace(/\[Official.*?\]/i, "")
        .replace(/\(Lyrics\)/i, "")
        .replace(/\[Lyrics\]/i, "")
        .trim();

    const baseUrl = "https://lrclib.net/api/get";
    const params = new URLSearchParams({
      track_name: cleanedTitle,
      artist_name: cleanedArtist === "YouTube" || !cleanedArtist ? "" : cleanedArtist
    });

    // Try with duration first (most precise)
    const urlWithDuration = `${baseUrl}?${params.toString()}&duration=${Math.round(duration ?? 0)}`;
    const response = await fetch(urlWithDuration, {
      headers: { "User-Agent": "MusicAnalyzerClient/0.1.0" }
    });

    if (response.ok) {
      const data = await response.json();
      if (data.syncedLyrics) return parseSyncedLyrics(data.syncedLyrics);
    }

    // Fallback: Try without duration (more lenient)
    const urlWithoutDuration = `${baseUrl}?${params.toString()}`;
    const responseNoDuration = await fetch(urlWithoutDuration, {
      headers: { "User-Agent": "MusicAnalyzerClient/0.1.0" }
    });

    if (responseNoDuration.ok) {
      const data = await responseNoDuration.json();
      if (data.syncedLyrics) return parseSyncedLyrics(data.syncedLyrics);
    }
    
    // Last resort: Search
    const searchQuery = `${cleanedTitle} ${cleanedArtist === "YouTube" ? "" : cleanedArtist}`.trim();
    const searchRes = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(searchQuery)}`, {
      headers: { "User-Agent": "MusicAnalyzerClient/0.1.0" }
    });
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      const best = searchData.find((t: any) => {
        if (!t.syncedLyrics) return false;
        if (!duration) return true; // Accept anything if we don't know duration
        return Math.abs(t.duration - duration) < 15;
      });
      if (best) return parseSyncedLyrics(best.syncedLyrics);
    }
    return null;
  } catch (err) {
    console.error("Failed to fetch lyrics:", err);
    return null;
  }
}

/**
 * Manually search for lyrics candidates without duration constraint.
 * Useful for the "Search Lyrics" UI.
 */
export async function searchLyrics(query: string): Promise<any[]> {
  try {
    const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`, {
      headers: { "User-Agent": "MusicAnalyzerClient/0.1.0" }
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.filter((t: any) => t.syncedLyrics);
  } catch (err) {
    console.error("Search lyrics failed:", err);
    return [];
  }
}
