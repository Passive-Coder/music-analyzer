import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

export const dynamic = "force-dynamic";

// Gracefully degrade if env vars aren't set yet (will fail at runtime, not build time)
const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null;

const SESSION_TTL_SECONDS = 3600; // 1 hour

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

function redisKey(roomCode: string) {
  return `session:${roomCode}`;
}

function noRedis() {
  return NextResponse.json(
    { error: "Session store not configured. Add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN env vars." },
    { status: 503 }
  );
}

/**
 * GET /api/sync?roomCode=XXXXX
 * Listeners poll this to get current host state.
 */
export async function GET(request: Request) {
  if (!redis) return noRedis();

  const { searchParams } = new URL(request.url);
  const roomCode = searchParams.get("roomCode");

  if (!roomCode) {
    return NextResponse.json({ error: "Missing roomCode" }, { status: 400 });
  }

  const session = await redis.get<any>(redisKey(roomCode));

  if (!session) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const isStale = Date.now() - session.lastUpdated > 10000; // 10s without host ping

  return NextResponse.json({
    roomCode,
    roomTitle: session.roomTitle || "Guest Room",
    active: !isStale,
    state: session.state,
  });
}

/**
 * POST /api/sync
 * Host creates or updates a session.
 */
export async function POST(request: Request) {
  if (!redis) return noRedis();

  try {
    const body = await request.json();
    const { action, hostId, roomCode, state } = body;

    if (action === "create") {
      const newRoom = generateRoomCode();
      const sessionData = {
        hostId,
        roomTitle: body.roomTitle || "New Room",
        createdAt: Date.now(),
        lastUpdated: Date.now(),
        state: state || {},
      };
      await redis.set(redisKey(newRoom), sessionData, { ex: SESSION_TTL_SECONDS });
      return NextResponse.json({ roomCode: newRoom, success: true });
    }

    if (action === "update") {
      if (!roomCode) {
        return NextResponse.json({ error: "Missing roomCode" }, { status: 400 });
      }

      const session = await redis.get<any>(redisKey(roomCode));
      if (!session) {
        return NextResponse.json({ error: "Room not found" }, { status: 404 });
      }
      if (session.hostId !== hostId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }

      const updated = {
        ...session,
        roomTitle: body.roomTitle || session.roomTitle,
        state: { ...session.state, ...state },
        lastUpdated: Date.now(),
      };
      // Refresh TTL on every heartbeat so active rooms don't expire
      await redis.set(redisKey(roomCode), updated, { ex: SESSION_TTL_SECONDS });
      return NextResponse.json({ success: true, updated: true, roomTitle: updated.roomTitle });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    console.error("Sync API Error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
