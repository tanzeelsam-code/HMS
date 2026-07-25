import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Globe2,
  Inbox,
  MessageSquare,
  Quote,
  Send,
  Sparkles,
  Star,
  TriangleAlert,
  X
} from 'lucide-react';
import { ReviewItem } from '../types';

interface ReputationBoardProps {
  reviews: ReviewItem[];
  onRespondToReview: (reviewId: string, responseText: string) => boolean | Promise<boolean>;
}

const sentimentStyles: Record<ReviewItem['sentiment'], string> = {
  Positive: 'border-emerald-300 bg-emerald-100 text-emerald-900',
  Neutral: 'border-amber-300 bg-amber-100 text-amber-900',
  Negative: 'border-rose-300 bg-rose-100 text-rose-900'
};

const sourceInitials: Record<ReviewItem['source'], string> = {
  'Google Reviews': 'G',
  'Booking.com': 'B',
  TripAdvisor: 'T',
  Expedia: 'E'
};

export const ReputationBoard: React.FC<ReputationBoardProps> = ({
  reviews,
  onRespondToReview
}) => {
  const [activeReviewId, setActiveReviewId] = useState<string | null>(null);
  const [editedResponse, setEditedResponse] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const activeReview = reviews.find((review) => review.id === activeReviewId);

  const metrics = useMemo(() => {
    const responseCount = reviews.filter((review) => review.responded).length;
    const averageRating = reviews.length
      ? reviews.reduce((total, review) => total + review.rating, 0) / reviews.length
      : 0;

    return {
      total: reviews.length,
      averageRating,
      awaitingResponse: reviews.length - responseCount,
      responseCount
    };
  }, [reviews]);

  const handleOpenDraft = (review: ReviewItem) => {
    setActiveReviewId(review.id);
    setEditedResponse(review.aiDraftedResponse || '');
  };

  const handleCloseDraft = () => {
    setActiveReviewId(null);
    setEditedResponse('');
  };

  const handlePublish = async (id: string) => {
    setSubmitting(true);
    try {
      if (await onRespondToReview(id, editedResponse)) handleCloseDraft();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 p-1 pb-8 animate-slide-up">
      <header className="rounded-2xl border border-slate-200 bg-white px-6 py-6 shadow-xs">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-cyan-800">
              <MessageSquare className="h-4 w-4 text-cyan-700" />
              Guest reputation
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Review inbox
            </h2>
            <p className="mt-2 max-w-2xl text-xs leading-relaxed font-medium text-slate-600">
              Review imported guest feedback, refine prepared response drafts, and save an approval-ready reply for each channel.
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 shadow-xs">
            <Globe2 className="h-5 w-5 text-cyan-700" />
            <div>
              <div className="text-xs font-bold text-slate-900">Connector-ready workflow</div>
              <div className="mt-0.5 text-[11px] font-semibold text-slate-600">External publishing remains disabled</div>
            </div>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Reputation summary">
        {[
          { label: 'Reviews imported', value: metrics.total.toLocaleString(), detail: 'Current inbox', icon: Inbox, tone: 'text-slate-900' },
          { label: 'Average rating', value: metrics.total ? metrics.averageRating.toFixed(1) : '—', detail: metrics.total ? 'Out of 5.0' : 'No ratings', icon: Star, tone: 'text-amber-800' },
          { label: 'Awaiting response', value: metrics.awaitingResponse.toLocaleString(), detail: 'Requires review', icon: TriangleAlert, tone: metrics.awaitingResponse ? 'text-amber-800' : 'text-emerald-800' },
          { label: 'Responses saved', value: metrics.responseCount.toLocaleString(), detail: 'Approval-ready', icon: CheckCircle2, tone: 'text-emerald-800' }
        ].map(({ label, value, detail, icon: Icon, tone }) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase">{label}</p>
                <p className={`mt-2 text-xl font-extrabold tracking-tight sm:text-2xl ${tone}`}>{value}</p>
                <p className="mt-1 text-[11px] font-semibold text-slate-500">{detail}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-slate-600">
                <Icon className="h-4 w-4" />
              </div>
            </div>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(390px,0.65fr)]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Imported feedback</h3>
              <p className="mt-1 text-xs font-semibold text-slate-500">{metrics.awaitingResponse} of {metrics.total} reviews awaiting a saved response</p>
            </div>
            <span className="rounded-full border border-slate-300 bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-700">
              All channels
            </span>
          </div>

          <div className="space-y-3 p-3 sm:p-4">
            {reviews.map((review) => {
              const active = activeReviewId === review.id;

              return (
                <article
                  key={review.id}
                  className={`rounded-xl border p-4 transition-colors sm:p-5 ${
                    active
                      ? 'border-cyan-300 bg-cyan-50'
                      : 'border-slate-200 bg-slate-50/70 hover:border-slate-300'
                  }`}
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm font-extrabold text-slate-800 shadow-xs">
                        {sourceInitials[review.source]}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-sm font-bold text-slate-900">{review.guestName}</h4>
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${sentimentStyles[review.sentiment]}`}>
                            {review.sentiment}
                          </span>
                        </div>
                        <p className="mt-1 text-xs font-semibold text-slate-500">{review.source} · {review.date}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1" aria-label={`${review.rating} out of 5 stars`}>
                      {Array.from({ length: 5 }, (_, index) => (
                        <Star
                          key={index}
                          className={`h-3.5 w-3.5 ${index < review.rating ? 'fill-amber-500 text-amber-500' : 'text-slate-300'}`}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 flex gap-3 rounded-xl border border-slate-200 bg-white p-4">
                    <Quote className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <p className="text-xs font-semibold leading-relaxed text-slate-800">{review.reviewText}</p>
                  </div>

                  {review.responded && review.responseText && (
                    <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Saved response</p>
                      <p className="mt-2 line-clamp-2 text-xs leading-relaxed font-semibold text-slate-700">{review.responseText}</p>
                    </div>
                  )}

                  <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
                    {review.responded ? (
                      <span className="flex items-center gap-2 text-xs font-bold text-emerald-800">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        Response saved for approval
                      </span>
                    ) : (
                      <span className="flex items-center gap-2 text-xs font-bold text-amber-800">
                        <TriangleAlert className="h-4 w-4 text-amber-600" />
                        Response required
                      </span>
                    )}

                    {!review.responded && (
                      <button
                        type="button"
                        onClick={() => handleOpenDraft(review)}
                        className={`inline-flex items-center justify-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-bold transition-colors ${
                          active
                            ? 'border-cyan-300 bg-cyan-100 text-cyan-900'
                            : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100 shadow-xs'
                        }`}
                      >
                        <Sparkles className="h-3.5 w-3.5 text-cyan-700" />
                        {active ? 'Draft open' : 'Open response draft'}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}

            {!reviews.length && (
              <div className="px-6 py-20 text-center">
                <Inbox className="mx-auto h-9 w-9 text-slate-400" />
                <h3 className="mt-4 text-base font-bold text-slate-900">No reviews imported</h3>
                <p className="mt-2 text-xs font-semibold text-slate-500">Guest feedback will appear here when review data is available.</p>
              </div>
            )}
          </div>
        </section>

        <aside className="xl:sticky xl:top-4 xl:self-start">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
            {activeReview ? (
              <>
                <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
                  <div>
                    <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-cyan-800">
                      <Sparkles className="h-3.5 w-3.5 text-cyan-700" />
                      Response workspace
                    </div>
                    <h3 className="mt-2 text-base font-bold text-slate-900">Reply to {activeReview.guestName}</h3>
                  </div>
                  <button
                    type="button"
                    onClick={handleCloseDraft}
                    aria-label="Close response workspace"
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-5 p-5">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-bold text-slate-900">{activeReview.source}</p>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${sentimentStyles[activeReview.sentiment]}`}>
                        {activeReview.sentiment}
                      </span>
                    </div>
                    <p className="mt-3 line-clamp-3 text-xs leading-relaxed font-semibold text-slate-700">{activeReview.reviewText}</p>
                  </div>

                  <div>
                    <div className="flex items-end justify-between gap-3">
                      <label htmlFor="review-response" className="text-xs font-bold text-slate-900">Prepared response draft</label>
                      <span className="text-[10px] text-slate-500 font-semibold">{editedResponse.length} characters</span>
                    </div>
                    <p className="mt-1.5 text-[11px] font-medium text-slate-500">Review and edit the draft before saving it as approval-ready.</p>
                    <textarea
                      id="review-response"
                      rows={10}
                      value={editedResponse}
                      onChange={(event) => setEditedResponse(event.target.value)}
                      className="field-control text-xs resize-y mt-3"
                      placeholder="Write a thoughtful response to this guest…"
                    />
                  </div>

                  <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[11px] font-semibold text-slate-700 leading-relaxed">
                    Saving records the approved response in NexusHOS. It will not publish externally until a review-platform connector is configured.
                  </div>

                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={handleCloseDraft}
                      className="btn-secondary px-4 py-2.5 text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePublish(activeReview.id)}
                      disabled={submitting || !editedResponse.trim()}
                      className="btn-primary justify-center px-4 py-2.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Send className="h-3.5 w-3.5" />
                      {submitting ? 'Saving response…' : 'Save approved response'}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="p-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-200 bg-cyan-50 text-cyan-800">
                  <MessageSquare className="h-5 w-5 text-cyan-700" />
                </div>
                <h3 className="mt-5 text-base font-bold text-slate-900">Response workspace</h3>
                <p className="mt-2 text-xs leading-relaxed font-medium text-slate-600">
                  Choose an unanswered review to inspect its prepared draft, make edits, and save an approval-ready response.
                </p>

                <div className="mt-6 space-y-3 border-t border-slate-200 pt-5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-bold">Drafts awaiting review</span>
                    <span className="font-extrabold text-slate-900">{metrics.awaitingResponse}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-bold">Approved responses</span>
                    <span className="font-extrabold text-emerald-800">{metrics.responseCount}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-bold">External publishing</span>
                    <span className="font-semibold text-slate-600">Not connected</span>
                  </div>
                </div>
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
};
