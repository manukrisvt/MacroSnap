// Public privacy policy — required by Apple for App Store submission.
// Served at /#/privacy (and linked from the Login page footer).

const UPDATED = 'October 1, 2026';

export default function Privacy() {
  return (
    <div className="mx-auto max-w-md px-5 py-8 text-sm leading-relaxed text-slate-700 dark:bg-slate-900 dark:text-slate-300">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Privacy Policy</h1>
      <p className="mt-1 text-xs text-slate-400">Last updated: {UPDATED}</p>

      <p className="mt-4">
        MacroSnap (&quot;we&quot;, &quot;the app&quot;) helps you track your nutrition by analyzing
        photos of your meals. This policy explains what data we collect and why.
      </p>

      <h2 className="mt-6 text-lg font-semibold text-slate-900 dark:text-white">What we collect</h2>
      <ul className="mt-2 list-disc space-y-1.5 pl-5">
        <li><strong>Account info:</strong> your email address and name, to create and secure your account.</li>
        <li><strong>Health info you enter:</strong> goals, weight log, and onboarding answers (age range, height, activity level). This stays in your account and is used only to calculate your nutrition targets.</li>
        <li><strong>Meal data:</strong> foods you log, manually or by photo.</li>
        <li><strong>Meal photos:</strong> when you snap a photo, it is sent to an AI vision service to identify the food. Photos are stored only when needed to improve estimates, and are never shared with third parties beyond the AI provider needed to process them.</li>
        <li><strong>Usage data:</strong> counts of app features you use (e.g. number of photo analyses), to enforce plan limits.</li>
      </ul>

      <h2 className="mt-6 text-lg font-semibold text-slate-900 dark:text-white">What we never do</h2>
      <ul className="mt-2 list-disc space-y-1.5 pl-5">
        <li>We never sell your data.</li>
        <li>We never share your data with advertisers.</li>
        <li>We never use judgment language about your food choices.</li>
      </ul>

      <h2 className="mt-6 text-lg font-semibold text-slate-900 dark:text-white">AI processing</h2>
      <p className="mt-2">
        Photo analysis uses a third-party AI vision API. The photo is sent securely over
        HTTPS, processed to identify food items, and the result is returned to your account.
        If you use your own AI key (&quot;Bring Your Own Key&quot;), your photos go directly from
        your device to the AI provider you choose — they never touch our servers.
      </p>

      <h2 className="mt-6 text-lg font-semibold text-slate-900 dark:text-white">Payments</h2>
      <p className="mt-2">
        Subscriptions are processed by Stripe. We never see or store your card details.
      </p>

      <h2 className="mt-6 text-lg font-semibold text-slate-900 dark:text-white">Data retention &amp; deletion</h2>
      <p className="mt-2">
        Your data is kept while your account is active. You can request deletion of your
        account and all associated data at any time by contacting us — everything is removed,
        including meals, photos, and logs.
      </p>

      <h2 className="mt-6 text-lg font-semibold text-slate-900 dark:text-white">Your choices</h2>
      <ul className="mt-2 list-disc space-y-1.5 pl-5">
        <li>You can use the app without providing photos (manual entry).</li>
        <li>You can use your own AI key so photos never reach our servers.</li>
        <li>You can delete any meal or weight entry at any time.</li>
      </ul>

      <h2 className="mt-6 text-lg font-semibold text-slate-900 dark:text-white">Contact</h2>
      <p className="mt-2">
        Questions or data deletion requests: reach out from the app&apos;s Settings →
        Send feedback, or reply to your account email.
      </p>

      <p className="mt-8 text-xs text-slate-400">
        This policy applies to the MacroSnap iOS app, Android app, and website.
      </p>
    </div>
  );
}
