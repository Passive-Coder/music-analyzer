export type TimedLyricLine = {
  startTimeMs: number;
  text: string;
};

export type LyricWord = {
  endTimeMs: number;
  id: string;
  startTimeMs: number;
  text: string;
};

export type LyricLine = {
  endTimeMs: number;
  id: string;
  startTimeMs: number;
  text: string;
  words: LyricWord[];
};

export type TrackLyrics = {
  hasWordTiming: boolean;
  lines: LyricLine[];
  synced: boolean;
};

export function parseSyncedLyrics(input: string | null | undefined): TrackLyrics {
  if (!input) {
    return {
      hasWordTiming: false,
      lines: [],
      synced: false,
    };
  }

  const rawLines = input.split(/\r?\n/);
  const parsedLines: LyricLine[] = [];
  let hasWordTiming = false;

  for (let lineIndex = 0; lineIndex < rawLines.length; lineIndex += 1) {
    const rawLine = rawLines[lineIndex]?.trim();

    if (!rawLine) {
      continue;
    }

    const lineMatch = rawLine.match(/^\[(\d{1,3}:\d{2}(?:\.\d{1,3})?)\](.*)$/);

    if (!lineMatch) {
      continue;
    }

    const lineStartTimeMs = parseTimeStringToMs(lineMatch[1]);
    const lineContent = lineMatch[2] ?? "";
    const words = parseLineWords(lineContent, lineIndex, lineStartTimeMs);

    if (words.length === 0) {
      continue;
    }

    hasWordTiming ||= words.length > 1 || words[0]?.startTimeMs !== lineStartTimeMs;

    parsedLines.push({
      endTimeMs: words[words.length - 1]?.endTimeMs ?? lineStartTimeMs + 2_000,
      id: `line-${lineIndex}`,
      startTimeMs: lineStartTimeMs,
      text: words.map((word) => word.text).join("").trim(),
      words,
    });
  }

  parsedLines.sort((left, right) => left.startTimeMs - right.startTimeMs);

  for (let index = 0; index < parsedLines.length - 1; index += 1) {
    const currentLine = parsedLines[index];
    const nextLine = parsedLines[index + 1];

    if (
      currentLine.words.length === 1 &&
      currentLine.words[0] &&
      currentLine.words[0].endTimeMs === currentLine.words[0].startTimeMs + 2_000
    ) {
      const adjustedEndTimeMs = Math.min(
        currentLine.startTimeMs + 5_000,
        nextLine.startTimeMs
      );

      currentLine.endTimeMs = adjustedEndTimeMs;
      currentLine.words[0].endTimeMs = adjustedEndTimeMs;
    }
  }

  return {
    hasWordTiming,
    lines: parsedLines,
    synced: parsedLines.length > 0,
  };
}

export function flattenLyricsToTimedLines(lyrics: TrackLyrics | null | undefined) {
  return (lyrics?.lines ?? []).map((line) => ({
    startTimeMs: line.startTimeMs,
    text: line.text,
  }));
}

export function getActiveLyricLineIndex(
  lyrics: TrackLyrics | null | undefined,
  currentTimeMs: number
) {
  const lines = lyrics?.lines ?? [];

  if (lines.length === 0) {
    return -1;
  }

  let low = 0;
  let high = lines.length - 1;
  let result = -1;

  while (low <= high) {
    const mid = (low + high) >>> 1;

    if (lines[mid].startTimeMs <= currentTimeMs) {
      result = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return result;
}

export function flattenLyricWords(lyrics: TrackLyrics | null | undefined) {
  return (lyrics?.lines ?? []).flatMap((line) => line.words);
}

function parseLineWords(
  lineContent: string,
  lineIndex: number,
  lineStartTimeMs: number
): LyricWord[] {
  if (!lineContent.trim()) {
    return [];
  }

  if (!lineContent.includes("<")) {
    const text = lineContent.trim();

    return text
      ? [
          {
            endTimeMs: lineStartTimeMs + 2_000,
            id: `word-${lineIndex}-0`,
            startTimeMs: lineStartTimeMs,
            text,
          },
        ]
      : [];
  }

  const parts = lineContent.split("<");
  const timedWords: Array<{ startTimeMs: number; text: string }> = [];

  for (const part of parts) {
    const trimmed = part.trim();

    if (!trimmed) {
      continue;
    }

    const tagMatch = trimmed.match(/^(\d{2,3}:\d{2}\.\d{2,3})>(.*)$/);

    if (!tagMatch) {
      continue;
    }

    timedWords.push({
      startTimeMs: parseTimeStringToMs(tagMatch[1]),
      text: tagMatch[2] ?? "",
    });
  }

  return timedWords
    .map((word, wordIndex) => {
      const text = word.text.trim();

      if (!text) {
        return null;
      }

      return {
        endTimeMs:
          timedWords[wordIndex + 1]?.startTimeMs ?? word.startTimeMs + 1_000,
        id: `word-${lineIndex}-${wordIndex}`,
        startTimeMs: word.startTimeMs,
        text: `${text} `,
      };
    })
    .filter((word): word is LyricWord => word !== null);
}

function parseTimeStringToMs(input: string) {
  const parts = input.split(":");

  if (parts.length === 3) {
    return Math.round(
      (Number(parts[0]) * 3_600 + Number(parts[1]) * 60 + Number(parts[2])) *
        1_000
    );
  }

  if (parts.length === 2) {
    return Math.round((Number(parts[0]) * 60 + Number(parts[1])) * 1_000);
  }

  return 0;
}
