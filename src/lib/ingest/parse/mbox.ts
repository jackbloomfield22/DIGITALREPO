// Split an mbox archive into individual raw email messages. mbox frames
// messages with "From " separator lines; ">From " inside bodies is the
// classic escaping, which we unescape.

export function splitMbox(bytes: Uint8Array, maxMessages: number, maxTotalBytes: number): Uint8Array[] {
  if (bytes.byteLength > maxTotalBytes) {
    throw new Error(`mbox is ${(bytes.byteLength / 1024 / 1024).toFixed(1)}MB — the limit is ${(maxTotalBytes / 1024 / 1024).toFixed(0)}MB. Split it up.`);
  }
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const lines = text.split(/\r?\n/);
  const messages: string[][] = [];
  let current: string[] | null = null;

  for (const line of lines) {
    if (/^From \S+.*\d{4}/.test(line)) {
      if (messages.length >= maxMessages) {
        throw new Error(`mbox has more than ${maxMessages} messages — the limit is ${maxMessages}.`);
      }
      current = [];
      messages.push(current);
      continue;
    }
    if (current) current.push(line.startsWith(">From ") ? line.slice(1) : line);
  }
  if (!messages.length) throw new Error("No messages found — is this a valid mbox file?");
  const encoder = new TextEncoder();
  return messages.map((m) => encoder.encode(m.join("\n")));
}
