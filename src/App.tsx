import { lazy } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import AppShell from './ui/Layout';
import Home from './routes/Home';
import { useAfterSignIn } from './hooks/useAfterSignIn';

// Home is in the first download. Everything else loads when it's opened.
const Prices = lazy(() => import('./routes/Prices'));
const Troy = lazy(() => import('./routes/Troy'));
const Stack = lazy(() => import('./routes/Stack'));
const Signal = lazy(() => import('./routes/Signal'));
const Article = lazy(() => import('./routes/Article'));
const Podcast = lazy(() => import('./routes/Podcast'));
const Vault = lazy(() => import('./routes/Vault'));
const Tools = lazy(() => import('./routes/Tools'));
const ToolMelt = lazy(() => import('./routes/ToolMelt'));
const ToolJunkSilver = lazy(() => import('./routes/ToolJunkSilver'));
const ToolWhatIf = lazy(() => import('./routes/ToolWhatIf'));
const ToolStackingHistory = lazy(() => import('./routes/ToolStackingHistory'));
const ToolRatio = lazy(() => import('./routes/ToolRatio'));
const Dealers = lazy(() => import('./routes/Dealers'));
const GetApp = lazy(() => import('./routes/GetApp'));
const Settings = lazy(() => import('./routes/Settings'));
const Auth = lazy(() => import('./routes/Auth'));
const ResetPassword = lazy(() => import('./routes/ResetPassword'));
const Developers = lazy(() => import('./routes/Developers'));
const DeveloperKeys = lazy(() => import('./routes/DeveloperKeys'));
const NotFound = lazy(() => import('./routes/NotFound'));

/** Old chat links were /c/:id. */
function OldConversation() {
  const { conversationId } = useParams();
  return <Navigate to={conversationId ? `/troy/c/${conversationId}` : '/troy'} replace />;
}

function CheckoutOverlay({ text }: { text: string }) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-bg/90 backdrop-blur-sm" role="status">
      <p className="text-[15px] font-semibold text-fg">{text}</p>
    </div>
  );
}

export default function App() {
  const { checkoutOverlay } = useAfterSignIn();
  return (
    <>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Home />} />
          <Route path="prices" element={<Prices />} />
          <Route path="prices/:metal" element={<Prices />} />
          <Route path="troy" element={<Troy />} />
          <Route path="troy/c/:conversationId" element={<Troy />} />
          <Route path="stack" element={<Stack />} />
          <Route path="signal" element={<Signal />} />
          <Route path="signal/:slug" element={<Article />} />
          <Route path="podcast" element={<Podcast />} />
          <Route path="vault" element={<Vault />} />
          <Route path="tools" element={<Tools />} />
          <Route path="tools/melt" element={<ToolMelt />} />
          <Route path="tools/junk-silver" element={<ToolJunkSilver />} />
          <Route path="tools/what-if" element={<ToolWhatIf />} />
          <Route path="tools/stacking-history" element={<ToolStackingHistory />} />
          <Route path="tools/ratio" element={<ToolRatio />} />
          <Route path="dealers" element={<Dealers />} />
          <Route path="app" element={<GetApp />} />
          <Route path="settings" element={<Settings />} />
          <Route path="auth" element={<Auth />} />
          <Route path="reset-password" element={<ResetPassword />} />
          <Route path="developers" element={<Developers />} />
          <Route path="developers/keys" element={<DeveloperKeys />} />

          {/* Addresses from the old site */}
          <Route path="dashboard" element={<Navigate to="/" replace />} />
          <Route path="today" element={<Navigate to="/" replace />} />
          <Route path="portfolio" element={<Navigate to="/stack" replace />} />
          <Route path="analytics" element={<Navigate to="/stack" replace />} />
          <Route path="speculate" element={<Navigate to="/tools/what-if" replace />} />
          <Route path="junk-silver" element={<Navigate to="/tools/junk-silver" replace />} />
          <Route path="chat" element={<Navigate to="/troy" replace />} />
          <Route path="c/:conversationId" element={<OldConversation />} />

          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
      {checkoutOverlay && <CheckoutOverlay text={checkoutOverlay} />}
    </>
  );
}
