import React from 'react';

/** Query-gated concept study; all states are projected by the existing scroll owner. */
export function StoryboardPrototype({ content, chapter, workspace }) {
  const p = content.prototype;
  const scene = p.scenes[chapter];
  return (
    <div className="workspace-demo storyboard-prototype" ref={workspace} data-chapter={chapter}>
      <div className="sb-spread">
        <section className="sb-task" aria-label={scene.document}>
          <div className="sb-document-line">
            <span>{scene.document}</span>
            <span className="sb-concept-label">{p.label}</span>
          </div>
          <h4>{scene.title}</h4>
          {chapter === 0 && (
            <>
              <ul className="sb-requirements">
                {p.requirements.map((item, index) => (
                  <li key={item}>
                    <span>0{index + 1}</span>
                    {item}
                  </li>
                ))}
              </ul>
              <div className="sb-task-result">
                <span data-when="!created">{p.preparing}</span>
                <span data-when="created">{p.ready}</span>
              </div>
            </>
          )}
          {chapter === 1 && (
            <>
              <div className="sb-handoff">
                <div>
                  <strong>{p.executor}</strong>
                  <span>{p.implementation}</span>
                </div>
                <div className="sb-transfer">
                  <span aria-hidden="true">↓</span>
                  <span data-when="!handedOff">{p.preparingHandoff}</span>
                  <span data-when="handedOff">{p.handedOff}</span>
                </div>
                <div>
                  <strong>{p.verifier}</strong>
                  <span data-when="!handedOff">{p.waiting}</span>
                  <span data-when="handedOff">{p.received}</span>
                </div>
              </div>
              <p className="sb-context-record">{p.context}</p>
            </>
          )}
          {chapter === 2 && (
            <>
              <div className="sb-review-finding">
                <p data-when="!corrected">{p.finding}</p>
                <p data-when="corrected">{p.corrected}</p>
                <pre>
                  <code>
                    <span className="sb-old-condition">− note.tags.includes(tag)</span>
                    <span data-when="corrected" className="sb-new-condition">
                      + tag === 'all' ||
                      <br /> note.tags.includes(tag)
                    </span>
                  </code>
                </pre>
              </div>
              <div className="sb-task-result">
                <span data-when="!verified">{p.rechecking}</span>
                <span data-when="verified">{p.verified}</span>
              </div>
            </>
          )}
        </section>
        <section className="sb-artifact" aria-label={scene.artifact}>
          <div className="sb-document-line">
            <span>{scene.artifact}</span>
            <code>{chapter === 0 ? 'main' : 'notes.ts'}</code>
          </div>
          {chapter === 0 && (
            <>
              <h4 className="sb-artifact-title">{p.repository}</h4>
              <div className="sb-repository" data-when="created">
                <div>
                  <code>README.md</code>
                  <span>{p.projectBrief}</span>
                </div>
                <div>
                  <code>notes.ts</code>
                  <span>{p.source}</span>
                </div>
                <div>
                  <code>notes.test.ts</code>
                  <span>{p.criteria}</span>
                </div>
              </div>
              <p className="sb-artifact-wait" data-when="!created">
                {p.preparing}
              </p>
              <div className="sb-record" data-when="created">
                <span>{p.initialVersion}</span>
                <code>0a71c2</code>
              </div>
            </>
          )}
          {chapter === 1 && (
            <>
              <h4 className="sb-artifact-title">{p.feature}</h4>
              <div className="sb-filter-sample" aria-hidden="true">
                <span>{p.all}</span>
                <strong>{p.work}</strong>
                <span>{p.reading}</span>
              </div>
              <div className="sb-note-sample">
                <span>{p.work}</span>
                <strong>{p.noteTitle}</strong>
                <p>{p.noteExcerpt}</p>
              </div>
              <div className="sb-change">
                <span>{p.change}</span>
                <code>notes.ts · notes.test.ts</code>
              </div>
              <div className="sb-record">
                <span data-when="!handedOff">{p.preparingHandoff}</span>
                <span data-when="handedOff">{p.handedOff}</span>
              </div>
            </>
          )}
          {chapter === 2 && (
            <>
              <h4 className="sb-artifact-title">{p.verifier}</h4>
              <div className="sb-checks">
                {p.checks.map((check, index) => (
                  <div key={check}>
                    <span>{check}</span>
                    <span data-when="!corrected" className={index === 0 ? 'sb-failed' : ''}>
                      {index === 0 ? p.failed : p.waiting}
                    </span>
                    <span data-when="corrected">
                      <span data-when="!verified">{p.waiting}</span>
                      <span data-when="verified" className="sb-passed">
                        {p.passed}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
              <div className="sb-record">
                <span data-when="!verified">{p.versionPending}</span>
                <span data-when="verified">{p.versionSaved}</span>
                <code data-when="verified">4b82d1</code>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
