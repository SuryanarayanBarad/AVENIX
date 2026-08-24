/**
 * ---------------------------------------------------------------------------
 * Kiosk translations
 * ---------------------------------------------------------------------------
 * The lobby kiosk serves walk-in visitors who may not read English, so its
 * language switch has to change every word on screen — not just the service
 * names. Each key below is one visible string; `kioskText(language)` returns
 * the whole set for the chosen language, falling back to English for anything
 * a translation is missing.
 */

export type KioskLanguage = 'en' | 'hi' | 'or';

export const KIOSK_LANGUAGES: { id: KioskLanguage; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'hi', label: 'हिन्दी' },
  { id: 'or', label: 'ଓଡ଼ିଆ' },
];


/**
 * Kiosk service tiles.
 *
 * Titles and descriptions live here with the rest of the translatable content
 * rather than inside the component, so adding a language means editing one
 * file. Wait times and queue lengths are NOT stored here — they are read live
 * from /api/visitor/services, so a tile never quotes a number the queue does
 * not actually have. Icons stay in the component, keyed by `type`, because they
 * are React references.
 */
export interface KioskServiceTile {
  type: string;
  badge?: KioskBadge;
  title: Record<KioskLanguage, string>;
  description: Record<KioskLanguage, string>;
}

export type KioskBadge = 'zero-wait' | 'high-load' | 'immediate';

/** Badge wording per language, so the chips translate with everything else. */
export const KIOSK_BADGES: Record<KioskBadge, Record<KioskLanguage, string>> = {
  'zero-wait': { en: 'Zero Wait', hi: 'प्रतीक्षा नहीं', or: 'ଅପେକ୍ଷା ନାହିଁ' },
  'high-load': { en: 'High Load', hi: 'अधिक भीड़', or: 'ଅଧିକ ଭିଡ଼' },
  'immediate': { en: 'Immediate', hi: 'तत्काल', or: 'ତୁରନ୍ତ' },
};

export const KIOSK_SERVICE_TILES: KioskServiceTile[] = [
  {
    type: 'General Consultation',
    title: { en: 'General Consultation', hi: 'सामान्य परामर्श', or: 'ସାଧାରଣ ପରାମର୍ଶ' },
    description: { en: 'OPD doctor checkups, seasonal illness, and general triage', hi: 'ओपीडी जांच, मौसमी बीमारी और सामान्य ट्राइएज', or: 'ଓପିଡି ଯାଞ୍ଚ, ଋତୁକାଳୀନ ରୋଗ ଏବଂ ସାଧାରଣ ଟ୍ରାଏଜ୍' },
  },
  {
    type: 'Registration',
    badge: 'zero-wait',
    title: { en: 'Registration & New Patient', hi: 'पंजीकरण एवं नया रोगी', or: 'ପଞ୍ଜୀକରଣ ଏବଂ ନୂତନ ରୋଗୀ' },
    description: { en: 'Hospital ID creation, file lookup, and insurance intake', hi: 'अस्पताल आईडी, फ़ाइल खोज और बीमा पंजीकरण', or: 'ହସ୍ପିଟାଲ ଆଇଡି, ଫାଇଲ ସନ୍ଧାନ ଏବଂ ବୀମା ପଞ୍ଜୀକରଣ' },
  },
  {
    type: 'Billing & Discharge',
    title: { en: 'Billing & Discharge', hi: 'बिलिंग एवं डिस्चार्ज', or: 'ବିଲିଂ ଏବଂ ଡିସଚାର୍ଜ' },
    description: { en: 'Cashless claims, settlement, and discharge summaries', hi: 'भुगतान, दावे, निपटान और डिस्चार्ज', or: 'ଦେୟ, ଦାବି, ନିଷ୍ପତ୍ତି ଏବଂ ଡିସଚାର୍ଜ' },
  },
  {
    type: 'Pharmacy & Dispensing',
    badge: 'high-load',
    title: { en: 'Pharmacy & Dispensing', hi: 'दवाखाना / फ़ार्मेसी', or: 'ଔଷଧାଳୟ / ଫାର୍ମାସୀ' },
    description: { en: 'Prescription fulfillment and medication dispensing', hi: 'दवा वितरण और पर्चा पूर्ति', or: 'ଔଷଧ ବଣ୍ଟନ ଏବଂ ପ୍ରେସକ୍ରିପସନ ପୂରଣ' },
  },
  {
    type: 'Specialist Appointments',
    title: { en: 'Specialist Appointments', hi: 'विशेषज्ञ परामर्श', or: 'ବିଶେଷଜ୍ଞ ପରାମର୍ଶ' },
    description: { en: 'Cardiology, Orthopedics, ENT, and pre-booked scans', hi: 'कार्डियोलॉजी, ऑर्थोपेडिक्स, ईएनटी और पूर्व-निर्धारित स्कैन', or: 'କାର୍ଡିଓଲୋଜି, ଅର୍ଥୋପେଡିକ୍ସ, ଇଏନଟି ଏବଂ ପୂର୍ବ-ନିର୍ଧାରିତ ସ୍କାନ' },
  },
  {
    type: 'Emergency Triage',
    badge: 'immediate',
    title: { en: 'Emergency & Critical Care', hi: 'आपातकालीन चिकित्सा', or: 'ଜରୁରୀକାଳୀନ ଚିକିତ୍ସା' },
    description: { en: 'Direct priority intake for severe acute distress', hi: 'गंभीर स्थिति हेतु सीधी प्राथमिकता', or: 'ଗମ୍ଭୀର ଅବସ୍ଥା ପାଇଁ ସିଧାସଳଖ ପ୍ରାଥମିକତା' },
  },
];

interface KioskStrings {
  facilityName: string;
  kioskBadge: string;
  tagline: string;
  avgWait: string;
  syncNote: string;
  fairnessNote: string;

  stepService: string;
  stepServiceHint: string;
  stepAssistance: string;
  stepDetails: string;

  minWait: string;
  peopleWaiting: string;
  noWait: string;

  demographics: Record<string, { label: string; desc: string }>;

  nameLabel: string;
  namePlaceholder: string;
  phoneLabel: string;
  phonePlaceholder: string;
  signedInNote: string;

  getToken: string;
  issuing: string;

  tokenIssued: string;
  yourTokenNumber: string;
  peopleAhead: string;
  assignedCounter: string;
  estimatedWait: string;
  trackOnMobile: string;
  issueAnother: string;
  backToOverview: string;
}

const en: KioskStrings = {
  facilityName: 'CityCare Central Hospital',
  kioskBadge: 'KIOSK #04',
  tagline: 'Touch below to select your service. AI will assign optimal counter and transparent wait time.',
  avgWait: 'Avg Hospital Wait: 18 min',
  syncNote: 'Kiosk Synchronized with 8 Hospital Counters',
  fairnessNote: 'Fairness weights applied transparently',

  stepService: '1. Select Your Service',
  stepServiceHint: 'Real-time wait estimates updated by QueueMind spatial intelligence.',
  stepAssistance: '2. Special Assistance & Priority Care (Optional)',
  stepDetails: '3. Your Details',

  minWait: 'min wait',
  peopleWaiting: 'waiting',
  noWait: 'No wait',

  demographics: {
    Standard: { label: 'Standard Visitor', desc: 'Default queue' },
    Elderly: { label: 'Senior Citizen (65+)', desc: '2.0x weight adjustment' },
    Pediatric: { label: 'Pediatric (Under 6)', desc: 'Fast-track routing' },
    'Pregnant / Mobility': { label: 'Pregnant / Mobility', desc: 'Seated counter priority' },
  },

  nameLabel: 'Patient Name',
  namePlaceholder: 'Patient Name (Optional)...',
  phoneLabel: 'Phone Number',
  phonePlaceholder: 'For queue alerts (Optional)...',
  signedInNote: 'Filled in from your account — edit if you need to.',

  getToken: 'Get Token Ticket',
  issuing: 'Issuing token…',

  tokenIssued: 'Token Issued Successfully!',
  yourTokenNumber: 'YOUR TOKEN NUMBER',
  peopleAhead: 'People Ahead',
  assignedCounter: 'Assigned Counter',
  estimatedWait: 'Estimated Wait',
  trackOnMobile: 'Track on Visitor Mobile',
  issueAnother: 'Issue Another Token',
  backToOverview: 'Back to Overview',
};

const hi: KioskStrings = {
  facilityName: 'सिटीकेयर सेंट्रल अस्पताल',
  kioskBadge: 'कियोस्क #04',
  tagline: 'अपनी सेवा चुनने के लिए नीचे स्पर्श करें। एआई सर्वोत्तम काउंटर और प्रतीक्षा समय बताएगा।',
  avgWait: 'औसत प्रतीक्षा: 18 मिनट',
  syncNote: '8 अस्पताल काउंटरों से जुड़ा हुआ',
  fairnessNote: 'निष्पक्षता नियम पारदर्शी रूप से लागू',

  stepService: '1. अपनी सेवा चुनें',
  stepServiceHint: 'वर्तमान प्रतीक्षा समय वास्तविक समय में अपडेट किया जाता है।',
  stepAssistance: '2. विशेष सहायता एवं प्राथमिकता (वैकल्पिक)',
  stepDetails: '3. आपकी जानकारी',

  minWait: 'मिनट प्रतीक्षा',
  peopleWaiting: 'प्रतीक्षारत',
  noWait: 'प्रतीक्षा नहीं',

  demographics: {
    Standard: { label: 'सामान्य आगंतुक', desc: 'सामान्य कतार' },
    Elderly: { label: 'वरिष्ठ नागरिक (65+)', desc: '2.0x प्राथमिकता' },
    Pediatric: { label: 'शिशु (6 वर्ष से कम)', desc: 'तेज़ मार्ग' },
    'Pregnant / Mobility': { label: 'गर्भवती / चलने में कठिनाई', desc: 'बैठने की सुविधा वाली प्राथमिकता' },
  },

  nameLabel: 'रोगी का नाम',
  namePlaceholder: 'रोगी का नाम (वैकल्पिक)...',
  phoneLabel: 'फ़ोन नंबर',
  phonePlaceholder: 'कतार सूचना हेतु (वैकल्पिक)...',
  signedInNote: 'आपके खाते से भरा गया — आवश्यकता हो तो बदलें।',

  getToken: 'टोकन प्राप्त करें',
  issuing: 'टोकन बनाया जा रहा है…',

  tokenIssued: 'टोकन सफलतापूर्वक जारी हुआ!',
  yourTokenNumber: 'आपका टोकन नंबर',
  peopleAhead: 'आपसे आगे',
  assignedCounter: 'निर्धारित काउंटर',
  estimatedWait: 'अनुमानित प्रतीक्षा',
  trackOnMobile: 'मोबाइल पर देखें',
  issueAnother: 'दूसरा टोकन लें',
  backToOverview: 'वापस जाएँ',
};

const or: KioskStrings = {
  facilityName: 'ସିଟିକେୟାର ସେଣ୍ଟ୍ରାଲ ହସ୍ପିଟାଲ',
  kioskBadge: 'କିଓସ୍କ #04',
  tagline: 'ଆପଣଙ୍କ ସେବା ବାଛିବା ପାଇଁ ତଳେ ଛୁଅଁନ୍ତୁ। AI ଉପଯୁକ୍ତ କାଉଣ୍ଟର ଓ ଅପେକ୍ଷା ସମୟ ଦେବ।',
  avgWait: 'ହାରାହାରି ଅପେକ୍ଷା: 18 ମିନିଟ୍',
  syncNote: '8 ଟି ହସ୍ପିଟାଲ କାଉଣ୍ଟର ସହ ସଂଯୁକ୍ତ',
  fairnessNote: 'ନ୍ୟାୟ ନିୟମ ସ୍ୱଚ୍ଛ ଭାବେ ପ୍ରୟୋଗ ହୋଇଛି',

  stepService: '1. ଆପଣଙ୍କ ସେବା ବାଛନ୍ତୁ',
  stepServiceHint: 'ଅପେକ୍ଷା ସମୟ ପ୍ରକୃତ ସମୟରେ ଅପଡେଟ୍ ହୁଏ।',
  stepAssistance: '2. ବିଶେଷ ସହାୟତା ଓ ପ୍ରାଥମିକତା (ଇଚ୍ଛାଧୀନ)',
  stepDetails: '3. ଆପଣଙ୍କ ବିବରଣୀ',

  minWait: 'ମିନିଟ୍ ଅପେକ୍ଷା',
  peopleWaiting: 'ଅପେକ୍ଷାରତ',
  noWait: 'ଅପେକ୍ଷା ନାହିଁ',

  demographics: {
    Standard: { label: 'ସାଧାରଣ ପରିଦର୍ଶକ', desc: 'ସାଧାରଣ ଧାଡ଼ି' },
    Elderly: { label: 'ବରିଷ୍ଠ ନାଗରିକ (65+)', desc: '2.0x ପ୍ରାଥମିକତା' },
    Pediatric: { label: 'ଶିଶୁ (6 ବର୍ଷରୁ କମ୍)', desc: 'ଦ୍ରୁତ ମାର୍ଗ' },
    'Pregnant / Mobility': { label: 'ଗର୍ଭବତୀ / ଚଳପ୍ରଚଳ ଅସୁବିଧା', desc: 'ବସିବା କାଉଣ୍ଟର ପ୍ରାଥମିକତା' },
  },

  nameLabel: 'ରୋଗୀଙ୍କ ନାମ',
  namePlaceholder: 'ରୋଗୀଙ୍କ ନାମ (ଇଚ୍ଛାଧୀନ)...',
  phoneLabel: 'ଫୋନ୍ ନମ୍ବର',
  phonePlaceholder: 'ଧାଡ଼ି ସୂଚନା ପାଇଁ (ଇଚ୍ଛାଧୀନ)...',
  signedInNote: 'ଆପଣଙ୍କ ଆକାଉଣ୍ଟରୁ ପୂରଣ ହୋଇଛି — ଆବଶ୍ୟକ ହେଲେ ବଦଳାନ୍ତୁ।',

  getToken: 'ଟୋକନ୍ ନିଅନ୍ତୁ',
  issuing: 'ଟୋକନ୍ ପ୍ରସ୍ତୁତ ହେଉଛି…',

  tokenIssued: 'ଟୋକନ୍ ସଫଳତାର ସହ ଜାରି ହୋଇଛି!',
  yourTokenNumber: 'ଆପଣଙ୍କ ଟୋକନ୍ ନମ୍ବର',
  peopleAhead: 'ଆପଣଙ୍କ ଆଗରେ',
  assignedCounter: 'ନିର୍ଦ୍ଦିଷ୍ଟ କାଉଣ୍ଟର',
  estimatedWait: 'ଆନୁମାନିକ ଅପେକ୍ଷା',
  trackOnMobile: 'ମୋବାଇଲରେ ଦେଖନ୍ତୁ',
  issueAnother: 'ଆଉ ଏକ ଟୋକନ୍',
  backToOverview: 'ପଛକୁ ଯାଆନ୍ତୁ',
};

const DICTIONARIES: Record<KioskLanguage, KioskStrings> = { en, hi, or };

/** All kiosk strings for a language, with English filling any gap. */
export function kioskText(language: KioskLanguage): KioskStrings {
  const chosen = DICTIONARIES[language] ?? en;
  return { ...en, ...chosen, demographics: { ...en.demographics, ...chosen.demographics } };
}
