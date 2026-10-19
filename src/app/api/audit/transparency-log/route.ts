import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/audit/transparency-log
 *
 * Publicly verifiable transparency log of daily Merkle root anchors.
 * No authentication required: provides third-party verifiable proofs of ledger
 * and attendance state immutability.
 */
export async function GET(req: NextRequest) {
  try {
    const adminClient = createAdminClient();
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date');

    let query = adminClient
      .from('anchors')
      .select('anchor_date, merkle_root, ledger_entries_count, attendance_events_count, combined_leaves_count, ledger_start_hash, ledger_end_hash, attendance_start_hash, attendance_end_hash, external_publication_url, external_publication_proof, created_at')
      .order('anchor_date', { ascending: false });

    if (date) {
      query = query.eq('anchor_date', date);
    }

    const { data: anchors, error } = await query.limit(30);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      service: 'ShramikSetu Public Transparency Log',
      description: 'Append-only cryptographic Merkle roots of daily financial ledger and attendance events',
      canonicalDocumentation: 'https://shramiksetu.gov.in/docs/tamper-evidence',
      anchors: anchors || [],
      queriedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
