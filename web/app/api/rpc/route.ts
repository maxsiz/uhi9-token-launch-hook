// OPTIONAL server-side RPC proxy — keeps paid RPC keys off the client.
// Configure server-only RPC_URL_<chainId> env vars, then point chains.ts at /api/rpc?chainId=...
// instead of the public NEXT_PUBLIC_RPC_URL_* values. Disabled by default (no env ⇒ 501).
import { NextResponse } from "next/server";

const SERVER_RPC: Record<string, string | undefined> = {
  "1": process.env.RPC_URL_1,
  "8453": process.env.RPC_URL_8453,
  "42161": process.env.RPC_URL_42161,
  "130": process.env.RPC_URL_130,
};

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const chainId = searchParams.get("chainId") ?? "";
  const upstream = SERVER_RPC[chainId];
  if (!upstream) {
    return NextResponse.json({ error: `No server RPC configured for chain ${chainId}` }, { status: 501 });
  }
  const body = await req.text();
  const res = await fetch(upstream, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  const data = await res.text();
  return new NextResponse(data, { status: res.status, headers: { "content-type": "application/json" } });
}
