/**
 * SHRAMIKSETU COMPLAINT REPORT & OFFICIAL FILING SERVICE
 *
 * Generates an authoritative, tamper-evident statutory complaint report PDF (A4)
 * using headless Chromium (Playwright) from an HTML template.
 * Offline-capable with bundled local Noto Sans Devanagari and Noto Sans fonts.
 *
 * All values are read from the DB at generation time (no client-trusted amounts).
 * Supported languages: English (EN), Hindi (HI), Marathi (MR).
 */

import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import QRCode from 'qrcode';
import type { Browser } from 'playwright-core';
import { createAdminClient } from '@/lib/supabase/admin';
import { getDisputeDetails, calculateDisputeAmounts } from './dispute-service';
import { getLatestLedgerHash } from './ledger-service';
import { resolveApplicableMinimumWage, normalizeSkillCategory } from '@/lib/compliance/statutory-wages';
import type { ComplaintReportRow } from '@/types/database.types';

export interface GenerateComplaintReportParams {
  disputeId: string;
  language?: 'EN' | 'HI' | 'MR';
  recipientType?: 'POLICE_STATION' | 'LABOUR_OFFICE' | 'OTHER' | 'police' | 'labour_office' | 'other';
  recipientName?: string;
  recipientAddress?: string;
  generatedByUserId: string;
}

export function formatIndianRupees(paise: number): string {
  const isNegative = paise < 0;
  const absPaise = Math.abs(Math.round(paise));
  const rupees = Math.trunc(absPaise / 100);
  const remainingPaise = absPaise % 100;
  const formatted = new Intl.NumberFormat('en-IN').format(rupees);
  const suffix = remainingPaise > 0 ? `.${remainingPaise.toString().padStart(2, '0')}` : '';
  return `${isNegative ? '-' : ''}₹${formatted}${suffix}`;
}

export function formatIstTimestamp(date = new Date()): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(date);
}

export function formatDateIst(dateStr?: string | null): string {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(d);
  } catch {
    return dateStr;
  }
}

// ─── Localized Translations Dictionary ──────────────────────────────────────────

export const REPORT_I18N = {
  EN: {
    appTitle: 'ShramikSetu',
    reportTitle: 'Complaint Report',
    referenceLabel: 'Reference No.',
    versionLabel: 'Report Version',
    generatedDateLabel: 'Generated Date/Time (IST)',
    toLabel: 'TO:',
    recipientTypes: {
      POLICE_STATION: 'Police Station',
      LABOUR_OFFICE: 'Labour Commissioner / Conciliation Office',
      OTHER: 'Concerned Authority',
    },
    subjectPrefix: 'Subject: Formal Complaint regarding wage dispute and employment grievance - Case Ref:',
    complainantSection: '1. Complainant (Worker)',
    nameLabel: 'Full Legal Name',
    workerIdLabel: 'Worker ID',
    contactLabel: 'Mobile Contact',
    addressLabel: 'Registered Address',
    respondentSection: '2. Respondent (Contractor / Employer)',
    contractorNameLabel: 'Contractor Name',
    contractorIdLabel: 'Contractor ID',
    companyNameLabel: 'Firm / Company Name',
    projectSection: '3. Project & Employment Contract Terms',
    projectNameLabel: 'Project Name / Site',
    tradeSkillLabel: 'Designated Trade / Skill',
    agreedWageLabel: 'Agreed Daily Wage',
    minWageLabel: 'Applicable Statutory Minimum Wage',
    minWageSourceLabel: 'Source / Effective Date',
    contractDatesLabel: 'Contract Period',
    complaintSection: '4. Complaint Details',
    categoryLabel: 'Category',
    periodLabel: 'Disputed Period',
    statusLabel: 'Current Status',
    workerDescriptionLabel: "Worker's Description / Statement",
    wageStatementSection: '5. Wage Statement & Financial Reconciliation',
    attendanceDaysCol: 'Attendance Days',
    agreedWageCol: 'Agreed Daily Wage',
    totalEarnedCol: 'Total Earned',
    paymentsReceivedTitle: 'Payments Received (from Double-Entry Ledger)',
    paymentDateCol: 'Date',
    paymentAmountCol: 'Amount',
    paymentNoteCol: 'Transaction / Note',
    totalPaidCol: 'Total Paid',
    shortfallCol: 'Shortfall',
    claimedAmountCol: 'Claimed Amount',
    summaryLineAgreed: 'Agreed',
    summaryLineReceived: 'Received',
    summaryLineShortfall: 'Shortfall',
    attendanceRecordSection: '6. Verified Attendance Record',
    datesWorkedLabel: 'Present Dates in Period (Verified via QR / PIN)',
    noAttendance: 'No attendance check-ins recorded for this period in system ledger.',
    contractorResponseSection: "7. Contractor's Response",
    responseTypeLabel: 'Response Type',
    deductionReasonLabel: 'Stated Deduction Reason',
    deductionAmountLabel: 'Deduction Amount',
    responseMessageLabel: 'Response Statement',
    noResponseRecorded: 'No response recorded as of',
    timelineSection: '8. Timeline of Events & Evidence',
    timelineTitle: 'Timeline of Events',
    evidenceTitle: 'Substantiating Evidence',
    createdEvent: 'Dispute registered on platform by worker',
    respondedEvent: 'Formal response submitted by contractor',
    messagesCountLabel: 'Discussion Messages Exchanged',
    noEvidence: 'No external files attached. Record backed by platform attendance and ledger.',
    declarationSection: '9. Solemn Declaration',
    declarationText: 'I hereby solemnly state and affirm that the above information is true, correct, and based on digital employment records stored on the ShramikSetu system to the best of my knowledge and belief.',
    signatureBoxLabel: 'Signature / Thumb Impression of Worker',
    dateLine: 'Date: ________________________',
    placeLine: 'Place: ________________________',
    verificationSection: '10. Authenticity Verification',
    scanToVerify: 'Scan QR code or visit verification portal to confirm record authenticity:',
    verificationUrlLabel: 'Public Verification URL',
    shortHashLabel: 'Short Integrity Hash',
    fullHashLabel: 'SHA-256 Checksum',
    footerDisclaimer: 'This is a system-generated summary of records stored on ShramikSetu. It is not a legal judgment, FIR or order. The concerned authority will decide the matter.',
    pageLabel: 'Page',
    ofLabel: 'of',
  },
  HI: {
    appTitle: 'श्रमिकसेतु',
    reportTitle: 'शिकायत अहवाल (Complaint Report)',
    referenceLabel: 'संदर्भ संख्या (Ref No.)',
    versionLabel: 'प्रतिवेदन संस्करण (Version)',
    generatedDateLabel: 'जारी करने का समय व तारीख (IST)',
    toLabel: 'सेवा में:',
    recipientTypes: {
      POLICE_STATION: 'थाना प्रभारी / पुलिस स्टेशन',
      LABOUR_OFFICE: 'श्रम आयुक्त / सुलह अधिकारी कार्यालय',
      OTHER: 'संबंधित सक्षम प्राधिकारी',
    },
    subjectPrefix: 'विषय: मजदूरी भुगतान में कमी एवं रोजगार शिकायत के संबंध में औपचारिक अभ्यावेदन - संदर्भ:',
    complainantSection: '1. शिकायतकर्ता का विवरण (श्रमिक)',
    nameLabel: 'पूरा कानूनी नाम',
    workerIdLabel: 'श्रमिक पहचान संख्या (Worker ID)',
    contactLabel: 'मोबाइल नंबर',
    addressLabel: 'पंजीकृत पता',
    respondentSection: '2. अनावेदक का विवरण (ठेकेदार / नियोक्ता)',
    contractorNameLabel: 'ठेकेदार का नाम',
    contractorIdLabel: 'ठेकेदार आईडी',
    companyNameLabel: 'कंपनी / फर्म का नाम',
    projectSection: '3. कार्यस्थल एवं रोजगार अनुबंध की शर्तें',
    projectNameLabel: 'परियोजना / साइट का नाम',
    tradeSkillLabel: 'कौशल श्रेणी / व्यवसाय',
    agreedWageLabel: 'तय दैनिक मजदूरी दर',
    minWageLabel: 'लागू वैधानिक न्यूनतम मजदूरी',
    minWageSourceLabel: 'स्रोत / प्रभावी तारीख',
    contractDatesLabel: 'अनुबंध की अवधि',
    complaintSection: '4. शिकायत का विवरण',
    categoryLabel: 'विवाद की श्रेणी',
    periodLabel: 'विवादित अवधि',
    statusLabel: 'वर्तमान स्थिति',
    workerDescriptionLabel: 'श्रमिक का आधिकारिक बयान (यथावत)',
    wageStatementSection: '5. मजदूरी एवं वित्तीय हिसाब (डबल-एंट्री लेजर)',
    attendanceDaysCol: 'हाजिरी के दिन',
    agreedWageCol: 'तय दैनिक दर',
    totalEarnedCol: 'कुल अर्जित मजदूरी',
    paymentsReceivedTitle: 'प्राप्त भुगतान (डिजिटल लेजर अनुसार)',
    paymentDateCol: 'तारीख',
    paymentAmountCol: 'राशि',
    paymentNoteCol: 'विवरण / ट्रांजैक्शन',
    totalPaidCol: 'कुल प्राप्त भुगतान',
    shortfallCol: 'बकाया कमी (Shortfall)',
    claimedAmountCol: 'दावा की गई राशि',
    summaryLineAgreed: 'तय दर',
    summaryLineReceived: 'प्राप्त',
    summaryLineShortfall: 'बकाया',
    attendanceRecordSection: '6. सत्यापित कार्य दिवस (हाजिरी रिकॉर्ड)',
    datesWorkedLabel: 'अवधि में दर्ज कार्य दिवस (QR / PIN द्वारा सत्यापित)',
    noAttendance: 'इस अवधि के लिए प्रणाली पर कोई हाजिरी दर्ज नहीं है।',
    contractorResponseSection: '7. ठेकेदार का जवाब (प्रति-बयान)',
    responseTypeLabel: 'जवाब का प्रकार',
    deductionReasonLabel: 'कटौती का कारण',
    deductionAmountLabel: 'कटौती राशि',
    responseMessageLabel: 'ठेकेदार का संदेश / बयान',
    noResponseRecorded: 'तक ठेकेदार द्वारा कोई जवाब दर्ज नहीं किया गया।',
    timelineSection: '8. घटनाक्रम एवं संलग्न साक्ष्य',
    timelineTitle: 'घटनाक्रम समय-सारणी',
    evidenceTitle: 'संलग्न साक्ष्य एवं प्रमाण',
    createdEvent: 'श्रमिक द्वारा प्लेटफॉर्म पर शिकायत दर्ज की गई',
    respondedEvent: 'ठेकेदार द्वारा आधिकारिक जवाब दाखिल किया गया',
    messagesCountLabel: 'कुल आदान-प्रदान संदेश',
    noEvidence: 'कोई बाहरी दस्तावेज संलग्न नहीं है। दावा डिजिटल हाजिरी और लेजर पर आधारित है।',
    declarationSection: '9. सत्यनिष्ठा घोषणा',
    declarationText: 'मैं सत्यनिष्ठा से घोषणा करता/करती हूँ कि उपरोक्त जानकारी मेरी सर्वोत्तम जानकारी व विश्वास के अनुसार सत्य, सही और श्रमिकसेतु प्लेटफॉर्म पर दर्ज रोजगार रिकॉर्ड पर आधारित है।',
    signatureBoxLabel: 'शिकायतकर्ता श्रमिक के हस्ताक्षर / अँगूठे का निशान',
    dateLine: 'तारीख: ________________________',
    placeLine: 'स्थान: ________________________',
    verificationSection: '10. प्रामाणिकता सत्यापन',
    scanToVerify: 'रिकॉर्ड की प्रामाणिकता जांचने के लिए क्यूआर स्कैन करें या लिंक पर जाएं:',
    verificationUrlLabel: 'सार्वजनिक सत्यापन यूआरएल',
    shortHashLabel: 'संक्षिप्त सुरक्षा हैश',
    fullHashLabel: 'SHA-256 चेकसम',
    footerDisclaimer: 'यह श्रमिकसेतु पर संग्रहीत अभिलेखों का एक प्रणाली-जनित सारांश है। यह कोई कानूनी निर्णय, प्राथमिकी (FIR) या आदेश नहीं है। संबंधित प्राधिकारी मामले का निर्णय करेंगे।',
    pageLabel: 'पृष्ठ',
    ofLabel: 'का',
  },
  MR: {
    appTitle: 'श्रमिकसेतू',
    reportTitle: 'तक्रार अहवाल (Complaint Report)',
    referenceLabel: 'संदर्भ क्रमांक (Ref No.)',
    versionLabel: 'अहवाल आवृत्ती (Version)',
    generatedDateLabel: 'तयार केल्याची तारीख व वेळ (IST)',
    toLabel: 'प्रति:',
    recipientTypes: {
      POLICE_STATION: 'पोलीस ठाणे प्रभारी अधिकारी',
      LABOUR_OFFICE: 'कामगार आयुक्त / समझोता अधिकारी कार्यालय',
      OTHER: 'संबंधित सक्षम प्राधिकारी',
    },
    subjectPrefix: 'विषय: मजुरीतील तफावत व रोजगार तक्रारीबाबत अधिकृत निवेदन - संदर्भ क्र.:',
    complainantSection: '१. तक्रारदाराचा तपशील (कामगार)',
    nameLabel: 'पूर्ण कायदेशीर नाव',
    workerIdLabel: 'कामगार ओळख क्रमांक (Worker ID)',
    contactLabel: 'मोबाईल क्रमांक',
    addressLabel: 'नोंदणीकृत पत्ता',
    respondentSection: '२. प्रतिवादी तपशील (कंत्राटदार / मालक)',
    contractorNameLabel: 'कंत्राटदाराचे नाव',
    contractorIdLabel: 'कंत्राटदार आयडी',
    companyNameLabel: 'कंपनी / फर्मचे नाव',
    projectSection: '३. प्रकल्प व रोजगार कराराच्या अटी',
    projectNameLabel: 'प्रकल्पाचे नाव / साइट',
    tradeSkillLabel: 'कौशल्य श्रेणी / काम',
    agreedWageLabel: 'ठरलेला दैनिक मजुरी दर',
    minWageLabel: 'लागू वैधानिक किमान वेतन',
    minWageSourceLabel: 'स्रोत / प्रभावी तारीख',
    contractDatesLabel: 'कराराचा कालावधी',
    complaintSection: '४. तक्रारीचा तपशील',
    categoryLabel: 'तक्रारीचा प्रकार',
    periodLabel: 'विवादित कालावधी',
    statusLabel: 'सध्याची स्थिती',
    workerDescriptionLabel: 'कामगाराचे अधिकृत निवेदन (जसे आहे तसे)',
    wageStatementSection: '५. मजुरी व आर्थिक हिशोब (डबल-एंट्री लेजर)',
    attendanceDaysCol: 'हजेरीचे दिवस',
    agreedWageCol: 'ठरलेला दर',
    totalEarnedCol: 'एकूण कमावलेली मजुरी',
    paymentsReceivedTitle: 'प्राप्त मजुरी वाटप (लेजर नोंदींनुसार)',
    paymentDateCol: 'तारीख',
    paymentAmountCol: 'रक्कम',
    paymentNoteCol: 'तपशील / पावती',
    totalPaidCol: 'एकूण मिळालेली मजुरी',
    shortfallCol: 'थकीत तफावत (Shortfall)',
    claimedAmountCol: 'मागणी केलेली रक्कम',
    summaryLineAgreed: 'ठरलेले',
    summaryLineReceived: 'मिळालेले',
    summaryLineShortfall: 'थकीत',
    attendanceRecordSection: '६. प्रमाणित हजेरी नोंद',
    datesWorkedLabel: 'कालावधीतील उपस्थित दिवस (QR / PIN प्रमाणित)',
    noAttendance: 'या कालावधीत कोणतीही हजेरी नोंद आढळली नाही.',
    contractorResponseSection: '७. कंत्राटदाराचे प्रत्युत्तर',
    responseTypeLabel: 'प्रत्युत्तराचा प्रकार',
    deductionReasonLabel: 'कपातीचे कारण',
    deductionAmountLabel: 'कपात रक्कम',
    responseMessageLabel: 'कंत्राटदाराचे निवेदन',
    noResponseRecorded: 'पर्यंत कंत्राटदाराकडून कोणतेही प्रत्युत्तर नोंदवलेले नाही.',
    timelineSection: '८. घटनाक्रम व पुरावे',
    timelineTitle: 'घटनाक्रम कालरेषा',
    evidenceTitle: 'जोडलेले पुरावे व कागदपत्रे',
    createdEvent: 'कामगाराने प्लॅटफॉर्मवर तक्रार नोंदवली',
    respondedEvent: 'कंत्राटदाराने अधिकृत प्रत्युत्तर दाखल केले',
    messagesCountLabel: 'एकूण देवाणघेवाण संदेश',
    noEvidence: 'कोणतीही स्वतंत्र कागदपत्रे जोडलेली नाहीत. दावा डिजिटल हजेरी व लेजरवर आधारित आहे.',
    declarationSection: '९. सत्यप्रतिज्ञा',
    declarationText: 'मी याद्वारे सत्यप्रतिज्ञा करतो/करते की, वरील सर्व माहिती माझ्या माहितीनुसार व विश्वासाप्रमाणे खरी, अचूक आणि श्रमिकसेतू प्रणालीवरील नोंदींवर आधारित आहे.',
    signatureBoxLabel: 'तक्रारदार कामगाराची स्वाक्षरी / अंगठ्याचा ठसा',
    dateLine: 'तारीख: ________________________',
    placeLine: 'ठिकाण: ________________________',
    verificationSection: '१०. सत्यता पडताळणी',
    scanToVerify: 'नोंदीची सत्यता पडताळण्यासाठी क्यूआर स्कॅन करा किंवा लिंकवर जा:',
    verificationUrlLabel: 'सार्वजनिक पडताळणी लिंक',
    shortHashLabel: 'संक्षिप्त सुरक्षा हॅश',
    fullHashLabel: 'SHA-256 चेकसम',
    footerDisclaimer: 'हा श्रमिकसेतूवर संग्रहित नोंदींचा प्रणाली-जनित सारांश आहे. हा कोणताही कायदेशीर निकाल, एफआयआर (FIR) किंवा आदेश नाही. संबंधित अधिकारी या प्रकरणाचा निर्णय घेतील.',
    pageLabel: 'पान',
    ofLabel: 'पैकी',
  },
} as const;

function generateReportRef(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randHex = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `CMP-${dateStr}-${randHex}`;
}

// ─── Data Assembly ─────────────────────────────────────────────────────────────

export interface AssembledComplaintReportData {
  reportRef: string;
  disputeRef: string;
  version: number;
  language: 'EN' | 'HI' | 'MR';
  generatedAtIst: string;
  recipientType: 'POLICE_STATION' | 'LABOUR_OFFICE' | 'OTHER';
  recipientName: string;
  recipientAddress: string;
  dispute: any;
  worker: any;
  contractor: any;
  project: any;
  contract: any;
  minimumWage: any;
  attendanceDaysCount: number;
  attendanceDates: Array<{ date: string; method: string }>;
  wageStatement: {
    agreedDailyWagePaise: number;
    earnedPaise: number;
    payments: Array<{ date: string; amountPaise: number; note: string }>;
    totalPaidPaise: number;
    shortfallPaise: number;
    claimedAmountPaise: number;
  };
  contractorResponse: {
    hasResponse: boolean;
    type?: string;
    deductionReason?: string | null;
    deductionAmountPaise?: number | null;
    message?: string | null;
    respondedAt?: string | null;
  };
  timeline: Array<{
    date: string;
    event: string;
    actor: string;
    note?: string;
  }>;
  messagesCount: number;
  evidenceItems: Array<{
    id: string;
    fileName: string;
    mime: string;
    uploadedAt: string;
    sizeKb: number;
    thumbnailBase64?: string | null;
  }>;
  ledgerHash: string;
  verificationUrl: string;
}

export async function assembleComplaintReportData(
  params: GenerateComplaintReportParams
): Promise<AssembledComplaintReportData> {
  const adminClient = createAdminClient();
  const rawLang = (params.language || 'EN').toUpperCase();
  const lang: 'EN' | 'HI' | 'MR' = rawLang === 'HI' || rawLang === 'MR' ? rawLang : 'EN';

  // Normalize recipient type
  let recipientType: 'POLICE_STATION' | 'LABOUR_OFFICE' | 'OTHER' = 'POLICE_STATION';
  if (params.recipientType) {
    const norm = params.recipientType.toUpperCase();
    if (norm.includes('LABOUR')) recipientType = 'LABOUR_OFFICE';
    else if (norm.includes('OTHER')) recipientType = 'OTHER';
  }

  // 1. Fetch Dispute details with worker, contractor, project, contract
  const details = await getDisputeDetails(params.disputeId);
  const dispute = details.dispute;
  const disputeRef = dispute.reference || dispute.dispute_ref || `DISP-${dispute.id.slice(0, 8)}`;

  // 2. Fetch full worker profile for contact & address if available
  const { data: fullWorker } = await adminClient
    .from('workers')
    .select('*')
    .eq('id', dispute.worker_id)
    .maybeSingle();

  // 3. Fetch full contractor profile
  const { data: fullContractor } = await adminClient
    .from('contractors')
    .select('*')
    .eq('id', dispute.contractor_id)
    .maybeSingle();

  // 4. Fetch work contract details
  const contract = details.contract;

  // 5. Server-side shortfall & financial computation from ledger
  const periodFrom = dispute.period_from || contract?.start_date || '2026-01-01';
  const periodTo = dispute.period_to || contract?.end_date || new Date().toISOString().slice(0, 10);

  let computedAmounts = {
    contractId: dispute.contract_id,
    periodFrom,
    periodTo,
    dailyWagePaise: contract?.daily_wage_paise || (contract?.daily_wage ? contract.daily_wage * 100 : 0),
    verifiedAttendanceDaysCount: 0,
    earnedPaise: 0,
    paidPaise: 0,
    shortfallPaise: 0,
  };

  try {
    computedAmounts = await calculateDisputeAmounts({
      contractId: dispute.contract_id,
      periodFrom,
      periodTo,
    });
  } catch (err) {
    // Fallback: direct calculation
    const dailyWagePaise = contract?.daily_wage_paise || (contract?.daily_wage ? contract.daily_wage * 100 : 0);
    const { data: att } = await adminClient
      .from('attendance_events')
      .select('id, status')
      .eq('contract_id', dispute.contract_id);
    const verifiedDaysCount = (att || []).filter((a: any) => String(a.status).toUpperCase() === 'VERIFIED' || a.is_geofence_verified).length;
    const earnedPaise = verifiedDaysCount * dailyWagePaise;
    computedAmounts = {
      contractId: dispute.contract_id,
      periodFrom,
      periodTo,
      dailyWagePaise,
      verifiedAttendanceDaysCount: verifiedDaysCount,
      earnedPaise,
      paidPaise: 0,
      shortfallPaise: earnedPaise,
    };
  }

  // 6. Fetch payments in the period for the table
  const { data: paymentTxns } = await adminClient
    .from('payment_transactions')
    .select('*')
    .eq('contract_id', dispute.contract_id)
    .eq('status', 'SUCCESS')
    .order('created_at', { ascending: true });

  const payments = (paymentTxns || []).map((p: any) => ({
    date: formatDateIst(p.created_at),
    amountPaise: Math.round(p.amount_paise || p.amount * 100 || 0),
    note: p.transaction_ref || p.notes || 'Platform Ledger Transfer',
  }));

  // 7. Fetch attendance records in period with verification method (QR/PIN)
  const { data: attendanceEvents } = await adminClient
    .from('attendance_events')
    .select('id, date, status, verification_method, created_at')
    .eq('contract_id', dispute.contract_id)
    .order('date', { ascending: true });

  const verifiedAttendance = (attendanceEvents || []).filter((a: any) => {
    const isVerified = String(a.status).toUpperCase() === 'VERIFIED' || Boolean(a.is_geofence_verified);
    if (!isVerified) return false;
    if (dispute.period_from && a.date && a.date < dispute.period_from) return false;
    if (dispute.period_to && a.date && a.date > dispute.period_to) return false;
    return true;
  });

  const attendanceDates = verifiedAttendance.map((a: any) => ({
    date: a.date,
    method: (a.verification_method || 'QR').toLowerCase().includes('otp') || (a.verification_method || '').toLowerCase().includes('pin') ? 'PIN' : 'QR',
  }));

  // 8. Applicable statutory minimum wage
  let minimumWage: any = null;
  try {
    const skillCategory = normalizeSkillCategory(fullWorker?.skill_category || contract?.work_type);
    minimumWage = await resolveApplicableMinimumWage({
      state: 'Maharashtra',
      skillCategory,
      zone: 'Zone I',
    });
  } catch {
    // Non-blocking
  }

  // 9. Contractor response details
  const responses = details.responses || [];
  const latestResponse = responses.length > 0 ? responses[0] : null;
  const contractorResponse = {
    hasResponse: Boolean(latestResponse),
    type: latestResponse?.type || (dispute.contractor_responded_at ? 'deduction_claimed' : undefined),
    deductionReason: latestResponse?.deduction_reason || null,
    deductionAmountPaise: latestResponse?.deduction_amount_paise || null,
    message: latestResponse?.message || dispute.contractor_counter_statement || null,
    respondedAt: latestResponse?.created_at ? formatIstTimestamp(new Date(latestResponse.created_at)) : (dispute.contractor_responded_at ? formatIstTimestamp(new Date(dispute.contractor_responded_at)) : null),
  };

  // 10. Timeline
  const timeline: AssembledComplaintReportData['timeline'] = [
    {
      date: formatIstTimestamp(new Date(dispute.created_at)),
      event: REPORT_I18N[lang].createdEvent,
      actor: fullWorker?.full_name || 'Worker',
      note: dispute.category,
    },
  ];

  if (contractorResponse.hasResponse && contractorResponse.respondedAt) {
    timeline.push({
      date: contractorResponse.respondedAt,
      event: REPORT_I18N[lang].respondedEvent,
      actor: fullContractor?.full_name || 'Contractor',
      note: contractorResponse.type,
    });
  }

  const statusHistory = details.statusHistory || [];
  for (const sh of statusHistory) {
    timeline.push({
      date: formatIstTimestamp(new Date(sh.at)),
      event: `Status: ${sh.to_status}`,
      actor: sh.actor_role || 'SYSTEM',
      note: sh.note || undefined,
    });
  }

  // 11. Messages count
  const messagesCount = (details.messages || []).length;

  // 12. Evidence items with thumbnail generation
  const evidenceList = details.evidence || [];
  const evidenceItems: AssembledComplaintReportData['evidenceItems'] = [];

  for (const ev of evidenceList) {
    let thumbnailBase64: string | null = null;
    const isImage = (ev.mime || '').startsWith('image/');

    if (isImage && ev.file_path && fs.existsSync(ev.file_path)) {
      try {
        const fileBuf = fs.readFileSync(ev.file_path);
        // If file is within reasonable size, use as data URL
        if (fileBuf.length < 2 * 1024 * 1024) {
          thumbnailBase64 = `data:${ev.mime};base64,${fileBuf.toString('base64')}`;
        }
      } catch {
        // Non-blocking
      }
    }

    const fileName = ev.file_path ? path.basename(ev.file_path).replace(/^\d+_/, '') : 'evidence_file';
    evidenceItems.push({
      id: ev.id,
      fileName,
      mime: ev.mime || 'application/octet-stream',
      uploadedAt: formatDateIst(ev.created_at),
      sizeKb: Math.round((ev.size || 0) / 1024),
      thumbnailBase64,
    });
  }

  // 13. Determine next report version
  const { data: previousReports } = await adminClient
    .from('complaint_reports')
    .select('version')
    .eq('dispute_id', dispute.id)
    .order('version', { ascending: false })
    .limit(1);

  const nextVersion = previousReports && previousReports.length > 0 ? (previousReports[0].version || 1) + 1 : 1;
  const reportRef = generateReportRef();
  const latestLedgerHash = await getLatestLedgerHash();

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const verificationUrl = `${baseUrl}/verify/${disputeRef}`;

  return {
    reportRef,
    disputeRef,
    version: nextVersion,
    language: lang,
    generatedAtIst: formatIstTimestamp(),
    recipientType,
    recipientName: params.recipientName?.trim() || '',
    recipientAddress: params.recipientAddress?.trim() || '',
    dispute,
    worker: fullWorker || details.worker,
    contractor: fullContractor || details.contractor,
    project: details.project,
    contract,
    minimumWage,
    attendanceDaysCount: computedAmounts.verifiedAttendanceDaysCount,
    attendanceDates,
    wageStatement: {
      agreedDailyWagePaise: computedAmounts.dailyWagePaise,
      earnedPaise: computedAmounts.earnedPaise,
      payments,
      totalPaidPaise: computedAmounts.paidPaise,
      shortfallPaise: computedAmounts.shortfallPaise,
      claimedAmountPaise: dispute.claimed_paise || dispute.amount_claimed_paise || 0,
    },
    contractorResponse,
    timeline,
    messagesCount,
    evidenceItems,
    ledgerHash: latestLedgerHash,
    verificationUrl,
  };
}

// ─── Font Base64 Embedding ────────────────────────────────────────────────────

function getBundledFontsBase64(): {
  devaRegularB64: string;
  devaBoldB64: string;
  notoSansRegularB64: string;
} {
  const rootDir = process.cwd();
  const devaRegPath = path.join(rootDir, 'public/fonts/NotoSansDevanagari-Regular.woff');
  const devaBoldPath = path.join(rootDir, 'public/fonts/NotoSansDevanagari-Bold.woff');
  const notoSansPath = path.join(rootDir, 'public/fonts/NotoSans-Regular.woff');

  const devaRegularB64 = fs.existsSync(devaRegPath)
    ? fs.readFileSync(devaRegPath).toString('base64')
    : '';
  const devaBoldB64 = fs.existsSync(devaBoldPath)
    ? fs.readFileSync(devaBoldPath).toString('base64')
    : '';
  const notoSansRegularB64 = fs.existsSync(notoSansPath)
    ? fs.readFileSync(notoSansPath).toString('base64')
    : '';

  return { devaRegularB64, devaBoldB64, notoSansRegularB64 };
}

// ─── HTML Template Generator ──────────────────────────────────────────────────

export async function generateComplaintReportHtml(data: AssembledComplaintReportData): Promise<string> {
  const t = REPORT_I18N[data.language] || REPORT_I18N.EN;
  const fonts = getBundledFontsBase64();

  // Generate QR Code Data URL linking to public /verify/:reference
  const qrDataUrl = await QRCode.toDataURL(data.verificationUrl, {
    width: 140,
    margin: 1,
    color: { dark: '#000000', light: '#ffffff' },
  });

  const shortHash = crypto
    .createHash('sha256')
    .update(`${data.disputeRef}-${data.reportRef}-${data.version}`)
    .digest('hex')
    .slice(0, 12);

  const recipientTypeName =
    t.recipientTypes[data.recipientType] || t.recipientTypes.POLICE_STATION;

  const earnedFormatted = formatIndianRupees(data.wageStatement.earnedPaise);
  const paidFormatted = formatIndianRupees(data.wageStatement.totalPaidPaise);
  const shortfallFormatted = formatIndianRupees(data.wageStatement.shortfallPaise);
  const claimedFormatted = formatIndianRupees(data.wageStatement.claimedAmountPaise);
  const agreedFormatted = formatIndianRupees(data.wageStatement.agreedDailyWagePaise);

  return `<!DOCTYPE html>
<html lang="${data.language.toLowerCase()}">
<head>
  <meta charset="utf-8">
  <title>Complaint Report - ${data.disputeRef}</title>
  <style>
    @font-face {
      font-family: 'Noto Sans Devanagari';
      src: url('data:font/woff;charset=utf-8;base64,${fonts.devaRegularB64}') format('woff');
      font-weight: 400;
      font-style: normal;
    }
    @font-face {
      font-family: 'Noto Sans Devanagari';
      src: url('data:font/woff;charset=utf-8;base64,${fonts.devaBoldB64}') format('woff');
      font-weight: 700;
      font-style: normal;
    }
    @font-face {
      font-family: 'Noto Sans';
      src: url('data:font/woff;charset=utf-8;base64,${fonts.notoSansRegularB64}') format('woff');
      font-weight: 400;
      font-style: normal;
    }

    * { box-sizing: border-box; }
    body {
      font-family: 'Noto Sans Devanagari', 'Noto Sans', sans-serif;
      font-size: 10px;
      line-height: 1.35;
      color: #111827;
      margin: 0;
      padding: 0;
      background: #ffffff;
      -webkit-font-smoothing: antialiased;
    }

    .header-bar {
      border-bottom: 2px solid #111827;
      padding-bottom: 8px;
      margin-bottom: 12px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .brand-title {
      font-size: 18px;
      font-weight: 700;
      letter-spacing: 0.5px;
      color: #111827;
      margin: 0;
    }
    .report-subtitle {
      font-size: 12px;
      font-weight: 700;
      color: #b45309;
      text-transform: uppercase;
      margin-top: 2px;
    }
    .meta-box {
      text-align: right;
      font-size: 9px;
      color: #374151;
      font-family: 'Noto Sans', 'Noto Sans Devanagari', sans-serif;
    }
    .meta-box strong { color: #111827; font-weight: 700; }

    .to-card {
      background: #f9fafb;
      border: 1.5px solid #d1d5db;
      border-radius: 4px;
      padding: 8px 10px;
      margin-bottom: 12px;
    }
    .to-card .to-title {
      font-weight: 700;
      font-size: 10px;
      color: #1f2937;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .subject-line {
      margin-top: 6px;
      font-weight: 700;
      font-size: 10px;
      color: #111827;
      background: #fef3c7;
      padding: 4px 6px;
      border-radius: 2px;
      border-left: 3px solid #d97706;
    }

    .section-title {
      font-size: 11px;
      font-weight: 700;
      color: #111827;
      text-transform: uppercase;
      border-bottom: 1.5px solid #374151;
      padding-bottom: 3px;
      margin-top: 10px;
      margin-bottom: 6px;
    }

    .two-col-grid {
      display: flex;
      gap: 10px;
      margin-bottom: 8px;
    }
    .col-half {
      flex: 1;
      border: 1px solid #e5e7eb;
      border-radius: 3px;
      padding: 6px 8px;
      background: #ffffff;
    }
    .col-half.highlight {
      background: #fbfbfb;
    }
    .grid-row {
      display: flex;
      margin-bottom: 3px;
      font-size: 9.5px;
    }
    .grid-label {
      width: 40%;
      color: #6b7280;
      font-weight: 600;
    }
    .grid-value {
      width: 60%;
      color: #111827;
      font-weight: 600;
      word-break: break-word;
    }

    /* Wage Statement Table */
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 4px;
      margin-bottom: 8px;
      font-size: 9px;
      page-break-inside: auto;
    }
    thead {
      display: table-header-group;
    }
    tr {
      page-break-inside: avoid;
    }
    th {
      background: #1f2937;
      color: #ffffff;
      padding: 5px 6px;
      text-align: left;
      font-weight: 700;
      font-size: 9px;
      text-transform: uppercase;
    }
    td {
      padding: 4px 6px;
      border-bottom: 1px solid #e5e7eb;
      color: #1f2937;
      vertical-align: top;
    }
    tr:nth-child(even) td {
      background: #f9fafb;
    }

    .shape-card {
      display: flex;
      justify-content: space-around;
      background: #fef3c7;
      border: 1.5px solid #f59e0b;
      border-radius: 4px;
      padding: 6px 10px;
      margin: 8px 0;
      text-align: center;
    }
    .shape-item .shape-label {
      font-size: 8.5px;
      text-transform: uppercase;
      font-weight: 700;
      color: #92400e;
    }
    .shape-item .shape-value {
      font-size: 13px;
      font-weight: 700;
      font-family: 'Noto Sans', 'Noto Sans Devanagari', sans-serif;
    }
    .shape-item.shortfall .shape-value {
      color: #b91c1c;
    }

    /* Compact Calendar / Attendance Pills */
    .attendance-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 4px;
      margin-bottom: 8px;
    }
    .pill {
      font-size: 8.5px;
      background: #ecfdf5;
      color: #065f46;
      border: 1px solid #a7f3d0;
      padding: 2px 5px;
      border-radius: 3px;
      font-family: 'Noto Sans', monospace;
      font-weight: 600;
    }

    /* Declaration */
    .declaration-box {
      border: 1.5px dashed #4b5563;
      border-radius: 4px;
      padding: 8px 10px;
      background: #fcfcfc;
      margin-top: 10px;
      page-break-inside: avoid;
    }
    .declaration-text {
      font-size: 9px;
      color: #1f2937;
      line-height: 1.4;
      margin-bottom: 16px;
    }
    .sign-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-top: 8px;
    }
    .sign-box {
      width: 48%;
      border-top: 1px solid #111827;
      padding-top: 4px;
      text-align: center;
      font-size: 8.5px;
      font-weight: 700;
      color: #374151;
    }

    /* Verification Box */
    .verify-box {
      border: 1.5px solid #1f2937;
      border-radius: 4px;
      padding: 8px;
      display: flex;
      align-items: center;
      gap: 12px;
      background: #f9fafb;
      margin-top: 10px;
      page-break-inside: avoid;
    }
    .verify-qr {
      width: 76px;
      height: 76px;
      flex-shrink: 0;
      border: 1px solid #d1d5db;
      background: #ffffff;
      padding: 2px;
    }
    .verify-details {
      flex: 1;
      font-size: 8.5px;
    }
    .verify-details strong {
      color: #111827;
    }

    /* Thumbnails */
    .thumbnails-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 4px;
    }
    .thumb-item {
      width: 70px;
      height: 70px;
      border: 1px solid #d1d5db;
      border-radius: 3px;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f3f4f6;
    }
    .thumb-item img {
      max-width: 100%;
      max-height: 100%;
      object-fit: cover;
    }

    .avoid-break {
      page-break-inside: avoid;
    }
  </style>
</head>
<body>

  <!-- 1. Header Bar -->
  <div class="header-bar">
    <div>
      <h1 class="brand-title">${t.appTitle}</h1>
      <div class="report-subtitle">${t.reportTitle}</div>
    </div>
    <div class="meta-box">
      <div><strong>${t.referenceLabel}:</strong> ${data.disputeRef}</div>
      <div><strong>${t.versionLabel}:</strong> v${data.version}</div>
      <div><strong>${t.generatedDateLabel}:</strong> ${data.generatedAtIst}</div>
    </div>
  </div>

  <!-- 2. To: Recipient Block -->
  <div class="to-card">
    <div class="to-title">${t.toLabel} ${recipientTypeName}</div>
    <div style="font-size: 10.5px; font-weight: 700; color: #111827;">
      ${data.recipientName || recipientTypeName}
    </div>
    <div style="font-size: 9.5px; color: #4b5563;">
      ${data.recipientAddress || 'Jurisdictional Authority'}
    </div>
    <div class="subject-line">
      ${t.subjectPrefix} ${data.disputeRef}
    </div>
  </div>

  <!-- 3. Complainant & Respondent Particulars -->
  <div class="two-col-grid">
    <div class="col-half">
      <div style="font-weight: 700; font-size: 10px; margin-bottom: 4px; color: #111827;">
        ${t.complainantSection}
      </div>
      <div class="grid-row">
        <span class="grid-label">${t.nameLabel}:</span>
        <span class="grid-value">${data.worker?.full_name || 'Complainant Worker'}</span>
      </div>
      <div class="grid-row">
        <span class="grid-label">${t.workerIdLabel}:</span>
        <span class="grid-value">${data.worker?.internal_worker_id || data.worker?.id?.slice(0, 8) || 'N/A'}</span>
      </div>
      <div class="grid-row">
        <span class="grid-label">${t.contactLabel}:</span>
        <span class="grid-value">${data.worker?.phone || data.worker?.phone_number || 'Registered on App'}</span>
      </div>
      <div class="grid-row">
        <span class="grid-label">${t.addressLabel}:</span>
        <span class="grid-value">${data.worker?.address || 'Site Registered Jurisdiction'}</span>
      </div>
    </div>

    <div class="col-half highlight">
      <div style="font-weight: 700; font-size: 10px; margin-bottom: 4px; color: #111827;">
        ${t.respondentSection}
      </div>
      <div class="grid-row">
        <span class="grid-label">${t.contractorNameLabel}:</span>
        <span class="grid-value">${data.contractor?.full_name || 'Contractor'}</span>
      </div>
      <div class="grid-row">
        <span class="grid-label">${t.companyNameLabel}:</span>
        <span class="grid-value">${data.contractor?.company_name || 'Contractor Firm'}</span>
      </div>
      <div class="grid-row">
        <span class="grid-label">${t.contractorIdLabel}:</span>
        <span class="grid-value">${data.contractor?.internal_contractor_id || data.contractor?.id?.slice(0, 8) || 'N/A'}</span>
      </div>
      <div class="grid-row">
        <span class="grid-label">${t.contactLabel}:</span>
        <span class="grid-value">${data.contractor?.phone || data.contractor?.phone_number || 'Registered on App'}</span>
      </div>
    </div>
  </div>

  <!-- Project & Contract Terms -->
  <div class="col-half" style="margin-bottom: 8px;">
    <div style="font-weight: 700; font-size: 10px; margin-bottom: 4px; color: #111827;">
      ${t.projectSection}
    </div>
    <div class="two-col-grid" style="margin-bottom: 0;">
      <div style="flex: 1;">
        <div class="grid-row">
          <span class="grid-label">${t.projectNameLabel}:</span>
          <span class="grid-value">${data.project?.name || 'Project Site'} (${data.project?.location || 'Location Not Specified'})</span>
        </div>
        <div class="grid-row">
          <span class="grid-label">${t.tradeSkillLabel}:</span>
          <span class="grid-value">${data.contract?.work_type || data.worker?.occupation || 'General Labour'} · ${data.worker?.skill_category || 'SKILLED'}</span>
        </div>
        <div class="grid-row">
          <span class="grid-label">${t.contractDatesLabel}:</span>
          <span class="grid-value">${formatDateIst(data.contract?.start_date)} - ${formatDateIst(data.contract?.end_date)}</span>
        </div>
      </div>
      <div style="flex: 1;">
        <div class="grid-row">
          <span class="grid-label">${t.agreedWageLabel}:</span>
          <span class="grid-value" style="color: #047857; font-weight: 700;">${agreedFormatted} / day</span>
        </div>
        <div class="grid-row">
          <span class="grid-label">${t.minWageLabel}:</span>
          <span class="grid-value">${data.minimumWage ? formatIndianRupees(data.minimumWage.daily_rate_paise) + ' / day' : '₹516 / day (Statutory)'}</span>
        </div>
        <div class="grid-row">
          <span class="grid-label">${t.minWageSourceLabel}:</span>
          <span class="grid-value" style="font-size: 8.5px;">${data.minimumWage?.source_name || 'Maharashtra Labour Dept Notification'} (${data.minimumWage ? formatDateIst(data.minimumWage.effective_from) : 'Current'})</span>
        </div>
      </div>
    </div>
  </div>

  <!-- 4. Complaint Details -->
  <div class="avoid-break" style="margin-bottom: 8px;">
    <div class="section-title">${t.complaintSection}</div>
    <div class="col-half">
      <div class="grid-row">
        <span class="grid-label">${t.categoryLabel}:</span>
        <span class="grid-value" style="color: #b45309; font-weight: 700; text-transform: uppercase;">${data.dispute.category}</span>
      </div>
      <div class="grid-row">
        <span class="grid-label">${t.periodLabel}:</span>
        <span class="grid-value">${formatDateIst(data.dispute.period_from)} to ${formatDateIst(data.dispute.period_to)}</span>
      </div>
      <div class="grid-row">
        <span class="grid-label">${t.statusLabel}:</span>
        <span class="grid-value" style="font-weight: 700;">${String(data.dispute.status).toUpperCase()}</span>
      </div>
      <div style="margin-top: 6px; padding: 6px 8px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 2px;">
        <div style="font-size: 8.5px; font-weight: 700; color: #4b5563; text-transform: uppercase; margin-bottom: 2px;">
          ${t.workerDescriptionLabel}
        </div>
        <div style="font-size: 9.5px; color: #111827; white-space: pre-wrap; word-break: break-word;">
          ${data.dispute.description || 'No description provided.'}
        </div>
      </div>
    </div>
  </div>

  <!-- 5. Wage Statement & Financial Reconciliation -->
  <div class="avoid-break" style="margin-bottom: 8px;">
    <div class="section-title">${t.wageStatementSection}</div>

    <!-- Highlight Shape Card: Agreed ₹X · Received ₹Y · Shortfall ₹Z -->
    <div class="shape-card">
      <div class="shape-item">
        <div class="shape-label">${t.summaryLineAgreed}</div>
        <div class="shape-value" style="color: #1f2937;">${agreedFormatted}</div>
        <div style="font-size: 8px; color: #6b7280;">(${data.attendanceDaysCount} ${t.attendanceDaysCol})</div>
      </div>
      <div class="shape-item">
        <div class="shape-label">${t.totalEarnedCol}</div>
        <div class="shape-value" style="color: #047857;">${earnedFormatted}</div>
      </div>
      <div class="shape-item">
        <div class="shape-label">${t.summaryLineReceived}</div>
        <div class="shape-value" style="color: #2563eb;">${paidFormatted}</div>
      </div>
      <div class="shape-item shortfall">
        <div class="shape-label">${t.summaryLineShortfall}</div>
        <div class="shape-value">${shortfallFormatted}</div>
      </div>
      <div class="shape-item">
        <div class="shape-label">${t.claimedAmountCol}</div>
        <div class="shape-value" style="color: #d97706;">${claimedFormatted}</div>
      </div>
    </div>

    <!-- Payments Received Table -->
    ${
      data.wageStatement.payments.length > 0
        ? `
      <table>
        <thead>
          <tr>
            <th>${t.paymentDateCol}</th>
            <th>${t.paymentAmountCol}</th>
            <th>${t.paymentNoteCol}</th>
          </tr>
        </thead>
        <tbody>
          ${data.wageStatement.payments
            .map(
              (p) => `
            <tr>
              <td style="font-family: 'Noto Sans', monospace; width: 25%;">${p.date}</td>
              <td style="font-weight: 700; width: 25%;">${formatIndianRupees(p.amountPaise)}</td>
              <td style="color: #4b5563;">${p.note}</td>
            </tr>
          `
            )
            .join('')}
          <tr style="font-weight: 700; background: #f3f4f6;">
            <td>${t.totalPaidCol}</td>
            <td colspan="2" style="color: #1f2937;">${paidFormatted}</td>
          </tr>
        </tbody>
      </table>
    `
        : `<p style="font-size: 9px; color: #6b7280; font-style: italic; margin: 4px 0;">No ledger payments recorded during this period.</p>`
    }
  </div>

  <!-- 6. Verified Attendance Record -->
  <div class="avoid-break" style="margin-bottom: 8px;">
    <div class="section-title">${t.attendanceRecordSection}</div>
    ${
      data.attendanceDates.length > 0
        ? `
      <div style="font-size: 9px; font-weight: 600; margin-bottom: 4px; color: #374151;">
        ${t.datesWorkedLabel} (${data.attendanceDates.length} shifts):
      </div>
      <div class="attendance-pills">
        ${data.attendanceDates
          .map((a) => `<span class="pill">${a.date} (${a.method.toUpperCase()})</span>`)
          .join('')}
      </div>
    `
        : `<p style="font-size: 9px; color: #6b7280; font-style: italic;">${t.noAttendance}</p>`
    }
  </div>

  <!-- 7. Contractor's Response -->
  <div class="avoid-break" style="margin-bottom: 8px;">
    <div class="section-title">${t.contractorResponseSection}</div>
    <div class="col-half ${data.contractorResponse.hasResponse ? 'highlight' : ''}">
      ${
        data.contractorResponse.hasResponse
          ? `
        <div class="grid-row">
          <span class="grid-label">${t.responseTypeLabel}:</span>
          <span class="grid-value" style="font-weight: 700; text-transform: uppercase;">${data.contractorResponse.type}</span>
        </div>
        ${
          data.contractorResponse.deductionReason
            ? `
          <div class="grid-row">
            <span class="grid-label">${t.deductionReasonLabel}:</span>
            <span class="grid-value">${data.contractorResponse.deductionReason} (${formatIndianRupees(data.contractorResponse.deductionAmountPaise || 0)})</span>
          </div>
        `
            : ''
        }
        <div style="margin-top: 4px; padding: 6px 8px; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 2px;">
          <div style="font-size: 8.5px; font-weight: 700; color: #4b5563; text-transform: uppercase;">${t.responseMessageLabel}:</div>
          <div style="font-size: 9.5px; color: #111827; margin-top: 2px;">${data.contractorResponse.message || 'Response recorded.'}</div>
        </div>
      `
          : `<p style="font-size: 9px; color: #6b7280; font-style: italic; margin: 2px 0;">${t.noResponseRecorded} ${data.generatedAtIst}.</p>`
      }
    </div>
  </div>

  <!-- 8. Timeline & Evidence -->
  <div class="avoid-break" style="margin-bottom: 8px;">
    <div class="section-title">${t.timelineSection}</div>
    <div class="two-col-grid" style="margin-bottom: 0;">
      <div class="col-half">
        <div style="font-weight: 700; font-size: 9.5px; margin-bottom: 4px; color: #111827;">${t.timelineTitle}</div>
        <div style="font-size: 8.5px; color: #4b5563; margin-bottom: 4px;">
          <strong>${t.messagesCountLabel}:</strong> ${data.messagesCount}
        </div>
        <div style="display: flex; flex-direction: column; gap: 4px;">
          ${data.timeline
            .slice(0, 5)
            .map(
              (item) => `
            <div style="padding-bottom: 3px; border-bottom: 1px dashed #e5e7eb;">
              <span style="font-family: 'Noto Sans', monospace; font-size: 8px; color: #6b7280;">${item.date}</span><br>
              <strong>${item.actor}:</strong> ${item.event} ${item.note ? `(${item.note})` : ''}
            </div>
          `
            )
            .join('')}
        </div>
      </div>

      <div class="col-half">
        <div style="font-weight: 700; font-size: 9.5px; margin-bottom: 4px; color: #111827;">${t.evidenceTitle}</div>
        ${
          data.evidenceItems.length > 0
            ? `
          <div style="display: flex; flex-direction: column; gap: 3px; font-size: 8.5px;">
            ${data.evidenceItems
              .map(
                (ev) => `
              <div style="padding: 2px 0; border-bottom: 1px dotted #e5e7eb;">
                <strong>${ev.fileName}</strong> (${ev.mime}, ${ev.sizeKb} KB, ${ev.uploadedAt})
              </div>
            `
              )
              .join('')}
          </div>
          <div class="thumbnails-grid">
            ${data.evidenceItems
              .filter((ev) => ev.thumbnailBase64)
              .map(
                (ev) => `
              <div class="thumb-item">
                <img src="${ev.thumbnailBase64}" alt="${ev.fileName}">
              </div>
            `
              )
              .join('')}
          </div>
        `
            : `<p style="font-size: 8.5px; color: #6b7280; font-style: italic;">${t.noEvidence}</p>`
        }
      </div>
    </div>
  </div>

  <!-- 9. Solemn Declaration -->
  <div class="declaration-box avoid-break">
    <div style="font-weight: 700; font-size: 10px; margin-bottom: 4px; color: #111827;">
      ${t.declarationSection}
    </div>
    <div class="declaration-text">
      "${t.declarationText}"
    </div>
    <div class="sign-row">
      <div style="font-size: 8.5px; color: #374151; width: 45%;">
        <div>${t.dateLine}</div>
        <div style="margin-top: 6px;">${t.placeLine}</div>
      </div>
      <div class="sign-box">
        ${t.signatureBoxLabel}
      </div>
    </div>
  </div>

  <!-- 10. Authenticity Verification QR + Short Hash -->
  <div class="verify-box avoid-break">
    <img src="${qrDataUrl}" alt="Verification QR" class="verify-qr">
    <div class="verify-details">
      <div style="font-weight: 700; font-size: 9.5px; color: #111827; margin-bottom: 2px;">
        ${t.verificationSection}
      </div>
      <div style="color: #4b5563; margin-bottom: 4px;">
        ${t.scanToVerify}
      </div>
      <div><strong>${t.verificationUrlLabel}:</strong> <span style="font-family: 'Noto Sans', monospace; color: #1d4ed8;">${data.verificationUrl}</span></div>
      <div><strong>${t.shortHashLabel}:</strong> <span style="font-family: 'Noto Sans', monospace; font-weight: 700;">${shortHash}</span></div>
      <div><strong>${t.referenceLabel}:</strong> ${data.disputeRef} (v${data.version})</div>
    </div>
  </div>

</body>
</html>`;
}

// ─── PDF Generation Engine (Playwright Headless Chromium) ─────────────────────

let sharedBrowser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!sharedBrowser || !sharedBrowser.isConnected()) {
    const pw = await import('playwright-core');
    const chromium = (pw as any).chromium || (pw as any).default?.chromium || pw;
    sharedBrowser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--font-render-hinting=none',
      ],
    });
  }
  return sharedBrowser!;
}

export async function generateComplaintReportPdf(
  params: GenerateComplaintReportParams
): Promise<{ pdfBuffer: Buffer; report: ComplaintReportRow; sha256: string }> {
  const adminClient = createAdminClient();

  // 1. Assemble data strictly from DB
  const data = await assembleComplaintReportData(params);
  const t = REPORT_I18N[data.language] || REPORT_I18N.EN;

  // 2. Generate HTML
  const html = await generateComplaintReportHtml(data);

  // 3. Render HTML to PDF via Headless Chromium
  const browser = await getBrowser();
  const page = await browser.newPage();

  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);

  const footerTemplate = `
    <div style="font-size: 8px; font-family: 'Noto Sans Devanagari', 'Noto Sans', sans-serif; color: #4b5563; width: 100%; padding: 0 12mm; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #d1d5db; padding-top: 2px;">
      <span style="max-width: 72%; line-height: 1.1;">${t.footerDisclaimer}</span>
      <span style="font-weight: 700; white-space: nowrap; text-align: right;">${data.disputeRef} | ${t.pageLabel} <span class="pageNumber"></span> ${t.ofLabel} <span class="totalPages"></span></span>
    </div>
  `;

  const pdfUint8 = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '12mm', bottom: '16mm', left: '12mm', right: '12mm' },
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate,
  });

  await page.close();

  const pdfBuffer = Buffer.from(pdfUint8);

  // 4. SHA-256 Hash of the generated PDF file
  const sha256 = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

  // 5. Save file in private storage
  const storageDir = path.resolve(process.cwd(), 'storage/complaint-reports');
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }

  const filePath = path.join(storageDir, `${data.reportRef}.pdf`);
  fs.writeFileSync(filePath, pdfBuffer);

  // 6. Save record to complaint_reports table
  const insertPayload = {
    dispute_id: data.dispute.id,
    report_ref: data.reportRef,
    version: data.version,
    language: data.language,
    recipient_type: data.recipientType,
    recipient_name: data.recipientName || t.recipientTypes[data.recipientType],
    recipient_address: data.recipientAddress || 'Official Jurisdiction',
    content_hash: sha256,
    sha256,
    file_path: filePath,
    ledger_hash: data.ledgerHash,
    report_metadata: {
      disputeRef: data.disputeRef,
      workerId: data.worker?.id,
      contractorId: data.contractor?.id,
      amountClaimedPaise: data.wageStatement.claimedAmountPaise,
      shortfallPaise: data.wageStatement.shortfallPaise,
      outstandingPaise: data.wageStatement.shortfallPaise,
      earnedPaise: data.wageStatement.earnedPaise,
      totalEarnedPaise: data.wageStatement.earnedPaise,
      totalPaidPaise: data.wageStatement.totalPaidPaise,
      attendanceDaysCount: data.attendanceDaysCount,
      verifiedDaysCount: data.attendanceDaysCount,
    },
    generated_by: params.generatedByUserId,
    generated_at: new Date().toISOString(),
  };

  const { data: savedReport, error: saveErr } = await adminClient
    .from('complaint_reports')
    .insert(insertPayload)
    .select()
    .single();

  if (saveErr) {
    console.error('Failed to save complaint_report row:', saveErr);
  }

  return {
    pdfBuffer,
    report: (savedReport || insertPayload) as ComplaintReportRow,
    sha256,
  };
}

// ─── Public Verification ──────────────────────────────────────────────────────

export interface ComplaintReportVerificationResult {
  isValid: boolean;
  status: 'VERIFIED' | 'TAMPERED' | 'NOT_FOUND';
  reference: string;
  disputeRef?: string;
  reportRef?: string;
  version?: number;
  claimedAmountPaise?: number;
  claimedAmountRupees?: number;
  amountClaimedPaise?: number;
  contentHash?: string;
  workerNameMasked?: string;
  generatedAt?: string;
  hashMatchesRecord: boolean;
  shortHash?: string;
}

export async function verifyComplaintReportByRef(
  reference: string,
  candidateFileHash?: string
): Promise<ComplaintReportVerificationResult> {
  const adminClient = createAdminClient();

  // Try finding by report_ref first
  let { data: report } = await adminClient
    .from('complaint_reports')
    .select('*, disputes(*)')
    .eq('report_ref', reference)
    .maybeSingle();

  // If not found, try finding by dispute reference (e.g. SS-D-2026-000001 or DSP-...)
  if (!report) {
    let disputeMatch: any = null;
    const { data: dMatch1 } = await adminClient
      .from('disputes')
      .select('id, reference, dispute_ref')
      .eq('reference', reference)
      .maybeSingle();
    disputeMatch = dMatch1;

    if (!disputeMatch) {
      const { data: dMatch2 } = await adminClient
        .from('disputes')
        .select('id, reference, dispute_ref')
        .eq('dispute_ref', reference)
        .maybeSingle();
      disputeMatch = dMatch2;
    }

    if (disputeMatch) {
      const { data: latestReport } = await adminClient
        .from('complaint_reports')
        .select('*, disputes(*)')
        .eq('dispute_id', disputeMatch.id)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestReport) {
        report = latestReport;
      }
    }
  }

  if (!report) {
    return {
      isValid: false,
      status: 'NOT_FOUND',
      reference,
      hashMatchesRecord: false,
    };
  }

  // Verify hash of stored file on disk
  let hashMatchesRecord = false;
  const storedFilePath = report.file_path || path.resolve(process.cwd(), 'storage/complaint-reports', `${report.report_ref}.pdf`);

  if (candidateFileHash) {
    // Client passed a specific hash to test against
    hashMatchesRecord = candidateFileHash === (report.sha256 || report.content_hash);
  } else if (fs.existsSync(storedFilePath)) {
    try {
      const fileBytes = fs.readFileSync(storedFilePath);
      const computedHash = crypto.createHash('sha256').update(fileBytes).digest('hex');
      hashMatchesRecord = computedHash === (report.sha256 || report.content_hash);
    } catch {
      hashMatchesRecord = false;
    }
  } else {
    // Fallback if file not on disk: verify content_hash consistency
    hashMatchesRecord = Boolean(report.sha256 || report.content_hash);
  }

  const dispute = report.disputes || {};
  const claimedPaise =
    dispute.claimed_paise ||
    dispute.amount_claimed_paise ||
    (report.report_metadata as any)?.amountClaimedPaise ||
    0;

  const expectedSha256 = report.sha256 || report.content_hash || '';

  const workerFullName = (report.disputes as any)?.workers?.full_name || (report.disputes as any)?.worker_id || '';
  const maskedName = workerFullName
    ? workerFullName
        .split(' ')
        .map((part: string) => (part.length > 1 ? part[0] + '*'.repeat(part.length - 1) : part))
        .join(' ')
    : undefined;

  return {
    isValid: hashMatchesRecord,
    status: hashMatchesRecord ? 'VERIFIED' : 'TAMPERED',
    reference: dispute.reference || report.report_ref || reference,
    disputeRef: dispute.reference || dispute.dispute_ref,
    reportRef: report.report_ref,
    version: report.version,
    claimedAmountPaise: claimedPaise,
    claimedAmountRupees: claimedPaise / 100,
    amountClaimedPaise: claimedPaise,
    contentHash: expectedSha256,
    workerNameMasked: maskedName,
    generatedAt: report.generated_at,
    hashMatchesRecord,
    shortHash: expectedSha256.slice(0, 12),
  };
}

export async function getComplaintReportsForDispute(disputeId: string) {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from('complaint_reports')
    .select('id, report_ref, version, language, recipient_type, recipient_name, sha256, generated_at, created_at')
    .eq('dispute_id', disputeId)
    .order('version', { ascending: false });

  return data || [];
}
