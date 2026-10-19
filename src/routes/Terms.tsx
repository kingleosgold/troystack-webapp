import { Link } from 'react-router-dom';
import { usePageMeta } from '../hooks/usePageMeta';
import SEO from '../lib/seo.json';
import { SUPPORT_EMAIL } from '../lib/appStore';

export default function Terms() {
  usePageMeta({ ...SEO['/terms'], canonical: '/terms' });
  return (
    <article className="mx-auto max-w-3xl px-4 sm:px-6 pt-6 sm:pt-10 text-[15px] leading-relaxed text-fg-2">
      <h1 className="text-[32px] sm:text-[40px] font-semibold tracking-tight text-fg">Terms of Service</h1>
      <p className="mt-2 text-[13px] text-fg-3"><strong className="text-fg">Effective: October 19, 2026</strong></p>

      <h2 id="introduction" className="mt-10 text-[20px] font-semibold text-fg">1. Introduction</h2>
      <p className="mt-2">These terms govern your use of TroyStack, operated by Mancini Tech Solutions LLC ("we," "us"). By using TroyStack, you agree to these terms.</p>

      <h2 id="service-description" className="mt-10 text-[20px] font-semibold text-fg">2. Service description</h2>
      <p className="mt-2">TroyStack is a portfolio tracking tool for precious metals. The Troy AI assistant provides educational information and is not financial advice. Stack Signal, daily briefs, and speculation features are editorial and informational in nature.</p>

      <h2 id="account-requirements" className="mt-10 text-[20px] font-semibold text-fg">3. Account requirements</h2>
      <p className="mt-2">You must be at least 13 (or the age of digital consent in your jurisdiction, whichever is higher). You're responsible for account security.</p>

      <h2 id="subscriptions-and-billing" className="mt-10 text-[20px] font-semibold text-fg">4. Subscriptions and billing</h2>
      <p className="mt-2">Consumer tiers (available via the iOS App Store and the web):</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li><strong className="text-fg">TroyStack Gold, Monthly:</strong> $4.99/month</li>
        <li><strong className="text-fg">TroyStack Gold, Yearly:</strong> $39.99/year</li>
        <li><strong className="text-fg">TroyStack Gold, Lifetime:</strong> $99.99 one-time, called "Lifetime Gold Pass" in the App Store</li>
      </ul>
      <p className="mt-3">Subscriptions auto-renew unless cancelled. Refunds are handled per the policy of the store you bought through, Apple for the App Store and Stripe for the web. Subscriptions bought in the app are managed and cancelled in that store's account settings. Prices may change with notice.</p>

      <h2 id="acceptable-use" className="mt-10 text-[20px] font-semibold text-fg">5. Acceptable use</h2>
      <p className="mt-2">No abuse, no reverse engineering, no scraping, no using the service for unlawful purposes. Don't share your account credentials with others.</p>

      <h2 id="intellectual-property" className="mt-10 text-[20px] font-semibold text-fg">6. Intellectual property</h2>
      <p className="mt-2">TroyStack content and software belong to Mancini Tech Solutions LLC. Your portfolio holdings, notes, and content you create belong to you. By using the service, you grant us a limited license to process that content to provide the service.</p>

      <h2 id="not-financial-advice" className="mt-10 text-[20px] font-semibold text-fg">7. Not financial advice</h2>
      <div className="mt-3 rounded-xl border border-line bg-surface px-4 py-3">
        <p><strong className="text-fg">TroyStack is a portfolio tracking tool. It is not a licensed financial advisor, broker, or investment service.</strong></p>
      </div>
      <p className="mt-3">The Troy AI assistant uses third-party AI models to generate responses. Responses may be inaccurate, incomplete, or misleading. Troy is not a financial advisor and its responses are not financial advice. You are responsible for verifying any information before making decisions based on it. Do not share confidential information with Troy beyond what is necessary to ask your question.</p>
      <p className="mt-3">Stack Signal is editorial commentary curated from public news sources and is not investment recommendations.</p>
      <p className="mt-3">Daily briefs are AI-generated summaries of market conditions and your portfolio. They are informational only and not investment advice.</p>
      <p className="mt-3">The speculation feature is illustrative only. Projections and scenarios shown are hypothetical and should not be relied upon as predictions.</p>
      <p className="mt-3"><strong className="text-fg">You are solely responsible for your investment decisions.</strong> TroyStack and Mancini Tech Solutions LLC are not liable for any financial losses, missed opportunities, or other damages arising from your use of the service.</p>

      <h2 id="limitation-of-liability" className="mt-10 text-[20px] font-semibold text-fg">8. Limitation of liability</h2>
      <p className="mt-2">The service is provided "as is" without warranty of any kind, express or implied. We are not liable for indirect, incidental, or consequential damages. Our total liability for any claim is limited to the amount you've paid us in the twelve months preceding the claim.</p>

      <h2 id="termination" className="mt-10 text-[20px] font-semibold text-fg">9. Termination</h2>
      <p className="mt-2">We can suspend or terminate accounts that violate these terms. You can delete your account at any time in app settings.</p>

      <h2 id="governing-law" className="mt-10 text-[20px] font-semibold text-fg">10. Governing law</h2>
      <p className="mt-2">These terms are governed by the laws of the State of Connecticut, United States, without regard to conflict of laws principles.</p>

      <h2 id="changes" className="mt-10 text-[20px] font-semibold text-fg">11. Changes</h2>
      <p className="mt-2">We may update these terms. The effective date will be updated and significant changes communicated in the app.</p>

      <h2 id="contact" className="mt-10 text-[20px] font-semibold text-fg">12. Contact</h2>
      <p className="mt-2">
        Mancini Tech Solutions LLC<br />
        Connecticut, United States<br />
        <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-gold hover:text-gold-2">{SUPPORT_EMAIL}</a>
      </p>
      <p className="mt-8 border-t border-line pt-4 text-[13px]">
        <Link to="/privacy" className="font-semibold text-gold hover:text-gold-2">Privacy Policy</Link>
      </p>
    </article>
  );
}
