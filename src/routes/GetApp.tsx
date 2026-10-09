import { Bell, Camera, Headphones, Layers, MessageCircle, Smartphone } from 'lucide-react';
import { usePageMeta } from '../hooks/usePageMeta';
import SEO from '../lib/seo.json';
import { GOLD } from '../lib/appStore';
import { InstallPath } from '../ui/AppStore';
import { Card } from '../ui/primitives';

const FREE = [
  { icon: <Layers size={18} />, title: 'Your stack at live spot', body: 'Add what you own, and the app values it all day with your cost basis and gain.' },
  { icon: <Bell size={18} />, title: 'Price alerts', body: 'Pick a price above or below spot for any metal and get a push when it crosses.' },
  { icon: <Camera size={18} />, title: 'Receipt scanning', body: 'Snap a dealer receipt and Troy pulls out every item. Five a month on the free plan.' },
  { icon: <MessageCircle size={18} />, title: 'Troy', body: 'Ask him anything about the metals. Three questions a day on the free plan.' },
];

const GOLD_FEATURES = [
  { icon: <MessageCircle size={18} />, title: '30 questions a day', body: 'Troy remembers every conversation and knows your stack.' },
  { icon: <Headphones size={18} />, title: 'Troy out loud', body: 'Hear his answers and keep listening from the lock screen.' },
  { icon: <Smartphone size={18} />, title: 'Widgets and the daily brief', body: 'Live spot on your home screen and a morning brief written around your stack.' },
];

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

      <section className="mt-12" aria-labelledby="free-heading">
        <h2 id="free-heading" className="text-[17px] font-semibold text-fg">Free in the app</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {FREE.map((f) => (
            <Card key={f.title} className="p-5 flex gap-3">
              <span className="text-gold mt-0.5" aria-hidden="true">{f.icon}</span>
              <span>
                <span className="block text-[15px] font-semibold text-fg">{f.title}</span>
                <span className="block text-[14px] text-fg-2 mt-0.5">{f.body}</span>
              </span>
            </Card>
          ))}
        </div>
      </section>

      <section className="mt-8" aria-labelledby="gold-heading">
        <h2 id="gold-heading" className="text-[17px] font-semibold text-fg">With Gold</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {GOLD_FEATURES.map((f) => (
            <Card key={f.title} className="p-5">
              <span className="text-gold" aria-hidden="true">{f.icon}</span>
              <span className="mt-2 block text-[15px] font-semibold text-fg">{f.title}</span>
              <span className="block text-[14px] text-fg-2 mt-0.5">{f.body}</span>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
