const { execSync } = require('child_process');
const path = require('path');

const query = "Perfect";
const binary = process.platform === 'win32' ? 'bin/yt-dlp.exe' : 'bin/yt-dlp-linux';
const binaryPath = path.resolve(binary);

try {
  const result = execSync(`"${binaryPath}" "ytsearch5:${query}" --dump-json --flat-playlist --quiet`).toString();
  const lines = result.split('\n').filter(l => l.trim().length > 0);
  lines.forEach((line, i) => {
    const data = JSON.parse(line);
    console.log(`Result ${i + 1}: ${data.title} (${data.id}) - ${data.duration}s`);
  });
} catch (err) {
  console.error("Search failed:", err.message);
}
