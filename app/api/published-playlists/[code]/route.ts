import { NextResponse } from "next/server";

import { getPublishedPlaylistRecord } from "@/lib/published-playlists";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await context.params;
    const record = await getPublishedPlaylistRecord(code);

    return NextResponse.json(record);
  } catch {
    return NextResponse.json(
      { error: "Published playlist not found." },
      { status: 404 }
    );
  }
}
