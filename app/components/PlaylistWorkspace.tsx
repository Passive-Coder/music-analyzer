"use client";

import { useState } from "react";

import type { PlaylistData, PlaylistSong } from "@/lib/playlist-types";

type PlaylistWorkspaceProps = {
  isVisible?: boolean;
};

type RequestState = "idle" | "loading" | "publishing";

export function PlaylistWorkspace({
  isVisible = false,
}: PlaylistWorkspaceProps) {
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [playlist, setPlaylist] = useState<PlaylistData | null>(null);
  const [songs, setSongs] = useState<PlaylistSong[]>([]);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [publishedCode, setPublishedCode] = useState<string | null>(null);

  const hasSongs = songs.length > 0;

  const handleLoadPlaylist = async () => {
    setRequestState("loading");
    setError(null);
    setPublishedCode(null);

    try {
      const response = await fetch("/api/spotify/playlist", {
        body: JSON.stringify({ playlistUrl }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      const payload = (await response.json()) as {
        error?: string;
        playlist?: PlaylistData;
      };

      if (!response.ok || !payload.playlist) {
        throw new Error(payload.error ?? "Playlist loading failed.");
      }

      setPlaylist(payload.playlist);
      setSongs(payload.playlist.songs);
    } catch (loadError) {
      setPlaylist(null);
      setSongs([]);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Playlist loading failed."
      );
    } finally {
      setRequestState("idle");
    }
  };

  const handlePublishPlaylist = async () => {
    if (!playlist || !songs.length) {
      return;
    }

    setRequestState("publishing");
    setError(null);

    try {
      const response = await fetch("/api/publish-playlist", {
        body: JSON.stringify({
          playlist,
          songs,
          sourceUrl: playlistUrl || playlist.spotifyUrl,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      const payload = (await response.json()) as {
        code?: string;
        error?: string;
      };

      if (!response.ok || !payload.code) {
        throw new Error(payload.error ?? "Publishing the playlist failed.");
      }

      setPublishedCode(payload.code);
    } catch (publishError) {
      setError(
        publishError instanceof Error
          ? publishError.message
          : "Publishing the playlist failed."
      );
    } finally {
      setRequestState("idle");
    }
  };

  const moveSong = (index: number, direction: -1 | 1) => {
    setSongs((currentSongs) => {
      const nextIndex = index + direction;

      if (nextIndex < 0 || nextIndex >= currentSongs.length) {
        return currentSongs;
      }

      const nextSongs = [...currentSongs];
      const [song] = nextSongs.splice(index, 1);
      nextSongs.splice(nextIndex, 0, song);

      return nextSongs;
    });
  };

  const shuffleSongs = () => {
    setSongs((currentSongs) => {
      const nextSongs = [...currentSongs];

      for (let index = nextSongs.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [nextSongs[index], nextSongs[swapIndex]] = [
          nextSongs[swapIndex],
          nextSongs[index],
        ];
      }

      return nextSongs;
    });
  };

  return (
    <section
      className={`playlist-workspace${isVisible ? " is-visible" : " is-hidden"}`}
      aria-hidden={!isVisible}
    >
      <div className="playlist-workspace__panel">
        <div className="playlist-workspace__header">
          <div className="playlist-workspace__brand">
            <SpotifyGlyph />
            <div>
              <p className="playlist-workspace__eyebrow">Spotify</p>
              <h2 className="playlist-workspace__title">Playlist</h2>
            </div>
          </div>
          <p className="playlist-workspace__copy">
            Paste a Spotify playlist link, reorder the songs, shuffle the stack,
            and publish a backend code for the current sequence.
          </p>
        </div>

        <div className="playlist-workspace__loader">
          <label className="playlist-workspace__field">
            <span className="playlist-workspace__label">Spotify Playlist Link</span>
            <input
              className="playlist-workspace__input"
              type="url"
              value={playlistUrl}
              onChange={(event) => setPlaylistUrl(event.target.value)}
              placeholder="https://open.spotify.com/playlist/..."
            />
          </label>
          <button
            type="button"
            className="playlist-workspace__primary"
            onClick={handleLoadPlaylist}
            disabled={requestState !== "idle"}
          >
            {requestState === "loading" ? "Loading..." : "Load Playlist"}
          </button>
        </div>

        {playlist ? (
          <div className="playlist-workspace__meta">
            <div>
              <p className="playlist-workspace__meta-label">Loaded Playlist</p>
              <h3 className="playlist-workspace__meta-title">{playlist.title}</h3>
              <p className="playlist-workspace__meta-subtitle">
                {playlist.owner} · {songs.length} songs
              </p>
            </div>
            <a
              className="playlist-workspace__meta-link"
              href={playlist.spotifyUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open On Spotify
            </a>
          </div>
        ) : (
          <div className="playlist-workspace__empty">
            <p className="playlist-workspace__empty-title">
              No playlist loaded yet.
            </p>
            <p className="playlist-workspace__empty-copy">
              The loader uses Spotify&apos;s Web API. If the request is rejected,
              configure `SPOTIFY_ACCESS_TOKEN` or your Spotify app credentials on
              the server.
            </p>
          </div>
        )}

        <div className="playlist-workspace__toolbar">
          <button
            type="button"
            className="playlist-workspace__secondary"
            onClick={shuffleSongs}
            disabled={!hasSongs}
          >
            Random Shuffle
          </button>
          {publishedCode ? (
            <p className="playlist-workspace__code">
              Backend code: <span>{publishedCode}</span>
            </p>
          ) : null}
        </div>

        {error ? <p className="playlist-workspace__error">{error}</p> : null}

        <div className="playlist-workspace__list">
          {songs.map((song, index) => (
            <article key={`${song.id}-${index}`} className="playlist-song-card">
              <div className="playlist-song-card__order">
                {String(index + 1).padStart(2, "0")}
              </div>
              <div className="playlist-song-card__body">
                <h4 className="playlist-song-card__title">{song.title}</h4>
                <p className="playlist-song-card__meta">
                  {song.artists.join(", ")} · {song.album}
                </p>
              </div>
              <div className="playlist-song-card__duration">
                {formatDuration(song.durationMs)}
              </div>
              <div className="playlist-song-card__controls">
                <button
                  type="button"
                  className="playlist-song-card__button"
                  onClick={() => moveSong(index, -1)}
                  disabled={index === 0}
                  aria-label={`Move ${song.title} up`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="playlist-song-card__button"
                  onClick={() => moveSong(index, 1)}
                  disabled={index === songs.length - 1}
                  aria-label={`Move ${song.title} down`}
                >
                  ↓
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="playlist-workspace__publish">
        <button
          type="button"
          className="playlist-workspace__publish-button"
          onClick={handlePublishPlaylist}
          disabled={!hasSongs || requestState === "publishing"}
        >
          {requestState === "publishing" ? "Publishing..." : "Publish Playlist"}
        </button>
      </div>
    </section>
  );
}

function SpotifyGlyph() {
  return (
    <div className="spotify-glyph" aria-hidden="true">
      <svg viewBox="0 0 64 64" fill="none">
        <circle cx="32" cy="32" r="32" fill="#1ED760" />
        <path
          d="M17 23.5C26.4 20.3 38.5 20.9 47 25.3"
          stroke="#08120D"
          strokeWidth="4.5"
          strokeLinecap="round"
        />
        <path
          d="M20.5 32.6C27.7 30.2 36.1 30.5 43.2 34.3"
          stroke="#08120D"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d="M24.3 40.7C29.5 39.2 35 39.6 39.8 42"
          stroke="#08120D"
          strokeWidth="3.6"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

function formatDuration(durationMs: number) {
  const totalSeconds = Math.max(Math.round(durationMs / 1000), 0);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
