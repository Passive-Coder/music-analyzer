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

function parseTimeStr(timeStr: string): number {
  const parts = timeStr.split(":");
  if (parts.length === 3) {
    return (
      Number.parseInt(parts[0], 10) * 3600 +
      Number.parseInt(parts[1], 10) * 60 +
      Number.parseFloat(parts[2])
    );
  }
  if (parts.length === 2) {
    return Number.parseInt(parts[0], 10) * 60 + Number.parseFloat(parts[1]);
  }
  return 0;
}

export function parseSyncedLyrics(lrcString: string): TrackLyrics {
  const lines: LyricLine[] = [];
  const rawLines = lrcString.split("\n");
  const lineRegex = /^\[(\d{1,3}:\d{2}(?:\.\d{1,3})?)\](.*)$/;

  for (let lineIndex = 0; lineIndex < rawLines.length; lineIndex += 1) {
    const rawLine = rawLines[lineIndex].trim();
    if (!rawLine) continue;

    const lineMatch = rawLine.match(lineRegex);
    if (!lineMatch) continue;

    const lineStart = parseTimeStr(lineMatch[1]);
    const lineContent = lineMatch[2];
    const words: LyricWord[] = [];

    if (lineContent.includes("<")) {
      const parts = lineContent.split("<");
      const tempTags: { text: string; time: number }[] = [];

      for (const part of parts) {
        if (!part.trim()) continue;

        const tagMatch = part.match(/^(\d{2,3}:\d{2}\.\d{2,3})>(.*)$/);
        if (tagMatch) {
          tempTags.push({
            time: parseTimeStr(tagMatch[1]),
            text: tagMatch[2],
          });
        }
      }

      for (let tagIndex = 0; tagIndex < tempTags.length; tagIndex += 1) {
        const text = tempTags[tagIndex].text.trim();
        const start = tempTags[tagIndex].time;
        const end =
          tagIndex < tempTags.length - 1
            ? tempTags[tagIndex + 1].time
            : start + 1;

        if (text) {
          words.push({
            id: `w_${lineIndex}_${words.length}`,
            text: `${text} `,
            start,
            end,
          });
        }
      }
    } else {
      const text = lineContent.trim();
      if (text) {
        words.push({
          id: `w_${lineIndex}_0`,
          text,
          start: lineStart,
          end: lineStart + 2,
        });
      }
    }

    if (words.length > 0) {
      lines.push({
        id: `l_${lineIndex}`,
        start: lineStart,
        end: words[words.length - 1].end,
        words,
      });
    }
  }

  for (let index = 0; index < lines.length - 1; index += 1) {
    const currentLine = lines[index];
    const nextLine = lines[index + 1];
    if (
      currentLine.words.length === 1 &&
      currentLine.end === currentLine.start + 2
    ) {
      currentLine.end = Math.min(currentLine.start + 5, nextLine.start);
      currentLine.words[0].end = currentLine.end;
    }
  }

  return {
    synced: lines.length > 0,
    lines,
  };
}

export async function fetchLyrics(
  title: string,
  artist: string,
  duration?: number
): Promise<TrackLyrics | null> {
  try {
    if (artist === "Local Audio") {
      const cleanName = title
        .replace(/\.[^/.]+$/, "")
        .replace(/\(feat\..*?\)/i, "")
        .replace(/\[.*?\]/g, "")
        .replace(/^\d+[\s.-]+/g, "");

      const searchRes = await fetch(
        `https://lrclib.net/api/search?q=${encodeURIComponent(cleanName)}`,
        {
          headers: { "User-Agent": "MusicAnalyzerClient/0.1.0" },
        }
      );

      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const bestMatch = searchData.find(
          (track: { syncedLyrics?: string }) => track.syncedLyrics
        );
        if (bestMatch?.syncedLyrics) {
          return parseSyncedLyrics(bestMatch.syncedLyrics);
        }
      }
    }

    let cleanedTitle = title;
    let cleanedArtist = artist;

    if (artist && title.toLowerCase().startsWith(artist.toLowerCase())) {
      cleanedTitle = title.substring(artist.length).replace(/^[\s\-_:=]+/, "");
    } else if (title.includes(" - ")) {
      const parts = title.split(" - ");
      if (
        parts.length >= 2 &&
        (!artist ||
          artist === "YouTube" ||
          artist.toLowerCase().includes(parts[0].toLowerCase()))
      ) {
        cleanedArtist = parts[0].trim();
        cleanedTitle = parts[1].trim();
      }
    }

    cleanedTitle = cleanedTitle
      .replace(/\(feat\..*?\)/i, "")
      .replace(/\(Official.*?\)/i, "")
      .replace(/\[Official.*?\]/i, "")
      .replace(/\(Lyrics\)/i, "")
      .replace(/\[Lyrics\]/i, "")
      .trim();

    const params = new URLSearchParams({
      track_name: cleanedTitle,
      artist_name:
        cleanedArtist === "YouTube" || !cleanedArtist ? "" : cleanedArtist,
    });

    const response = await fetch(
      `https://lrclib.net/api/get?${params.toString()}&duration=${Math.round(duration ?? 0)}`,
      {
        headers: { "User-Agent": "MusicAnalyzerClient/0.1.0" },
      }
    );

    if (response.ok) {
      const data = await response.json();
      if (data.syncedLyrics) return parseSyncedLyrics(data.syncedLyrics);
    }

    const responseNoDuration = await fetch(
      `https://lrclib.net/api/get?${params.toString()}`,
      {
        headers: { "User-Agent": "MusicAnalyzerClient/0.1.0" },
      }
    );

    if (responseNoDuration.ok) {
      const data = await responseNoDuration.json();
      if (data.syncedLyrics) return parseSyncedLyrics(data.syncedLyrics);
    }

    const searchQuery = `${cleanedTitle} ${cleanedArtist === "YouTube" ? "" : cleanedArtist}`.trim();
    const searchRes = await fetch(
      `https://lrclib.net/api/search?q=${encodeURIComponent(searchQuery)}`,
      {
        headers: { "User-Agent": "MusicAnalyzerClient/0.1.0" },
      }
    );

    if (searchRes.ok) {
      const searchData = await searchRes.json();
      const best = searchData.find(
        (track: { duration?: number; syncedLyrics?: string }) => {
          if (!track.syncedLyrics) return false;
          if (!duration) return true;
          return Math.abs((track.duration ?? 0) - duration) < 15;
        }
      );

      if (best?.syncedLyrics) {
        return parseSyncedLyrics(best.syncedLyrics);
      }
    }

    return null;
  } catch (error) {
    console.error("Failed to fetch lyrics:", error);
    return null;
  }
}

export async function searchLyrics(query: string): Promise<unknown[]> {
  try {
    const res = await fetch(
      `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`,
      {
        headers: { "User-Agent": "MusicAnalyzerClient/0.1.0" },
      }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.filter((track: { syncedLyrics?: string }) => track.syncedLyrics);
  } catch (error) {
    console.error("Search lyrics failed:", error);
    return [];
  }
}
