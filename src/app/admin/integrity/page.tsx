'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/Button';
import { Icons } from '@/components/ui/icons';
import { LoadingState } from '@/components/ui/FeedbackStates';

interface BrokenLinkDetails {
  table: string;
  brokenRowId: string;
  brokenIndex: number;
  failureReason: string;
  expectedHash: string;
  actualHash: string;
}

interface VerificationReport {
  isValid: boolean;
  firstBrokenLink: BrokenLinkDetails | null;
  ledger: {
    isValid: boolean;
    totalEntries: number;
    brokenRowId: string | null;
    brokenIndex: number | null;
    failureReason: string | null;
    latestHash?: string;
  };
  attendance: {
    isValid: boolean;
    totalEntries: number;
    brokenRowId: string | null;
    brokenIndex: number | null;
    failureReason: string | null;
    latestHash?: string;
  };
  anchors: {
    isValid: boolean;
    totalAnchorsCount: number;
    lastAnchor: {
      id: string;
      anchor_date: string;
      merkle_root: string;
      ledger_entries_count: number;
      attendance_events_count: number;
      combined_leaves_count: number;
      external_publication_url: string | null;
      external_publication_proof: string | null;
      created_at: string;
    } | null;
  };
  honestyDisclosure: {
    title: string;
    whatItProves: string[];
    whatItDoesNotProve: string[];
  };
  verifiedAt: string;
}

export default function AdminIntegrityPage() {
  const { user } = useAuth();
  const [report, setReport] = useState<VerificationReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isAnchoring, setIsAnchoring] = useState(false);
  const [anchorMessage, setAnchorMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchIntegrityStatus = async () => {
    try {
      setIsVerifying(true);
      setErrorMsg(null);
      const res = await fetch('/api/audit/verify');
      if (!res.ok) {
        throw new Error(`Verification endpoint returned status ${res.status}`);
      }
      const data = await res.json();
      setReport(data);
    } catch (err: any) {
      console.error('Error fetching integrity status:', err);
      setErrorMsg(err.message || 'Failed to verify system integrity.');
    } finally {
      setIsLoading(false);
      setIsVerifying(false);
    }
  };

  useEffect(() => {
    fetchIntegrityStatus();
  }, []);

  const handleComputeAnchor = async () => {
    try {
      setIsAnchoring(true);
      setAnchorMessage(null);
      const res = await fetch('/api/audit/anchor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          anchorDate: new Date().toISOString().split('T')[0],
          publishExternal: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to compute anchor');
      }
      setAnchorMessage(`Merkle anchor computed & registered: ${data.anchor?.merkle_root?.slice(0, 16)}...`);
      // Refresh report
      await fetchIntegrityStatus();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsAnchoring(false);
    }
  };

  if (isLoading) {
    return <LoadingState message="RECOMPUTING CRYPTOGRAPHIC HASH CHAINS & VERIFYING MERKLE ANCHORS..." />;
  }

  const isSystemValid = report?.isValid ?? true;

  return (
    <div className="min-h-screen bg-[var(--paper)] text-[var(--ink)]">
      {/* Header */}
      <header className="bg-[var(--ink)] text-white px-4 py-3 border-b-4 border-[var(--site-yellow)]">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="text-xs font-mono uppercase bg-white/10 hover:bg-white/20 text-white px-2.5 py-1 rounded-[2px]"
            >
              ← Admin Console
            </Link>
            <div className="border-l border-white/20 pl-3">
              <span className="font-bold text-base tracking-wider uppercase text-white">
                Tamper-Evidence & Integrity Monitor
              </span>
              <div className="text-[10px] font-mono text-[var(--site-yellow)]">
                CRYPTOGRAPHIC PROOF VERIFICATION ENGINE · SHA-256 HASH CHAINS & MERKLE ANCHORS
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={fetchIntegrityStatus}
              disabled={isVerifying}
            >
              {isVerifying ? 'VERIFYING...' : 'RE-VERIFY CHAINS'}
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Error Notification */}
        {errorMsg && (
          <div className="p-4 bg-red-50 border-2 border-red-600 text-red-900 rounded-[2px]">
            <div className="font-bold text-sm flex items-center gap-2">
              <Icons.AlertTriangle size={18} className="text-red-600" />
              Verification Error
            </div>
            <p className="text-xs mt-1 font-mono">{errorMsg}</p>
          </div>
        )}

        {/* Master Integrity Status Banner */}
        <div
          className={`p-6 border-4 rounded-[2px] transition-all ${
            isSystemValid
              ? 'bg-[#EBF7EE] border-[#1E7A4B] text-[#0E4426]'
              : 'bg-[#FDF2F2] border-[#D32F2F] text-[#821313]'
          }`}
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div
                className={`w-12 h-12 rounded-[2px] flex items-center justify-center font-bold text-xl ${
                  isSystemValid ? 'bg-[#1E7A4B] text-white' : 'bg-[#D32F2F] text-white'
                }`}
              >
                {isSystemValid ? '✓' : '!'}
              </div>
              <div>
                <div className="text-xs font-mono font-bold uppercase tracking-wider">
                  SYSTEM TAMPER-EVIDENCE STATUS
                </div>
                <h1 className="text-2xl font-bold uppercase">
                  {isSystemValid
                    ? 'VERIFIED · UNBROKEN CRYPTOGRAPHIC CHAIN'
                    : 'INTEGRITY BREACH · TAMPERED RECORD IDENTIFIED'}
                </h1>
                <p className="text-xs mt-1 opacity-90">
                  {isSystemValid
                    ? 'All sequential SHA-256 hashes match across double-entry ledger entries and attendance muster events.'
                    : 'A database record has been altered after capture. Cryptographic hash chain failed to match stored record.'}
                </p>
                <div className="text-[11px] font-mono mt-2 opacity-75">
                  Last verified: {report?.verifiedAt ? new Date(report.verifiedAt).toLocaleString() : 'Just now'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant={isSystemValid ? 'primary' : 'warning'}
                size="md"
                onClick={fetchIntegrityStatus}
                disabled={isVerifying}
              >
                {isVerifying ? 'RECOMPUTING...' : 'RUN VERIFICATION AUDIT'}
              </Button>
            </div>
          </div>

          {/* Tamper Alert Details if Broken */}
          {!isSystemValid && report?.firstBrokenLink && (
            <div className="mt-5 p-4 bg-white border-2 border-[#D32F2F] text-[var(--ink)]">
              <div className="text-xs font-bold font-mono text-[#D32F2F] uppercase tracking-wider flex items-center gap-2">
                <Icons.AlertCircle size={16} />
                EXACT COMPROMISED RECORD ISOLATED (EXIT CHECK AUDIT)
              </div>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
                <div className="bg-red-50 p-3 border border-red-200">
                  <span className="text-gray-600 block">TAMPERED TABLE:</span>
                  <span className="font-bold text-red-700 text-sm">{report.firstBrokenLink.table}</span>
                </div>
                <div className="bg-red-50 p-3 border border-red-200">
                  <span className="text-gray-600 block">COMPROMISED RECORD ID:</span>
                  <span className="font-bold text-red-700 text-sm break-all">
                    {report.firstBrokenLink.brokenRowId}
                  </span>
                </div>
                <div className="bg-red-50 p-3 border border-red-200">
                  <span className="text-gray-600 block">CHAIN SEQUENCE INDEX:</span>
                  <span className="font-bold text-red-700 text-sm">
                    Row #{report.firstBrokenLink.brokenIndex + 1}
                  </span>
                </div>
                <div className="bg-red-50 p-3 border border-red-200">
                  <span className="text-gray-600 block">FAILURE REASON:</span>
                  <span className="font-bold text-red-700 text-sm">
                    {report.firstBrokenLink.failureReason}
                  </span>
                </div>
              </div>

              <div className="mt-3 p-3 bg-gray-50 border border-gray-200 text-xs font-mono space-y-1">
                <div>
                  <span className="font-bold text-gray-700">Expected Recomputed Hash:</span>{' '}
                  <span className="text-green-700 break-all">{report.firstBrokenLink.expectedHash}</span>
                </div>
                <div>
                  <span className="font-bold text-gray-700">Stored Database Hash:</span>{' '}
                  <span className="text-red-700 break-all">{report.firstBrokenLink.actualHash}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Chain Health Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Double-Entry Ledger Card */}
          <div className="bg-white border-2 border-[var(--ink)] p-5">
            <div className="flex justify-between items-start">
              <div>
                <div className="text-[10px] font-mono font-bold uppercase text-[var(--ink-60)]">
                  FINANCIAL LEDGER CHAIN
                </div>
                <h2 className="text-lg font-bold text-[var(--ink)] mt-1">Double-Entry Ledger</h2>
              </div>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 font-bold ${
                  report?.ledger.isValid
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                }`}
              >
                {report?.ledger.isValid ? 'UNBROKEN' : 'BROKEN'}
              </span>
            </div>
            <div className="mt-4 space-y-2 text-xs">
              <div className="flex justify-between border-b border-gray-100 pb-1">
                <span className="text-[var(--ink-60)]">Total Chained Entries:</span>
                <span className="font-mono font-bold">{report?.ledger.totalEntries || 0}</span>
              </div>
              <div className="flex justify-between border-b border-gray-100 pb-1">
                <span className="text-[var(--ink-60)]">Hash Formula:</span>
                <span className="font-mono text-[10px] text-gray-700">SHA-256(prev || canonical)</span>
              </div>
              <div className="flex justify-between border-b border-gray-100 pb-1">
                <span className="text-[var(--ink-60)]">DB Immutability:</span>
                <span className="font-bold text-green-700">UPDATE/DELETE Blocked</span>
              </div>
            </div>
          </div>

          {/* Attendance Muster Chain Card */}
          <div className="bg-white border-2 border-[var(--ink)] p-5">
            <div className="flex justify-between items-start">
              <div>
                <div className="text-[10px] font-mono font-bold uppercase text-[var(--ink-60)]">
                  MUSTER ATTENDANCE CHAIN
                </div>
                <h2 className="text-lg font-bold text-[var(--ink)] mt-1">Attendance Events</h2>
              </div>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 font-bold ${
                  report?.attendance.isValid
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                }`}
              >
                {report?.attendance.isValid ? 'UNBROKEN' : 'BROKEN'}
              </span>
            </div>
            <div className="mt-4 space-y-2 text-xs">
              <div className="flex justify-between border-b border-gray-100 pb-1">
                <span className="text-[var(--ink-60)]">Total Chained Events:</span>
                <span className="font-mono font-bold">{report?.attendance.totalEntries || 0}</span>
              </div>
              <div className="flex justify-between border-b border-gray-100 pb-1">
                <span className="text-[var(--ink-60)]">Hash Formula:</span>
                <span className="font-mono text-[10px] text-gray-700">SHA-256(prev || canonical)</span>
              </div>
              <div className="flex justify-between border-b border-gray-100 pb-1">
                <span className="text-[var(--ink-60)]">DB Immutability:</span>
                <span className="font-bold text-green-700">UPDATE/DELETE Blocked</span>
              </div>
            </div>
          </div>

          {/* Daily Merkle Anchors Card */}
          <div className="bg-white border-2 border-[var(--ink)] p-5">
            <div className="flex justify-between items-start">
              <div>
                <div className="text-[10px] font-mono font-bold uppercase text-[var(--ink-60)]">
                  MERKLE ROOT REGISTRY
                </div>
                <h2 className="text-lg font-bold text-[var(--ink)] mt-1">Append-Only Anchors</h2>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 font-bold bg-blue-100 text-blue-800">
                ACTIVE
              </span>
            </div>
            <div className="mt-4 space-y-2 text-xs">
              <div className="flex justify-between border-b border-gray-100 pb-1">
                <span className="text-[var(--ink-60)]">Total Daily Anchors:</span>
                <span className="font-mono font-bold">{report?.anchors.totalAnchorsCount || 0}</span>
              </div>
              <div className="flex justify-between border-b border-gray-100 pb-1">
                <span className="text-[var(--ink-60)]">External Registry:</span>
                <span className="font-bold text-[var(--register-blue)]">Transparency Log</span>
              </div>
              <div className="flex justify-between border-b border-gray-100 pb-1">
                <span className="text-[var(--ink-60)]">Table Protection:</span>
                <span className="font-bold text-green-700">Append-Only (SQL 27000)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Latest Merkle Anchor Details */}
        <div className="bg-white border-2 border-[var(--ink)] p-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-3 border-b border-[var(--ink-20)] gap-3">
            <div>
              <div className="text-[10px] font-mono font-bold uppercase text-[var(--register-blue)]">
                LATEST VERIFIED ANCHOR · दैनिक मेर्कल एंकर
              </div>
              <h2 className="text-base font-bold text-[var(--ink)] uppercase">
                Daily Merkle Root & Transparency Log
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleComputeAnchor}
                disabled={isAnchoring}
              >
                {isAnchoring ? 'ANCHORING...' : 'COMPUTE & PUBLISH ANCHOR'}
              </Button>
              <Link href="/api/audit/transparency-log" target="_blank">
                <Button variant="ghost" size="sm">
                  PUBLIC LOG ↗
                </Button>
              </Link>
            </div>
          </div>

          {anchorMessage && (
            <div className="mt-3 p-3 bg-green-50 border border-green-300 text-green-900 text-xs font-mono">
              ✓ {anchorMessage}
            </div>
          )}

          {report?.anchors.lastAnchor ? (
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 bg-gray-50 border border-gray-200">
                  <span className="text-gray-500 block text-[10px] font-mono">ANCHOR DATE:</span>
                  <span className="font-bold text-sm font-mono text-[var(--ink)]">
                    {report.anchors.lastAnchor.anchor_date}
                  </span>
                </div>
                <div className="p-3 bg-gray-50 border border-gray-200">
                  <span className="text-gray-500 block text-[10px] font-mono">LEDGER LEAVES:</span>
                  <span className="font-bold text-sm font-mono text-[var(--ink)]">
                    {report.anchors.lastAnchor.ledger_entries_count} entries
                  </span>
                </div>
                <div className="p-3 bg-gray-50 border border-gray-200">
                  <span className="text-gray-500 block text-[10px] font-mono">ATTENDANCE LEAVES:</span>
                  <span className="font-bold text-sm font-mono text-[var(--ink)]">
                    {report.anchors.lastAnchor.attendance_events_count} events
                  </span>
                </div>
                <div className="p-3 bg-gray-50 border border-gray-200">
                  <span className="text-gray-500 block text-[10px] font-mono">COMBINED LEAVES:</span>
                  <span className="font-bold text-sm font-mono text-[var(--ink)]">
                    {report.anchors.lastAnchor.combined_leaves_count} total
                  </span>
                </div>
              </div>

              <div className="p-3 bg-gray-50 border border-gray-200">
                <span className="text-gray-500 block text-[10px] font-mono">ROOT HASH (SHA-256):</span>
                <span className="font-bold font-mono text-xs text-[var(--ink)] break-all select-all">
                  {report.anchors.lastAnchor.merkle_root}
                </span>
              </div>

              {report.anchors.lastAnchor.external_publication_url && (
                <div className="p-3 bg-blue-50 border border-blue-200 text-xs">
                  <span className="text-blue-900 font-bold block mb-1">
                    Independently Verifiable Transparency Reference:
                  </span>
                  <a
                    href="/api/audit/transparency-log"
                    target="_blank"
                    className="font-mono text-[11px] text-[var(--register-blue)] hover:underline break-all"
                  >
                    {report.anchors.lastAnchor.external_publication_url}
                  </a>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-4 p-4 text-center text-xs text-gray-500 border border-dashed border-gray-300">
              No daily anchors computed yet. Click "COMPUTE & PUBLISH ANCHOR" to generate today&apos;s Merkle root.
            </div>
          )}
        </div>

        {/* HONESTY RULE DISCLOSURE (CRITICAL REQUIREMENT 6) */}
        <div className="bg-[#FFFDF5] border-2 border-[var(--site-yellow)] p-5">
          <div className="flex items-center gap-2 pb-2 border-b border-[var(--site-yellow)]">
            <Icons.ShieldCheck size={20} className="text-[#855B00]" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-[#694700]">
              Honesty Rule Disclosure: Scope & Boundaries of Tamper-Evidence
            </h2>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
            {/* What it proves */}
            <div className="space-y-2">
              <div className="font-bold text-[#1E7A4B] uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#1E7A4B]"></span>
                WHAT THIS CRYPTOGRAPHIC PROOF PROVES:
              </div>
              <ul className="space-y-2 text-[var(--ink)] list-disc pl-4">
                <li>
                  <strong>Detects after-the-fact edits:</strong> Any retroactive modification to amounts,
                  timestamps, worker IDs, or punch coordinates will instantly invalidate the SHA-256 hash chain.
                </li>
                <li>
                  <strong>Detects row deletions or insertions:</strong> Backdating an entry or removing a transaction
                  breaks the subsequent record&apos;s <code className="font-mono text-[11px] bg-yellow-100 px-1">prev_hash</code> pointer.
                </li>
                <li>
                  <strong>Pinpoints the exact compromised record:</strong> The verification algorithm isolates the
                  exact database row ID and index where data diverges from genesis.
                </li>
                <li>
                  <strong>Append-only database triggers:</strong> Database triggers block all <code className="font-mono text-[11px] bg-yellow-100 px-1">UPDATE</code> and <code className="font-mono text-[11px] bg-yellow-100 px-1">DELETE</code> queries
                  at the PostgreSQL engine level.
                </li>
              </ul>
            </div>

            {/* What it doesn't prove */}
            <div className="space-y-2">
              <div className="font-bold text-[#D32F2F] uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#D32F2F]"></span>
                WHAT THIS CRYPTOGRAPHIC PROOF DOES NOT PROVE:
              </div>
              <ul className="space-y-2 text-[var(--ink)] list-disc pl-4">
                <li>
                  <strong>Does NOT prove physical labor occurred:</strong> An intact hash chain proves the punch was
                  recorded as stated; it cannot prove physical work was performed on site.
                </li>
                <li>
                  <strong>Does NOT prevent initial supervisor collusion:</strong> If an authorized supervisor scans or
                  shares tokens with an absent worker off-site, the hash chain records that collusion faithfully.
                </li>
                <li>
                  <strong>Does NOT guarantee hardware GPS authenticity:</strong> While Haversine geofences and anti-fraud
                  heuristics flag suspicious coordinates, cryptographic chains guarantee <em>data integrity after capture</em>,
                  not <em>physical truth before capture</em>.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
