import { getPresentationFrame } from './presentation';
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
    ink.replaceChildren(...copies);
  }

  function projectInk() {
    const amount = currentFrame.static ? 1 : Math.min(1, currentFrame.progress / 0.85);
    const weight = String(Math.round(500 + 200 * amount));
    stage.style.setProperty('--ink-weight', weight);
    if (!ink) return;
    const box = stage.getBoundingClientRect();
    ink.hidden = !inkActive || box.bottom <= 0 || box.top >= window.innerHeight;
    Object.assign(ink.style, {
      left: `${box.left}px`,
      top: `${box.top}px`,
      width: `${box.width}px`,
    });
    ink.style.setProperty('--ink-weight', weight);
    if (inkActive) stage.dataset.ink = 'ready';
    else delete stage.dataset.ink;
  }

  function projectWorkspace() {
    projectInk();
    workspace.style.setProperty('--phase', currentFrame.phase);
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
      node.hidden = !visible[node.dataset.when];
    });
    // The phone keeps the same pinned stage. Scroll reveals oversized documents within it.
    const document = workspace.querySelector('.sb-spread');
    const overflow = document
      ? Math.max(
          0,
          document.getBoundingClientRect().height - workspace.getBoundingClientRect().height,
        )
      : 0;
    // Keep the late handoff state in view before revealing the result at chapter end.
    const reveal = currentFrame.chapter === 1 ? currentFrame.phase ** 3 : currentFrame.phase;
    const pan = currentFrame.narrow && !currentFrame.static ? -overflow * reveal : 0;
    workspace.style.setProperty('--document-offset', `${pan}px`);
  }

  function present(frame) {
    currentFrame = frame;
    if (currentChapter !== frame.chapter) {
      currentChapter = frame.chapter;
      onChapter(frame.chapter);
    }
    projectWorkspace();
    return journey.present(frame);
  }

  const controller = createStoryController(track, stage, present, artwork);
  copyNarrative();
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
        projectWorkspace();
        controller.refresh();
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
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
    hasDynamicFrame = false;
  const isStatic = () => reduced || window.innerHeight < 680;
  const isNarrow = () => window.innerWidth <= 900;
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
    const inset = isNarrow()
      ? 32
      : Math.max(32, (window.innerHeight - stage.getBoundingClientRect().height) / 2);
    return { scroll: window.scrollY, handoff: window.scrollY + rect.top - inset };
  }
  function measure() {
    request = null;
    if (disposed || !active || isStatic()) return;
    const rect = track.getBoundingClientRect();
    const stageHeight = stage.getBoundingClientRect().height;
    const inset = isNarrow() ? 32 : Math.max(32, (window.innerHeight - stageHeight) / 2);
    const progress = (inset - rect.top) / Math.max(1, rect.height - stageHeight);
    const frame = getPresentationFrame(progress);
    selected = frame.chapter;
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
    const inset = isNarrow() ? 32 : Math.max(32, (window.innerHeight - stageHeight) / 2);
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
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
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
      window.removeEventListener('resize', schedule);
    },
  };
}
