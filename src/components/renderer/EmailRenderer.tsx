"use client";

import type { Message } from "@/lib/trace/types";

// EmailRenderer (issue #53). Quiet Notebook restyle. Email is not in the
// handoff's first-class renderer table but it ships in v2 and the parser
// is content-detected, so we keep it behind detect.ts and just retoken
// the styling.

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
    <div className="email-trace">
      {promptMessages.length > 0 && (
        <div className="email-trace__prompt">
          <div className="email-trace__sectionLabel">prompt</div>
          {promptMessages.map((m, i) => (
            <div key={i} className="trace-msg chat-trace__turn">
              <div className="chat-trace__pill">
                <span className="role-pill" data-role={m.role}>
                  {m.role}
                </span>
              </div>
              <div className="trace-msg__body trace-msg__body--serif">
                {m.content}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="email-trace__email">
        <div className="email-trace__sectionLabel">generated email</div>
        <div className="email-trace__envelope">
          {hasAnyHeader && (
            <div className="email-trace__headers">
              {from && (
                <div className="email-trace__headerRow">
                  <span className="email-trace__headerKey">From:</span>
                  <span className="email-trace__headerVal">{from}</span>
                </div>
              )}
              {to && (
                <div className="email-trace__headerRow">
                  <span className="email-trace__headerKey">To:</span>
                  <span className="email-trace__headerVal">{to}</span>
                </div>
              )}
              {subject && (
                <div className="email-trace__headerRow">
                  <span className="email-trace__headerKey">Subject:</span>
                  <span className="email-trace__headerVal email-trace__headerVal--bold">
                    {subject}
                  </span>
                </div>
              )}
            </div>
          )}
          <div className="email-trace__body">{body}</div>
        </div>
      </div>
    </div>
  );
}
