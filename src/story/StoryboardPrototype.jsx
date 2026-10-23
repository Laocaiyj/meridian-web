import React from 'react';

/** Development concept only; the scroll owner projects fixture states, never real execution. */
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
                <div className="sb-parallel-runs">
                  <div>
                    <strong>{p.executor}</strong>
                    <span>{p.implementation}</span>
                  </div>
                  <div>
                    <strong>{p.parallelExecutor}</strong>
                    <span>{p.parallelImplementation}</span>
                  </div>
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
                    <span className="sb-old-condition">− publish(result);</span>
                    <span data-when="corrected" className="sb-new-condition">
                      + if (isCurrent(run)) {'{'}
                      <br /> + publish(result);
                      <br /> + {'}'}
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
            <code>{chapter === 0 ? 'main' : 'tasks.ts'}</code>
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
                  <code>tasks.ts</code>
                  <span>{p.source}</span>
                </div>
                <div>
                  <code>tasks.test.ts</code>
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
              <div className="sb-run-capabilities">
                {p.executionSteps.map((step) => (
                  <span key={step}>{step}</span>
                ))}
              </div>
              <div className="sb-run-sample">
                <span>{p.runLabel}</span>
                <strong>{p.runTitle}</strong>
                <p>{p.runDescription}</p>
              </div>
              <div className="sb-change">
                <span>{p.change}</span>
                <code>tasks.ts · tasks.test.ts</code>
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
                    <span
                      data-when="!corrected"
                      className={index === 2 ? 'sb-failed' : 'sb-passed'}
                    >
                      {index === 2 ? p.failed : p.passed}
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
