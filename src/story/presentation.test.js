import { getPresentationFrame, filterNotes, demoNotes } from './presentation';

test('a reversible script keeps creation, code, correction and evidence in order', () => {
  expect(getPresentationFrame(0)).toMatchObject({ chapter: 0, created: false });
  expect(getPresentationFrame(0.3)).toMatchObject({ chapter: 0, created: true });
  expect(getPresentationFrame(0.62)).toMatchObject({ chapter: 1, handedOff: true });
  expect(getPresentationFrame(0.7)).toMatchObject({ chapter: 2, corrected: false });
  expect(getPresentationFrame(1)).toMatchObject({ chapter: 2, corrected: true, verified: true });
  expect(getPresentationFrame(0.3)).toEqual(getPresentationFrame(0.3));
  expect(getPresentationFrame(-10).chapter).toBe(0);
  expect(getPresentationFrame(10).chapter).toBe(2);
});

test('the demonstrated fix includes all notes before a tag is selected', () => {
  expect(filterNotes(demoNotes, 'all')).toEqual(demoNotes);
  expect(filterNotes(demoNotes, 'work').map((note) => note.id)).toEqual(['release']);
  expect(filterNotes(demoNotes, 'missing')).toEqual([]);
});

test('the demonstrated correction passes the same three fixture cases', () => {
  const { getDemoDocument } = require('./presentation');
  const initial = getDemoDocument(false).join('\n').replace('export ', '');
  const corrected = getDemoDocument(true).join('\n').replace('export ', '');
  const run = (source) => new Function(`${source}; return filterNotes;`)();
  expect(run(initial)(demoNotes, 'all')).toHaveLength(0);
  for (const tag of ['all', 'work', 'missing'])
    expect(run(corrected)(demoNotes, tag)).toEqual(filterNotes(demoNotes, tag));
});
