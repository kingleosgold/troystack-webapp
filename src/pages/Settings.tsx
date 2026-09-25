import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useHoldings } from '../hooks/useHoldings';
import { useTheme } from '../hooks/useTheme';
import type { Theme } from '../hooks/useTheme';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../hooks/useSubscription';
import { clearAllHoldings } from '../services/holdings';
import { syncSubscription, createCustomerPortal, verifyStripeSession } from '../services/api';
import { PricingModal } from '../components/PricingModal';
import { ExternalLinkModal, useExternalLink } from '../components/ExternalLinkModal';

const APP_VERSION = '2.0.0';

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.04 } },
};

const item = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0 },
};

function SettingsRow({ label, description, onClick, href, onExternalClick, rightElement, danger }: {
  label: string;
  description?: string;
  onClick?: () => void;
  href?: string;
  onExternalClick?: (url: string) => void;
  rightElement?: React.ReactNode;
  danger?: boolean;
}) {
  const content = (
    <>
      <div className="flex-1">
        <p className={`text-sm ${danger ? 'text-red' : 'text-text'}`}>{label}</p>
        {description && <p className="text-xs text-text-muted mt-0.5">{description}</p>}
      </div>
      {rightElement || (
        <svg className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      )}
    </>
  );

  const cls = "flex items-center justify-between py-3.5 px-4 hover:bg-text/[0.02] transition-colors cursor-pointer";

  if (href && onExternalClick) {
    return (
      <button onClick={() => onExternalClick(href)} className={`${cls} w-full text-left`}>
        {content}
      </button>
    );
  }

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {content}
      </a>
    );
  }

  return (
    <button onClick={onClick} className={`${cls} w-full text-left`}>
      {content}
    </button>
  );
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <motion.div variants={item} className="mb-5">
      <h2 className="text-[11px] font-medium text-text-muted uppercase tracking-wider mb-2 px-1">
        {title}
      </h2>
      <div className="rounded-xl bg-surface border border-border divide-y divide-border overflow-hidden">
        {children}
      </div>
    </motion.div>
  );
}

function ThemeToggle({ theme, onChange }: { theme: Theme; onChange: (t: Theme) => void }) {
  const options: { value: Theme; label: string; icon: React.ReactNode }[] = [
    {
      value: 'dark',
      label: 'Dark',
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
        </svg>
      ),
    },
    {
      value: 'light',
      label: 'Light',
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
        </svg>
      ),
    },
    {
      value: 'system',
      label: 'Auto',
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
        </svg>
      ),
    },
  ];

  return (
    <div className="flex bg-background rounded-lg p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors ${
            theme === opt.value
              ? 'bg-gold text-background font-medium'
              : 'text-text-muted hover:text-text-secondary'
          }`}
        >
          {opt.icon}
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function ConfirmModal({ isOpen, onClose, onConfirm, title, message, confirmText = 'Confirm', danger = false }: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  danger?: boolean;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-surface border border-border rounded-xl max-w-sm w-full p-6"
      >
        <h3 className="text-base font-semibold mb-2">{title}</h3>
        <p className="text-sm text-text-muted mb-5">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 px-4 rounded-lg bg-background border border-border hover:bg-surface-hover text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => { onConfirm(); onClose(); }}
            className={`flex-1 py-2.5 px-4 rounded-lg font-medium text-sm transition-colors ${
              danger
                ? 'bg-red text-text hover:bg-red-600'
                : 'bg-gold text-background hover:bg-gold-hover'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { holdings, exportCSV, importCSV, refresh } = useHoldings();
  const { theme, setTheme } = useTheme();
  const {
    user, isConfigured, signOut, linkWithGoogle, linkWithApple,
    updateEmailPassword, getLinkedProviders, hasEmailPassword,
  } = useAuth();
  const { tier, isTrial, trialEnd, refetch: refetchTier } = useSubscription();
  const [syncingSubscription, setSyncingSubscription] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [showPricing, setShowPricing] = useState(false);
  const [managingPortal, setManagingPortal] = useState(false);
  const externalLink = useExternalLink();

  // Handle Stripe checkout success redirect — verify session to ensure tier updates
  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    if (!sessionId) return;

    // Clean up URL immediately
    window.history.replaceState({}, '', window.location.pathname);

    verifyStripeSession(sessionId)
      .then(async (result) => {
        await refetchTier();
        if (result.success) {
          const label = result.tier === 'lifetime' ? 'Lifetime' : result.tier === 'gold' ? 'Gold' : 'Gold';
          showStatus(`${label} subscription activated! Welcome aboard.`);
        } else {
          showStatus('Subscription activated! Welcome aboard.');
        }
      })
      .catch(async () => {
        // Fallback: just refetch tier (webhook may have already handled it)
        await refetchTier();
        showStatus('Subscription activated! Welcome aboard.');
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [linkingProvider, setLinkingProvider] = useState<string | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);

  const linkedProviders = user ? getLinkedProviders() : [];
  const hasEmail = user ? hasEmailPassword() : false;

  const showStatus = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const handleLinkGoogle = async () => {
    setLinkingProvider('google');
    const { error } = await linkWithGoogle();
    if (error) showStatus(`Failed: ${error.message}`);
    setLinkingProvider(null);
  };

  const handleLinkApple = async () => {
    setLinkingProvider('apple');
    const { error } = await linkWithApple();
    if (error) showStatus(`Failed: ${error.message}`);
    setLinkingProvider(null);
  };

  const handleUpdateEmailPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword && newPassword !== confirmNewPassword) {
      showStatus('Passwords do not match');
      return;
    }
    const { error } = await updateEmailPassword(newEmail, newPassword);
    if (error) {
      showStatus(`Failed: ${error.message}`);
    } else {
      showStatus('Account updated');
      setShowEmailForm(false);
      setNewEmail('');
      setNewPassword('');
      setConfirmNewPassword('');
    }
  };

  const handleExportCSV = () => {
    const csv = exportCSV();
    if (!csv) { showStatus('No holdings'); return; }
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stacktracker-holdings-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showStatus('CSV exported');
  };

  const handleExportJSON = () => {
    if (holdings.length === 0) { showStatus('No holdings'); return; }
    const blob = new Blob([JSON.stringify({ version: '2.0', exportedAt: new Date().toISOString(), holdings }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stacktracker-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showStatus('Backup exported');
  };

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const imported = importCSV(text);
      showStatus(`Imported ${imported.length} holdings`);
    } catch (err) {
      showStatus(`Import failed: ${err instanceof Error ? err.message : 'Error'}`);
    }
    if (csvInputRef.current) csvInputRef.current.value = '';
  };

  const handleImportJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const backup = JSON.parse(text);
      if (!backup.holdings?.length) throw new Error('Invalid backup');
      clearAllHoldings();
      localStorage.setItem('stacktracker_holdings', JSON.stringify(backup.holdings));
      refresh();
      showStatus(`Restored ${backup.holdings.length} holdings`);
    } catch (err) {
      showStatus(`Restore failed: ${err instanceof Error ? err.message : 'Error'}`);
    }
    if (jsonInputRef.current) jsonInputRef.current.value = '';
  };

  const handleSyncSubscription = async () => {
    if (!user) { showStatus('Sign in first to sync your subscription'); return; }
    setSyncingSubscription(true);
    try {
      const result = await syncSubscription(user.id);
      await refetchTier();
      const t = result.tier || 'free';
      const tierLabel = t === 'free' ? 'Free' : t === 'lifetime' ? 'Lifetime' : t.charAt(0).toUpperCase() + t.slice(1);
      showStatus(`Synced! Your plan: ${tierLabel}`);
    } catch (err) {
      showStatus(`Failed: ${err instanceof Error ? err.message : "Couldn't sync subscription. Make sure you're signed in with the same account on mobile."}`);
    } finally {
      setSyncingSubscription(false);
    }
  };

  const handleManageSubscription = async () => {
    if (!user) return;
    setManagingPortal(true);
    try {
      const { url } = await createCustomerPortal(user.id);
      window.location.href = url;
    } catch (err) {
      showStatus(`Failed: ${err instanceof Error ? err.message : 'Could not open billing portal'}`);
      setManagingPortal(false);
    }
  };

  const tierLabel = tier === 'free' ? 'Free' : tier === 'lifetime' ? 'Lifetime' : isTrial ? 'Gold Trial' : 'Gold';
  const trialDaysLeft = trialEnd ? Math.max(0, Math.ceil((new Date(trialEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : 0;
  const tierDescription = tier === 'free'
    ? 'Basic stack tracking'
    : tier === 'lifetime'
    ? 'Lifetime access to all features'
    : isTrial
    ? `${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'} remaining in trial`
    : 'Gold member';

  const inputClass = "w-full px-3 py-2.5 rounded-lg bg-background border border-border focus:border-gold/50 focus:outline-none text-sm";

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 lg:p-8">
      <h1 className="text-2xl font-bold tracking-tight mb-6">Settings</h1>

      {/* Status Toast */}
      {statusMessage && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className={`mb-4 p-3 rounded-lg border text-xs ${
            statusMessage.includes('Failed') || statusMessage.includes('failed')
              ? 'bg-red/10 border-red/20 text-red'
              : 'bg-green/10 border-green/20 text-green'
          }`}
        >
          {statusMessage}
        </motion.div>
      )}

      <motion.div variants={container} initial="hidden" animate="show">

        {/* Account */}
        {isConfigured && (
          <SettingsSection title="Account">
            {user ? (
              <>
                <div className="py-3.5 px-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gold/15 flex items-center justify-center">
                      <span className="text-sm font-semibold text-gold">
                        {(user.email?.[0] || 'U').toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium">{user.email || 'No email'}</p>
                      <p className="text-xs text-text-muted">Signed in</p>
                    </div>
                  </div>
                </div>

                {/* Provider Links */}
                <div className="py-3.5 px-4">
                  <p className="text-xs font-medium text-text-secondary mb-3">Sign-in Methods</p>
                  <div className="space-y-2.5">
                    {[
                      { id: 'google', label: 'Google', handler: handleLinkGoogle, linked: linkedProviders.includes('google') },
                      { id: 'apple', label: 'Apple', handler: handleLinkApple, linked: linkedProviders.includes('apple') },
                    ].map((provider) => (
                      <div key={provider.id} className="flex items-center justify-between">
                        <span className="text-sm">{provider.label}</span>
                        {provider.linked ? (
                          <span className="text-xs text-green font-medium">Linked</span>
                        ) : (
                          <button
                            onClick={provider.handler}
                            disabled={linkingProvider === provider.id}
                            className="px-3 py-1 text-xs bg-gold text-background font-medium rounded-md hover:bg-gold-hover disabled:opacity-50"
                          >
                            {linkingProvider === provider.id ? '...' : 'Link'}
                          </button>
                        )}
                      </div>
                    ))}
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Email & Password</span>
                      {hasEmail ? (
                        <span className="text-xs text-green font-medium">Set</span>
                      ) : (
                        <button
                          onClick={() => setShowEmailForm(true)}
                          className="px-3 py-1 text-xs bg-gold text-background font-medium rounded-md"
                        >
                          Add
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Email/Password Form */}
                {(showEmailForm || (hasEmail && showEmailForm)) && (
                  <div className="py-3.5 px-4">
                    <form onSubmit={handleUpdateEmailPassword} className="space-y-3">
                      <input
                        type="email"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder={user.email || 'Email'}
                        className={inputClass}
                      />
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="New password"
                        minLength={6}
                        className={inputClass}
                      />
                      <input
                        type="password"
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        placeholder="Confirm password"
                        className={inputClass}
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => { setShowEmailForm(false); setNewEmail(''); setNewPassword(''); setConfirmNewPassword(''); }}
                          className="flex-1 py-2 text-xs bg-surface border border-border rounded-lg"
                        >
                          Cancel
                        </button>
                        <button type="submit" className="flex-1 py-2 text-xs bg-gold text-background font-medium rounded-lg">
                          Save
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {hasEmail && !showEmailForm && (
                  <SettingsRow
                    label="Change Email or Password"
                    onClick={() => setShowEmailForm(true)}
                  />
                )}

                <SettingsRow label="Sign Out" onClick={() => setShowSignOutConfirm(true)} danger />
              </>
            ) : (
              <SettingsRow
                label="Sign In"
                description="Sync your holdings across devices"
                onClick={() => navigate('/auth')}
                rightElement={<span className="text-gold text-xs font-medium">Sign In</span>}
              />
            )}
          </SettingsSection>
        )}

        {/* Membership */}
        <SettingsSection title="Membership">
          <div className="py-3.5 px-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{tierLabel} Plan</p>
                <p className="text-xs text-text-muted">{tierDescription}</p>
              </div>
              <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                tier === 'free' ? 'bg-gold/10 text-gold' : isTrial ? 'bg-gold/10 text-gold' : 'bg-green/10 text-green'
              }`}>
                {tierLabel}
              </span>
            </div>
          </div>
          {user && tier === 'free' && (
            <div className="py-3.5 px-4">
              <button
                onClick={() => setShowPricing(true)}
                className="flex items-center gap-2 px-4 py-2.5 w-full bg-gold text-background font-medium rounded-lg hover:bg-gold-hover transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                </svg>
                <span className="text-sm">Try Gold Free for 7 Days</span>
              </button>
            </div>
          )}
          {user && tier !== 'free' && tier !== 'lifetime' && (
            <div className="py-3.5 px-4">
              <button
                onClick={handleManageSubscription}
                disabled={managingPortal}
                className="flex items-center gap-2 px-4 py-2.5 w-full bg-background border border-border rounded-lg hover:bg-surface-hover transition-colors disabled:opacity-50"
              >
                <svg className="w-4 h-4 text-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
                </svg>
                <div className="text-left">
                  <p className="text-sm font-medium">{managingPortal ? 'Opening...' : 'Manage Subscription'}</p>
                  <p className="text-[11px] text-text-muted">Change plan, update payment, or cancel</p>
                </div>
              </button>
            </div>
          )}
          {user && (
            <div className="py-3.5 px-4">
              <button
                onClick={handleSyncSubscription}
                disabled={syncingSubscription}
                className="flex items-center gap-2 px-4 py-2.5 w-full bg-background border border-border rounded-lg hover:bg-surface-hover transition-colors disabled:opacity-50"
              >
                {syncingSubscription ? (
                  <svg className="w-4 h-4 text-gold animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                  </svg>
                )}
                <div className="text-left">
                  <p className="text-sm font-medium">{syncingSubscription ? 'Syncing...' : 'Sync Mobile Subscription'}</p>
                  <p className="text-[11px] text-text-muted">Have a Gold or Lifetime subscription on iOS? Tap to sync it here.</p>
                </div>
              </button>
            </div>
          )}
        </SettingsSection>

        {/* Appearance */}
        <SettingsSection title="Appearance">
          <div className="flex items-center justify-between py-3.5 px-4">
            <div>
              <p className="text-sm">Theme</p>
              <p className="text-xs text-text-muted mt-0.5">Color scheme preference</p>
            </div>
            <ThemeToggle theme={theme} onChange={setTheme} />
          </div>
        </SettingsSection>

        {/* Data */}
        <SettingsSection title="Data Management">
          <SettingsRow label="Export as CSV" description="Download holdings spreadsheet" onClick={handleExportCSV} />
          <SettingsRow label="Export as JSON" description="Full backup" onClick={handleExportJSON} />
          <SettingsRow label="Import from CSV" onClick={() => csvInputRef.current?.click()} />
          <SettingsRow label="Restore from Backup" onClick={() => jsonInputRef.current?.click()} />
          <SettingsRow label="Clear All Data" description="Delete all holdings" onClick={() => setShowClearConfirm(true)} danger />
        </SettingsSection>

        <input ref={csvInputRef} type="file" accept=".csv" onChange={handleImportCSV} className="hidden" />
        <input ref={jsonInputRef} type="file" accept=".json" onChange={handleImportJSON} className="hidden" />

        {/* About */}
        <SettingsSection title="About">
          <div className="flex items-center justify-between py-3.5 px-4">
            <p className="text-sm">Version</p>
            <p className="text-xs text-text-muted">{APP_VERSION}</p>
          </div>
          <SettingsRow label="Privacy Policy" href="https://troystack.com/privacy" onExternalClick={externalLink.openExternal} />
          <SettingsRow label="Terms of Service" href="https://troystack.com/terms" onExternalClick={externalLink.openExternal} />
        </SettingsSection>

        {/* Links */}
        <SettingsSection title="Get the App">
          <SettingsRow
            label="Download for iOS"
            href="https://apps.apple.com/app/apple-store/id6757343766?pt=96487801&ct=webapp&mt=8"
            onExternalClick={externalLink.openExternal}
            rightElement={<span className="text-gold text-xs font-medium">App Store</span>}
          />
          <SettingsRow
            label="Visit Website"
            href="https://troystack.com"
            onExternalClick={externalLink.openExternal}
          />
        </SettingsSection>

        {/* Support */}
        <SettingsSection title="Support">
          <SettingsRow
            label="Contact Support"
            href="mailto:support@troystack.com"
            onExternalClick={externalLink.openExternal}
          />
        </SettingsSection>

        {/* Footer */}
        <div className="text-center text-text-muted text-xs mt-6 mb-4">
          <p>TroyStack v{APP_VERSION}</p>
          <p className="mt-1">Made with care for stackers everywhere</p>
        </div>
      </motion.div>

      <ConfirmModal
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={() => { clearAllHoldings(); refresh(); showStatus('All data cleared'); }}
        title="Clear All Data?"
        message="This will permanently delete all holdings. This cannot be undone."
        confirmText="Clear All"
        danger
      />

      <ConfirmModal
        isOpen={showSignOutConfirm}
        onClose={() => setShowSignOutConfirm(false)}
        onConfirm={handleSignOut}
        title="Sign Out?"
        message="You'll be signed out and local data will be cleared. Your holdings are safely stored in the cloud and will sync when you sign back in."
        confirmText="Sign Out"
        danger
      />

      <PricingModal
        isOpen={showPricing}
        onClose={() => setShowPricing(false)}
        currentTier={tier}
      />

      <ExternalLinkModal
        isOpen={externalLink.isOpen}
        url={externalLink.pendingUrl || ''}
        onClose={externalLink.close}
      />
    </div>
  );
}
