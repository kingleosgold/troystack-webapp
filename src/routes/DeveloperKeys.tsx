import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, KeyRound } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { usePageMeta } from '../hooks/usePageMeta';
import { generateApiKey, listApiKeys, revokeApiKey, type ApiKey, type GeneratedApiKey } from '../services/api';
import { SUPPORT_EMAIL } from '../lib/appStore';
import { formatShortDate } from '../lib/text';
import { Button, Card, EmptyState, ErrorNote, PageHeader, Sheet, Skeleton } from '../ui/primitives';

const TIER_LABEL: Record<ApiKey['tier'], string> = { free: 'Free', pro: 'Pro', enterprise: 'Enterprise' };

function NewKeySheet({ created, onClose }: { created: GeneratedApiKey; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const raw = created.api_key || (created as unknown as { key?: string }).key || '';
  return (
    <Sheet open onClose={onClose} title="Your new API key" width="sm">
      <p className="rounded-xl border border-down/40 bg-down-soft px-3 py-2 text-[13px] text-fg">
        Copy it now. For your safety it won't be shown again.
      </p>
      <div className="mt-3 break-all rounded-xl border border-line bg-bg-elev p-3 font-mono text-[12.5px] text-fg">{raw}</div>
      <div className="mt-3 flex items-center justify-between text-[12px] text-fg-3">
        <span>{TIER_LABEL[created.tier] ?? 'Free'} key</span>
        <span className="tnum">{created.rate_limit?.toLocaleString('en-US') ?? 100} requests an hour</span>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button
          variant="secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(raw);
              setCopied(true);
            } catch {
              // clipboard blocked; the key is selectable above
            }
          }}
        >
          {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
          {copied ? 'Copied' : 'Copy key'}
        </Button>
        <Button onClick={onClose}>Done</Button>
      </div>
    </Sheet>
  );
}

export default function DeveloperKeys() {
  usePageMeta({ title: 'API keys', canonical: '/developers/keys', noindex: true });
  const { user, session, isConfigured } = useAuth();
  const token = session?.access_token;
  const qc = useQueryClient();
  const [created, setCreated] = useState<GeneratedApiKey | null>(null);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);

  const keys = useQuery({
    queryKey: ['api-keys', user?.id],
    queryFn: () => listApiKeys(token!),
    enabled: Boolean(user && token),
  });

  const generate = useMutation({
    mutationFn: () => generateApiKey(token!),
    onSuccess: (k) => {
      setCreated(k);
      void qc.invalidateQueries({ queryKey: ['api-keys', user?.id] });
    },
  });

  const revoke = useMutation({
    mutationFn: (id: string) => revokeApiKey(token!, id),
    onSuccess: (_d, id) => {
      qc.setQueryData<ApiKey[]>(['api-keys', user?.id], (prev) => (prev ?? []).filter((k) => k.id !== id));
      setRevoking(null);
    },
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <PageHeader
        eyebrow={<Link to="/developers" className="hover:text-fg">Developers</Link>}
        title="API keys"
        subtitle="Keys let your code read your own stack through the API and the MCP server. Keep them private, like a password."
      />

      {!isConfigured || !user ? (
        <div className="mt-8">
          <EmptyState
            icon={<KeyRound size={22} aria-hidden="true" />}
            title="Sign in to manage keys"
            body="Keys belong to your TroyStack account, the same one you use in the app."
            action={
              <Link to="/auth?next=/developers/keys" className="inline-flex h-10 items-center rounded-xl bg-btn px-4 text-sm font-semibold text-btn-fg hover:bg-btn-hover">
                Sign in
              </Link>
            }
          />
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13px] text-fg-2">
              New keys start on Free, 100 requests an hour. For more, email{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-gold hover:text-gold-2">
                {SUPPORT_EMAIL}
              </a>
              .
            </p>
            <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
              {generate.isPending ? 'Making a key' : 'New key'}
            </Button>
          </div>
          {generate.error && <ErrorNote>{(generate.error as Error).message || "That key wasn't made. Try again."}</ErrorNote>}

          <Card className="overflow-hidden p-0">
            {keys.isLoading ? (
              <div className="space-y-2 p-4">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </div>
            ) : keys.error ? (
              <div className="p-4">
                <ErrorNote onRetry={() => void keys.refetch()}>Your keys didn't load.</ErrorNote>
              </div>
            ) : (keys.data ?? []).length === 0 ? (
              <p className="px-4 py-10 text-center text-[14px] text-fg-2">No keys yet. Make one to get started.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead className="bg-surface-2 text-left text-fg-3">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Key</th>
                      <th className="px-4 py-2.5 font-medium">Plan</th>
                      <th className="px-4 py-2.5 font-medium">Made</th>
                      <th className="px-4 py-2.5 font-medium">Last used</th>
                      <th className="px-4 py-2.5 text-right font-medium">Requests</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {(keys.data ?? []).map((k) => (
                      <tr key={k.id} className="border-t border-line">
                        <td className="px-4 py-3">
                          <span className="font-mono text-fg">…{k.key_preview}</span>
                          {k.name && <span className="block text-[12px] text-fg-3">{k.name}</span>}
                        </td>
                        <td className="px-4 py-3 text-fg-2">
                          {TIER_LABEL[k.tier] ?? k.tier}, <span className="tnum">{k.rate_limit?.toLocaleString('en-US')}</span> an hour
                        </td>
                        <td className="px-4 py-3 text-fg-2">{k.created_at ? formatShortDate(k.created_at) : ''}</td>
                        <td className="px-4 py-3 text-fg-2">{k.last_used_at ? formatShortDate(k.last_used_at) : 'Not yet'}</td>
                        <td className="px-4 py-3 text-right text-fg-2 tnum">{(k.request_count ?? 0).toLocaleString('en-US')}</td>
                        <td className="px-4 py-3 text-right">
                          <button type="button" onClick={() => setRevoking(k)} className="text-[13px] font-semibold text-down hover:opacity-80">
                            Revoke
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {created && <NewKeySheet created={created} onClose={() => setCreated(null)} />}
      {revoking && (
        <Sheet open onClose={() => setRevoking(null)} title="Revoke this key?" width="sm">
          <p className="text-[14px] text-fg-2">
            Anything using the key ending in <span className="font-mono text-fg">{revoking.key_preview}</span> stops working right away. This can't be undone.
          </p>
          {revoke.error && <p className="mt-3 text-[13px] text-down">{(revoke.error as Error).message}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRevoking(null)} disabled={revoke.isPending}>
              Keep it
            </Button>
            <Button variant="danger" onClick={() => revoke.mutate(revoking.id)} disabled={revoke.isPending}>
              {revoke.isPending ? 'Revoking' : 'Revoke'}
            </Button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
