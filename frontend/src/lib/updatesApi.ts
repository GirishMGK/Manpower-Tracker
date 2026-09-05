import { api } from "@/lib/api";

// "Check for updates" (desktop build) — a thin client for
// GET /api/v1/updates/check (app/api/v1/updates.py). No auto-update: this
// only tells the user whether a newer release exists and hands them the
// download link, same as any other installer-distributed desktop tool.

export type UpdateCheckResult = {
  current_version: string;
  latest_version: string | null;
  update_available: boolean;
  download_url: string | null;
  release_notes_url: string | null;
  checked_ok: boolean;
  message: string | null;
};

export async function checkForUpdates(): Promise<UpdateCheckResult> {
  const { data } = await api.get<UpdateCheckResult>("/updates/check");
  return data;
}
