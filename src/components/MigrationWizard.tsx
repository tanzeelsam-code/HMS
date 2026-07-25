import React, { useState } from 'react';
import { Upload, CheckCircle2 } from 'lucide-react';

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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 surface-panel bg-white p-5 shadow-xs border border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Self-Service Legacy PMS Data Migration Importer</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200">
              CSV & API Data Switcher
            </span>
          </div>
          <p className="text-xs text-slate-600 mt-1.5 leading-normal">
            Effortlessly switch away from Cloudbeds, Mews, or OPERA by importing guest profiles, reservations, and room rates with dry-run validation.
          </p>
        </div>
      </div>

      {/* Main Container */}
      <div className="surface-panel bg-white p-6 space-y-6 shadow-xs border border-slate-200">
        {stage === 'upload' && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              {['Cloudbeds PMS', 'Mews PMS', 'Oracle OPERA Cloud'].map((pms) => (
                <button
                  key={pms}
                  onClick={() => setSelectedPms(pms)}
                  className={`p-4 rounded-xl border font-bold text-center transition-all ${
                    selectedPms === pms
                      ? 'bg-amber-50 border-amber-400 text-amber-900 shadow-xs'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {pms} Format
                </button>
              ))}
            </div>

            <div 
              onClick={() => setStage('preview')}
              className="border-2 border-dashed border-slate-300 hover:border-amber-500 rounded-2xl p-10 text-center space-y-3 cursor-pointer bg-slate-50 hover:bg-amber-50/60 transition-all shadow-inner"
            >
              <div className="w-14 h-14 rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center mx-auto text-amber-700">
                <Upload className="w-6 h-6" />
              </div>
              <div className="font-bold text-sm text-slate-900">Drop {selectedPms} CSV / Export File Here</div>
              <div className="text-xs text-slate-500 font-medium">Or click to select CSV sample file (Dry-run validation active)</div>
            </div>
          </div>
        )}

        {stage === 'preview' && (
          <div className="space-y-4 text-xs">
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-800 font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Dry-Run Validation Passed (3 Records Ready)
              </div>
              <span className="text-slate-600 font-semibold">Source: {selectedPms}</span>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3">Guest Name</th>
                    <th className="p-3">Email</th>
                    <th className="p-3">Room Type</th>
                    <th className="p-3">Check-in</th>
                    <th className="p-3 text-right">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {sampleParsedRecords.map((rec, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="p-3 font-bold text-slate-900">{rec.name}</td>
                      <td className="p-3 text-slate-600">{rec.email}</td>
                      <td className="p-3 text-slate-700 font-medium">{rec.roomType}</td>
                      <td className="p-3 font-mono text-slate-600">{rec.checkIn}</td>
                      <td className="p-3 text-right font-mono font-bold text-amber-700">${rec.amount}</td>
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
          <div className="p-8 rounded-xl bg-emerald-50/60 border border-emerald-200 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-700 flex items-center justify-center mx-auto text-2xl font-bold">
              ✓
            </div>
            <div className="font-extrabold text-lg text-slate-900">Migration Completed Successfully!</div>
            <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
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
