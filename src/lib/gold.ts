/**
 * What Free includes and what Gold adds, the same list wherever either is
 * offered on this site. The gates are the ones the app and the API enforce:
 * price alerts are free (App.js, "PRICE ALERTS (Free Feature)"), receipt
 * scans are five every 30 days on Free and unlimited on Gold
 * (troystack-api scan-usage.js), and historical spot charts in the iPhone
 * app come with Gold (goldOffer.js priceHistoryPrompt). Spot charts on
 * this website are not gated.
 */
export const FREE_FEATURES = [
  'Live spot for all four metals, with charts on the web',
  'Your stack at live spot, with cost basis and gain',
  'Price alerts in the iPhone app',
  'Three questions a day with Troy',
  'Five receipt scans every 30 days',
  'Every calculator, the Signal and the podcast',
];

export const GOLD_FEATURES = [
  '30 questions a day with Troy, and he keeps every conversation',
  'A morning brief written around your stack',
  'Your stack value history, day by day',
  'Price history charts in the iPhone app',
  'The full COMEX vault picture with the 30-day trend',
  'Unlimited receipt scans',
  'Troy reads his answers aloud',
];
