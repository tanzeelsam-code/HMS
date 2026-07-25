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
  Platinum: 'border-purple-300 bg-purple-100 text-purple-900',
  Gold: 'border-amber-300 bg-amber-100 text-amber-900',
  Silver: 'border-slate-300 bg-slate-100 text-slate-800',
  Member: 'border-sky-300 bg-sky-100 text-sky-900'
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
      <header className="rounded-2xl border border-slate-200 bg-white px-6 py-6 shadow-xs">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-amber-800">
              <ShieldCheck className="h-4 w-4 text-amber-700" />
              Guest intelligence
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Unified guest profiles
            </h2>
            <p className="mt-2 max-w-2xl text-xs leading-relaxed font-medium text-slate-600">
              A consolidated view of stay history, lifetime value, preferences, and the operational context staff need to personalize service.
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 shadow-xs">
            <Sparkles className="h-5 w-5 text-amber-700" />
            <div>
              <div className="text-xs font-bold text-slate-900">Identity resolution active</div>
              <div className="mt-0.5 text-[11px] font-semibold text-slate-600">Profiles shown from the current property dataset</div>
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
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase">{label}</p>
                <p className="mt-2 text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">{value}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-slate-600">
                <Icon className="h-4 w-4" />
              </div>
            </div>
          </div>
        ))}
      </section>

      <div className="grid min-h-[620px] grid-cols-1 gap-5 xl:grid-cols-[390px_minmax(0,1fr)]">
        <aside className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="border-b border-slate-200 p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Guest directory</h3>
                <p className="mt-1 text-xs font-semibold text-slate-500">{filteredProfiles.length} profiles visible</p>
              </div>
            </div>
            <label className="relative mt-4 block">
              <span className="sr-only">Search guest profiles</span>
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                placeholder="Search name, email, or phone"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="field-control !pl-10 text-xs"
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
                      ? 'border-amber-300 bg-amber-50 shadow-xs'
                      : 'border-transparent hover:border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${
                    active ? 'bg-amber-800 text-white' : 'bg-slate-100 text-slate-700'
                  }`}>
                    {profile.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-bold text-slate-900">{profile.name}</p>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${vipStyles[profile.vipTier]}`}>
                        {profile.vipTier}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs font-semibold text-slate-500">{profile.email}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-slate-900">{currency.format(profile.lifetimeSpend)}</p>
                    <ChevronRight className={`ml-auto mt-1 h-3.5 w-3.5 ${active ? 'text-amber-800' : 'text-slate-400 group-hover:text-slate-600'}`} />
                  </div>
                </button>
              );
            })}

            {!filteredProfiles.length && (
              <div className="px-5 py-16 text-center">
                <Users className="mx-auto h-7 w-7 text-slate-400" />
                <p className="mt-3 text-sm font-bold text-slate-900">No matching guests</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">Try a different name, email, or phone number.</p>
              </div>
            )}
          </div>
        </aside>

        <main className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          {selectedProfile ? (
            <>
              <div className="border-b border-slate-200 p-6 sm:p-7">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex min-w-0 items-start gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-amber-600 text-lg font-extrabold text-white shadow-xs">
                      {selectedProfile.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h3 className="text-2xl font-extrabold tracking-tight text-slate-900">{selectedProfile.name}</h3>
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${vipStyles[selectedProfile.vipTier]}`}>
                          {selectedProfile.vipTier} guest
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-slate-600">
                        <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-slate-400" />{selectedProfile.email}</span>
                        <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-slate-400" />{selectedProfile.phone}</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 lg:min-w-[210px] lg:text-right">
                    <p className="text-xs font-bold text-slate-500 uppercase">Lifetime value</p>
                    <p className="mt-1 text-2xl font-extrabold tracking-tight text-amber-900">
                      {currency.format(selectedProfile.lifetimeSpend)}
                    </p>
                    <p className="mt-1 text-[11px] font-semibold text-slate-500">Across completed stays</p>
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
                    <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center gap-2 text-slate-500">
                        <Icon className="h-3.5 w-3.5 text-slate-600" />
                        <span className="text-[11px] font-bold uppercase tracking-wider">{label}</span>
                      </div>
                      <p className="mt-3 line-clamp-2 text-sm font-extrabold text-slate-900">{value}</p>
                    </div>
                  ))}
                </section>

                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.72fr)]">
                  <section className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-rose-100 p-2 text-rose-800">
                        <Heart className="h-4 w-4" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">Preferences and amenities</h4>
                        <p className="mt-0.5 text-xs font-semibold text-slate-500">Service details recorded on the guest profile</p>
                      </div>
                    </div>
                    <div className="mt-5 flex flex-wrap gap-2">
                      {selectedProfile.dietaryPreferences.length ? selectedProfile.dietaryPreferences.map((preference) => (
                        <span key={preference} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-900">
                          {preference}
                        </span>
                      )) : (
                        <p className="text-sm font-semibold text-slate-500">No dietary or amenity preferences recorded.</p>
                      )}
                    </div>
                  </section>

                  <section className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-amber-100 p-2 text-amber-800">
                        <Award className="h-4 w-4" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">Loyalty summary</h4>
                        <p className="mt-0.5 text-xs font-semibold text-slate-500">Recognize the guest at every touchpoint</p>
                      </div>
                    </div>
                    <dl className="mt-5 space-y-3 text-xs">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                        <dt className="text-slate-500 font-bold">Current tier</dt>
                        <dd className="font-extrabold text-slate-900">{selectedProfile.vipTier}</dd>
                      </div>
                      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                        <dt className="text-slate-500 font-bold">Average stay value</dt>
                        <dd className="font-extrabold text-slate-900">
                          {currency.format(selectedProfile.totalStays ? selectedProfile.lifetimeSpend / selectedProfile.totalStays : 0)}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between">
                        <dt className="text-slate-500 font-bold">Average stay length</dt>
                        <dd className="font-extrabold text-slate-900">
                          {selectedProfile.totalStays ? (selectedProfile.totalNights / selectedProfile.totalStays).toFixed(1) : '0'} nights
                        </dd>
                      </div>
                    </dl>
                  </section>
                </div>

                <section className="rounded-xl border border-amber-300 bg-amber-50 p-5 shadow-xs">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-lg bg-amber-100 p-2 text-amber-800">
                      <ShieldCheck className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">Staff service notes</h4>
                      <p className="mt-2 text-xs leading-relaxed font-semibold text-slate-800">{selectedProfile.notes || 'No operational notes recorded for this guest.'}</p>
                    </div>
                  </div>
                </section>
              </div>
            </>
          ) : (
            <div className="flex min-h-[620px] items-center justify-center p-8 text-center">
              <div>
                <Users className="mx-auto h-9 w-9 text-slate-400" />
                <h3 className="mt-4 text-base font-bold text-slate-900">No guest profiles available</h3>
                <p className="mt-2 text-sm font-semibold text-slate-500">Profiles will appear here when guest data is available.</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
