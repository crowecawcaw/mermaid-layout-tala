import mermaid from 'mermaid';
import talaLayouts from '../src/index.js';
import { examples } from './examples.js';

type Layout = 'tala' | 'elk' | 'dagre';

const source = document.querySelector<HTMLTextAreaElement>('#source')!;
const exampleSelect = document.querySelector<HTMLSelectElement>('#example')!;
const layoutSelect = document.querySelector<HTMLSelectElement>('#layout')!;
const directionSelect = document.querySelector<HTMLSelectElement>('#direction')!;
const preview = document.querySelector<HTMLElement>('#preview')!;
const status = document.querySelector<HTMLElement>('#status')!;
const description = document.querySelector<HTMLElement>('#example-description')!;
const downloadButton = document.querySelector<HTMLButtonElement>('#download')!;
const renderButton = document.querySelector<HTMLButtonElement>('#render')!;
const talaOptions = document.querySelector<HTMLElement>('#tala-options')!;
const nodeSpacing = document.querySelector<HTMLInputElement>('#node-spacing')!;
const rankSpacing = document.querySelector<HTMLInputElement>('#rank-spacing')!;
const nodeSpacingValue = document.querySelector<HTMLOutputElement>('#node-spacing-value')!;
const rankSpacingValue = document.querySelector<HTMLOutputElement>('#rank-spacing-value')!;
const talaSeeds = document.querySelector<HTMLInputElement>('#tala-seeds')!;
const previewZoom = document.querySelector<HTMLInputElement>('#preview-zoom')!;
const previewZoomValue = document.querySelector<HTMLOutputElement>('#preview-zoom-value')!;
const previewFit = document.querySelector<HTMLButtonElement>('#preview-fit')!;

let renderVersion = 0;
let renderQueue = Promise.resolve();
let debounceTimer: number | undefined;
let renderedSvg = '';

function sizePreview(): void {
  const svg = preview.querySelector<SVGSVGElement>('svg');
  if (!svg) return;
  const viewBox = svg.viewBox.baseVal;
  if (!viewBox.width) return;
  const fitWidth = Math.min(viewBox.width, Math.max(120, preview.clientWidth - 64));
  svg.style.width = `${fitWidth * previewZoom.valueAsNumber / 100}px`;
  svg.style.maxWidth = 'none';
  previewZoomValue.value = previewZoom.valueAsNumber === 100 ? 'Fit' : `${previewZoom.value}%`;
}

mermaid.registerLayoutLoaders(talaLayouts);

for (const [index, example] of examples.entries()) {
  const option = document.createElement('option');
  option.value = String(index);
  option.textContent = example.title;
  exampleSelect.append(option);
}

function setStatus(message: string, isError = false): void {
  status.textContent = message;
  status.classList.toggle('error', isError);
}

function render(): void {
  window.clearTimeout(debounceTimer);
  const version = ++renderVersion;
  const diagram = source.value.trim();
  const layout = layoutSelect.value as Layout;

  if (!diagram) {
    preview.replaceChildren();
    renderedSvg = '';
    downloadButton.disabled = true;
    talaOptions.hidden = true;
    setStatus('Enter Mermaid syntax to see a diagram.');
    return;
  }

  setStatus('Rendering…');
  renderQueue = renderQueue.catch(() => {}).then(async () => {
    if (version !== renderVersion) return;

    const renderId = `playground-${version}`;
    try {
      const seeds = talaSeeds.value.split(',').map((value) => Number(value.trim()));
      if (layout === 'tala' && (talaSeeds.value.trim() === '' || seeds.some((seed) => !Number.isSafeInteger(seed)))) {
        throw new Error('Layout seeds must be comma separated integers.');
      }
      const flowchartOptions = layout === 'tala'
        ? { htmlLabels: false, nodeSpacing: nodeSpacing.valueAsNumber, rankSpacing: rankSpacing.valueAsNumber, talaSeeds: seeds }
        : { htmlLabels: false };
      mermaid.initialize({
        startOnLoad: false,
        layout,
        theme: 'default',
        securityLevel: 'strict',
        flowchart: flowchartOptions,
      });
      const parsed = await mermaid.parse(diagram);
      const isFlowchart = parsed.diagramType.startsWith('flowchart');
      const result = await mermaid.render(renderId, diagram);
      if (version !== renderVersion) return;

      preview.innerHTML = result.svg;
      result.bindFunctions?.(preview);
      sizePreview();
      renderedSvg = result.svg;
      downloadButton.disabled = false;
      talaOptions.hidden = layout !== 'tala' || !isFlowchart;
      setStatus(isFlowchart
        ? `Rendered with ${layout.toUpperCase()}.`
        : parsed.diagramType.startsWith('architecture')
          ? "Rendered with Mermaid's native architecture layout. TALA applies to flowcharts."
          : 'Rendered diagram. Layout selection depends on the Mermaid diagram type.');
    } catch (error) {
      // Mermaid may leave its temporary error diagram in the document.
      document.getElementById(`d${renderId}`)?.remove();
      if (version !== renderVersion) return;
      preview.replaceChildren();
      renderedSvg = '';
      downloadButton.disabled = true;
      setStatus(error instanceof Error ? error.message : String(error), true);
    }
  });
}

function scheduleRender(): void {
  window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(render, 450);
}

function selectExample(index: number): void {
  const example = examples[index];
  if (!example) return;
  source.value = example.source;
  syncDirection();
  description.textContent = example.description;
  render();
}

function syncDirection(): void {
  const match = source.value.match(/^\s*(?:flowchart|graph)\s+(TB|TD|BT|LR|RL)\b/i);
  directionSelect.disabled = !match;
  if (match) directionSelect.value = match[1]!.toUpperCase() === 'TD' ? 'TB' : match[1]!.toUpperCase();
}

exampleSelect.addEventListener('change', () => {
  if (exampleSelect.value === '') return;
  selectExample(Number(exampleSelect.value));
});

layoutSelect.addEventListener('change', () => {
  talaOptions.hidden = layoutSelect.value !== 'tala';
  render();
});
directionSelect.addEventListener('change', () => {
  source.value = source.value.replace(/^(\s*(?:flowchart|graph)\s+)(TB|TD|BT|LR|RL)\b/i, `$1${directionSelect.value}`);
  exampleSelect.value = '';
  description.textContent = 'Your own Mermaid diagram.';
  render();
});
for (const [input, output] of [[nodeSpacing, nodeSpacingValue], [rankSpacing, rankSpacingValue]] as const) {
  input.addEventListener('input', () => {
    output.value = `${input.value} px`;
    scheduleRender();
  });
}
talaSeeds.addEventListener('input', scheduleRender);
source.addEventListener('input', () => {
  syncDirection();
  exampleSelect.value = '';
  description.textContent = 'Your own Mermaid diagram.';
  scheduleRender();
});
source.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    render();
  }
});
renderButton.addEventListener('click', render);
previewZoom.addEventListener('input', sizePreview);
previewFit.addEventListener('click', () => {
  previewZoom.value = '100';
  sizePreview();
});
new ResizeObserver(sizePreview).observe(preview);
downloadButton.addEventListener('click', () => {
  if (!renderedSvg) return;
  const url = URL.createObjectURL(new Blob([renderedSvg], { type: 'image/svg+xml' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'mermaid-diagram.svg';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
});

exampleSelect.value = '0';
selectExample(0);
