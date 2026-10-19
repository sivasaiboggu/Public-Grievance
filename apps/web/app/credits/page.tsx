import Link from 'next/link';
import credits from '@/public/images/auth/credits.json';

export const metadata = {
  title: 'Photographic Credits | GrievanceGrid',
  description: 'Attribution and licensing information for civic photographs used across GrievanceGrid authentication.'
};

export default function CreditsPage() {
  return (
    <main className="min-h-screen bg-[var(--surface-canvas)] py-12 px-4 sm:px-6 lg:px-8 text-[var(--text-primary)]">
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <Link
            href="/login"
            className="text-sm font-medium text-[var(--brand-primary)] hover:underline inline-flex items-center gap-1.5 mb-6"
          >
            ← Return to sign in
          </Link>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)]">
            Photographic Credits &amp; Attribution
          </h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)] leading-relaxed">
            The civic category imagery displayed on the GrievanceGrid authentication screens is made available under Creative Commons licenses. In compliance with license attribution requirements, details and original works are listed below.
          </p>
        </div>

        <div className="divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">
          {credits.map((item) => (
            <article key={item.file} className="py-6 space-y-2">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="text-base font-semibold text-[var(--text-primary)]">
                  {item.caption}
                </h2>
                <span className="text-xs font-mono text-[var(--text-muted)] uppercase tracking-wider">
                  {item.category.replace('_', ' ')}
                </span>
              </div>
              <p className="text-sm text-[var(--text-secondary)]">
                <span className="font-medium text-[var(--text-primary)]">Original Title: </span>
                {item.title}
              </p>
              <p className="text-sm text-[var(--text-secondary)]">
                <span className="font-medium text-[var(--text-primary)]">Photographer: </span>
                <a
                  href={item.profileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[var(--brand-primary)] hover:underline"
                >
                  {item.photographer}
                </a>
              </p>
              <p className="text-sm text-[var(--text-secondary)]">
                <span className="font-medium text-[var(--text-primary)]">License: </span>
                <a
                  href={item.licenseUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[var(--brand-primary)] hover:underline"
                >
                  {item.license}
                </a>
              </p>
              <p className="text-sm text-[var(--text-secondary)]">
                <span className="font-medium text-[var(--text-primary)]">Source: </span>
                <a
                  href={item.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[var(--brand-primary)] hover:underline break-all"
                >
                  {item.sourceUrl}
                </a>
              </p>
              <p className="text-xs text-[var(--text-muted)] pt-1">
                {item.modifications} Downloaded on {item.downloadDate}.
              </p>
            </article>
          ))}
        </div>

        <div className="pt-4 text-xs text-[var(--text-muted)] leading-relaxed">
          GrievanceGrid is dedicated to civic transparency and strict adherence to open knowledge and intellectual property standards.
        </div>
      </div>
    </main>
  );
}
