// BatchView — experienced-mode batch labeling.
// Replaces the trace pane with a multi-select queue when activated.

function BatchView({ traces }) {
  const [selected, setSelected] = React.useState(new Set(['t_001', 't_005']));

  const toggle = (id) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  return (
    <div className="batch-view">
      <div className="batch-view__head">
        <div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
            batch mode · experienced
          </div>
          <div style={{ fontSize: 14, marginTop: 4, fontWeight: 500 }}>
            <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent-ink)' }}>{selected.size}</span>{' '}
            traces selected · filter: <span style={{ fontFamily: 'var(--mono)' }}>tag:hallucinated-policy</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="ta-iconbtn" style={{ borderColor: 'var(--rule)' }}>
            <Glyph kind="pass" /> Pass <kbd style={{ marginLeft: 4 }}>⇧P</kbd>
          </button>
          <button className="ta-iconbtn" style={{ borderColor: 'var(--rule)' }}>
            <Glyph kind="fail" /> Fail <kbd style={{ marginLeft: 4 }}>⇧F</kbd>
          </button>
          <button className="ta-iconbtn" style={{ borderColor: 'var(--rule)' }}>
            + tag…
          </button>
        </div>
      </div>

      <div className="batch-view__list scroll-y">
        {[...traces, ...traces.slice(0, 4).map((t, i) => ({ ...t, id: t.id + '_b' + i }))].map((t) => {
          const isSel = selected.has(t.id);
          return (
            <div key={t.id} className={`batch-row ${isSel ? 'batch-row--sel' : ''}`} onClick={() => toggle(t.id)}>
              <span className="batch-row__check">
                {isSel ? '✓' : ''}
              </span>
              <span className={`lv-leftnav__dot lv-leftnav__dot--${t.verdict || 'open'}`} />
              <span className="batch-row__id">{t.id}</span>
              <span className="batch-row__title">{t.title}</span>
              <span className="batch-row__kind">{t.kind}</span>
              <span className="batch-row__tags">
                {(t.tags || []).slice(0, 2).map((tag) => (
                  <span key={tag} className="ta-chip ta-chip--applied" style={{ fontSize: 10.5, padding: '1px 6px' }}>{tag}</span>
                ))}
              </span>
              <span className="batch-row__source">{t.source.split(' · ')[0]}</span>
            </div>
          );
        })}
      </div>

      <div className="batch-view__foot">
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)' }}>
          ⌘A select all · ⇧↑↓ extend selection · esc exit batch
        </span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)' }}>
          last batch action: applied <span style={{ color: 'var(--ink)' }}>tag:wrong-tone</span> to 6 traces · <span style={{ textDecoration: 'underline' }}>undo</span>
        </span>
      </div>
    </div>
  );
}

// SimilarityView — clusters of similar traces, experienced mode.
function SimilarityView() {
  const clusters = [
    {
      label: 'refund / return policy disputes',
      size: 18,
      tags: ['hallucinated-policy', 'wrong-tone'],
      examples: [
        { id: 't_001', title: 'Refund request — order #A-88241', verdict: 'fail' },
        { id: 't_011', title: 'Refund — order #B-12092', verdict: 'fail' },
        { id: 't_023', title: 'Return policy confusion (chat)', verdict: 'fail' },
        { id: 't_044', title: 'Late-window refund denied', verdict: null },
      ],
    },
    {
      label: 'tool-call without confirmation',
      size: 11,
      tags: ['unsafe-action', 'no-confirmation'],
      examples: [
        { id: 't_007', title: 'Roll back the bad deploy', verdict: 'fail' },
        { id: 't_032', title: 'Delete user record', verdict: 'fail' },
        { id: 't_055', title: 'Restart prod service', verdict: null },
      ],
    },
    {
      label: 'RAG ungrounded answers',
      size: 9,
      tags: ['ungrounded', 'missing-step'],
      examples: [
        { id: 't_002', title: 'How do I rotate the API key?', verdict: 'fail' },
        { id: 't_018', title: 'Webhook signature setup', verdict: null },
        { id: 't_029', title: 'Quota override procedure', verdict: null },
      ],
    },
    {
      label: 'login / auth issues (mostly working)',
      size: 7,
      tags: ['good-handoff'],
      examples: [
        { id: 't_005', title: 'Login MFA loop', verdict: 'pass' },
        { id: 't_021', title: 'SAML org switch', verdict: 'pass' },
      ],
    },
  ];

  return (
    <div className="sim-view">
      <div className="sim-view__head">
        <div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
            similarity · experienced
          </div>
          <div style={{ fontSize: 14, marginTop: 4, fontWeight: 500 }}>
            45 unlabeled · clustered into {clusters.length} groups
          </div>
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)' }}>
          embedding · text-emb-3-small · k=4
        </div>
      </div>

      <div className="sim-clusters scroll-y">
        {clusters.map((c, i) => (
          <div key={i} className="sim-cluster">
            <div className="sim-cluster__head">
              <span className="sim-cluster__sigil">⌗{String(i + 1).padStart(2, '0')}</span>
              <span className="sim-cluster__label">{c.label}</span>
              <span className="sim-cluster__size">{c.size} traces</span>
            </div>
            <div className="sim-cluster__tags">
              {c.tags.map((t) => (
                <span key={t} className="ta-chip ta-chip--applied" style={{ fontSize: 10.5 }}>{t}</span>
              ))}
            </div>
            <div className="sim-cluster__examples">
              {c.examples.map((e) => (
                <div key={e.id} className="sim-example">
                  <span className={`lv-leftnav__dot lv-leftnav__dot--${e.verdict || 'open'}`} />
                  <span className="sim-example__id">{e.id}</span>
                  <span className="sim-example__title">{e.title}</span>
                </div>
              ))}
              <button className="sim-cluster__more">+ {c.size - c.examples.length} more · review cluster →</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Coaching milestone card (used between trace 25 / 50 / 100).
function MilestoneCard({ milestone }) {
  return (
    <div className="milestone-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'oklch(0.45 0.08 75)' }}>
          milestone · {milestone} traces
        </div>
        <button style={{ background: 'transparent', border: 0, color: 'oklch(0.45 0.08 75)', cursor: 'pointer', fontSize: 16, padding: 0 }}>×</button>
      </div>
      <div style={{ fontFamily: 'var(--serif)', fontSize: 17, lineHeight: 1.4, marginBottom: 12, fontWeight: 500 }}>
        Take a look at your taxonomy.
      </div>
      <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5, marginBottom: 14 }}>
        After {milestone} traces, recurring failure modes start to emerge. This is a good moment to merge near-duplicates and rename anything that's gotten muddy.
      </div>
      <div className="milestone-card__stats">
        <div>
          <div className="milestone-card__num">14</div>
          <div className="milestone-card__lbl">unique tags</div>
        </div>
        <div>
          <div className="milestone-card__num">3</div>
          <div className="milestone-card__lbl">used once only</div>
        </div>
        <div>
          <div className="milestone-card__num">2</div>
          <div className="milestone-card__lbl">near-duplicates</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="lv-nav lv-nav--primary" style={{ flex: 1 }}>Review taxonomy</button>
        <button className="lv-nav" style={{ flex: 1 }}>Later</button>
      </div>
    </div>
  );
}

Object.assign(window, { BatchView, SimilarityView, MilestoneCard });
