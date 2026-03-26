const { execSync } = require('child_process');
const path = require('path');

const id = "cNGjD0VG4R8"; // Ed Sheeran - Perfect
const binary = process.platform === 'win32' ? 'bin/yt-dlp.exe' : 'bin/yt-dlp-linux';
const binaryPath = path.resolve(binary);

console.log(`Checking AUTO-generated captions for ${id}...`);
try {
  const result = execSync(`"${binaryPath}" --list-subs --write-auto-subs "https://www.youtube.com/watch?v=${id}"`).toString();
  console.log("Subtitles listed (including auto):\n", result);
} catch (err) {
  console.error("Failed to list subs:", err.stderr?.toString());
}
