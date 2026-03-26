import { NextResponse } from "next/server";
import { exec } from "child_process";
import path from "path";
import util from "util";

const execPromise = util.promisify(exec);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get("videoId");

  if (!videoId) {
    return NextResponse.json({ error: "Missing videoId" }, { status: 400 });
  }

  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

  try {
    // 1. Determine platform extension for the binary
    const ext = process.platform === "win32" ? ".exe" : "";
    
    // 2. Resolve the absolute path to the yt-dlp binary that youtube-dl-exec downloaded
    const ytDlpPath = path.resolve(process.cwd(), "node_modules", "youtube-dl-exec", "bin", `yt-dlp${ext}`);

    // 3. Define Temporary Download Path
    const tempDir = path.resolve(process.cwd(), ".next", "cache");
    const outputFile = path.join(tempDir, `ytaudio_${videoId}.mp3`);

    // 4. Download directly via yt-dlp to a temp file, bypassing node fetch throttling
    const command = `"${ytDlpPath}" -x --audio-format mp3 -o "${outputFile}" --no-warnings --no-check-certificates "${youtubeUrl}"`;
    await execPromise(command);

    // 5. Read the fully downloaded file into memory
    const fs = await import("fs");
    const audioBuffer = fs.readFileSync(outputFile);

    // 6. Delete temp file to prevent disk bloat
    fs.unlinkSync(outputFile);

    // 7. Serve the complete Buffer to the client, preventing Next.js stream timeouts
    const headers = new Headers();
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Content-Type", "audio/mpeg");
    headers.set("Content-Length", audioBuffer.length.toString());

    return new NextResponse(audioBuffer, { 
      status: 200, 
      headers 
    });
  } catch (err: any) {
    console.error("Extraction Proxy Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

