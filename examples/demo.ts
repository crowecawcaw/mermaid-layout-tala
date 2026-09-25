import mermaid from 'mermaid';
import talaLayouts from '../src/index.js';

const examples = [
  {
    title: 'Request flow · top to bottom',
    caption: 'Branching, a join, edge labels, and a retry loop.',
    source: `flowchart TD
      request[Incoming request] --> auth{Authenticated?}
      auth -->|yes| route[Choose route]
      auth -->|no| login[Sign in]
      login --> auth
      route --> cache[(Cache)]
      route --> service[Application service]
      cache --> response[Return response]
      service --> response`,
  },
  {
    title: 'Service mesh · left to right',
    caption: 'Feedback edges, parallel traffic paths, and a self loop.',
    source: `flowchart LR
      browser[Web client] --> gateway[API gateway]
      gateway --> catalog[Catalog]
      gateway --> orders[Orders]
      gateway -->|primary| billing[Billing]
      gateway -->|retry| billing
      billing --> orders
      catalog --> search[(Search index)]
      orders --> inventory[Inventory]
      inventory --> catalog
      orders --> orders`,
  },
  {
    title: 'Event pipeline · right to left',
    caption: 'A long path alongside a separate connected component.',
    source: `flowchart RL
      webhook[Webhook] --> queue[Message queue]
      queue --> normalize[Normalize event]
      normalize --> validate{Valid?}
      validate -->|yes| enrich[Enrich]
      validate -->|no| dead[Dead letter]
      enrich --> store[(Event store)]
      enrich --> metrics[Metrics]
      metrics --> normalize
      alert[Alert source] --> pager[On-call pager]`,
  },
];

mermaid.registerLayoutLoaders(talaLayouts);
mermaid.initialize({
  startOnLoad: false,
  layout: 'tala',
  theme: 'default',
  flowchart: { nodeSpacing: 44, rankSpacing: 64, htmlLabels: false },
});

const root = document.querySelector<HTMLElement>('#examples')!;
for (const [index, example] of examples.entries()) {
  const article = document.createElement('article');
  article.innerHTML = `
    <div class="card-head">
      <h2>${example.title}</h2>
      <p class="caption">${example.caption}</p>
    </div>
    <div class="diagram" id="diagram-${index}"><span class="caption">Rendering…</span></div>
    <details class="source">
      <summary>View Mermaid source</summary>
      <pre></pre>
    </details>`;
  article.querySelector('pre')!.textContent = example.source;
  root.append(article);
  const target = article.querySelector<HTMLElement>(`.diagram`)!;
  try {
    const result = await mermaid.render(`tala-example-${index}`, example.source);
    target.innerHTML = result.svg;
    result.bindFunctions?.(target);
  } catch (error) {
    target.innerHTML = `<div class="status"></div>`;
    target.querySelector('.status')!.textContent = error instanceof Error ? error.message : String(error);
  }
}
