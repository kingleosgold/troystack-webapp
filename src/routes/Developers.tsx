import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy, KeyRound } from 'lucide-react';
import { usePageMeta } from '../hooks/usePageMeta';
import SEO from '../lib/seo.json';
import { SUPPORT_EMAIL } from '../lib/appStore';
import { API_BASE } from '../lib/apiClient';
import { Card, PageHeader, SectionHeader } from '../ui/primitives';
import { cx } from '../lib/cx';

function CodeBlock({ label, code }: { label: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard blocked; the text is selectable
    }
  };
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-bg-elev">
      <div className="flex items-center justify-between border-b border-line px-4 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-3">{label}</span>
        <button type="button" onClick={() => void copy()} className="inline-flex items-center gap-1 text-[12px] font-semibold text-fg-2 hover:text-fg" aria-label={`Copy ${label}`}>
          {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3 font-mono text-[12.5px] leading-relaxed text-fg">{code}</pre>
    </div>
  );
}

const MCP_URL = `${API_BASE}/mcp`;

const CLAUDE_CONFIG = `{
  "mcpServers": {
    "troystack": {
      "url": "${MCP_URL}"
    }
  }
}`;

const CURSOR_CONFIG = `{
  "troystack": {
    "url": "${MCP_URL}"
  }
}`;

const TOOLS: Array<{ name: string; does: string; key?: boolean }> = [
  { name: 'get_spot_prices', does: 'Gold, silver, platinum and palladium spot with the day\'s change' },
  { name: 'get_price_history', does: 'Spot history for one metal over a range you pick' },
  { name: 'get_stack_signal', does: 'Stack Signal stories with Troy\'s take' },
  { name: 'get_vault_watch', does: 'COMEX registered and eligible ounces, with daily changes' },
  { name: 'get_junk_silver', does: 'Melt value for pre-1965 US silver coins' },
  { name: 'get_speculation', does: 'What a stack is worth at prices you name' },
  { name: 'chat_with_troy', does: 'Ask Troy. Add a key and he answers with your stack in mind' },
  { name: 'get_daily_brief', does: 'The latest brief. With a key, the one written for your stack' },
  { name: 'get_portfolio', does: 'Your stack value, cost and gain, by metal', key: true },
  { name: 'add_holding', does: 'Add a purchase to your stack', key: true },
  { name: 'get_analytics', does: 'Cost basis, average cost per ounce and break-even, by metal', key: true },
  { name: 'scan_receipt', does: 'Read a dealer receipt photo into line items', key: true },
];

const PUBLIC_ENDPOINTS: Array<[string, string, string]> = [
  ['GET', '/v1/prices', 'Live spot for all four metals with the day\'s change'],
  ['GET', '/v1/prices/history', 'History for a metal. Params metal, range (1M to ALL)'],
  ['GET', '/v1/historical-spot', 'Spot on a single date'],
  ['POST', '/v1/historical-spot-batch', 'Spot for up to 100 dates'],
  ['GET', '/v1/stack-signal', 'Stack Signal stories. Params limit, offset, category'],
  ['GET', '/v1/stack-signal/latest', 'The latest daily synthesis'],
  ['GET', '/v1/stack-signal/:slug', 'One story by its slug'],
  ['GET', '/v1/vault-watch', 'COMEX warehouse inventory'],
  ['GET', '/v1/vault-watch/history', 'Vault history. Params metal, days'],
  ['GET', '/v1/junk-silver', 'Junk silver melt. Params dimes, quarters, half_dollars, kennedy_40, dollars, war_nickels'],
  ['GET', '/v1/speculation', 'What-if prices. Params silver, gold, platinum, palladium'],
];

const KEY_ENDPOINTS: Array<[string, string, string]> = [
  ['GET', '/v1/portfolio', 'Your stack with live value'],
  ['GET', '/v1/analytics', 'Cost basis and allocation'],
  ['GET', '/v1/holdings', 'Your holdings, line by line'],
];

const EXAMPLE_RESPONSE = `{
  "success": true,
  "marketsClosed": false,
  "prices": {
    "gold":   { "price": 4012.40, "change_pct": 0.42 },
    "silver": { "price": 48.21,   "change_pct": 1.15 },
    ...
  }
}`;

function EndpointList({ rows }: { rows: Array<[string, string, string]> }) {
  return (
    <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
      {rows.map(([method, path, what]) => (
        <div key={`${method} ${path}`} className="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[4.5rem_minmax(14rem,1fr)_2fr] sm:items-baseline sm:gap-3">
          <span className={cx('font-mono text-[11px] font-semibold', method === 'GET' ? 'text-gold' : 'text-fg-2')}>{method}</span>
          <code className="break-all font-mono text-[13px] text-fg">{path}</code>
          <span className="text-[13px] text-fg-2">{what}</span>
        </div>
      ))}
    </div>
  );
}

export default function Developers() {
  usePageMeta({ ...SEO['/developers'], canonical: '/developers' });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <PageHeader
        eyebrow="Developers"
        title="TroyStack API"
        subtitle="The prices, history, vault data and stories behind TroyStack, over plain REST or an MCP server. The public endpoints need no key."
        action={
          <Link to="/developers/keys" className="inline-flex h-10 items-center gap-2 rounded-xl bg-btn px-4 text-sm font-semibold text-btn-fg hover:bg-btn-hover">
            <KeyRound size={16} aria-hidden="true" /> API keys
          </Link>
        }
      />

      <section className="mt-8 space-y-4">
        <SectionHeader title="Add TroyStack to Claude or Cursor" subtitle={`The MCP server lives at ${MCP_URL}. Public tools work without a key.`} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-[13px] text-fg-2">Claude Desktop, in claude_desktop_config.json</p>
            <CodeBlock label="JSON" code={CLAUDE_CONFIG} />
          </div>
          <div className="space-y-2">
            <p className="text-[13px] text-fg-2">Cursor, in your MCP settings</p>
            <CodeBlock label="JSON" code={CURSOR_CONFIG} />
          </div>
        </div>
        <Card className="p-0">
          <ul className="divide-y divide-line">
            {TOOLS.map((t) => (
              <li key={t.name} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3">
                <code className="font-mono text-[13px] font-semibold text-gold">{t.name}</code>
                <span className="text-[13px] text-fg-2">{t.does}</span>
                {t.key && <span className="ml-auto rounded-md bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-fg-3">needs a key</span>}
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <section className="mt-10 space-y-3">
        <SectionHeader title="REST" subtitle={`Base URL ${API_BASE}. Calls that touch your stack take your key as a bearer token.`} />
        <CodeBlock label="Header" code="Authorization: Bearer YOUR_API_KEY" />
        <h3 className="pt-3 text-[13px] font-semibold text-fg">Public</h3>
        <EndpointList rows={PUBLIC_ENDPOINTS} />
        <h3 className="pt-3 text-[13px] font-semibold text-fg">With a key</h3>
        <EndpointList rows={KEY_ENDPOINTS} />
      </section>

      <section className="mt-10 grid gap-4 md:grid-cols-2">
        <CodeBlock label="Request" code={`curl ${API_BASE}/v1/prices`} />
        <CodeBlock label="Response, trimmed" code={EXAMPLE_RESPONSE} />
      </section>

      <section className="mt-10">
        <SectionHeader title="Rate limits" subtitle="Per key, per hour. New keys start on Free." />
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {[
            ['Free', '100'],
            ['Pro', '1,000'],
            ['Enterprise', '10,000'],
          ].map(([tier, rate]) => (
            <Card key={tier} className="p-4">
              <div className="text-[12px] text-fg-3">{tier}</div>
              <div className="mt-1 text-[22px] font-semibold text-fg tnum">{rate}</div>
              <div className="text-[12px] text-fg-3">requests an hour</div>
            </Card>
          ))}
        </div>
        <p className="mt-3 text-[13px] text-fg-2">
          Need more than Free? Email{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-gold hover:text-gold-2">
            {SUPPORT_EMAIL}
          </a>{' '}
          and tell us what you're building.
        </p>
      </section>
    </div>
  );
}
