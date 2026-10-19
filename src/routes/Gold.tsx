import { useEffect } from 'react';
import { Check } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { usePageMeta } from '../hooks/usePageMeta';
import { useSubscription } from '../hooks/useSubscription';
import { useTrial } from '../contexts/TrialContext';
import SEO from '../lib/seo.json';
import { GOLD } from '../lib/appStore';
import { goldPagePlans, siteCampaign, webCheckoutReady, type WebPlan } from '../lib/checkout';
import { countStep } from '../lib/funnel';
import { GOLD_FEATURES } from '../lib/gold';
import { cx } from '../lib/cx';
import { Button, Card } from '../ui/primitives';

const FREE = [
  'Live spot for all four metals, with charts',
  'Your stack at live spot, with cost basis and gain',
  'Three questions a day with Troy',
  'Five receipt scans every 30 days',
  'Every calculator, the Signal and the podcast',
];

const QUESTIONS = [
  {
    q: 'How does the free week work?',
    a: `Monthly and yearly start with ${GOLD.trialDays} free days if you haven't had Gold before. Cancel before day ${GOLD.trialDays + 1} and you aren't charged.`,
  },
  { q: 'What does Lifetime mean?', a: 'One payment and Gold stays on your account for good. There is no free week on Lifetime, since nothing renews.' },
  { q: 'Does it work in the iPhone app too?', a: 'Yes. Gold belongs to your account, so sign in to the app with the same account and it’s on there too.' },
  { q: 'How do I cancel?', a: 'Gold bought here is cancelled from Settings on this site, which opens Stripe’s billing page. Gold bought in the app is cancelled in your iPhone’s settings.' },
];

export default function Gold() {
  usePageMeta({ ...SEO['/gold'], canonical: '/gold' });
  const { isGold, tier, loading } = useSubscription();
  const { openTrial } = useTrial();
  // A visitor from one of troystack.com's links keeps that page's site-* token
  // through the counts and checkout, so the funnel shows which page sent them.
  const [params] = useSearchParams();
  const campaign = siteCampaign(params.get('campaign')) ?? 'webapp-gold';
  // The card already showed the plan and its price, so where it can be bought
  // here the button goes on to sign-up or Stripe without a second pick.
  const start = (plan: WebPlan) => {
    countStep('plan_tap', plan, campaign);
    openTrial({ campaign, plan, start: webCheckoutReady(plan) });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- one view per visit, under the token it landed with
  useEffect(() => countStep('gold_view', null, campaign), []);
  const plans = goldPagePlans();

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 pt-6 sm:pt-10">
      <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-gold">TroyStack Gold</div>
      <h1 className="mt-2 text-[32px] sm:text-[40px] font-semibold tracking-tight text-fg leading-[1.1]">Troy, all day, around your stack</h1>
      <p className="mt-3 text-[16px] text-fg-2 max-w-2xl">
        Gold gives you 30 questions a day with Troy and a brief every morning written around what you own. Try it free for {GOLD.trialDays} days.
      </p>

      {isGold ? (
        <Card className="mt-6 p-5">
          <p className="text-[15px] text-fg">{tier === 'lifetime' ? 'You have Gold for life on this account.' : 'You have Gold on this account.'}</p>
          <Link to="/settings" className="mt-2 inline-block text-[14px] font-semibold text-gold hover:text-gold-2">
            See your plan in Settings
          </Link>
        </Card>
      ) : (
        <>
          <div className={cx('mt-6 grid gap-3', plans.length >= 3 ? 'sm:grid-cols-3' : plans.length === 2 ? 'sm:grid-cols-2' : '')} aria-label="Plans">
            {plans.map((p) => (
              <Card key={p.id} as="div" className={cx('p-5 flex flex-col', p.id === 'yearly' && 'border-gold')}>
                <div className="flex items-center justify-between">
                  <span className="text-[14px] font-semibold text-fg">{p.label}</span>
                  {p.note && <span className="text-[12px] font-semibold text-gold">{p.note}</span>}
                </div>
                <div className="mt-2 text-[28px] font-semibold text-fg tnum">{p.price}</div>
                <div className="text-[13px] text-fg-3">{p.id === 'lifetime' ? 'one payment' : `${p.per}, after ${GOLD.trialDays} free days`}</div>
                <Button
                  className="mt-4 w-full"
                  variant={p.id === 'yearly' ? 'primary' : 'secondary'}
                  disabled={loading}
                  onClick={() => start(p.id)}
                >
                  {p.id === 'lifetime' ? 'Get Lifetime' : 'Start free week'}
                </Button>
              </Card>
            ))}
          </div>
          <p className="mt-3 text-[13px] text-fg-3">Same prices on the web and in the iPhone app. Checkout on the web is handled by Stripe.</p>
        </>
      )}

      <div className="mt-10 grid gap-3 sm:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-[17px] font-semibold text-fg">Free</h2>
          <ul className="mt-3 space-y-2.5">
            {FREE.map((f) => (
              <li key={f} className="flex gap-2.5 text-[14px] text-fg-2">
                <Check size={16} className="mt-0.5 shrink-0 text-fg-3" aria-hidden="true" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-5 border-gold">
          <h2 className="text-[17px] font-semibold text-fg">Gold adds</h2>
          <ul className="mt-3 space-y-2.5">
            {GOLD_FEATURES.map((f) => (
              <li key={f} className="flex gap-2.5 text-[14px] text-fg-2">
                <Check size={16} className="mt-0.5 shrink-0 text-gold" aria-hidden="true" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <section className="mt-10" aria-labelledby="gold-questions">
        <h2 id="gold-questions" className="text-[17px] font-semibold text-fg">Questions</h2>
        <dl className="mt-3 space-y-4">
          {QUESTIONS.map((x) => (
            <div key={x.q}>
              <dt className="text-[15px] font-semibold text-fg">{x.q}</dt>
              <dd className="mt-1 text-[14px] text-fg-2">{x.a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
