/**
 * Unmute's Terms of Service and Privacy Policy, shown at /terms and /privacy and in the sign-up
 * dialogs. Written to match what the app actually does; have them reviewed by a lawyer, and fill
 * in the operator's legal name and address (LEGAL_ENTITY, LEGAL_ADDRESS), before a public launch.
 */

export const LEGAL_UPDATED = '7 October 2026';
export const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || 'support@unmute.app';
export const LEGAL_ENTITY = import.meta.env.VITE_LEGAL_ENTITY || 'Unmute';
export const LEGAL_ADDRESS = import.meta.env.VITE_LEGAL_ADDRESS || 'India';

export interface LegalSection {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
}

export interface LegalDocument {
  title: string;
  intro: string;
  sections: LegalSection[];
}

export const TERMS: LegalDocument = {
  title: 'Terms of Service',
  intro: `These terms are an agreement between you and ${LEGAL_ENTITY} ("Unmute", "we") about your use of the Unmute app and website. By creating an account you accept them. If you don't agree, please don't use Unmute.`,
  sections: [
    {
      heading: '1. Who can use Unmute',
      bullets: [
        'You must be at least 18 years old. We check your date of birth when you sign up and remove accounts that belong to minors.',
        'You may have only one account at a time, and it must be about you: your real name, your own photos and your true age.',
        'You must not use Unmute if you have been removed from it before, or if you are legally barred from using it.',
        'Unmute is currently available in India only.',
      ],
    },
    {
      heading: '2. Your account',
      bullets: [
        'Keep your password and the phone you sign in with secure. You are responsible for what happens on your account.',
        'Verification codes we send by SMS or email are for you only. Never share them, including with anyone who claims to work for Unmute.',
        'You can delete your account at any time in Settings → Delete account. Deletion is permanent.',
      ],
    },
    {
      heading: '3. How to behave',
      paragraphs: ['Unmute is built for respectful, pressure-free conversations. You agree not to:'],
      bullets: [
        'harass, threaten, bully, stalk or intimidate anyone, or send sexual content to people who have not asked for it;',
        'post nudity, sexual content involving anyone under 18, violence, hate speech, or content that promotes self-harm;',
        'pretend to be someone else, use another person\'s photos, or misstate your age, relationship status or intentions;',
        'ask for or offer money, gifts, investments, loans or paid services, or promote any business, escort or "companionship" service;',
        'share someone else\'s personal information, or photos and messages they sent you, without their permission;',
        'use bots, scrapers or automated tools, create accounts in bulk, or try to get around blocks, limits or plan restrictions;',
        'break the law, including laws on privacy, intellectual property and online safety.',
      ],
    },
    {
      heading: '4. Safety',
      bullets: [
        'Unmute does not run criminal background checks. Verification badges confirm a photo or ID was reviewed; they are not a guarantee about anyone.',
        'Take care when sharing personal details and when meeting anyone in person. Meet in public, tell a friend, and leave if you feel unsafe.',
        'Use Block and Report whenever someone makes you uncomfortable. We review reports and may remove content or accounts.',
        'If you are in danger, contact local emergency services (112 in India) first.',
      ],
    },
    {
      heading: '5. Your content',
      bullets: [
        'You own the photos, words and recordings you add. You give Unmute a non-exclusive, royalty-free licence to store, display and send them as needed to run the service, for as long as they are on Unmute.',
        'You confirm you have the right to share what you upload.',
        'We may remove content that breaks these terms, and we may keep a record of reported content to investigate it.',
      ],
    },
    {
      heading: '6. Free trial and paid plans',
      bullets: [
        'Every new account gets 1 day of full access, free.',
        'After the trial, continued access needs a paid plan: 1 hour ₹10, 1 day ₹25, 1 week ₹70, 1 month ₹150, 2 months ₹250, 3 months ₹350, 6 months ₹600, or 1 year ₹1,000. Prices include applicable taxes and may change; a change never affects a plan you have already bought.',
        'Plans are one-time payments through Razorpay. They do not renew automatically. A plan bought during your trial starts when the trial ends; a plan bought while another is active starts when that plan ends.',
        'Paid plans include the Premium features shown on the Upgrade page (plan badge, Profile Boost, Super Likes, priority likes, advanced filters and Travel mode). Features may be improved or changed over time.',
        'Payments are non-refundable except where the law requires a refund, or where you were charged but the plan was not activated. If that happens, contact us and we will activate the plan or refund you.',
        'When a plan expires, you can still open Upgrade, Settings, your profile and Privacy & Safety, but other features stop until you choose a new plan.',
      ],
    },
    {
      heading: '7. Suspension and removal',
      paragraphs: [
        'We may suspend or remove an account that breaks these terms, puts others at risk, or is required to be removed by law. Where it is safe and lawful, we will tell you why. If your account is removed for breaking these terms, unused plan time is not refunded.',
      ],
    },
    {
      heading: '8. The service',
      bullets: [
        'We work to keep Unmute available and secure, but it is provided "as is". Calls, messages and notifications depend on your network and device and may sometimes fail.',
        'We are not responsible for how other members behave on or off Unmute.',
        'To the extent the law allows, our total liability to you for any claim about Unmute is limited to the amount you paid us in the 12 months before the claim. Nothing in these terms limits liability that cannot be limited by law.',
      ],
    },
    {
      heading: '9. Changes to these terms',
      paragraphs: [
        'We may update these terms. If a change is important, we will tell you in the app before it takes effect. Continuing to use Unmute after that means you accept the new terms.',
      ],
    },
    {
      heading: '10. Law and disputes',
      paragraphs: [
        'These terms are governed by the laws of India. Please contact us first so we can try to resolve any problem. Courts in India have jurisdiction over disputes about Unmute.',
      ],
    },
    {
      heading: '11. Contact and grievances',
      paragraphs: [
        `Questions, complaints or reports about content can be sent to ${SUPPORT_EMAIL}. Our Grievance Officer can be reached at the same address; we acknowledge complaints within 24 hours and aim to resolve them within 15 days. ${LEGAL_ENTITY}, ${LEGAL_ADDRESS}.`,
      ],
    },
  ],
};

export const PRIVACY: LegalDocument = {
  title: 'Privacy Policy',
  intro: `This policy explains what personal data ${LEGAL_ENTITY} ("Unmute", "we") collects, why, who can see it, and the choices you have. It applies to the Unmute app and website.`,
  sections: [
    {
      heading: '1. What we collect',
      bullets: [
        'Account details: your name, email address, phone number, date of birth and password (stored only as a secure hash), or your Google account\'s name and email if you sign in with Google.',
        'Profile details you choose to add: gender, photos, bio, interests, what you are looking for, education, profession, height, lifestyle choices and similar details.',
        'Location: the area you pick (by search or PIN code), or, if you tap "Near me", your device\'s position. A device position is rounded to a grid square of about 1 km before it is saved; your exact position is never stored.',
        'Activity: likes, passes, Super Likes, matches, blocks and reports you make, and which plan you are on.',
        'Messages and calls: the text, photo and voice messages you send, and a record of calls (who called, when, and how long). Voice and video calls connect directly between devices where possible; we do not record them.',
        'Verification: a selfie or photo of an ID document, if you choose to verify. These are kept privately for our reviewers and deleted once a decision is made.',
        'Payments: the plan, amount, date and Razorpay order and payment references. Razorpay handles your card, UPI or bank details; we never see or store them.',
        'Device and usage data: your IP address and browser or device type for each signed-in session (to keep your account secure), and a push-notification address if you turn on notifications.',
      ],
    },
    {
      heading: '2. Why we use it',
      bullets: [
        'To create and secure your account, including sign-in codes by SMS or email and spotting suspicious sign-ins.',
        'To show your profile to other members and suggest people to you, using your preferences, interests and area.',
        'To deliver messages, calls and notifications.',
        'To run your free trial and paid plans, send reminders before they end, and keep payment records.',
        'To keep Unmute safe: checking ages, reviewing verifications and reports, and stopping fraud, spam and abuse.',
        'To meet legal obligations, such as tax records and lawful requests from authorities.',
      ],
      paragraphs: ['We use your data on the basis of your consent when you sign up and add details, and where it is necessary to provide the service or required by law. We do not sell your personal data, and we do not use it for third-party advertising.'],
    },
    {
      heading: '3. What other members see',
      bullets: [
        'Your name, photos, age (never your full date of birth), profile details, interests and verification badge.',
        'Your area only as a place name at the precision you choose, and distances only in rough ranges. Never your exact location.',
        'Whether you are online, and your plan badge if you have a paid plan.',
        'Your email address and phone number are never shown to other members.',
      ],
    },
    {
      heading: '4. Who else we share it with',
      bullets: [
        'Service providers that run parts of Unmute for us, under contracts that limit their use of your data: hosting, SMS and email delivery, push notifications (your browser\'s push service), call relay servers, and Razorpay for payments.',
        'Google, only to confirm your identity if you choose Google sign-in.',
        'Authorities, when the law requires it, or when needed to protect someone from serious harm.',
        'A buyer or successor, if Unmute is merged or sold; this policy would continue to apply to your data.',
      ],
    },
    {
      heading: '5. How long we keep it',
      bullets: [
        'Your account data, profile, matches and messages: until you delete your account.',
        'Verification selfies and ID photos: deleted as soon as a reviewer approves or rejects them.',
        'Sign-in sessions: up to 30 days, or until you sign out.',
        'Sign-in and verification codes: until used, and never more than 30 minutes.',
        'After you delete your account, your profile, photos, messages and other data are removed straight away. We may keep limited records where the law requires it (for example, payment records for tax purposes), or where needed to deal with a safety report or legal claim.',
      ],
    },
    {
      heading: '6. Your rights and choices',
      bullets: [
        'See and correct your details at any time in Edit Profile.',
        'Choose how precisely your area is shown, or remove your location, in Set Your Location.',
        'Turn notifications on or off in the app and in your device settings.',
        'Block anyone, at any time.',
        'Delete your account and its data in Settings → Delete account.',
        `For a copy of your data, to withdraw consent, to nominate someone to act for you, or to raise a privacy complaint, email ${SUPPORT_EMAIL}. If you are not satisfied with our answer, you can complain to the Data Protection Board of India.`,
      ],
    },
    {
      heading: '7. Security',
      paragraphs: [
        'We protect your data with encrypted connections, hashed passwords, private storage for verification images, rate limits and access controls for our staff. No system is perfectly secure, so please use a strong password and keep sign-in codes to yourself.',
      ],
    },
    {
      heading: '8. Age',
      paragraphs: [
        'Unmute is only for adults aged 18 and over. We do not knowingly collect data from anyone younger. If you believe a minor is using Unmute, please report the profile or email us, and we will remove it.',
      ],
    },
    {
      heading: '9. Changes to this policy',
      paragraphs: [
        'We will update this policy when our practices change, and tell you in the app about important changes before they take effect.',
      ],
    },
    {
      heading: '10. Contact',
      paragraphs: [
        `Privacy questions and requests: ${SUPPORT_EMAIL}. Grievance Officer: contact the same address; we acknowledge requests within 24 hours. ${LEGAL_ENTITY}, ${LEGAL_ADDRESS}.`,
      ],
    },
  ],
};
