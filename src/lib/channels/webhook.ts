const MAX_WEBHOOK_BODY = 4000;

function truncate(value: string, max = MAX_WEBHOOK_BODY): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

/**
 * Send a notification to one or more webhook URLs (Slack-compatible and
 * Discord-compatible: both `text` and `content` keys are included).
 */
export async function sendWebhooks(urls: string[], text: string): Promise<boolean> {
  const body = JSON.stringify({ text: truncate(text), content: truncate(text) });

  let anySuccess = false;
  for (const url of urls) {
    if (!url) continue;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        anySuccess = true;
      } else {
        console.error(`[Notify] Webhook to ${url} failed: HTTP ${res.status}`);
      }
    } catch (err) {
      console.error(`[Notify] Webhook to ${url} failed:`, err instanceof Error ? err.message : err);
    }
  }
  return anySuccess;
}