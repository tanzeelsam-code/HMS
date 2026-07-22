import React, { useState } from 'react';
import { ReviewItem } from '../types';
import { Sparkles, MessageSquare, Star, CheckCircle2, Send, Globe, ThumbsUp } from 'lucide-react';

interface ReputationBoardProps {
  reviews: ReviewItem[];
  onRespondToReview: (reviewId: string, responseText: string) => void;
}

export const ReputationBoard: React.FC<ReputationBoardProps> = ({
  reviews,
  onRespondToReview
}) => {
  const [activeReviewId, setActiveReviewId] = useState<string | null>(null);
  const [editedResponse, setEditedResponse] = useState('');

  const handleOpenDraft = (rev: ReviewItem) => {
    setActiveReviewId(rev.id);
    setEditedResponse(rev.aiDraftedResponse || '');
  };

  const handlePublish = (id: string) => {
    onRespondToReview(id, editedResponse);
    setActiveReviewId(null);
  };

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-panel p-5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-gray-100 tracking-tight">Reputation AI & Guest Review Assistant</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
              Unified Review Inbox & AI Drafter
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Aggregate guest feedback from Google, Booking.com, and TripAdvisor with 1-click brand-voice AI responses.
          </p>
        </div>
      </div>

      {/* Review Cards List */}
      <div className="space-y-4">
        {reviews.map((rev) => (
          <div 
            key={rev.id}
            className="glass-panel p-5 space-y-3 hover:border-cyan-400/40 transition-all text-xs"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-slate-900 border border-white/10 flex items-center justify-center font-bold text-amber-300">
                  {rev.rating}★
                </div>
                <div>
                  <div className="font-extrabold text-sm text-gray-100">{rev.guestName}</div>
                  <div className="text-[11px] text-gray-400">{rev.source} • {rev.date}</div>
                </div>
              </div>

              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                rev.sentiment === 'Positive' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
              }`}>
                {rev.sentiment} Sentiment
              </span>
            </div>

            <p className="text-gray-200 leading-relaxed italic bg-slate-900/60 p-3 rounded-xl border border-white/5">
              "{rev.reviewText}"
            </p>

            {/* AI Response Drafter Area */}
            {activeReviewId === rev.id ? (
              <div className="p-4 rounded-xl bg-slate-900 border border-cyan-500/30 space-y-3">
                <div className="font-bold text-cyan-300 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4" /> AI Drafted Response (Editable)
                </div>
                <textarea
                  rows={3}
                  value={editedResponse}
                  onChange={(e) => setEditedResponse(e.target.value)}
                  className="w-full p-2.5 rounded-lg bg-slate-950 border border-white/10 text-gray-200 text-xs focus:outline-none focus:border-cyan-400/50"
                />
                <div className="flex items-center justify-end gap-2">
                  <button 
                    onClick={() => setActiveReviewId(null)}
                    className="btn-secondary text-xs px-3 py-1.5"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => handlePublish(rev.id)}
                    className="btn-primary text-xs px-4 py-1.5"
                  >
                    <Send className="w-3.5 h-3.5" /> Publish Response
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between pt-2 border-t border-white/10">
                {rev.responded ? (
                  <span className="text-emerald-400 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" /> Response Published
                  </span>
                ) : (
                  <button 
                    onClick={() => handleOpenDraft(rev)}
                    className="btn-secondary text-xs px-3.5 py-1.5 text-cyan-300 hover:bg-cyan-500/10 border-cyan-500/30"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> Generate AI Response
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
