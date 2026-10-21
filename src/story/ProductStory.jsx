import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMotionActivity } from '../useMotionActivity';
import { technologyStack, referenceRepositories } from '../content/site';
import { createStoryPlayback } from './storyController';
import { StoryboardPrototype } from './StoryboardPrototype';
import { getDemoDocument } from './presentation';
import './ProductStory.css';

function WorkspaceDemo({ content, chapter, workspace }) {
  const d = content.demo;
  return (
    <div translate="no" className="workspace-demo" ref={workspace} data-chapter={chapter}>
      <div className="workspace-heading">
        <strong>Notes</strong>
        <span>{d.label}</span>
        <span className="branch-name">main</span>
      </div>
      <div className="workspace-body">
        <aside className="repository-panel">
          <p className="demo-label">{d.files}</p>
          <div className="repository-files" data-when="created">
            <span>notes.ts</span>
            <span>notes.test.ts</span>
            <span>README.md</span>
            <span>package.json</span>
          </div>
          <div className="repository-history" data-when="created">
            <p className="demo-label">{d.history}</p>
            <span className="commit-dot" />
            {d.commit}
            <code>0a71c2</code>
          </div>
        </aside>
        <div className="editor-panel">
          <div className="editor-tab">
            {chapter === 0 ? 'README.md' : 'notes.ts'}
            <span>{chapter === 0 ? 'Markdown' : 'TypeScript'}</span>
          </div>
          {chapter === 0 ? (
            <div className="project-intro">
              <span className="project-symbol" aria-hidden="true">
                N
              </span>
              <h4>Notes</h4>
              <p data-when="!created">{d.create}</p>
              <p data-when="created">{d.created}</p>
              <div className="note-preview" data-when="created">
                <span>
                  Release notes <small>work</small>
                </span>
                <span>
                  Reading list <small>personal</small>
                </span>
              </div>
            </div>
          ) : (
            <div className="code-scene">
              <div className="code-document" aria-label="notes.ts">
                {[false, true].map((corrected) => (
                  <pre
                    key={String(corrected)}
                    data-when={corrected ? 'corrected' : '!corrected'}
                    className="code-snapshot"
                  >
                    {getDemoDocument(corrected).map((line, index) => (
                      <div key={index} className={corrected && index === 2 ? 'added-line' : ''}>
                        <span className="code-number" aria-hidden="true">
                          {index + 1}
                        </span>
                        <code>{line}</code>
                      </div>
                    ))}
                  </pre>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="demo-activity">
        {chapter === 0 ? (
          <>
            <span className="activity-indicator" />
            <strong>Notes</strong>
            <span data-when="!created">{d.create}</span>
            <span data-when="created">{d.created}</span>
          </>
        ) : chapter === 1 ? (
          <>
            <span className="activity-indicator" />
            <strong>{d.developer}</strong>
            <span>{d.goal}</span>
            <span className="activity-end" data-when="!handedOff">
              {d.writing}
            </span>
            <span className="activity-end" data-when="handedOff">
              {d.handoff}
            </span>
          </>
        ) : (
          <>
            <span className="activity-indicator" />
            <strong>{d.reviewer}</strong>
            <span data-when="!corrected">{d.issue}</span>
            <span data-when="corrected">{d.fix}</span>
          </>
        )}
      </div>
      {chapter === 2 && (
        <div className="check-record">
          <span>{d.checks}</span>
          <span data-when="!verified">{d.pending}</span>
          <strong data-when="verified">{d.passed}</strong>
          <span data-when="verified">
            {d.delivery} <code>4b82d1</code>
          </span>
        </div>
      )}
      <p className="demo-boundary">{d.boundary}</p>
    </div>
  );
}

export function ProductStory({ content, heroRef }) {
  const section = useRef(null),
    track = useRef(null),
    stage = useRef(null),
    workspace = useRef(null),
    playback = useRef(null);
  const artwork = useRef(null),
    canvas = useRef(null),
    layer = useRef(null),
    ink = useRef(null);
  const emptyHero = useRef(null);
  const heroActivity = useMotionActivity(heroRef || emptyHero);
  const [rendererState, setRendererState] = useState('static');
  const [chapter, setChapter] = useState(0);
  const activity = useMotionActivity(section);
  useLayoutEffect(() => {
    const owner = createStoryPlayback({
      track: track.current,
      stage: stage.current,
      artwork: artwork.current,
      canvas: canvas.current,
      layer: layer.current,
      ink: ink.current,
      hero: heroRef?.current,
      boundary: section.current,
      workspace: workspace.current,
      onChapter: setChapter,
      onRendererState: setRendererState,
    });
    playback.current = owner;
    return () => {
      playback.current = null;
      owner.dispose();
    };
  }, [heroRef]);
  useEffect(() => {
    playback.current?.setActivity(activity.active || heroActivity.active, activity.reduced);
  }, [activity.active, heroActivity.active, activity.reduced]);
  useLayoutEffect(() => {
    playback.current?.refreshWorkspace();
  }, [chapter, content]);
  const current = content.chapters[chapter];
  const prototype = new URLSearchParams(window.location.search).get('demo') !== 'legacy';
  return (
    <>
      {createPortal(
        <div className="story-ink" ref={ink} aria-hidden="true" hidden />,
        document.body,
      )}
      <div className="quartz-journey" ref={layer} aria-hidden="true" data-renderer={rendererState}>
        <img
          className="quartz-poster-accent"
          src={`${process.env.PUBLIC_URL}/brand/quartz-fan-static.png`}
          width="1600"
          height="2200"
          decoding="async"
          alt=""
        />
        <img
          className="quartz-poster-main"
          src={`${process.env.PUBLIC_URL}/brand/quartz-fan-static.png`}
          width="1600"
          height="2200"
          decoding="async"
          alt=""
        />
        <canvas ref={canvas} />
      </div>
      <section id="showcase" className="product-story" ref={section}>
        <div className="story-introduction">
          <div className="story-intro-copy">
            <p className="section-eyebrow">{content.eyebrow}</p>
            <h2>{content.title}</h2>
            <p>{content.description}</p>
          </div>
        </div>
        <div className="story-track" ref={track}>
          <div className="story-stage" ref={stage} data-demo={prototype ? 'storyboard' : undefined}>
            <div
              className="interference-art"
              ref={artwork}
              aria-hidden="true"
              data-renderer={rendererState}
            />
            <div className="story-caption">
              <div className="story-caption-current">
                <h3>{current.title}</h3>
                <p>{current.description}</p>
              </div>
              {content.chapters.map((item) => (
                <div className="story-caption-sizer" key={item.id} aria-hidden="true">
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </div>
              ))}
            </div>
            <div className="story-chapters" aria-label={content.eyebrow}>
              {content.chapters.map((item, index) => (
                <a
                  key={item.id}
                  id={item.id}
                  href={`#${item.id}`}
                  aria-current={chapter === index ? 'step' : undefined}
                  onClick={(event) => {
                    if (
                      event.button !== 0 ||
                      event.metaKey ||
                      event.ctrlKey ||
                      event.shiftKey ||
                      event.altKey
                    )
                      return;
                    event.preventDefault();
                    playback.current.selectChapter(index);
                    window.history.replaceState(null, '', `#${item.id}`);
                  }}
                >
                  <span>0{index + 1}</span>
                  {item.label}
                </a>
              ))}
            </div>
            {prototype ? (
              <StoryboardPrototype content={content} chapter={chapter} workspace={workspace} />
            ) : (
              <WorkspaceDemo content={content} chapter={chapter} workspace={workspace} />
            )}
          </div>
        </div>
      </section>
    </>
  );
}

export function Principles({ content }) {
  const strip = useRef(null);
  const { active, reduced } = useMotionActivity(strip);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const motion = reduced ? 'static' : active && !hovered && !focused ? 'running' : 'paused';
  return (
    <section id="featured" className="principles">
      <div className="principles-inner principles-heading">
        <h2>{content.title}</h2>
        <p>{content.description}</p>
      </div>
      <div
        ref={strip}
        className="technology-strip"
        role="region"
        aria-label={content.technologiesLabel}
        tabIndex="0"
        data-motion={motion}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      >
        <div className="technology-track">
          {[false, true].map((copy) => (
            // Safari hides list semantics when list markers are removed.
            // eslint-disable-next-line jsx-a11y/no-redundant-roles
            <ul
              key={String(copy)}
              className="technology-group"
              aria-label={copy ? undefined : content.technologiesLabel}
              aria-hidden={copy ? true : undefined}
              data-copy={copy ? '' : undefined}
              role="list"
            >
              {technologyStack.map((technology) => (
                <li key={technology.id} className={`technology-${technology.id}`}>
                  <img
                    src={`${process.env.PUBLIC_URL}/brand/${technology.icon}`}
                    alt=""
                    width="56"
                    height="56"
                    loading="lazy"
                    decoding="async"
                  />
                  <span>{technology.name}</span>
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
      <div className="principles-inner repository-references">
        <h3>{content.repositoriesLabel}</h3>
        {/* eslint-disable-next-line jsx-a11y/no-redundant-roles -- Safari list semantics */}
        <ul aria-label={content.repositoriesLabel} role="list">
          {referenceRepositories.map((repository) => (
            <li key={repository.id}>
              <a
                href={repository.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`repository-${repository.id}`}
              >
                <span className="repository-identity">
                  {repository.icon && (
                    <img
                      src={`${process.env.PUBLIC_URL}/brand/${repository.icon}`}
                      alt=""
                      width={repository.id === 'libkrun' ? '108' : '32'}
                      height="32"
                      loading="lazy"
                      decoding="async"
                    />
                  )}
                  <strong>{repository.name}</strong>
                  <span className="repository-arrow" aria-hidden="true">
                    ↗
                  </span>
                </span>
                <small>{content.referenceRoles[repository.id]}</small>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
