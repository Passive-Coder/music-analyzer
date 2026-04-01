"use client";

import { ConvexReactClient } from "convex/react";

import { getConvexDeploymentUrl } from "@/lib/convex-url";

let browserClient: ConvexReactClient | null = null;

export function getConvexBrowserClient() {
  if (!browserClient) {
    browserClient = new ConvexReactClient(getConvexDeploymentUrl());
  }

  return browserClient;
}
