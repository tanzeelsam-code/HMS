import React, { useState } from 'react';
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, ArrowRight, ShieldCheck } from 'lucide-react';

interface MigrationWizardProps {
  onCommitImport: (count: number) => void;
}

export const MigrationWizard: React.FC<MigrationWizardProps> = ({ onCommitImport }) => {
  const [stage, setStage] = useState<'upload' | 'preview' | 'imported'>('upload');
  const [selectedPms, setSelectedPms] = useState('Cloudbeds PMS');

  const sampleParsedRecords = [
    { name: 'Marcus Brody', email: 'marcus@corp.com', roomType: 'Executive Suite', checkIn: '2026-08-01', amount: 1680, valid: true },
    { name: 'Claire Bennet', email: 'claire@designs.io', roomType: 'Deluxe Ocean View', checkIn: '2026-08-05', amount: 1020, valid: true },
    { name: 'Edward Norton', email: 'edward@cinema.org', roomType: 'Standard King', checkIn: '2026-08-12', amount: 660, valid: true },
  ];

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-panel p-5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-gray-100 tracking-tight">Self-Service Legacy PMS Data Migration Importer</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-300 border border-blue-500/30">
              CSV & API Data Switcher
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Effortlessly switch away from Cloudbeds, Mews, or OPERA by importing guest profiles, reservations, and room rates with dry-run validation.
          </p>
        </div>
      </div>

      {/* Main Container */}
      <div className="glass-panel p-6 space-y-6">
        {stage === 'upload' && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              {['Cloudbeds PMS', 'Mews PMS', 'Oracle OPERA Cloud'].map((pms) => (
                <button
                  key={pms}
                  onClick={() => setSelectedPms(pms)}
                  className={`p-4 rounded-xl border font-bold text-center transition-all ${
                    selectedPms === pms ? 'bg-amber-500/15 border-amber-500/40 text-amber-300' : 'bg-slate-900 border-white/10 text-gray-400 hover:bg-white/5'
                  }`}
                >
                  {pms} Format
                </button>
              ))}
            </div>

            <div 
              onClick={() => setStage('preview')}
              className="border-2 border-dashed border-white/20 hover:border-amber-400/50 rounded-2xl p-10 text-center space-y-3 cursor-pointer bg-slate-900/40 hover:bg-amber-400/5 transition-all"
            >
              <div className="w-14 h-14 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400">
                <Upload className="w-6 h-6" />
              </div>
              <div className="font-bold text-sm text-gray-200">Drop {selectedPms} CSV / Export File Here</div>
              <div className="text-xs text-gray-400">Or click to select CSV sample file (Dry-run validation active)</div>
            </div>
          </div>
        )}

        {stage === 'preview' && (
          <div className="space-y-4 text-xs">
            <div className="p-3.5 rounded-xl bg-slate-900 border border-emerald-500/30 flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-400 font-bold">
                <CheckCircle2 className="w-4 h-4" /> Dry-Run Validation Passed (3 Records Ready)
              </div>
              <span className="text-gray-400">Source: {selectedPms}</span>
            </div>

            <div className="border border-white/10 rounded-xl overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-slate-900 text-gray-400 border-b border-white/10">
                  <tr>
                    <th className="p-3">Guest Name</th>
                    <th className="p-3">Email</th>
                    <th className="p-3">Room Type</th>
                    <th className="p-3">Check-in</th>
                    <th className="p-3 text-right">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 bg-slate-950/60">
                  {sampleParsedRecords.map((rec, i) => (
                    <tr key={i}>
                      <td className="p-3 font-bold text-gray-200">{rec.name}</td>
                      <td className="p-3 text-gray-400">{rec.email}</td>
                      <td className="p-3 text-gray-300">{rec.roomType}</td>
                      <td className="p-3 font-mono text-gray-400">{rec.checkIn}</td>
                      <td className="p-3 text-right font-mono font-bold text-amber-300">${rec.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button 
                onClick={() => setStage('upload')}
                className="btn-secondary text-xs px-4 py-2"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  onCommitImport(sampleParsedRecords.length);
                  setStage('imported');
                }}
                className="btn-primary text-xs px-5 py-2"
              >
                <CheckCircle2 className="w-4 h-4" /> Commit Migration to NexusHOS
              </button>
            </div>
          </div>
        )}

        {stage === 'imported' && (
          <div className="p-8 rounded-xl bg-slate-900 border border-emerald-500/30 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto text-2xl">
              ✓
            </div>
            <div className="font-extrabold text-lg text-gray-100">Migration Completed Successfully!</div>
            <p className="text-xs text-gray-400 max-w-md mx-auto">
              Imported 3 reservation contracts and guest golden profiles into NexusHOS database.
            </p>
            <button 
              onClick={() => setStage('upload')}
              className="btn-secondary text-xs px-4 py-2"
            >
              Import Another File
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
