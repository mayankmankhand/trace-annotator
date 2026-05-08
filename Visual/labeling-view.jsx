// LabelingView - the main labeling workspace.
// Two-pane: trace on the left (scrolls), decision rail on the right (sticky).
// Top bar = progress + nav + session controls. Bottom = save status.

const { useState: useStateLV, useEffect: useEffectLV, useMemo: useMemoLV, useRef: useRefLV } = React;

function LabelingView({
  trace, idx, total, onPrev, onNext, onSetVerdict, onAddTag, onRemoveTag,
  onSetNote, onJumpUnlabeled, dense, coaching, experienced, layoutVariant,
  recentTags, suggestedTags, onTaxonomy, allTraces,
  variant = 'A',
}) {
  const [tagInput, setTagInput] = useStateLV('');
  const [filterQ, setFilterQ] = useStateLV('');
  const [showAllTags, setShowAllTags] = useStateLV(false);

  const passCount = allTraces.filter((t) => t.verdict === 'pass').length;
  const failCount = allTraces.filter((t) => t.verdict === 'fail').length;
  const skipCount = allTraces.filter((t) => t.verdict === 'skip').length;
  const labeled = passCount + failCount + skipCount;

  const appliedTags = trace?.tags || [];
  const matching = suggestedTags
    .filter((s) => !appliedTags.includes(s.tag))
    .filter((s) => !filterQ || s.tag.includes(filterQ.toLowerCase()));
  const hotkeyMax = 9;
  const visibleSuggestions = showAllTags || filterQ ? matching : matching.slice(0, hotkeyMax);
  const hiddenCount = Math.max(0, matching.length - visibleSuggestions.length);

  // ── Top bar ──
  const TopBar = (
    <div className="lv-topbar">
      <div className="lv-topbar__left">
        <button className="ta-iconbtn ta-iconbtn--ghost" title="Files">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
            <path d="M2 3h4l1.5 1.5H12V11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3z"/>
          </svg>
          traces.jsonl
        </button>
        <span className="lv-topbar__sep">/</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink-3)' }}>
          template: <span style={{ color: 'var(--ink-2)' }}>{traceTemplate(trace?.kind)}</span>
        </span>
      </div>

      <div className="lv-topbar__center">
        <div className="lv-progress">
          <div className="lv-progress__numbers">
            <span style={{ color: 'var(--ink)', fontWeight: 500 }}>{idx + 1}</span>
            <span style={{ color: 'var(--ink-4)' }}>/ {total}</span>
          </div>
          <div className="progress-bar" style={{ width: 220 }}>
            <div className="progress-bar__fill" style={{
              width: `${(passCount / total) * 100}%`, background: 'oklch(0.6 0.09 150)', left: 0,
            }} />
            <div className="progress-bar__skip" style={{
              left: `${(passCount / total) * 100}%`, width: `${(failCount / total) * 100}%`, background: 'oklch(0.6 0.13 30)',
            }} />
            <div className="progress-bar__skip" style={{
              left: `${((passCount + failCount) / total) * 100}%`, width: `${(skipCount / total) * 100}%`, background: 'var(--ink-4)',
            }} />
          </div>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)' }}>
            {labeled} labeled
          </span>
        </div>
      </div>

      <div className="lv-topbar__right">
        <button className="ta-iconbtn" onClick={onJumpUnlabeled} title="Jump to next unlabeled">
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>⤳ next unlabeled</span>
          <kbd>U</kbd>
        </button>
        <button className="ta-iconbtn" title="Find / jump">
          <kbd>Ctrl K</kbd>
        </button>
        <button className="ta-iconbtn" onClick={onTaxonomy} title="Manage tags">
          tags ({suggestedTags.length})
        </button>
        <button className="ta-iconbtn" title="Export">export</button>
        <button className="ta-iconbtn" title="Settings">⚙</button>
      </div>
    </div>
  );

  // ── Trace pane ──
  const TraceHeader = trace && (
    <div className="lv-trace__head">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--ink-4)' }}>
          {trace.id}
        </div>
        <h1 style={{
          margin: 0, fontFamily: 'var(--serif)', fontSize: dense ? 19 : 22,
          fontWeight: 500, letterSpacing: '-0.01em', lineHeight: 1.2,
        }}>
          {trace.title}
        </h1>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)' }}>
          {trace.source}
        </span>
        {trace.edited && <span className="ta-chip" style={{ padding: '1px 7px', fontSize: 10.5 }}>edited</span>}
      </div>
    </div>
  );

  const TracePane = (
    <div className="lv-trace scroll-y">
      {TraceHeader}
      <div className="lv-trace__body" style={{ padding: `0 ${dense ? 28 : 36}px ${dense ? 24 : 40}px` }}>
        <TraceRenderer trace={trace} dense={dense} />
      </div>
      <div className="lv-trace__foot">
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-4)' }}>
          end of trace · {trace?.kind} · {messageCount(trace)} turns
        </span>
      </div>
    </div>
  );

  // ── Decision rail ──
  const DecisionRail = (
    <div className="lv-rail">

      <div className="lv-rail__section">
        <div className="lv-rail__label">verdict</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="verdict-btn" data-active={trace?.verdict === 'pass' ? 'pass' : null}
            onClick={() => onSetVerdict('pass')}>
            <Glyph kind="pass" /> Pass
            <span className="kbd-hint">P</span>
          </button>
          <button className="verdict-btn" data-active={trace?.verdict === 'fail' ? 'fail' : null}
            onClick={() => onSetVerdict('fail')}>
            <Glyph kind="fail" /> Fail
            <span className="kbd-hint">F</span>
          </button>
          <button className="verdict-btn" data-active={trace?.verdict === 'skip' ? 'skip' : null}
            onClick={() => onSetVerdict('skip')}>
            Skip <span className="kbd-hint">S</span>
          </button>
        </div>
      </div>

      <hr className="ta-rule" />

      <div className="lv-rail__section">
        <div className="lv-rail__label">
          failure modes
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-4)' }}>
            {appliedTags.length} applied
          </span>
        </div>

        {appliedTags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
            {appliedTags.map((t) => (
              <span key={t} className="ta-chip ta-chip--applied">
                {t}
                <span className="ta-chip__x" onClick={() => onRemoveTag(t)}>×</span>
              </span>
            ))}
          </div>
        )}

        <div className="lv-tag-input">
          <input
            value={tagInput}
            onChange={(e) => { setTagInput(e.target.value); setFilterQ(e.target.value); }}
            placeholder="Type or pick a tag…"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && tagInput.trim()) {
                onAddTag(tagInput.trim());
                setTagInput(''); setFilterQ('');
              }
            }}
          />
          <kbd>T</kbd>
        </div>

        <div className="lv-tag-cloud">
          {visibleSuggestions.map((s, i) => (
            <button key={s.tag} className="ta-chip lv-tag-cloud__chip"
              onClick={() => onAddTag(s.tag)}>
              {i < hotkeyMax && !filterQ && <span className="lv-tag-cloud__num">{i + 1}</span>}
              {s.tag}
              <span className="ta-chip__count">{s.count}</span>
            </button>
          ))}
          {hiddenCount > 0 && (
            <button className="ta-chip lv-tag-cloud__chip lv-tag-cloud__more"
              onClick={() => setShowAllTags(true)}>
              + {hiddenCount} more
            </button>
          )}
          {showAllTags && !filterQ && matching.length > hotkeyMax && (
            <button className="ta-chip lv-tag-cloud__chip lv-tag-cloud__more"
              onClick={() => setShowAllTags(false)}>
              show less
            </button>
          )}
          {matching.length === 0 && (
            <span style={{ fontSize: 12, color: 'var(--ink-4)', fontStyle: 'italic' }}>
              no matches - press Enter to create
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 8, fontFamily: 'var(--mono)' }}>
          {filterQ
            ? <>type to filter · <kbd>Enter</kbd> to create new</>
            : <>press <kbd>1</kbd>-<kbd>9</kbd> to apply · type to filter the rest</>}
        </div>
      </div>

      <hr className="ta-rule" />

      <div className="lv-rail__section">
        <div className="lv-rail__label">note <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-4)' }}>{(trace?.note || '').length} ch</span></div>
        <textarea className="lv-note"
          value={trace?.note || ''}
          onChange={(e) => onSetNote(e.target.value)}
          placeholder="What's wrong? (free text - write like a junior reviewer)" />
      </div>

      {coaching && idx < 5 && (
        <div className="lv-rail__section">
          <CoachCard idx={idx} />
        </div>
      )}

      {experienced && (
        <div className="lv-rail__section">
          <div className="lv-rail__label">similar traces <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-4)' }}>3 found</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { id: 't_011', title: 'Refund - order #B-12092', sim: 0.91 },
              { id: 't_023', title: 'Return policy confusion (chat)', sim: 0.84 },
              { id: 't_044', title: 'Late-window refund denied', sim: 0.79 },
            ].map((s) => (
              <div key={s.id} className="lv-similar-row">
                <span className="lv-similar-row__bar"><span style={{ width: `${s.sim * 100}%` }} /></span>
                <span className="lv-similar-row__title">{s.title}</span>
                <span className="lv-similar-row__id">{s.id}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // ── Bottom bar ──
  const BottomBar = (
    <div className="lv-bottombar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button className="lv-nav" onClick={onPrev}><kbd>←</kbd> Prev</button>
        <button className="lv-nav lv-nav--primary" onClick={onNext}>Next <kbd>→</kbd></button>
        <span className="lv-bottombar__counter">
          {idx + 1} of {total}
        </span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-4)' }}>
          Ctrl Z undo · Ctrl Shift Z redo
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span className="lv-savestatus">
          <span className="lv-savestatus__dot" /> saved · just now
        </span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-4)' }}>
          {labeled} / {total} labeled
        </span>
      </div>
    </div>
  );

  // ── Layout ──
  return (
    <div className={`labeling-view ${dense ? 'density-dense' : ''}`} data-variant={variant} data-layout={layoutVariant}>
      {TopBar}
      <div className="lv-body">
        {layoutVariant === 'three' && (
          <div className="lv-leftnav">
            <div className="lv-leftnav__head">queue</div>
            {allTraces.slice(0, 12).map((t, i) => (
              <button key={t.id} className={`lv-leftnav__item ${i === idx ? 'lv-leftnav__item--active' : ''}`}>
                <span className={`lv-leftnav__dot lv-leftnav__dot--${t.verdict || 'open'}`} />
                <span className="lv-leftnav__title">{t.title}</span>
                <span className="lv-leftnav__id">{t.id.slice(2)}</span>
              </button>
            ))}
          </div>
        )}
        {TracePane}
        {layoutVariant !== 'one' && DecisionRail}
      </div>
      {BottomBar}
    </div>
  );
}

function CoachCard({ idx }) {
  const cards = [
    { title: 'Welcome', body: "Read the trace, decide Pass or Fail, drop in any failure-mode tags that fit. Don't worry about a perfect taxonomy - patterns emerge later." },
    { title: 'Tags are flat', body: 'Type any phrase. There is no preset list. After 25 traces you will be prompted to merge similar tags.' },
    { title: 'You can revisit anything', body: 'Every decision is reversible. Use ← to go back, undo with ⌘Z. The audit log persists across sessions.' },
    { title: 'Keyboard first', body: 'P / F / S for verdict. T to add a tag. Left/Right arrow to navigate. U to jump to the next unlabeled.' },
    { title: 'Quality over speed', body: 'A good open-coding note describes what is wrong, not just that something is. Specifics make the next step easier.' },
  ];
  const c = cards[Math.min(idx, cards.length - 1)];
  return (
    <div className="coach-card">
      <div className="coach-card__title">tip · {idx + 1} of 5</div>
      <div>{c.body}</div>
      <button className="coach-card__dismiss">dismiss · don't show again</button>
    </div>
  );
}

function Glyph({ kind }) {
  if (kind === 'pass') return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 7l3 3 5-6" />
    </svg>
  );
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <path d="M3 3l7 7M10 3l-7 7" />
    </svg>
  );
}

function traceTemplate(kind) {
  return ({
    chat: 'Chatbot', rag: 'RAG', agent: 'Tool-calling', summarizer: 'Summarizer',
  })[kind] || 'Generic';
}

function messageCount(trace) {
  if (!trace) return 0;
  if (trace.messages) return trace.messages.length;
  if (trace.chunks) return trace.chunks.length + 2;
  return 2;
}

Object.assign(window, { LabelingView });
