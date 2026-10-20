export const demoNotes = [
  { id: 'release', title: 'Release notes', tags: ['work'] },
  { id: 'reading', title: 'Reading list', tags: ['personal'] },
];

export function filterNotes(notes, tag) {
  return notes.filter((note) => tag === 'all' || note.tags.includes(tag));
}

/** A reversible snapshot of one fixture; it never operates on a real project. */
export function getPresentationFrame(value) {
  const progress = Math.min(1, Math.max(0, Number(value) || 0));
  const chapter = Math.min(2, Math.floor(progress * 3));
  const phase = progress === 1 ? 1 : progress * 3 - chapter;
  return {
    progress,
    chapter,
    phase,
    created: chapter > 0 || phase > 0.25,
    handedOff: chapter > 1 || (chapter === 1 && phase > 0.8),
    corrected: chapter === 2 && phase > 0.5,
    verified: chapter === 2 && phase > 0.82,
  };
}

export function getDemoDocument(corrected) {
  return [
    'export function filterNotes(notes, tag) {',
    '  return notes.filter((note) =>',
    ...(corrected ? ["    tag === 'all' ||"] : []),
    '    note.tags.includes(tag)',
    '  );',
    '}',
  ];
}
