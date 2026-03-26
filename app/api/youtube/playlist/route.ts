import { NextResponse } from "next/server";
import { exec } from "child_process";
import path from "path";
import fs from "fs";
import util from "util";

const execPromise = util.promisify(exec);

export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const listId = searchParams.get("listId");

  if (!listId) {
    return NextResponse.json({ error: "Missing listId parameter" }, { status: 400 });
  }

  const playlistUrl = `https://www.youtube.com/playlist?list=${listId}`;

  try {
    // Determine the correct binary path
    const isWin = process.platform === "win32";
    const binName = isWin ? "yt-dlp.exe" : "yt-dlp-linux";
    const srcBinPath = path.join(process.cwd(), "bin", binName);
    let targetBinPath = srcBinPath;

    // Platform-specific logic for Linux/Vercel
    if (!isWin) {
      targetBinPath = path.join("/tmp", "yt-dlp");
      if (!fs.existsSync(targetBinPath)) {
        fs.copyFileSync(srcBinPath, targetBinPath);
        fs.chmodSync(targetBinPath, 0o755);
      }
    }

    // Command to extract flat playlist (very fast, no audio downloaded)
    const command = `"${targetBinPath}" --flat-playlist -J "${playlistUrl}"`;
    const { stdout, stderr } = await execPromise(command);

    if (!stdout || stdout.trim() === "") {
        console.error("[playlist] yt-dlp error:", stderr);
        throw new Error("Failed to parse playlist");
    }

    const playlistData = JSON.parse(stdout.trim());
    const entries = playlistData.entries || [];

    const mappedSongs = entries.map((entry: any, index: number) => {
      const videoId = entry.id || entry.url;
      const title = entry.title || `Track ${index + 1}`;
      const uploader = entry.uploader || playlistData.uploader || "YouTube Artist";
      const durationMs = (entry.duration || 0) * 1000;
      
      let thumb = null;
      if (entry.thumbnails && entry.thumbnails.length > 0) {
        thumb = entry.thumbnails[entry.thumbnails.length - 1].url; 
      }

      return {
        id: `yt-pl-${videoId}-${index}`,
        title,
        artists: [uploader],
        album: playlistData.title || "YouTube Playlist",
        durationMs,
        artworkUrl: thumb,
        previewUrl: null,
        spotifyId: videoId,
        spotifyUrl: `https://youtube.com/watch?v=${videoId}`,
        uri: null,
      };
    }).filter((s: any) => s.spotifyId);

    return NextResponse.json({ items: mappedSongs });

  } catch (err: any) {
    console.error(`[playlist] Standalone yt-dlp failed, using scraper fallback:`, err.message);

    // --- FALLBACK: Direct Scraper ---
    try {
        const res = await fetch(playlistUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            }
        });
        const html = await res.text();
        const match = html.match(/var ytInitialData\s*=\s*(\{[\s\S]+?\});\s*<\/script>/);
        if (match) {
            const ytData = JSON.parse(match[1]);
            const tabs = ytData?.contents?.twoColumnBrowseResultsRenderer?.tabs ?? [];
            const tab = tabs.find((t: any) => t?.tabRenderer?.selected);
            const contents = tab?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]
                ?.itemSectionRenderer?.contents?.[0]
                ?.playlistVideoListRenderer?.contents ?? [];

            const mappedSongs = contents.map((item: any, index: number) => {
                const v = item?.playlistVideoRenderer;
                if (!v) return null;
                return {
                    id: `yt-pl-${v.videoId}-${index}`,
                    title: v.title?.runs?.[0]?.text || "Track",
                    artists: [v.shortBylineText?.runs?.[0]?.text || "Artist"],
                    album: "YouTube Playlist",
                    durationMs: parseInt(v.lengthSeconds || "0", 10) * 1000,
                    artworkUrl: v.thumbnail?.thumbnails?.at(-1)?.url || null,
                    previewUrl: null,
                    spotifyId: v.videoId,
                    spotifyUrl: `https://youtube.com/watch?v=${v.videoId}`,
                    uri: null
                };
            }).filter(Boolean);

            return NextResponse.json({ items: mappedSongs });
        }
    } catch (scrapErr: any) {
        console.error(`[playlist] Scraper also failed:`, scrapErr.message);
    }

    return NextResponse.json({ error: "Failed to load playlist. Check if the URL is correct and public." }, { status: 500 });
  }
}
