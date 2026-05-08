// Trace renderers - chat, RAG, agent, summarizer.
// Each takes a trace and returns the body content for the trace pane.
// Render style: minimal, generous whitespace, role pills as metadata,
// content in serif (Newsreader) for prose-heavy turns and sans for chrome.

const { useState } = React;

function TraceMessage({ msg, dense }) {
  const role = msg.role;
  const isTool = role === 'tool_call';

  if (isTool) {
    const ok = msg.status === 'ok';
    return (
      <div className="trace-msg trace-msg--tool" style={{ marginBottom: dense ? 12 : 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span className="role-pill" data-role="tool">tool · {msg.name}</span>
          <span style={{
            fontFamily: 'var(--mono)', fontSize: 10.5,
            color: ok ? 'oklch(0.45 0.08 150)' : 'oklch(0.45 0.13 30)',
          }}>
            {ok ? '● ok' : '● error'}
          </span>
        </div>
        <div className="tool-block">
          <div className="tool-block__row">
            <span className="tool-block__label">args</span>
            <code>{JSON.stringify(msg.args)}</code>
          </div>
          <div className="tool-block__row">
            <span className="tool-block__label">→</span>
            <code style={{ color: ok ? 'var(--ink)' : 'oklch(0.45 0.13 30)' }}>
              {JSON.stringify(msg.result)}
            </code>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="trace-msg" style={{ marginBottom: dense ? 14 : 22 }}>
      <div style={{ marginBottom: 6 }}>
        <span className="role-pill" data-role={role}>{role}</span>
      </div>
      <div className="trace-msg__body" style={{
        fontFamily: role === 'system' ? 'var(--mono)' : 'var(--serif)',
        fontSize: role === 'system' ? 12.5 : (dense ? 14.5 : 15.5),
        lineHeight: 1.55,
        color: role === 'system' ? 'var(--ink-3)' : 'var(--ink)',
        whiteSpace: 'pre-wrap',
      }}>
        {msg.content}
      </div>
    </div>
  );
}

function ChatTrace({ trace, dense }) {
  return (
    <div>
      {trace.messages.map((m, i) => <TraceMessage key={i} msg={m} dense={dense} />)}
    </div>
  );
}

function AgentTrace({ trace, dense }) {
  return (
    <div>
      {trace.messages.map((m, i) => <TraceMessage key={i} msg={m} dense={dense} />)}
    </div>
  );
}

function RagTrace({ trace, dense }) {
  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div className="role-pill" data-role="user" style={{ marginBottom: 6 }}>query</div>
        <div style={{ fontFamily: 'var(--serif)', fontSize: dense ? 15 : 16.5, lineHeight: 1.5 }}>
          {trace.query}
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{
          fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '0.04em',
          textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 8,
        }}>
          Retrieved · {trace.chunks.length} chunks
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {trace.chunks.map((c) => (
            <div key={c.id} className={`rag-chunk${c.used ? ' rag-chunk--used' : ''}`}>
              <div className="rag-chunk__head">
                <span className="rag-chunk__source" title="File path the retriever pulled this chunk from">{c.source}</span>
                <span className="rag-chunk__score" title="Retriever similarity score (0-1). Higher = stronger match to the query.">match {c.score.toFixed(2)}</span>
                {c.used && <span className="rag-chunk__used" title="The model's answer references this chunk - a sign the answer is grounded in retrieved context.">used in answer</span>}
              </div>
              <div className="rag-chunk__text">{c.text}</div>
            </div>
          ))}
        </div>
      </div>

      <hr className="ta-rule ta-rule--dotted" style={{ margin: '20px 0' }} />

      <div>
        <div className="role-pill" data-role="assistant" style={{ marginBottom: 6 }}>answer</div>
        <div style={{ fontFamily: 'var(--serif)', fontSize: dense ? 14.5 : 15.5, lineHeight: 1.6 }}>
          {trace.answer}
        </div>
      </div>
    </div>
  );
}

function SummarizerTrace({ trace, dense }) {
  return (
    <div className="summ-grid">
      <div className="summ-col">
        <div className="summ-col__head">
          <span className="role-pill" data-role="user">source</span>
          <span className="summ-col__meta">
            {trace.source_doc.split(/\s+/).length} words
          </span>
        </div>
        <div className="summ-col__body" style={{
          fontFamily: 'var(--serif)', fontSize: 13.5, lineHeight: 1.55,
          color: 'var(--ink-2)', whiteSpace: 'pre-wrap',
        }}>
          {trace.source_doc}
        </div>
      </div>
      <div className="summ-col">
        <div className="summ-col__head">
          <span className="role-pill" data-role="assistant">summary</span>
          <span className="summ-col__meta">
            {trace.answer.split(/\s+/).length} words
          </span>
        </div>
        <div className="summ-col__body" style={{
          fontFamily: 'var(--serif)', fontSize: 14.5, lineHeight: 1.6, whiteSpace: 'pre-wrap',
        }}>
          {trace.answer.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
            part.startsWith('**')
              ? <strong key={i}>{part.slice(2, -2)}</strong>
              : <React.Fragment key={i}>{part}</React.Fragment>
          )}
        </div>
      </div>
    </div>
  );
}

function TraceRenderer({ trace, dense }) {
  if (!trace) return null;
  if (trace.kind === 'rag') return <RagTrace trace={trace} dense={dense} />;
  if (trace.kind === 'agent') return <AgentTrace trace={trace} dense={dense} />;
  if (trace.kind === 'summarizer') return <SummarizerTrace trace={trace} dense={dense} />;
  return <ChatTrace trace={trace} dense={dense} />;
}

Object.assign(window, { TraceRenderer, ChatTrace, AgentTrace, RagTrace, SummarizerTrace });
