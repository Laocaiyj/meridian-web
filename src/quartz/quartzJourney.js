import { createQuartzScene } from './quartzScene';
const clamp = (value) => Math.min(1, Math.max(0, value));

/** One scene owns both fixed roots. Scroll changes hinges; the controller owns scheduling. */
export function createQuartzJourney({ hero, boundary, artwork, layer, canvas, refresh, onState }) {
  let scene = null,
    disposed = false,
    active = false,
    reduced = false,
    lastPose = '';
  let gpuState = 'static',
    shownState = 'static';
  const poster = layer.querySelector('.quartz-poster-main') || layer.querySelector('img');
  const accentPoster = layer.querySelector('.quartz-poster-accent');
  function publish(state) {
    layer.dataset.renderer = state;
    if (shownState !== state) {
      shownState = state;
      onState(state);
    }
  }
  function setState(state) {
    if (disposed) return;
    gpuState = state;
    if (state !== 'ready') lastPose = '';
    refresh();
  }

  function sector(reveal, width, height) {
    const radius = Math.hypot(width, height),
      points = ['100% 50%'];
    for (let i = 0; i <= 48; i++) {
      const angle = -Math.PI / 2 + (Math.PI * reveal * i) / 48;
      points.push(
        `${100 - ((Math.cos(angle) * radius) / width) * 100}% ${50 - ((Math.sin(angle) * radius) / height) * 100}%`,
      );
    }
    return `polygon(${points.join(',')})`;
  }
  return {
    setActivity(nextActive, nextReduced) {
      if (disposed) return;
      active = nextActive && !nextReduced;
      reduced = nextReduced;
      lastPose = '';
      if (reduced) {
        scene?.dispose();
        scene = null;
        gpuState = 'static';
        publish('static');
      } else if (active && !scene) scene = createQuartzScene(canvas, setState);
      if (!active) {
        scene?.render({ active: false });
        if (!reduced) layer.hidden = true;
      }
    },
    present(frame) {
      if (disposed) return false;
      const bounds = artwork.getBoundingClientRect();
      const header = hero?.getBoundingClientRect();
      const travel = header
        ? clamp(
            (frame.scroll - header.height * 0.1) / Math.max(1, frame.handoff - header.height * 0.1),
          )
        : 1;
      const section = boundary?.getBoundingClientRect();
      // Phone hinges follow physical document travel, independently of chapter selection.
      const storyProgress = frame.narrow
        ? clamp(
            (frame.scroll - frame.handoff) /
              Math.max(
                1,
                (section?.bottom ?? window.innerHeight) +
                  frame.scroll -
                  frame.handoff -
                  (window.innerHeight + bounds.height) * 0.5,
              ),
          )
        : frame.progress;
      // Both phone actors keep unfolding through all three scroll-driven documents.
      const progress = frame.narrow
        ? 0.7 * travel + 0.3 * storyProgress
        : 0.5 * travel + 0.5 * storyProgress;
      const bottom = section?.bottom ?? Infinity;
      const layerTop = Math.min((window.innerHeight - bounds.height) / 2, bottom - bounds.height);
      const exitShift = layerTop - (window.innerHeight - bounds.height) / 2;
      const accentTop = (frame.narrow ? -100 : -220) + exitShift;
      const accentProgress = frame.narrow
        ? clamp(0.65 * travel + 0.35 * storyProgress)
        : clamp(0.4 * clamp(-section?.top / window.innerHeight) + 0.6 * storyProgress);
      const accentVisible = section?.top <= 0 && bottom > 0;
      layer.hidden = bottom <= 0 || (!active && !reduced && !frame.static);
      // Fixed throughout unfolding; the completed actor leaves with its chapter.
      Object.assign(layer.style, {
        left: `0px`,
        top: `${layerTop}px`,
        width: `${window.innerWidth}px`,
        height: `${bounds.height}px`,
      });
      layer.style.setProperty('--primary-width', `${bounds.width}px`);
      // Keep projection in the full sculpture space; spend backing pixels on the viewport.
      Object.assign(canvas.style, {
        top: `${-layerTop}px`,
        height: `${window.innerHeight}px`,
      });
      const pose = {
        viewportAspect: window.innerWidth / Math.max(1, bounds.height),
        accentY: accentVisible ? 1 - (2 * (accentTop - layerTop)) / bounds.height : 2,
        accentProgress: accentVisible ? accentProgress : 0,
        progress,
        detail: storyProgress > 0 ? 0 : 1,
        aspect: bounds.width / Math.max(1, bounds.height),
        cropY: -layerTop / Math.max(1, bounds.height),
        cropHeight: window.innerHeight / Math.max(1, bounds.height),
        active: active && !frame.static && !layer.hidden,
      };
      layer.dataset.progress = progress.toFixed(4);
      layer.dataset.detail = pose.detail.toFixed(4);
      layer.dataset.accentProgress = pose.accentProgress.toFixed(4);
      if (poster) {
        // Reveal the same full-open poster through a sector when GPU is unavailable.
        // Reduced motion uses a complete state only after the opening screen.
        const reveal = reduced || frame.static ? (header?.bottom > 0 ? 0 : 1) : progress;
        poster.style.clipPath = sector(reveal, bounds.width, bounds.height);
      }
      if (accentPoster) {
        const complete = reduced || frame.static;
        const amount = accentVisible ? (complete ? 1 : accentProgress) : 0;
        accentPoster.style.clipPath = sector(amount, bounds.width, bounds.height);
        const sine = Math.sin(-0.42),
          cosine = Math.cos(-0.42);
        const a = 0.6 * sine,
          b = -0.6 * cosine,
          c = 1.35 * cosine,
          d = 1.35 * sine;
        const x = window.innerWidth * 0.18 - a * bounds.width - (c * bounds.height) / 2;
        const y = accentTop - layerTop - b * bounds.width - (d * bounds.height) / 2;
        accentPoster.style.transform = `matrix(${a},${b},${c},${d},${x},${y})`;
      }
      publish(frame.static || reduced ? 'static' : gpuState);
      const key = JSON.stringify({
        pose,
        width: bounds.width,
        height: bounds.height,
        dpr: window.devicePixelRatio,
      });
      if (key === lastPose) return false;
      lastPose = key;
      if (pose.active) {
        scene.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio);
        scene.render(pose);
      } else scene?.render({ ...pose, active: false });
      return false;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      scene?.dispose();
    },
  };
}
