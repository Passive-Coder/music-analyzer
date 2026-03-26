import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query");

  if (!query) {
    return NextResponse.json({ error: "Missing search query" }, { status: 400 });
  }

  try {
    // We use server-side Node.js fetch to scrape YouTube directly, as Piped instances are highly unreliable/shut down
    const res = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      }
    });
    
    if (!res.ok) throw new Error(`YouTube returned ${res.status}`);
    
    const html = await res.text();
    const match = html.match(/ytInitialData = (\{.*?\});<\/script>/);
    if (!match) throw new Error("Could not extract ytInitialData from YouTube");
    
    const data = JSON.parse(match[1]);
    
    // Safely navigate the deeply nested JSON to find the first video renderer
    const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
    if (!contents) throw new Error("Could not parse YouTube search contents");

    let videoRenderer = null;
    for (const section of contents) {
      if (section.itemSectionRenderer?.contents) {
        const video = section.itemSectionRenderer.contents.find((c: any) => c.videoRenderer);
        if (video) {
          videoRenderer = video.videoRenderer;
          break;
        }
      }
    }

    if (!videoRenderer) {
      throw new Error("No video results found");
    }

    // Format the result to mimic the expected Piped format for the frontend
    const result = {
      items: [
        {
          type: "stream",
          title: videoRenderer.title?.runs?.[0]?.text || query,
          uploaderName: videoRenderer.ownerText?.runs?.[0]?.text || "YouTube",
          url: `/watch?v=${videoRenderer.videoId}`,
          thumbnail: videoRenderer.thumbnail?.thumbnails?.[0]?.url || "",
          // Convert lengthText (e.g. "6:00") to seconds. If undefined (e.g. live stream), use 0.
          duration: videoRenderer.lengthText?.simpleText 
            ? videoRenderer.lengthText.simpleText.split(':').reduce((acc: number, time: string) => (60 * acc) + parseInt(time, 10), 0)
            : 0
        }
      ]
    };

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("YouTube Search Proxy Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

