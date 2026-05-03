"use client";

import type { Message } from "@/lib/trace/types";

type Props = {
  promptMessages: Message[];
  emailContent: string;
};

type EmailParts = {
  from: string | null;
  to: string | null;
  subject: string | null;
  body: string;
};

function parseEmail(content: string): EmailParts {
  const lines = content.split(/\r?\n/);
  const headers: Record<string, string> = {};
  let bodyStart = 0;
  let inHeaders = true;

  for (let i = 0; i < lines.length; i++) {
    if (!inHeaders) break;
    const line = lines[i];
    const match = line.match(/^(From|To|Subject|Date|CC|BCC):\s*(.*)$/i);
    if (match) {
      headers[match[1].toLowerCase()] = match[2].trim();
      bodyStart = i + 1;
    } else if (line.trim() === "") {
      if (Object.keys(headers).length > 0) {
        bodyStart = i + 1;
        inHeaders = false;
      }
    } else if (Object.keys(headers).length === 0) {
      inHeaders = false;
    }
  }

  const body = lines.slice(bodyStart).join("\n").trim() || content.trim();
  return {
    from: headers.from ?? null,
    to: headers.to ?? null,
    subject: headers.subject ?? null,
    body,
  };
}

export function EmailRenderer({ promptMessages, emailContent }: Props) {
  const { from, to, subject, body } = parseEmail(emailContent);
  const hasAnyHeader = from ?? to ?? subject;

  return (
    <div className="space-y-4">
      {promptMessages.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wide text-gray-400 font-medium">
            Prompt
          </p>
          {promptMessages.map((m, i) => (
            <div key={i} className="rounded-lg bg-blue-600 px-4 py-3 text-sm text-white whitespace-pre-wrap break-words max-w-[85%] ml-auto">
              <div className="text-[10px] uppercase tracking-wide mb-1 text-blue-200 font-medium">
                {m.role}
              </div>
              <div className="max-h-48 overflow-auto">{m.content}</div>
            </div>
          ))}
        </div>
      )}

      <div>
        <p className="text-[10px] uppercase tracking-wide text-gray-400 font-medium mb-2">
          Generated email
        </p>
        <div className="rounded-lg border border-gray-200 overflow-hidden">
          {hasAnyHeader && (
            <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 space-y-1">
              {from && (
                <div className="flex gap-2 text-sm">
                  <span className="text-gray-500 w-14 shrink-0">From:</span>
                  <span className="text-gray-900">{from}</span>
                </div>
              )}
              {to && (
                <div className="flex gap-2 text-sm">
                  <span className="text-gray-500 w-14 shrink-0">To:</span>
                  <span className="text-gray-900">{to}</span>
                </div>
              )}
              {subject && (
                <div className="flex gap-2 text-sm">
                  <span className="text-gray-500 w-14 shrink-0">Subject:</span>
                  <span className="text-gray-900 font-medium">{subject}</span>
                </div>
              )}
            </div>
          )}
          <div className="px-4 py-4">
            <p className="text-sm text-gray-900 whitespace-pre-wrap">{body}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
