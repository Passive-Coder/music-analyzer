const { execSync } = require('child_process');
const path = require('path');

const id = "cNGjD0VG4R8"; // Ed Sheeran - Perfect
const binary = process.platform === 'win32' ? 'bin/yt-dlp.exe' : 'bin/yt-dlp-linux';
const binaryPath = path.resolve(binary);

console.log(`Extracting audio for ${id}...`);
try {
  // Try to get extraction URL
  const result = execSync(`"${binaryPath}" -g -f "ba" "https://www.youtube.com/watch?v=${id}"`).toString();
  console.log("Extraction Success! URL Preview:", result.substring(0, 50));
} catch (err) {
  console.error("Extraction failed for Ed Sheeran - Perfect:", err.message);
  if (err.stdout) console.log("STDOUT:", err.stdout.toString());
  if (err.stderr) console.log("STDERR:", err.stderr.toString());
}
