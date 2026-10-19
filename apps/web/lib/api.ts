import { createClient, type Client, getErrorMessage, toList, formatDate, formatDateTime, formatDuration, formatPlural } from "@grievancegrid/api-client";
import { toast } from "sonner";
import { getStoredAuth } from "./auth";

const baseUrl = process.env.NEXT_PUBLIC_API_URL !== undefined ? process.env.NEXT_PUBLIC_API_URL : "";

export function getApiClient(tokenOverride?: string): Client {
  const token = tokenOverride || getStoredAuth()?.access_token;
  return createClient(baseUrl, token);
}

export function showToastError(error: unknown, fallback?: string) {
  toast.error(getErrorMessage(error, fallback));
}

export { getErrorMessage, toList, formatDate, formatDateTime, formatDuration, formatPlural };
