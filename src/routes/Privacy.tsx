import { Link } from 'react-router-dom';
import { usePageMeta } from '../hooks/usePageMeta';
import SEO from '../lib/seo.json';
import { SUPPORT_EMAIL } from '../lib/appStore';

export default function Privacy() {
  usePageMeta({ ...SEO['/privacy'], canonical: '/privacy' });
  return (
    <article className="mx-auto max-w-3xl px-4 sm:px-6 pt-6 sm:pt-10 text-[15px] leading-relaxed text-fg-2">
      <h1 className="text-[32px] sm:text-[40px] font-semibold tracking-tight text-fg">Privacy Policy</h1>
      <p className="mt-2 text-[13px] text-fg-3"><strong className="text-fg">Effective: October 19, 2026</strong></p>
      <p className="mt-6">
        TroyStack is a precious metals portfolio tracking service operated by Mancini Tech Solutions LLC, available as an app for iPhone and Android and on the web at troystack.ai. This policy covers all three. We track what you tell us about your holdings, we use AI to help you understand markets and process receipts, and we use third-party services to deliver that experience. This document tells you what data we collect, who we share it with, and what your rights are. We've tried to write it in plain English.
      </p>

      <h2 className="mt-10 text-[20px] font-semibold text-fg">1. Information we collect</h2>
      <h3 className="mt-6 text-[16px] font-semibold text-fg">Account information</h3>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Email address (required for account creation)</li>
        <li>Hashed password (managed by Supabase Auth, never visible to us)</li>
        <li>Display name (optional)</li>
        <li>Subscription tier and purchase history (managed by Apple In-App Purchase on iPhone, Google Play Billing on Android, Stripe on the web, and RevenueCat across the apps)</li>
      </ul>
      <h3 className="mt-6 text-[16px] font-semibold text-fg">Portfolio data</h3>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Precious metals holdings you record (metal type, weight, cost basis, purchase date)</li>
        <li>Receipt images you upload for scanning</li>
        <li>Notes and tags you add to holdings</li>
      </ul>
      <p className="mt-3">Your holdings are stored encrypted. They run the app and Troy, and they're never sold or used for ads. Section 3 lists who receives what.</p>
      <h3 className="mt-6 text-[16px] font-semibold text-fg">Chat and voice data (when you use Troy, our AI assistant)</h3>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Chat messages you send to Troy</li>
        <li>Voice recordings when you use voice input</li>
        <li>Voice playback requests when you use voice output</li>
        <li>Reports you file on one of Troy's replies, with the reply's text and the reason you give</li>
      </ul>
      <h3 className="mt-6 text-[16px] font-semibold text-fg">Device and technical data</h3>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Device push notification token (only for alerts you've subscribed to)</li>
        <li>IP address (logged briefly by hosting infrastructure for standard operational purposes; not retained or used to identify you)</li>
        <li>App version and operating system version (iOS or Android)</li>
      </ul>

      <h2 className="mt-10 text-[20px] font-semibold text-fg">2. How we use the information</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Provide the core service: track your portfolio, calculate value against live spot prices, generate intelligence summaries, send alerts you've opted into</li>
        <li>Operate the Troy AI assistant: route your messages through third-party AI providers to generate responses</li>
        <li>Process subscription payments through Apple, Google Play, Stripe, and RevenueCat</li>
        <li>Review reports you file on Troy's replies, to find and fix answers that are wrong or inappropriate</li>
        <li>Improve the product through aggregated, non-identifying usage patterns</li>
        <li>Communicate with you about your account or the service</li>
      </ul>
      <p className="mt-3">Receipt images you upload are processed in memory and are not written to our servers' disk storage. They are forwarded to Google Gemini for OCR processing and are not retained by us afterward.</p>

      <h2 className="mt-10 text-[20px] font-semibold text-fg">3. Third-party services we use</h2>
      <p className="mt-2">TroyStack uses the following third-party services to operate. Each service has its own privacy policy governing how they handle data they receive. We do not control those policies.</p>
      <div className="mt-4 max-w-full overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
          <thead>
            <tr className="text-fg">
              <th className="border-b border-line py-2 pr-3 font-semibold">Vendor</th>
              <th className="border-b border-line py-2 pr-3 font-semibold">What they receive</th>
              <th className="border-b border-line py-2 pr-3 font-semibold">Purpose</th>
              <th className="border-b border-line py-2 font-semibold">Reference</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Supabase', 'Account credentials, portfolio data, chat history, push tokens, reports you file on Troy\'s replies', 'Primary data storage and authentication', 'Retained for the life of your account per Supabase\'s privacy policy'],
              ['Apple', 'Apple ID for Sign in with Apple, subscription status, in-app purchases', 'Account authentication and payment processing', 'Per Apple\'s privacy policy'],
              ['Google Play', 'Purchase and subscription status for in-app purchases on Android', 'Payment processing on Android', 'Per Google\'s privacy policy and the Google Play terms'],
              ['Google (Sign in with Google)', 'Google account identifier and email', 'Optional alternative authentication', 'Per Google\'s privacy policy'],
              ['RevenueCat', 'Subscription tier, anonymous user identifier', 'Subscription management for iPhone and Android', 'Per RevenueCat\'s privacy policy'],
              ['Stripe', 'Payment information for web subscriptions', 'Payment processing. Stripe is PCI-compliant and we never see card numbers', 'Per Stripe\'s privacy policy'],
              ['Anthropic (Claude)', 'Public news content for Stack Signal articles and the daily market brief. Troy chat messages, with portfolio contents used as context, whenever Claude answers Troy', 'Editorial synthesis, and Troy chat', 'Per Anthropic\'s privacy policy and API data-usage terms (Anthropic states API submissions are not used for training by default)'],
              ['Google (Gemini)', 'Troy chat messages, with portfolio contents used as context, whenever Gemini answers Troy. Daily brief generation, portfolio intelligence summaries, Stack Signal article scoring, receipt images for OCR', 'Most user-data-touching AI work, and Troy chat', 'Per Google\'s API terms and privacy policy'],
              ['OpenAI (Whisper, DALL-E)', 'Voice recordings when you use voice input and OpenAI is the active speech-to-text provider. Image prompts for Stack Signal article art, which contain no user data', 'Speech-to-text transcription and article images', 'Per OpenAI\'s privacy policy and API data-usage terms'],
              ['ElevenLabs', 'Text content of Troy\'s responses when voice output is enabled and ElevenLabs is the active voice provider', 'Text-to-speech synthesis', 'Per ElevenLabs\' privacy policy'],
              ['xAI (Grok)', 'Voice recordings when you use voice input and xAI is the active speech-to-text provider. Text of Troy\'s responses when xAI is the active voice provider. Podcast scripts built from public market content', 'Speech-to-text and text-to-speech synthesis', 'Per xAI\'s privacy policy'],
              ['Expo Push Service', 'Push notification routing', 'Transient delivery only, not retained for analysis', 'Per Expo\'s privacy policy'],
              ['Railway, Vercel', 'Application hosting infrastructure', 'Hosting and request handling', 'Per their respective privacy policies'],
              ['Vercel Analytics', 'Anonymous page view statistics on our pages (not in the app itself)', 'Understand site traffic', 'Per Vercel\'s privacy policy'],
            ].map((row) => (
              <tr key={row[0]}>
                {row.map((cell) => (
                  <td key={cell} className="border-b border-line py-2 pr-3 align-top">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 text-[20px] font-semibold text-fg">4. What we don't do</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>We do not sell your personal information to third parties.</li>
        <li>We do not show advertising in the app.</li>
        <li>We do not provide your portfolio data or chat content to any AI provider for the purpose of training their models. Anthropic, Google, OpenAI, ElevenLabs, and xAI each have their own published terms on training data usage. As of this writing, none of our AI providers' API terms permit training on API-submitted data by default.</li>
        <li>We do not share your portfolio holdings with any party not listed in Section 3.</li>
        <li>We do not access your portfolio data for marketing or sales targeting. Production data access is logged and limited to debugging and support purposes.</li>
      </ul>

      <h2 className="mt-10 text-[20px] font-semibold text-fg">5. Your rights</h2>
      <ul className="mt-2 list-disc space-y-2 pl-5">
        <li><strong className="text-fg">Access your data:</strong> export available in app settings.</li>
        <li>
          <strong className="text-fg">Delete your account:</strong> in the iPhone app's settings, or on the web at <Link to="/delete-account" className="font-semibold text-gold hover:text-gold-2">troystack.ai/delete-account</Link>. Deletion is immediate. It removes your holdings, Troy conversations, daily briefs, alerts, notification settings and push tokens, scan history, API keys, article likes and comments, your profile, and your sign-in from our primary systems, and any remaining copies within 30 days. Reports you filed on Troy's replies are kept for review with your account removed from them. Deleting your account doesn't cancel an App Store or Google Play subscription, which you manage in your Apple or Google account. If you pay on the web, cancel that plan first, since we won't delete an account whose web plan is set to renew. Some third-party providers may retain data according to their own policies (listed in Section 3).
        </li>
        <li><strong className="text-fg">Update your information:</strong> editable in app settings.</li>
        <li><strong className="text-fg">Contact us:</strong> <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-gold hover:text-gold-2">{SUPPORT_EMAIL}</a></li>
      </ul>

      <h2 className="mt-10 text-[20px] font-semibold text-fg">6. Children's privacy</h2>
      <p className="mt-2">TroyStack is not directed at children under 13 and we do not knowingly collect data from children under 13.</p>

      <h2 className="mt-10 text-[20px] font-semibold text-fg">7. International users</h2>
      <p className="mt-2">We are based in the United States. By using TroyStack you consent to processing in the United States.</p>

      <h2 className="mt-10 text-[20px] font-semibold text-fg">8. Changes to this policy</h2>
      <p className="mt-2">We will update the effective date when we make material changes. Significant changes will be communicated in the app.</p>

      <h2 className="mt-10 text-[20px] font-semibold text-fg">9. Contact</h2>
      <p className="mt-2">
        Mancini Tech Solutions LLC<br />
        Connecticut, United States<br />
        <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-gold hover:text-gold-2">{SUPPORT_EMAIL}</a>
      </p>
      <p className="mt-8 border-t border-line pt-4 text-[13px]">
        <Link to="/terms" className="font-semibold text-gold hover:text-gold-2">Terms of Service</Link>
      </p>
    </article>
  );
}
