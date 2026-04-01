const DEFAULT_CONVEX_URL = "https://mild-firefly-71.eu-west-1.convex.cloud";

export function getConvexDeploymentUrl() {
  return process.env.NEXT_PUBLIC_CONVEX_URL ?? DEFAULT_CONVEX_URL;
}
