import { getPresentationFrame, presentationMilestones } from './presentation';
import { createQuartzJourney } from '../quartz/quartzJourney';

/**
 * Owns the controller, renderer and current frame. React supplies mounted DOM nodes,
 * forwards activity/selection, refreshes after a chapter/language commit, then disposes.
 * Continuous frames update DOM/GPU directly; only chapter changes reach React.
 */
export function createStoryPlayback({
  track,
  stage,
  artwork,
  canvas,
  layer,
  ink,
  hero,
  boundary,
  workspace,
  onChapter,
  onRendererState,
}) {
  let disposed = false;
  let currentChapter = 0;
  let inkActive = false;
  let currentFrame = getPresentationFrame(0);
  let layoutDirty = true,
    documentOverflow = 0,
    documentSpread = null,
    panStops = [
      [0, 0],
      [1, 0],
    ];
  const journey = createQuartzJourney({
    hero,
    boundary,
    artwork,
    layer,
    canvas,
    onState: onRendererState,
    refresh: () => controller.refresh(),
  });

  function copyNarrative() {
    if (!ink) return;
    const copies = ['story-caption', 'story-chapters']
      .map((name) => {
        const original = stage.querySelector(`.${name}`);
        if (!original) return null;
        const copy = original.cloneNode(true);
        copy.className = name.replace('story-', 'story-ink-');
        copy.removeAttribute('aria-label');
        copy.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
        copy.querySelectorAll('a').forEach((node) => {
          node.tabIndex = -1;
        });
        return copy;
      })
      .filter(Boolean);
    const projection = document.createElement('div');
    projection.className = 'story-ink-projection';
    const strength = document.createElement('div');
    strength.className = 'story-ink-strength';
    strength.append(
      ...copies.map((copy) => {
        const heavy = copy.cloneNode(true);
        heavy.className += '-heavy';
        return heavy;
      }),
    );
    projection.append(...copies, strength);
    ink.replaceChildren(projection);
    layoutDirty = true;
  }

  // Geometry changes on content/viewport commits, never on continuous paint-only frames.
  function measureLayout() {
    if (!layoutDirty) return;
    layoutDirty = false;
    documentSpread = workspace.querySelector('.sb-spread');
    const viewport = workspace.getBoundingClientRect();
    const sheet = documentSpread?.getBoundingClientRect();
    documentOverflow = sheet ? Math.max(0, sheet.height - viewport.height) : 0;
    const focus = (selector) => {
      const box = workspace.querySelector(selector)?.getBoundingClientRect();
      return box && sheet
        ? Math.max(
            0,
            Math.min(documentOverflow, box.top - sheet.top + box.height / 2 - viewport.height / 2),
          )
        : 0;
    };
    // Pause the document camera on newly introduced states, then reveal the result.
    // Milestones are shared with fixture state changes; fixed viewport-size curves cannot do this.
    const m = presentationMilestones;
    const cues =
      currentFrame.chapter === 0
        ? [[m.created, 0.42, '.sb-task-result > [data-when="created"]']]
        : currentFrame.chapter === 1
          ? [[m.handedOff, 0.9, '.sb-handoff > div:last-child > [data-when="handedOff"]']]
          : [
              [m.corrected, 0.64, '.sb-review-finding > [data-when="corrected"]'],
              [m.verified, 0.9, '.sb-task-result > [data-when="verified"]'],
            ];
    panStops = [[0, 0]];
    for (const [at, holdUntil, selector] of cues) {
      const offset = Math.max(panStops.at(-1)[1], focus(selector));
      panStops.push([at, offset], [holdUntil, offset]);
    }
    panStops.push([1, documentOverflow]);
    if (!ink) return;
    const box = stage.getBoundingClientRect();
    const rail = track.getBoundingClientRect();
    Object.assign(ink.style, {
      left: `${box.left + window.scrollX}px`,
      top: `${rail.top + window.scrollY}px`,
      width: `${box.width}px`,
      height: `${rail.height}px`,
    });
    ink.style.setProperty('--projection-height', `${box.height}px`);
    ink.style.setProperty('--projection-inset', getComputedStyle(stage).top);
  }
  function projectInk() {
    const amount = currentFrame.static ? 1 : Math.min(1, currentFrame.progress / 0.85);
    if (!ink) return;
    ink.hidden = !inkActive;
    ink.dataset.static = String(Boolean(currentFrame.static));
    const strength = ink.querySelector('.story-ink-strength');
    if (strength) strength.style.opacity = String(amount);
    if (inkActive) stage.dataset.ink = 'ready';
    else delete stage.dataset.ink;
  }

  function projectWorkspace() {
    projectInk();
    if (!documentSpread) workspace.style.setProperty('--phase', currentFrame.phase);
    workspace.dataset.progress = currentFrame.progress.toFixed(4);
    const visible = {
      created: currentFrame.created,
      '!created': !currentFrame.created,
      handedOff: currentFrame.handedOff,
      '!handedOff': !currentFrame.handedOff,
      corrected: currentFrame.corrected,
      '!corrected': !currentFrame.corrected,
      verified: currentFrame.verified,
      '!verified': !currentFrame.verified,
    };
    workspace.querySelectorAll('[data-when]').forEach((node) => {
      const hidden = !visible[node.dataset.when];
      if (node.hidden !== hidden) node.hidden = hidden;
    });
    const phase = currentFrame.phase;
    let pan = 0;
    if (!currentFrame.static) {
      for (let i = 1; i < panStops.length; i++) {
        const [end, to] = panStops[i];
        const [start, from] = panStops[i - 1];
        if (phase <= end) {
          const t = Math.max(0, Math.min(1, (phase - start) / (end - start)));
          pan = -(from + (to - from) * t * t * (3 - 2 * t));
          break;
        }
      }
    }
    if (documentSpread) documentSpread.style.transform = `translateY(${pan}px)`;
  }

  function present(frame) {
    currentFrame = frame;
    measureLayout();
    journey.present(frame);
    if (currentChapter !== frame.chapter) {
      currentChapter = frame.chapter;
      onChapter(frame.chapter);
    }
    projectWorkspace();
    return false;
  }

  const controller = createStoryController(track, stage, present, artwork);
  const invalidateLayout = () => {
    layoutDirty = true;
    controller.refresh();
  };
  const observer =
    typeof ResizeObserver === 'function' ? new ResizeObserver(invalidateLayout) : null;
  // Upstream text reflow moves the projection even when the stage size stays unchanged.
  const introduction = boundary?.querySelector('.story-introduction');
  observer?.observe(stage);
  observer?.observe(workspace);
  if (introduction) observer?.observe(introduction);
  if (hero) observer?.observe(hero);
  const spread = workspace.querySelector('.sb-spread');
  if (spread) observer?.observe(spread);
  window.addEventListener('resize', invalidateLayout);
  copyNarrative();
  measureLayout();
  projectWorkspace();
  return {
    setActivity(active, reduced) {
      if (disposed) return;
      inkActive = active || reduced;
      if (!inkActive && ink) {
        ink.hidden = true;
        delete stage.dataset.ink;
      }
      journey.setActivity(active, reduced);
      controller.setActivity(active, reduced);
    },
    selectChapter(index) {
      if (!disposed) controller.selectChapter(index);
    },
    refreshWorkspace() {
      if (!disposed) {
        copyNarrative();
        observer?.disconnect();
        observer?.observe(stage);
        observer?.observe(workspace);
        if (introduction) observer?.observe(introduction);
        if (hero) observer?.observe(hero);
        const spread = workspace.querySelector('.sb-spread');
        if (spread) observer?.observe(spread);
        measureLayout();
        projectWorkspace();
        controller.refresh();
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      observer?.disconnect();
      window.removeEventListener('resize', invalidateLayout);
      controller.dispose();
      journey.dispose();
      if (ink) ink.hidden = true;
      delete stage.dataset.ink;
    },
  };
}

/** One event-driven RAF owns scroll measurement; dispose removes listeners and pending work. */
export function createStoryController(track, stage, onFrame, artwork = null) {
  let active = false,
    reduced = false,
    disposed = false,
    request = null,
    selected = 0,
    wasStatic = false,
    previousStatic = false,
    hasDynamicFrame = false,
    lastProgress = 0;
  const isStatic = () => reduced;
  const isNarrow = () => window.innerWidth <= 900;
  const insetFor = (height) => {
    const css = parseFloat(getComputedStyle(stage).top);
    return Number.isFinite(css)
      ? css
      : isNarrow()
        ? 32
        : Math.max(32, (window.innerHeight - height) / 2);
  };
  function readingStage() {
    const rect = stage.getBoundingClientRect();
    return rect.top < window.innerHeight / 2 && rect.bottom > window.innerHeight / 2;
  }
  function showSelected() {
    if (!isNarrow() && hasDynamicFrame && readingStage()) wasStatic = true;
    onFrame({
      ...getPresentationFrame((selected + 0.999) / 3),
      phase: 1,
      static: !isNarrow() || isStatic(),
      ...(isNarrow() ? { narrow: true } : {}),
      ...position(),
    });
  }
  function position() {
    const rect = track.getBoundingClientRect();
    const inset = insetFor(stage.getBoundingClientRect().height);
    return { scroll: window.scrollY, handoff: window.scrollY + rect.top - inset };
  }
  function measure() {
    request = null;
    if (disposed || !active || isStatic()) return;
    const rect = track.getBoundingClientRect();
    const stageHeight = stage.getBoundingClientRect().height;
    const inset = insetFor(stageHeight);
    const progress = (inset - rect.top) / Math.max(1, rect.height - stageHeight);
    const frame = getPresentationFrame(progress);
    selected = frame.chapter;
    lastProgress = frame.progress;
    if (frame.progress > 0) hasDynamicFrame = true;
    const art = artwork?.getBoundingClientRect();
    onFrame({
      ...frame,
      ...position(),
      static: false,
      ...(isNarrow() ? { narrow: true } : {}),
      art: art
        ? {
            width: art.width,
            height: art.height,
            visible: art.bottom > 0 && art.top < window.innerHeight,
            progress: frame.progress,
          }
        : null,
    });
  }
  function scrollToChapter(phase, behavior) {
    const rect = track.getBoundingClientRect();
    const stageHeight = stage.getBoundingClientRect().height;
    const inset = insetFor(stageHeight);
    window.scrollTo({
      top:
        window.scrollY + rect.top - inset + ((rect.height - stageHeight) * (selected + phase)) / 3,
      behavior,
    });
  }
  function schedule() {
    if (disposed) return;
    const staticMode = isStatic();
    if (previousStatic && !staticMode) {
      if (!readingStage()) wasStatic = false;
    }
    previousStatic = staticMode;
    if (staticMode) {
      cancel();
      showSelected();
      return;
    }
    if (active && request === null) {
      if (wasStatic) {
        wasStatic = false;
        scrollToChapter(0.999, 'instant');
      }
      request = window.requestAnimationFrame(measure);
    }
  }
  function cancel() {
    if (request !== null) window.cancelAnimationFrame(request);
    request = null;
  }
  function resize() {
    if (!reduced && lastProgress > 0 && lastProgress < 1) {
      const rect = track.getBoundingClientRect();
      const height = stage.getBoundingClientRect().height;
      const inset = insetFor(height);
      window.scrollTo({
        top: window.scrollY + rect.top - inset + (rect.height - height) * lastProgress,
        behavior: 'instant',
      });
    }
    schedule();
  }
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', resize);
  return {
    refresh: schedule,
    setActivity(nextActive, nextReduced) {
      active = nextActive;
      reduced = nextReduced;
      cancel();
      schedule();
    },
    selectChapter(index) {
      selected = Math.min(2, Math.max(0, index));
      if (isStatic()) {
        wasStatic = true;
        showSelected();
      } else scrollToChapter(0.08, 'smooth');
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancel();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', resize);
    },
  };
}
