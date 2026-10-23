import { usePageMeta } from '../hooks/usePageMeta';
import SEO from '../lib/seo.json';
import { GOLD } from '../lib/appStore';
import { FREE_FEATURES, GOLD_FEATURES } from '../lib/gold';
import { InstallPath } from '../ui/AppStore';
import { Card } from '../ui/primitives';

export default function GetApp() {
  usePageMeta({ ...SEO['/app'], canonical: '/app' });
  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 pt-6 sm:pt-10">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.1fr_1fr] items-center">
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-gold">TroyStack for iPhone</div>
          <h1 className="mt-2 text-[32px] sm:text-[40px] font-semibold tracking-tight text-fg leading-[1.1]">Your stack and Troy, wherever you are</h1>
          <p className="mt-3 text-[16px] text-fg-2 max-w-xl">
            The app is free to download. Sign in with the same account you use here and your stack and your chats with Troy come with you.
          </p>
          <Card className="mt-6 p-5">
            <InstallPath campaign="webapp-getapp" />
          </Card>
          <p className="mt-3 text-[13px] text-fg-3">
            Gold starts with {GOLD.trialDays} free days for new subscribers, then {GOLD.monthly} a month or {GOLD.yearly} a year. Cancel anytime in your iPhone's settings.
          </p>
        </div>
        <div className="flex justify-center">
          <div className="flex flex-col items-center text-center rounded-[32px] border border-line bg-surface px-10 py-10 shadow-card">
            <img src="/app-icon.jpg" alt="TroyStack app icon" width={160} height={160} className="h-40 w-40 rounded-[36px] shadow-card" />
            <div className="mt-5 text-[18px] font-semibold text-fg">TroyStack: Gold &amp; Silver AI</div>
            <div className="mt-1 text-[14px] text-fg-3">Free on the App Store for iPhone and iPad</div>
          </div>
        </div>
      </div>

      <div className="mt-12 grid gap-3 sm:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-[17px] font-semibold text-fg">Free in the app and on the web</h2>
          <ul className="mt-3 space-y-2.5">
            {FREE_FEATURES.map((f) => (
              <li key={f} className="text-[14px] text-fg-2">{f}</li>
            ))}
          </ul>
        </Card>
        <Card className="p-5 border-gold">
          <h2 className="text-[17px] font-semibold text-fg">With Gold</h2>
          <ul className="mt-3 space-y-2.5">
            {GOLD_FEATURES.map((f) => (
              <li key={f} className="text-[14px] text-fg-2">{f}</li>
            ))}
          </ul>
        </Card>
      </div>

      <h2 className="mt-10 text-[15px] font-semibold text-fg">Who's behind this</h2>
      <p className="mt-1 text-[13px] text-fg-3">Built by Jon Mancini, Mancini Tech Solutions, Connecticut.</p>
    </div>
  );
}
