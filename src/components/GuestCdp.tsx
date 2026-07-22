import React, { useMemo, useState } from 'react';
import {
  Award,
  BedDouble,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  Heart,
  Mail,
  Moon,
  Phone,
  Search,
  ShieldCheck,
  Sparkles,
  Users
} from 'lucide-react';
import { GuestProfile } from '../types';

interface GuestCdpProps {
  profiles: GuestProfile[];
}

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
});

const vipStyles: Record<GuestProfile['vipTier'], string> = {
  Platinum: 'border-violet-400/25 bg-violet-400/10 text-violet-200',
  Gold: 'border-amber-400/25 bg-amber-400/10 text-amber-200',
  Silver: 'border-slate-300/20 bg-slate-300/10 text-slate-200',
  Member: 'border-sky-400/20 bg-sky-400/10 text-sky-200'
};

export const GuestCdp: React.FC<GuestCdpProps> = ({ profiles }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProfileId, setSelectedProfileId] = useState<string | undefined>(profiles[0]?.id);

  const filteredProfiles = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return profiles;

    return profiles.filter((profile) =>
      profile.name.toLowerCase().includes(query) ||
      profile.email.toLowerCase().includes(query) ||
      profile.phone.toLowerCase().includes(query)
    );
  }, [profiles, searchTerm]);

  const selectedProfile =
    profiles.find((profile) => profile.id === selectedProfileId) ?? filteredProfiles[0] ?? profiles[0];

  const portfolioMetrics = useMemo(() => {
    const lifetimeValue = profiles.reduce((total, profile) => total + profile.lifetimeSpend, 0);
    const totalStays = profiles.reduce((total, profile) => total + profile.totalStays, 0);

    return {
      profiles: profiles.length,
      vipProfiles: profiles.filter((profile) => ['Gold', 'Platinum'].includes(profile.vipTier)).length,
      averageValue: profiles.length ? Math.round(lifetimeValue / profiles.length) : 0,
      totalStays
    };
  }, [profiles]);

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 p-1 pb-8 animate-slide-up">
      <header className="rounded-2xl border border-white/[0.08] bg-slate-900/75 px-6 py-6 shadow-[0_18px_60px_rgba(0,0,0,0.22)]">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-300/80">
              <ShieldCheck className="h-4 w-4" />
              Guest intelligence
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">
              Unified guest profiles
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              A consolidated view of stay history, lifetime value, preferences, and the operational context staff need to personalize service.
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.06] px-4 py-3">
            <Sparkles className="h-5 w-5 text-amber-300" />
            <div>
              <div className="text-xs font-semibold text-slate-200">Identity resolution active</div>
              <div className="mt-0.5 text-[11px] text-slate-500">Profiles shown from the current property dataset</div>
            </div>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Guest portfolio summary">
        {[
          { label: 'Unified profiles', value: portfolioMetrics.profiles.toLocaleString(), icon: Users },
          { label: 'Gold & platinum', value: portfolioMetrics.vipProfiles.toLocaleString(), icon: Award },
          { label: 'Average lifetime value', value: currency.format(portfolioMetrics.averageValue), icon: CircleDollarSign },
          { label: 'Completed stays', value: portfolioMetrics.totalStays.toLocaleString(), icon: CalendarDays }
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-2xl border border-white/[0.07] bg-slate-900/60 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-slate-500">{label}</p>
                <p className="mt-2 text-xl font-semibold tracking-tight text-slate-100 sm:text-2xl">{value}</p>
              </div>
              <div className="rounded-xl border border-white/[0.07] bg-slate-950/70 p-2.5 text-slate-400">
                <Icon className="h-4 w-4" />
              </div>
            </div>
          </div>
        ))}
      </section>

      <div className="grid min-h-[620px] grid-cols-1 gap-5 xl:grid-cols-[390px_minmax(0,1fr)]">
        <aside className="overflow-hidden rounded-2xl border border-white/[0.08] bg-slate-900/65">
          <div className="border-b border-white/[0.07] p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Guest directory</h3>
                <p className="mt-1 text-xs text-slate-500">{filteredProfiles.length} profiles visible</p>
              </div>
            </div>
            <label className="relative mt-4 block">
              <span className="sr-only">Search guest profiles</span>
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="search"
                placeholder="Search name, email, or phone"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="w-full rounded-xl border border-white/[0.08] bg-slate-950/60 py-3 pl-10 pr-4 text-sm text-slate-200 placeholder:text-slate-600 focus:border-amber-300/40 focus:outline-none"
              />
            </label>
          </div>

          <div className="max-h-[530px] space-y-1.5 overflow-y-auto p-2.5">
            {filteredProfiles.map((profile) => {
              const active = selectedProfile?.id === profile.id;

              return (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => setSelectedProfileId(profile.id)}
                  aria-pressed={active}
                  className={`group flex w-full items-center gap-3 rounded-xl border px-3.5 py-3.5 text-left transition-colors ${
                    active
                      ? 'border-amber-300/25 bg-amber-300/[0.08]'
                      : 'border-transparent hover:border-white/[0.06] hover:bg-white/[0.035]'
                  }`}
                >
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-semibold ${
                    active ? 'bg-amber-300 text-slate-950' : 'bg-slate-800 text-slate-300'
                  }`}>
                    {profile.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-slate-100">{profile.name}</p>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${vipStyles[profile.vipTier]}`}>
                        {profile.vipTier}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500">{profile.email}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold text-slate-300">{currency.format(profile.lifetimeSpend)}</p>
                    <ChevronRight className={`ml-auto mt-1 h-3.5 w-3.5 ${active ? 'text-amber-300' : 'text-slate-600 group-hover:text-slate-400'}`} />
                  </div>
                </button>
              );
            })}

            {!filteredProfiles.length && (
              <div className="px-5 py-16 text-center">
                <Users className="mx-auto h-7 w-7 text-slate-600" />
                <p className="mt-3 text-sm font-medium text-slate-300">No matching guests</p>
                <p className="mt-1 text-xs text-slate-500">Try a different name, email, or phone number.</p>
              </div>
            )}
          </div>
        </aside>

        <main className="overflow-hidden rounded-2xl border border-white/[0.08] bg-slate-900/65">
          {selectedProfile ? (
            <>
              <div className="border-b border-white/[0.07] p-6 sm:p-7">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex min-w-0 items-start gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-200 to-amber-500 text-lg font-bold text-slate-950 shadow-[0_10px_35px_rgba(226,177,83,0.18)]">
                      {selectedProfile.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h3 className="text-2xl font-semibold tracking-tight text-slate-50">{selectedProfile.name}</h3>
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${vipStyles[selectedProfile.vipTier]}`}>
                          {selectedProfile.vipTier} guest
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-400">
                        <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-slate-500" />{selectedProfile.email}</span>
                        <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-slate-500" />{selectedProfile.phone}</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/[0.07] bg-slate-950/45 px-5 py-4 lg:min-w-[210px] lg:text-right">
                    <p className="text-xs font-medium text-slate-500">Lifetime value</p>
                    <p className="mt-1 text-2xl font-semibold tracking-tight text-amber-200">
                      {currency.format(selectedProfile.lifetimeSpend)}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-600">Across completed stays</p>
                  </div>
                </div>
              </div>

              <div className="space-y-5 p-6 sm:p-7">
                <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Selected guest metrics">
                  {[
                    { label: 'Completed stays', value: selectedProfile.totalStays.toLocaleString(), icon: CalendarDays },
                    { label: 'Room nights', value: selectedProfile.totalNights.toLocaleString(), icon: Moon },
                    { label: 'Preferred room', value: selectedProfile.preferredRoomType, icon: BedDouble },
                    { label: 'Last stay', value: selectedProfile.lastStayDate, icon: CalendarDays }
                  ].map(({ label, value, icon: Icon }) => (
                    <div key={label} className="rounded-xl border border-white/[0.07] bg-slate-950/40 p-4">
                      <div className="flex items-center gap-2 text-slate-500">
                        <Icon className="h-3.5 w-3.5" />
                        <span className="text-[11px] font-medium uppercase tracking-[0.08em]">{label}</span>
                      </div>
                      <p className="mt-3 line-clamp-2 text-sm font-semibold leading-5 text-slate-100">{value}</p>
                    </div>
                  ))}
                </section>

                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.72fr)]">
                  <section className="rounded-xl border border-white/[0.07] bg-slate-950/35 p-5">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-rose-400/10 p-2 text-rose-300">
                        <Heart className="h-4 w-4" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-slate-100">Preferences and amenities</h4>
                        <p className="mt-0.5 text-xs text-slate-500">Service details recorded on the guest profile</p>
                      </div>
                    </div>
                    <div className="mt-5 flex flex-wrap gap-2">
                      {selectedProfile.dietaryPreferences.length ? selectedProfile.dietaryPreferences.map((preference) => (
                        <span key={preference} className="rounded-lg border border-rose-300/15 bg-rose-300/[0.07] px-3 py-2 text-xs font-medium text-rose-100">
                          {preference}
                        </span>
                      )) : (
                        <p className="text-sm text-slate-500">No dietary or amenity preferences recorded.</p>
                      )}
                    </div>
                  </section>

                  <section className="rounded-xl border border-white/[0.07] bg-slate-950/35 p-5">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-amber-300/10 p-2 text-amber-300">
                        <Award className="h-4 w-4" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-slate-100">Loyalty summary</h4>
                        <p className="mt-0.5 text-xs text-slate-500">Recognize the guest at every touchpoint</p>
                      </div>
                    </div>
                    <dl className="mt-5 space-y-3 text-xs">
                      <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                        <dt className="text-slate-500">Current tier</dt>
                        <dd className="font-semibold text-slate-200">{selectedProfile.vipTier}</dd>
                      </div>
                      <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                        <dt className="text-slate-500">Average stay value</dt>
                        <dd className="font-semibold text-slate-200">
                          {currency.format(selectedProfile.totalStays ? selectedProfile.lifetimeSpend / selectedProfile.totalStays : 0)}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between">
                        <dt className="text-slate-500">Average stay length</dt>
                        <dd className="font-semibold text-slate-200">
                          {selectedProfile.totalStays ? (selectedProfile.totalNights / selectedProfile.totalStays).toFixed(1) : '0'} nights
                        </dd>
                      </div>
                    </dl>
                  </section>
                </div>

                <section className="rounded-xl border border-amber-300/15 bg-amber-300/[0.045] p-5">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-lg bg-amber-300/10 p-2 text-amber-300">
                      <ShieldCheck className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-slate-100">Staff service notes</h4>
                      <p className="mt-2 text-sm leading-6 text-slate-300">{selectedProfile.notes || 'No operational notes recorded for this guest.'}</p>
                    </div>
                  </div>
                </section>
              </div>
            </>
          ) : (
            <div className="flex min-h-[620px] items-center justify-center p-8 text-center">
              <div>
                <Users className="mx-auto h-9 w-9 text-slate-600" />
                <h3 className="mt-4 text-base font-semibold text-slate-200">No guest profiles available</h3>
                <p className="mt-2 text-sm text-slate-500">Profiles will appear here when guest data is available.</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
