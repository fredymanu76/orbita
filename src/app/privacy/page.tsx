import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy — Orbita',
}

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight text-gray-900">Privacy Policy</h1>
      <p className="mt-2 text-sm text-gray-500">Last updated: May 2026</p>

      <div className="mt-8 space-y-6 text-gray-700 leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-gray-900">What Orbita Does</h2>
          <p>
            Orbita helps you capture thoughts, keep promises, and stay connected. It stores
            the content you create — text notes, voice recordings, images, and metadata about
            your conversations and commitments.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900">Data We Collect</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Account information (email address, authentication credentials)</li>
            <li>Content you create (memories, commitments, follow-ups, threads)</li>
            <li>Device information for push notifications (push tokens)</li>
            <li>Usage metadata (timestamps, interaction patterns) to improve your experience</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900">How We Store Your Data</h2>
          <p>
            Your data is stored securely in Supabase (PostgreSQL) with row-level security
            policies ensuring only you can access your own data. All connections use TLS
            encryption in transit.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900">AI Processing</h2>
          <p>
            Orbita uses OpenAI to generate daily briefs, extract entities, and create
            embeddings for semantic search. Your data is sent to OpenAI&apos;s API for processing
            and is subject to OpenAI&apos;s data usage policies. We do not use your data to train
            AI models.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900">We Do Not Sell Your Data</h2>
          <p>
            Your data is never sold, rented, or shared with third parties for marketing
            purposes. We only share data with the service providers necessary to operate the
            app (Supabase for storage, OpenAI for AI features, Vercel for hosting).
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900">Your Rights</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Access all data associated with your account</li>
            <li>Delete your account and all associated data at any time</li>
            <li>Export your data in a standard format</li>
            <li>Opt out of push notifications and email notifications via settings</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900">Contact</h2>
          <p>
            If you have questions about this privacy policy or your data, contact us at{' '}
            <a href="mailto:privacy@orbita-app.com" className="text-blue-600 underline">
              privacy@orbita-app.com
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  )
}
