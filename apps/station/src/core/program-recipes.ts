import { draftSchema, defaultDraft, type ProgramDraft } from "./programs";

/** Inert, forkable examples. Choosing a recipe neither starts code nor approves
 * a surface/service binding. Values here contain no task or workspace resources. */
export const PROGRAM_RECIPES: readonly {
  id: string;
  title: string;
  description: string;
  draft: ProgramDraft;
}[] = [
  {
    id: "counter",
    title: "Counter",
    description: "Buttons, local state and a live metric.",
    draft: defaultDraft("Counter"),
  },
  {
    id: "checklist",
    title: "Checklist",
    description: "A small interactive list you can reshape.",
    draft: draftSchema.parse({
      title: "Checklist",
      files: {
        "main.tsx": `import { ui } from '@station/sdk';
export default async function() {
  const tasks = [{ title: 'Read the source', done: false }, { title: 'Make it yours', done: false }];
  const render = () => ui.render(ui.h('column', { key: 'root' },
    ui.h('text', { key: 'title', text: 'A little progress' }),
    ...tasks.map((task, i) => ui.h('toggle', { key: 'task-' + i, label: task.title, text: task.title, value: task.done,
      onChange: async (value?: string | boolean) => { task.done = value === true; await render(); } })),
    ui.h('text', { key: 'progress', text: tasks.filter(task => task.done).length + ' of ' + tasks.length + ' complete', tone: 'muted' })));
  await render(); return ui;
}
`,
      },
    }),
  },
  {
    id: "notes",
    title: "Scratchpad",
    description: "Editable text with an immediate preview.",
    draft: draftSchema.parse({
      title: "Scratchpad",
      files: {
        "main.tsx": `import { ui } from '@station/sdk';
export default async function() {
  let note = 'What are you thinking about?';
  const render = () => ui.render(ui.h('column', { key: 'root' },
    ui.h('input', { key: 'note', label: 'Note', value: note, onChange: async (value?: string | boolean) => { note = String(value ?? ''); await render(); } }),
    ui.h('text', { key: 'preview', text: note })));
  await render(); return ui;
}
`,
      },
    }),
  },
  {
    id: "converter",
    title: "Temperature converter",
    description: "A typed input and computed output.",
    draft: draftSchema.parse({
      title: "Temperature converter",
      files: {
        "main.tsx": `import { ui } from '@station/sdk';
export default async function() {
  let celsius = '20';
  const render = () => ui.render(ui.h('column', { key: 'root' },
    ui.h('input', { key: 'celsius', label: 'Celsius', value: celsius, onChange: async (value?: string | boolean) => { celsius = String(value ?? ''); await render(); } }),
    ui.h('text', { key: 'result', text: celsius.trim() && Number.isFinite(Number(celsius)) ? ((Number(celsius) * 9 / 5) + 32).toFixed(1) + ' °F' : 'Enter a temperature' })));
  await render(); return ui;
}
`,
      },
    }),
  },
];
