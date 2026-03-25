"use client";

import { useState } from "react";
import type { PlaylistSong } from "@/lib/playlist-types";
import { searchITunesSongs } from "@/lib/itunes";
import { audioManager } from "@/lib/audioManager";

type PlaylistWorkspaceProps = {
  isVisible?: boolean;
  onPlaySong?: (song: PlaylistSong) => void;
  onStopSong?: () => void;
  activeSongId?: string | null;
};

type RequestState = "idle" | "loading";

export function PlaylistWorkspace({
  isVisible = false,
  onPlaySong,
  onStopSong,
  activeSongId = null,
}: PlaylistWorkspaceProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PlaylistSong[]>([]);
  const [songs, setSongs] = useState<PlaylistSong[]>([]);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [error, setError] = useState<string | null>(null);

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
    setSongs((prev) => [...prev, newSong]);
    event.target.value = '';
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    setRequestState("loading");
    setError(null);
    try {
      const results = await searchITunesSongs(searchQuery);
      setSearchResults(results);
      if (results.length === 0) {
        setError("No results found on iTunes.");
      }
    } catch (err) {
      setError("Search failed.");
    } finally {
      setRequestState("idle");
    }
  };

  const addSongToQueue = (song: PlaylistSong) => {
    setSongs(prev => [...prev, song]);
    setSearchResults([]);
    setSearchQuery("");
  };

  const moveSong = (index: number, direction: -1 | 1) => {
    setSongs((currentSongs) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= currentSongs.length) return currentSongs;
      const nextSongs = [...currentSongs];
      const [song] = nextSongs.splice(index, 1);
      nextSongs.splice(nextIndex, 0, song);
      return nextSongs;
    });
  };

  const removeSong = (index: number) => {
    setSongs((current) => current.filter((_, i) => i !== index));
  };

  return (
    <section
      className={`playlist-workspace${isVisible ? " is-visible" : " is-hidden"}`}
      aria-hidden={!isVisible}
    >
      <div className="playlist-workspace__panel">
        <div className="playlist-workspace__header">
          <div className="playlist-workspace__brand">
            <WorkspaceGlyph />
            <div>
              <p className="playlist-workspace__eyebrow">Free Audio Streams</p>
              <h2 className="playlist-workspace__title">Track Queue</h2>
            </div>
          </div>
          <p className="playlist-workspace__copy">
            Search the global iTunes directory for any song to instantly add
            free 30-second audio previews to your visualizer queue, or upload local files.
          </p>
        </div>

        <form className="playlist-workspace__loader" onSubmit={handleSearch}>
          <label className="playlist-workspace__field">
            <span className="playlist-workspace__label">Search iTunes</span>
            <input
              className="playlist-workspace__input"
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="e.g., Espresso Sabrina Carpenter"
            />
          </label>
          <button
            type="submit"
            className="playlist-workspace__primary"
            disabled={requestState !== "idle" || !searchQuery.trim()}
          >
            {requestState === "loading" ? "Searching..." : "Search"}
          </button>
        </form>

        <div style={{ marginTop: "1rem", marginBottom: "1.5rem" }}>
          <label className="playlist-workspace__secondary" style={{ display: "inline-block", cursor: "pointer", textAlign: "center", paddingInline: "1rem", width: "100%" }}>
            Upload Local Audio Instead
            <input 
              type="file" 
              accept="audio/*" 
              onChange={handleFileUpload} 
              style={{ display: "none" }} 
            />
          </label>
        </div>

        {error ? <p className="playlist-workspace__error">{error}</p> : null}

        {searchResults.length > 0 && (
          <div className="playlist-workspace__list" style={{ marginBottom: "2rem", borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: "1rem" }}>
            <h3 style={{ fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "#a5a5a5", marginBottom: "1rem" }}>Search Results</h3>
            {searchResults.map((song, index) => (
              <article key={`search-${song.id}-${index}`} className="playlist-song-card">
                <div className="playlist-song-card__order">+</div>
                <div className="playlist-song-card__body">
                  <div className="playlist-song-card__title-row">
                    <h4 className="playlist-song-card__title" title={song.title}>{song.title}</h4>
                  </div>
                  <p className="playlist-song-card__meta">{song.artists.join(", ")}</p>
                </div>
                <div className="playlist-song-card__controls">
                  <button
                    type="button"
                    className="playlist-workspace__primary"
                    style={{ padding: "0.25rem 0.75rem", fontSize: "0.8rem", height: "auto" }}
                    onClick={() => addSongToQueue(song)}
                  >
                    Add
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}

        {songs.length > 0 ? (
          <div className="playlist-workspace__list">
            <h3 style={{ fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "#a5a5a5", marginBottom: "1rem" }}>Your Queue</h3>
            {songs.map((song, index) => (
              <article key={`${song.id}-${index}`} className="playlist-song-card">
                <div className="playlist-song-card__order">{String(index + 1).padStart(2, "0")}</div>
                <div className="playlist-song-card__body">
                  <div className="playlist-song-card__title-row">
                    <h4 className="playlist-song-card__title" title={song.title}>{song.title}</h4>
                  </div>
                  <p className="playlist-song-card__meta">{song.artists.join(", ")}</p>
                </div>
                <div className="playlist-song-card__duration">{formatDuration(song.durationMs)}</div>
                <div className="playlist-song-card__controls">
                  <button
                    type="button"
                    className="playlist-song-card__button"
                    onClick={() => handlePlaySong(song)}
                    disabled={!song.previewUrl}
                    title={!song.previewUrl ? "No preview available" : activeSongId === song.id ? "Stop Preview" : "Play Preview"}
                  >
                    {activeSongId === song.id ? "⏹" : "▶"}
                  </button>
                  <button
                    type="button"
                    className="playlist-song-card__button"
                    onClick={() => moveSong(index, -1)}
                    disabled={index === 0}
                  >↑</button>
                  <button
                    type="button"
                    className="playlist-song-card__button"
                    onClick={() => moveSong(index, 1)}
                    disabled={index === songs.length - 1}
                  >↓</button>
                  <button
                    type="button"
                    className="playlist-song-card__button"
                    onClick={() => removeSong(index)}
                    style={{ color: "#ff4444" }}
                  >✕</button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          !searchResults.length && (
            <div className="playlist-workspace__empty">
              <p className="playlist-workspace__empty-title">Queue is empty.</p>
              <p className="playlist-workspace__empty-copy">Search for a song or upload a local file to get started.</p>
            </div>
          )
        )}
      </div>
    </section>
  );
}

function WorkspaceGlyph() {
  return (
    <div className="playlist-workspace__local-glyph" aria-hidden="true">
      <svg viewBox="0 0 64 64" fill="none">
        <rect x="8" y="8" width="48" height="48" rx="20" fill="url(#localGlyphGradient)" />
        <path d="M26 21.5V40.5" stroke="#F6EEFF" strokeWidth="4.5" strokeLinecap="round" />
        <path d="M26 25L40 21.5V35" stroke="#F6EEFF" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="22.5" cy="42.5" r="5.5" fill="#F6EEFF" />
        <circle cx="36.5" cy="37.5" r="5.5" fill="#F6EEFF" />
        <defs>
          <linearGradient id="localGlyphGradient" x1="12" y1="10" x2="54" y2="54" gradientUnits="userSpaceOnUse">
            <stop stopColor="#00f3ff" />
            <stop offset="1" stopColor="#ff00ff" />
          </linearGradient>
        </defs>
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
