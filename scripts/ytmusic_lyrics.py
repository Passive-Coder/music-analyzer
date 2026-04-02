import json
import re
import sys
from typing import Any

from ytmusicapi import YTMusic

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass


NOISE_TERMS = (
    "official video",
    "official music video",
    "official audio",
    "video song",
    "full song",
    "lyric video",
    "with lyrics",
    "lyrics",
    "audio",
    "music video",
    "hd",
    "4k",
)
NOTE_LINES = {"\u266a", "\u266b", "\u266c", "\u2669", "â™ª"}
MAX_CANDIDATES = 14


def normalize(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", (value or "").casefold())).strip()


def compact_spaces(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def strip_noise_brackets(value: str) -> str:
    def replace(match: re.Match[str]) -> str:
        content = match.group(1)
        normalized = normalize(content)
        if any(term in normalized for term in NOISE_TERMS):
            return " "
        return match.group(0)

    cleaned = re.sub(r"\(([^)]*)\)", replace, value)
    cleaned = re.sub(r"\[([^]]*)\]", replace, cleaned)
    return cleaned


def sanitize_title(title: str) -> str:
    cleaned = strip_noise_brackets(title or "")
    cleaned = re.sub(r"\bft\.?\b", "feat", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bfeat\.?\b.*$", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.split(r"\s[|\-:]\s", cleaned)[0]

    for term in NOISE_TERMS:
        cleaned = re.sub(rf"\b{re.escape(term)}\b", " ", cleaned, flags=re.IGNORECASE)

    cleaned = re.sub(r"\s+", " ", cleaned).strip(" -_:|")
    return compact_spaces(cleaned)


def sanitize_artist(artist: str) -> str:
    cleaned = compact_spaces((artist or "").replace("&", ","))
    normalized = normalize(cleaned)
    if normalized in {"youtube", "yt music", "ytmusic", "t series", "tseries"}:
        return ""
    if re.search(
        r"\b(topic|records|music|entertainment|official|channel|films|series)\b",
        normalized,
    ):
        return ""
    return cleaned


def unique_queries(title: str, artist: str) -> list[str]:
    sanitized_title = sanitize_title(title)
    sanitized_artist = sanitize_artist(artist)
    variants = [
        compact_spaces(f"{title} {sanitized_artist}"),
        compact_spaces(f"{sanitized_title} {sanitized_artist}"),
        compact_spaces(sanitized_title),
        compact_spaces(title),
    ]

    if " - " in title:
        left, right = [part.strip() for part in title.split(" - ", 1)]
        variants.extend(
            [
                compact_spaces(f"{right} {sanitized_artist}"),
                compact_spaces(right),
                compact_spaces(f"{left} {right}"),
            ]
        )

    deduped: list[str] = []
    seen: set[str] = set()

    for value in variants:
        if not value:
            continue
        key = normalize(value)
        if key and key not in seen:
            deduped.append(value)
            seen.add(key)

    return deduped


def result_duration_ms(result: dict[str, Any]) -> int | None:
    duration_seconds = result.get("duration_seconds")
    if isinstance(duration_seconds, (int, float)) and duration_seconds > 0:
        return int(round(float(duration_seconds) * 1000))

    duration_text = result.get("duration")
    if not isinstance(duration_text, str) or ":" not in duration_text:
        return None

    parts = duration_text.split(":")
    seconds = 0.0
    for part in parts:
        seconds = seconds * 60 + float(part)
    return int(round(seconds * 1000))


def artist_names(result: dict[str, Any]) -> list[str]:
    artists = result.get("artists") or []
    names: list[str] = []
    for artist in artists:
        if isinstance(artist, dict):
            name = compact_spaces(str(artist.get("name") or ""))
        else:
            name = compact_spaces(str(artist or ""))
        if name:
            names.append(name)
    return names


def score_result(
    result: dict[str, Any],
    *,
    target_title: str,
    target_artist: str,
    target_album: str,
    target_duration_ms: int,
    target_video_id: str,
) -> float:
    score = 0.0

    result_title = normalize(str(result.get("title") or ""))
    result_artist = normalize(" ".join(artist_names(result)))
    result_album = normalize(str((result.get("album") or {}).get("name") or ""))
    expected_title = normalize(sanitize_title(target_title) or target_title)
    expected_artist = normalize(target_artist)
    expected_album = normalize(target_album)

    if target_video_id and result.get("videoId") == target_video_id:
        score += 120

    if result_title == expected_title:
        score += 40
    elif expected_title and (result_title in expected_title or expected_title in result_title):
        score += 24

    if expected_artist and result_artist == expected_artist:
        score += 24
    elif expected_artist and (
        result_artist in expected_artist or expected_artist in result_artist
    ):
        score += 12

    if expected_album and result_album == expected_album:
        score += 8

    if target_duration_ms > 0:
        result_ms = result_duration_ms(result)
        if result_ms:
            diff = abs(result_ms - target_duration_ms)
            if diff <= 2500:
                score += 18
            elif diff <= 7000:
                score += 11
            elif diff <= 15000:
                score += 5

    category = str(result.get("category") or "").lower()
    if category == "songs":
        score += 8
    elif category == "videos":
        score += 4

    return score


def get_watch_candidate(ytmusic: YTMusic, video_id: str) -> dict[str, Any] | None:
    if not video_id:
        return None

    try:
        watch = ytmusic.get_watch_playlist(videoId=video_id, limit=1)
    except Exception:
        return None

    track = (watch.get("tracks") or [{}])[0]
    return {
        "album": track.get("album"),
        "artists": track.get("artists") or [],
        "category": "songs",
        "duration": track.get("duration"),
        "duration_seconds": track.get("duration_seconds"),
        "lyricsBrowseId": watch.get("lyrics"),
        "title": track.get("title") or watch.get("title"),
        "videoId": video_id,
    }


def search_candidates(
    ytmusic: YTMusic,
    *,
    title: str,
    artist: str,
    album: str,
    duration_ms: int,
    video_id: str,
) -> list[dict[str, Any]]:
    ranked: list[tuple[float, dict[str, Any]]] = []
    seen: set[str] = set()

    direct = get_watch_candidate(ytmusic, video_id)
    if direct:
        ranked.append(
            (
                score_result(
                    direct,
                    target_title=title,
                    target_artist=artist,
                    target_album=album,
                    target_duration_ms=duration_ms,
                    target_video_id=video_id,
                ),
                direct,
            )
        )
        seen.add(str(direct.get("videoId") or ""))

    for query in unique_queries(title, artist):
        for filter_name in ("songs", "videos", None):
            try:
                results = ytmusic.search(query, filter=filter_name, limit=10)
            except Exception:
                continue

            for result in results:
                candidate_video_id = str(result.get("videoId") or "")
                if not candidate_video_id or candidate_video_id in seen:
                    continue

                ranked.append(
                    (
                        score_result(
                            result,
                            target_title=title,
                            target_artist=artist,
                            target_album=album,
                            target_duration_ms=duration_ms,
                            target_video_id=video_id,
                        ),
                        result,
                    )
                )
                seen.add(candidate_video_id)

    ranked.sort(key=lambda item: item[0], reverse=True)
    return [candidate for _, candidate in ranked[:MAX_CANDIDATES]]


def clean_line_text(value: str) -> str:
    text = compact_spaces(value)
    if text in NOTE_LINES:
        return ""
    return text


def build_track_lyrics(timed_lyrics: dict[str, Any]) -> dict[str, Any] | None:
    raw_lines = timed_lyrics.get("lyrics") or []
    lines: list[dict[str, Any]] = []

    for index, raw_line in enumerate(raw_lines):
        text = clean_line_text(str(getattr(raw_line, "text", "") or ""))
        start_time = getattr(raw_line, "start_time", None)
        end_time = getattr(raw_line, "end_time", None)

        if not text or not isinstance(start_time, int):
            continue

        resolved_end = end_time if isinstance(end_time, int) and end_time > start_time else start_time + 2000
        lines.append(
            {
                "endTimeMs": resolved_end,
                "id": f"ytm-line-{index}",
                "startTimeMs": start_time,
                "text": text,
                "words": [
                    {
                        "endTimeMs": resolved_end,
                        "id": f"ytm-word-{index}-0",
                        "startTimeMs": start_time,
                        "text": text,
                    }
                ],
            }
        )

    if not lines:
        return None

    for index in range(len(lines) - 1):
        current = lines[index]
        next_line = lines[index + 1]
        current["endTimeMs"] = max(
            current["startTimeMs"] + 1000,
            min(current["endTimeMs"], next_line["startTimeMs"]),
        )
        current["words"][0]["endTimeMs"] = current["endTimeMs"]

    return {
        "hasWordTiming": False,
        "lines": lines,
        "synced": True,
    }


def fetch_candidate_lyrics(ytmusic: YTMusic, candidate: dict[str, Any]) -> dict[str, Any]:
    browse_id = candidate.get("lyricsBrowseId")

    if not browse_id:
        watch_candidate = get_watch_candidate(ytmusic, str(candidate.get("videoId") or ""))
        if watch_candidate:
            browse_id = watch_candidate.get("lyricsBrowseId")
            candidate = {**watch_candidate, **candidate}

    if not browse_id:
        return {
            "plainLyrics": None,
            "provider": "ytmusicapi",
            "source": None,
            "status": "not-found",
            "trackLyrics": None,
        }

    try:
        timed_lyrics = ytmusic.get_lyrics(browse_id, timestamps=True)
    except Exception:
        timed_lyrics = None

    if isinstance(timed_lyrics, dict) and timed_lyrics.get("hasTimestamps"):
        track_lyrics = build_track_lyrics(timed_lyrics)
        if track_lyrics:
            return {
                "plainLyrics": None,
                "provider": "ytmusicapi",
                "source": timed_lyrics.get("source"),
                "status": "ok",
                "trackLyrics": track_lyrics,
            }

    try:
        plain_lyrics = ytmusic.get_lyrics(browse_id, timestamps=False)
    except Exception:
        plain_lyrics = None

    if isinstance(plain_lyrics, dict):
        plain_text = "\n".join(
            clean_line_text(str(line))
            for line in (plain_lyrics.get("lyrics") or [])
            if clean_line_text(str(line))
        ).strip()
        if plain_text:
            return {
                "plainLyrics": plain_text,
                "provider": "ytmusicapi",
                "source": plain_lyrics.get("source"),
                "status": "plain-only",
                "trackLyrics": None,
            }

    return {
        "plainLyrics": None,
        "provider": "ytmusicapi",
        "source": None,
        "status": "not-found",
        "trackLyrics": None,
    }


def main() -> None:
    title = sys.argv[1] if len(sys.argv) > 1 else ""
    artist = sys.argv[2] if len(sys.argv) > 2 else ""
    album = sys.argv[3] if len(sys.argv) > 3 else ""
    try:
        duration_ms = int(sys.argv[4]) if len(sys.argv) > 4 and sys.argv[4] else 0
    except ValueError:
        duration_ms = 0
    video_id = sys.argv[5] if len(sys.argv) > 5 else ""

    ytmusic = YTMusic()
    best_plain: dict[str, Any] | None = None

    for candidate in search_candidates(
        ytmusic,
        title=title,
        artist=artist,
        album=album,
        duration_ms=duration_ms,
        video_id=video_id,
    ):
        result = fetch_candidate_lyrics(ytmusic, candidate)
        if result.get("trackLyrics"):
            print(json.dumps(result, ensure_ascii=False))
            return

        if result.get("status") == "plain-only" and not best_plain:
            best_plain = result

    if best_plain:
        print(json.dumps(best_plain, ensure_ascii=False))
        return

    print(
        json.dumps(
            {
                "plainLyrics": None,
                "provider": "ytmusicapi",
                "source": None,
                "status": "not-found",
                "trackLyrics": None,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
