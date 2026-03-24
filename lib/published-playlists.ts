import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

import type {
  PlaylistData,
  PlaylistSong,
  PublishedPlaylistRecord,
} from "@/lib/playlist-types";

const PUBLISHED_PLAYLISTS_DIR = path.join(
  process.cwd(),
  "data",
  "published-playlists"
);

export async function createPublishedPlaylistRecord(input: {
  playlist: PlaylistData;
  songs: PlaylistSong[];
  sourceUrl: string;
}) {
  await mkdir(PUBLISHED_PLAYLISTS_DIR, { recursive: true });

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = createPlaylistCode();
    const record: PublishedPlaylistRecord = {
      code,
      createdAt: new Date().toISOString(),
      playlist: {
        ...input.playlist,
        songs: input.songs,
      },
      sourceUrl: input.sourceUrl,
    };

    try {
      await writeFile(
        getPublishedPlaylistPath(code),
        JSON.stringify(record, null, 2),
        {
          encoding: "utf8",
          flag: "wx",
        }
      );

      return record;
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "EEXIST"
      ) {
        continue;
      }

      throw error;
    }
  }

  throw new Error("Could not create a unique playlist code.");
}

export async function getPublishedPlaylistRecord(code: string) {
  const normalizedCode = code.trim().toUpperCase();
  const payload = await readFile(getPublishedPlaylistPath(normalizedCode), "utf8");
  return JSON.parse(payload) as PublishedPlaylistRecord;
}

function getPublishedPlaylistPath(code: string) {
  return path.join(PUBLISHED_PLAYLISTS_DIR, `${code}.json`);
}

function createPlaylistCode() {
  return randomBytes(4).toString("hex").toUpperCase();
}
