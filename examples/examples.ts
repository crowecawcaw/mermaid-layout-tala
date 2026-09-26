export const examples = [
  {
    title: 'Nested cloud architecture',
    description: 'An architecture diagram with nested application, data, and edge containers.',
    source: `flowchart LR
  user[Users] --> cdn[CDN]
  subgraph cloud[Cloud platform]
    direction LR
    subgraph app[Application tier]
      gateway[API gateway] --> auth[Auth service]
      gateway --> orders[Order service]
      gateway --> catalog[Catalog service]
    end
    subgraph data[Data tier]
      users[(Users DB)]
      orderdb[(Orders DB)]
      products[(Product DB)]
    end
    auth --> users
    orders --> orderdb
    catalog --> products
  end
  cdn --> gateway
  orders --> queue[Event queue]
  queue --> worker[Background worker]
  worker --> storage[(Object storage)]`,
  },
  {
    title: 'Cloud architecture',
    description: 'An architecture topology in flowchart syntax, so TALA can lay it out.',
    source: `flowchart TB
  clients[Web and mobile clients] --> cdn[CDN]
  cdn --> gateway[API gateway]
  gateway --> identity[Identity service]
  gateway --> catalog[Catalog service]
  gateway --> orders[Order service]
  identity --> users[(User database)]
  catalog --> products[(Product database)]
  orders --> orderdb[(Order database)]
  orders --> events[Event queue]
  events --> worker[Background worker]
  worker --> storage[(Object storage)]
  events --> analytics[Analytics pipeline]`,
  },
  {
    title: 'Request flow',
    description: 'A decision, branching paths, a join, and a retry loop.',
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
    title: 'Service mesh',
    description: 'Parallel links, feedback edges, and a self loop.',
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
    title: 'Event pipeline',
    description: 'A right-to-left path plus a separate connected component.',
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
  {
    title: 'CI pipeline',
    description: 'A build with parallel checks and a release gate.',
    source: `flowchart LR
  commit[Commit] --> build[Build]
  build --> unit[Unit tests]
  build --> lint[Lint]
  build --> security[Security scan]
  unit --> gate{All checks pass?}
  lint --> gate
  security --> gate
  gate -->|yes| deploy[Deploy]
  gate -->|no| fix[Fix issues]
  fix --> commit`,
  },
  {
    title: 'Approval loop',
    description: 'A compact process with a return path.',
    source: `flowchart TB
  draft[Draft proposal] --> review[Team review]
  review --> decision{Approved?}
  decision -->|yes| publish[Publish]
  decision -->|changes needed| revise[Revise draft]
  revise --> review`,
  },
  {
    title: 'Data sync',
    description: 'Two sources merge before validation and storage.',
    source: `flowchart BT
  crm[(CRM)] --> extract[Extract]
  billing[(Billing)] --> extract
  extract --> transform[Transform]
  transform --> valid{Valid rows?}
  valid -->|yes| warehouse[(Warehouse)]
  valid -->|no| quarantine[(Quarantine)]
  warehouse --> dashboard[Dashboard]`,
  },
  {
    title: 'Incident response',
    description: 'An operational workflow with branching and recovery.',
    source: `flowchart LR
  detect[Alert fires] --> triage[Assess impact]
  triage --> severity{Critical?}
  severity -->|yes| page[Page on-call]
  severity -->|no| ticket[Create ticket]
  page --> mitigate[Mitigate]
  ticket --> investigate[Investigate]
  mitigate --> investigate
  investigate --> resolve[Resolve]
  resolve --> review[Postmortem]`,
  },
  {
    title: 'Inventory lifecycle',
    description: 'A simple stateful flow with replenishment.',
    source: `flowchart TD
  receive[Receive stock] --> count[Count items]
  count --> shelf[Put on shelf]
  shelf --> sale[Customer purchase]
  sale --> remaining{Below threshold?}
  remaining -->|yes| reorder[Place order]
  remaining -->|no| shelf
  reorder --> receive`,
  },
] as const;
