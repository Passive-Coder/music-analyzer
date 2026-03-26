const title = "Perfect";
const artist = "Ed Sheeran";
const url = `https://lrclib.net/api/get?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`;

fetch(url, { headers: { "User-Agent": "TestClient/0.1.0" } })
  .then(res => res.json())
  .then(data => {
    console.log("LRCLIB 'get' Result for 'Perfect' by 'Ed Sheeran':");
    console.log("ID:", data.id);
    console.log("Synced Lyrics Length:", data.syncedLyrics?.length || 0);
    
    if (!data.syncedLyrics) {
      console.log("No synced lyrics in 'get'. Trying 'search'...");
      return fetch(`https://lrclib.net/api/search?q=${encodeURIComponent("Perfect Ed Sheeran")}`)
        .then(r => r.json())
        .then(sData => {
           console.log("Search Results Count:", sData.length);
           const best = sData.find(t => t.syncedLyrics);
           console.log("Best Search Result ID:", best?.id);
           console.log("Best Synced Lyrics Length:", best?.syncedLyrics?.length || 0);
        });
    }
  })
  .catch(err => console.error(err));
