'use client';

import { useState } from 'react';

type Kind = 'design' | 'gelx';

const TIERS = [
  {
    id: 1,
    tier: 'Tier 1',
    name: 'Chic',
    features: ['Single color', 'Cuticle care', 'Base & top coat'],
    price: { design: 70, gelx: 85 },
  },
  {
    id: 2,
    tier: 'Tier 2',
    name: 'Elegance',
    features: ['Two-tone', 'Simple patterns / French tips', 'Strengthening'],
    price: { design: 80, gelx: 95 },
    popular: true,
  },
  {
    id: 3,
    tier: 'Tier 3',
    name: 'Radiance',
    features: ['Complex patterns', 'Hand-painted details', 'Texture work'],
    price: { design: 90, gelx: 105 },
  },
  {
    id: 4,
    tier: 'Tier 4',
    name: 'Dream',
    features: ['3D art / crystals', 'Custom designs', 'Luxury treatment'],
    price: { design: 100, gelx: 115 },
  },
];

export default function ServiceTiers({ onBook }: { onBook: (path: string) => void }) {
  const [kind, setKind] = useState<Kind>('design');

  return (
    <section className="mx-auto max-w-7xl px-6">
      <header className="text-center mb-10">
        <h2 className="font-title text-4xl md:text-5xl font-semibold tracking-wide text-brand-brown">
          Services
        </h2>
        <p className="mt-3 text-brand-taupe-light font-elegant">
          Choose your tier. Toggle prices for Design or GELX.
        </p>

        {/* segmented control */}
        <div
          role="tablist"
          aria-label="Service type"
          className="mt-6 inline-flex items-center justify-center rounded-full border border-gray-200 bg-white p-1 shadow-sm sticky top-20 z-40"
        >
          {(['design', 'gelx'] as Kind[]).map((k) => {
            const active = k === kind;
            return (
              <button
                key={k}
                role="tab"
                aria-selected={active}
                onClick={() => setKind(k)}
                className={`relative z-10 px-6 py-2 text-sm font-semibold rounded-full transition-colors duration-300 ease-out
                  ${active ? 'bg-rose-50 text-rose-600 shadow-sm' : 'text-brand-taupe/60 hover:text-brand-taupe'}`}
              >
                {k === 'design' ? 'Design' : 'GELX'}
              </button>
            );
          })}
        </div>
      </header>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {TIERS.map((t) => (
          <article
            key={t.id}
            className="group relative flex flex-col rounded-2xl border bg-white p-6 shadow-sm transition hover:shadow-lg hover:-translate-y-0.5 focus-within:shadow-lg"
          >
            {t.popular && (
              <span className="absolute -top-3 left-6 rounded-full bg-brand-taupe px-3 py-1 text-xs font-semibold text-brand-cream shadow">
                Most popular
              </span>
            )}

            <div className="text-xs uppercase tracking-wide text-brand-taupe-light">{t.tier}</div>
            <h3 className="mt-1 text-2xl font-elegant text-brand-taupe">{t.name}</h3>

            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-4xl font-extrabold leading-none text-brand-brown">
                ${t.price[kind]}
              </span>
              <span className="text-sm text-brand-taupe-light">/ visit</span>
            </div>

            <ul className="mt-4 space-y-2 text-sm text-brand-taupe">
              {t.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-0.5 h-5 w-5 text-brand-sage">
                    <path d="M7.5 13.5 3.5 9.5l1.4-1.4 2.6 2.6 7.6-7.6 1.4 1.4-9 9z" />
                  </svg>
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            {/* Show both prices as small pills for clarity */}
            <div className="mt-6 flex items-center gap-3">
              <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold shadow-sm border
                ${kind === 'design' ? 'border-rose-200 bg-rose-50 text-rose-600' : 'border-gray-200 bg-gray-50 text-gray-400'}`}>
                <span>Design</span>
                <span>${t.price.design}</span>
              </span>
              <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold shadow-sm border
                ${kind === 'gelx' ? 'border-rose-200 bg-rose-50 text-rose-600' : 'border-gray-200 bg-gray-50 text-gray-400'}`}>
                <span>GELX</span>
                <span>${t.price.gelx}</span>
              </span>
            </div>

            <div className="mt-auto pt-6">
              <button
                onClick={() => onBook('/booking')}
                className="w-full rounded-xl bg-brand-taupe px-4 py-2.5 text-brand-cream font-medium transition hover:bg-brand-taupe-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-taupe"
                aria-label={`Book ${t.name} ${kind} at $${t.price[kind]}`}
              >
                Book {t.name}
              </button>
            </div>
          </article>
        ))}
      </div>

      <p className="mt-6 text-center text-xs text-brand-taupe-light">
        Prices shown are for {kind.toUpperCase()}. Add-ons priced separately.
      </p>
    </section>
  );
}
