import { NextResponse } from "next/server";
import { exec } from "child_process";
import path from "path";
import fs from "fs";
import util from "util";

const execPromise = util.promisify(exec);

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get("videoId");

  if (!videoId) {
    return NextResponse.json({ error: "Missing videoId" }, { status: 400 });
  }

  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

  try {
    // Determine the correct binary path
    const isWin = process.platform === "win32";
    const binName = isWin ? "yt-dlp.exe" : "yt-dlp-linux";
    const srcBinPath = path.join(process.cwd(), "bin", binName);
    let targetBinPath = srcBinPath;

    // On Vercel (Linux), we might need to copy and chmod to ensure execution
    if (!isWin) {
      targetBinPath = path.join("/tmp", "yt-dlp");
      if (!fs.existsSync(targetBinPath)) {
        fs.copyFileSync(srcBinPath, targetBinPath);
        fs.chmodSync(targetBinPath, 0o755);
      }
    }

    const outputFile = path.join("/tmp", `audio_${videoId}.mp3`);
    
    // Command to extract audio as mp3
    const command = `"${targetBinPath}" -x --audio-format mp3 -o "${outputFile}" --no-warnings --no-check-certificates "${youtubeUrl}"`;
    
    await execPromise(command);

    if (fs.existsSync(outputFile)) {
      const audioBuffer = fs.readFileSync(outputFile);
      fs.unlinkSync(outputFile); // Clean up
      
      const headers = new Headers();
      headers.set("Access-Control-Allow-Origin", "*");
      headers.set("Content-Type", "audio/mpeg");
      headers.set("Content-Length", audioBuffer.length.toString());
      headers.set("Cache-Control", "public, max-age=3600");

      return new NextResponse(audioBuffer, { status: 200, headers });
    } else {
      throw new Error("Output file not found after extraction");
    }

  } catch (err: any) {
    console.error(`[extract-audio] Standalone yt-dlp failed for ${videoId}:`, err.message);
    
    // --- REDUNDANT FALLBACK: @distube/ytdl-core ---
    try {
      const ytdl = (await import("@distube/ytdl-core")).default;
      const info = await ytdl.getInfo(youtubeUrl);
      const format = ytdl.chooseFormat(info.formats, { quality: "highestaudio", filter: "audioonly" });

      if (format?.url) {
        const res = await fetch(format.url);
        if (res.ok) {
          const arrayBuffer = await res.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          
          const headers = new Headers();
          headers.set("Access-Control-Allow-Origin", "*");
          headers.set("Content-Type", format.mimeType?.split(";")[0] || "audio/mpeg");
          headers.set("Content-Length", buffer.length.toString());

          return new NextResponse(buffer, { status: 200, headers });
        }
      }
    } catch (fallbackErr: any) {
       console.error(`[extract-audio] Fallback also failed:`, fallbackErr.message);
    }

    return NextResponse.json(
      { error: "Audio extraction failed. This video might be restricted or YouTube is rate-limiting." },
      { status: 500 }
    );
  }
}
