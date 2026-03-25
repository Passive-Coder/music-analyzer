"use client";

import { useState, useEffect } from "react";

import type { PlaylistData, PlaylistSong } from "@/lib/playlist-types";
import { audioManager } from "@/lib/audioManager";

type PlaylistWorkspaceProps = {
  isVisible?: boolean;
  onPlaySong?: (song: PlaylistSong) => void;
  onStopSong?: () => void;
  activeSongId?: string | null;
};

type RequestState = "idle" | "loading" | "publishing";

export function PlaylistWorkspace({
  isVisible = false,
  onPlaySong,
  onStopSong,
  activeSongId = null,
}: PlaylistWorkspaceProps) {
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [playlist, setPlaylist] = useState<PlaylistData | null>(null);
  const [songs, setSongs] = useState<PlaylistSong[]>([]);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [publishedCode, setPublishedCode] = useState<string | null>(null);

  const handlePlaySong = (song: PlaylistSong) => {
    if (!audioManager || !song.previewUrl) return;

    if (activeSongId === song.id) {
      audioManager.stop();
      if (onStopSong) onStopSong();
    } else {
      audioManager.play(song.previewUrl);
      if (onPlaySong) onPlaySong(song);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const newSong: PlaylistSong = {
      album: "Local Upload",
      artists: ["Local Audio"],
      artworkUrl: null,
      durationMs: 0,
      id: `local-${Date.now()}`,
      previewUrl: url,
      spotifyId: null,
      spotifyUrl: null,
      title: file.name,
      uri: null,
    };
    
    if (!playlist) {
      setPlaylist({
        description: "Your local audio testing playground.",
        id: "local-playlist",
        imageUrl: null,
        owner: "You",
        songs: [newSong],
        spotifyUrl: "",
        title: "Local Tracks",
      });
    }
    
    setSongs((prev) => [...prev, newSong]);
    event.target.value = '';
  };

  const hasSongs = songs.length > 0;
  const isLocalPlaylist = playlist?.id === "local-playlist" || !playlist?.spotifyUrl;

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
            <WorkspaceGlyph isLocal={Boolean(isLocalPlaylist && playlist)} />
            <div>
              <p className="playlist-workspace__eyebrow">
                {isLocalPlaylist && playlist ? "Local Audio" : "Spotify"}
              </p>
              <h2 className="playlist-workspace__title">
                {isLocalPlaylist && playlist ? "Track Queue" : "Playlist"}
              </h2>
            </div>
          </div>
          <p className="playlist-workspace__copy">
            {isLocalPlaylist && playlist
              ? "Upload local audio, reorder the queue, shuffle the stack, and publish the current sequence."
              : "Paste a Spotify playlist link, reorder the songs, shuffle the stack, and publish a backend code for the current sequence."}
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

        <div style={{ marginTop: "1rem", marginBottom: "1.5rem" }}>
          <label className="playlist-workspace__secondary" style={{ display: "inline-block", cursor: "pointer", textAlign: "center", paddingInline: "1rem", width: "100%" }}>
            Upload Local Audio Instead (No API Needed)
            <input 
              type="file" 
              accept="audio/*" 
              onChange={handleFileUpload} 
              style={{ display: "none" }} 
            />
          </label>
        </div>

        {playlist ? (
          <div
            className={`playlist-workspace__meta${isLocalPlaylist ? " playlist-workspace__meta--local" : ""}`}
          >
            <div>
              <p className="playlist-workspace__meta-label">Loaded Playlist</p>
              <h3 className="playlist-workspace__meta-title">{playlist.title}</h3>
              <p className="playlist-workspace__meta-subtitle">
                {playlist.owner} · {songs.length} songs
              </p>
            </div>
            {!isLocalPlaylist ? (
              <a
                className="playlist-workspace__meta-link"
                href={playlist.spotifyUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open On Spotify
              </a>
            ) : null}
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
            <article
              key={`${song.id}-${index}`}
              className={`playlist-song-card${!song.spotifyUrl ? " playlist-song-card--local" : ""}`}
            >
              <div className="playlist-song-card__order">
                {String(index + 1).padStart(2, "0")}
              </div>
              <div className="playlist-song-card__body">
                <div className="playlist-song-card__title-row">
                  <h4 className="playlist-song-card__title" title={song.title}>
                    {song.title}
                  </h4>
                </div>
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
                  onClick={() => handlePlaySong(song)}
                  disabled={!song.previewUrl}
                  title={!song.previewUrl ? "No preview available" : activeSongId === song.id ? "Stop Preview" : "Play Preview"}
                  aria-label={activeSongId === song.id ? `Stop ${song.title}` : `Play ${song.title}`}
                >
                  {activeSongId === song.id ? "⏹" : "▶"}
                </button>
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

function WorkspaceGlyph({ isLocal }: { isLocal: boolean }) {
  if (isLocal) {
    return (
      <div className="playlist-workspace__local-glyph" aria-hidden="true">
        <svg viewBox="0 0 64 64" fill="none">
          <rect x="8" y="8" width="48" height="48" rx="20" fill="url(#localGlyphGradient)" />
          <path
            d="M26 21.5V40.5"
            stroke="#F6EEFF"
            strokeWidth="4.5"
            strokeLinecap="round"
          />
          <path
            d="M26 25L40 21.5V35"
            stroke="#F6EEFF"
            strokeWidth="4.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="22.5" cy="42.5" r="5.5" fill="#F6EEFF" />
          <circle cx="36.5" cy="37.5" r="5.5" fill="#F6EEFF" />
          <defs>
            <linearGradient id="localGlyphGradient" x1="12" y1="10" x2="54" y2="54" gradientUnits="userSpaceOnUse">
              <stop stopColor="#C38BFF" />
              <stop offset="1" stopColor="#6E45D3" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    );
  }

  return <SpotifyGlyph />;
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
