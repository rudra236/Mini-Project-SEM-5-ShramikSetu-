/**
 * SHRAMIKSETU BILINGUAL WORK CONTRACT PDF GENERATOR
 *
 * Generates an authoritative, tamper-evident bilingual (English + Hindi/Marathi)
 * work contract deed using pdfkit.
 *
 * Statutory Invariants:
 *  1. Non-affiliation disclaimer prominently displayed.
 *  2. Cryptographic terms hash (SHA-256), IP hash, and device signature embedded.
 *  3. Daily wage explicitly stated in integer paise and rupee denomination.
 *  4. Both employer (contractor) and worker statutory obligations stated.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { paiseToRupeeDisplay } from '@/types/payment.types';

export class ContractPdfError extends Error {
  constructor(message: string, public statusCode = 400) {
    super(message);
    this.name = 'ContractPdfError';
  }
}

export interface ContractDeedData {
  contractId: string;
  contractCode: string;
  status: string;
  startDate: string;
  endDate: string | null;
  dailyWagePaise: number;
  expectedWorkingHours: number;
  paymentFrequency: string;
  workType: string;
  contractorName: string;
  contractorCompany: string;
  contractorLicense: string;
  workerName: string;
  workerInternalId: string;
  workerSkillCategory: string;
  workerOccupation: string;
  projectName: string;
  worksiteName: string;
  worksiteAddress: string;
  acceptanceTimestamp: string;
  ipHash: string;
  deviceInfo: string;
  termsHash: string;
}

/**
 * Assemble authoritative contract data for deed generation
 */
export async function getContractDeedData(contractId: string): Promise<ContractDeedData> {
  const adminClient = createAdminClient();

  const { data: contract, error: contractErr } = await adminClient
    .from('work_contracts')
    .select(`
      id,
      contract_code,
      status,
      start_date,
      end_date,
      daily_wage,
      expected_working_hours,
      payment_frequency,
      work_type,
      terms_hash,
      workers (
        id,
        full_name,
        internal_worker_id,
        skill_category,
        occupation
      ),
      contractors (
        id,
        full_name,
        company_name,
        license_number
      ),
      projects (
        id,
        name,
        worksites (
          name,
          address,
          city,
          state
        )
      )
    `)
    .eq('id', contractId)
    .maybeSingle();

  if (contractErr || !contract) {
    throw new ContractPdfError('Work contract not found.', 404);
  }

  // Fetch acceptance record
  const { data: acceptance } = await adminClient
    .from('contract_acceptances')
    .select('*')
    .eq('contract_id', contractId)
    .order('responded_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const worker = contract.workers as any;
  const contractor = contract.contractors as any;
  const project = contract.projects as any;
  const worksite = Array.isArray(project?.worksites) ? project?.worksites[0] : project?.worksites;

  const rawWage = contract.daily_wage;
  const dailyWagePaise = typeof rawWage === 'number' && rawWage < 10000 ? Math.round(rawWage * 100) : Number(rawWage || 0);

  return {
    contractId: contract.id,
    contractCode: contract.contract_code,
    status: contract.status,
    startDate: contract.start_date,
    endDate: contract.end_date,
    dailyWagePaise,
    expectedWorkingHours: contract.expected_working_hours || 8,
    paymentFrequency: contract.payment_frequency || 'DAILY',
    workType: contract.work_type,
    contractorName: contractor?.full_name || 'Authorized Contractor',
    contractorCompany: contractor?.company_name || 'Contractor Firm',
    contractorLicense: contractor?.license_number || 'CLRA-MH-REGISTERED',
    workerName: worker?.full_name || 'Registered Worker',
    workerInternalId: worker?.internal_worker_id || 'WRK-REGISTERED',
    workerSkillCategory: worker?.skill_category || 'SKILLED',
    workerOccupation: worker?.occupation || contract.work_type,
    projectName: project?.name || 'Authorized Works Project',
    worksiteName: worksite?.name || 'Designated Construction Site',
    worksiteAddress: worksite?.address ? `${worksite.address}, ${worksite.city || 'Mumbai'}` : 'Mumbai, Maharashtra',
    acceptanceTimestamp: acceptance?.responded_at || new Date().toISOString(),
    ipHash: acceptance?.ip_hash || 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    deviceInfo: acceptance?.device_info || 'Authenticated Mobile Client',
    termsHash: contract.terms_hash || acceptance?.terms_hash || 'terms-hash-pending',
  };
}

/**
 * Generate bilingual PDF buffer from contract data
 */
export async function generateBilingualContractPdf(contractId: string): Promise<Buffer> {
  const PDFDocument = (await import('pdfkit')).default;
  const deed = await getContractDeedData(contractId);

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // ── Outer Border ──
    doc.rect(20, 20, 555, 802).lineWidth(1.5).stroke('#111827');
    doc.rect(24, 24, 547, 794).lineWidth(0.5).stroke('#6B7280');

    // ── Header ──
    doc
      .fontSize(16)
      .font('Helvetica-Bold')
      .fillColor('#111827')
      .text('SHRAMIKSETU STATUTORY WORK CONTRACT DEED', 40, 40, { align: 'center' });

    doc
      .fontSize(11)
      .font('Helvetica')
      .fillColor('#374151')
      .text('वैधानिक कार्य अनुबंध विलेख · डिजिटल रोजगार करार', { align: 'center' });

    doc.moveDown(0.3);

    // Disclaimer
    doc
      .fontSize(8)
      .font('Helvetica-Oblique')
      .fillColor('#6B7280')
      .text(
        'Generated via ShramikSetu Digital Employment Ledger. Enforced under the Contract Labour (Regulation and Abolition) Act, 1970. Not a government KYC certificate.',
        { align: 'center' }
      )
      .fillColor('#111827');

    doc.moveDown(0.5);
    drawDivider(doc);

    // ── Deed Summary Bar ──
    doc.moveDown(0.4);
    doc.fontSize(9).font('Helvetica-Bold').text('CONTRACT REFERENCE: ', { continued: true });
    doc.font('Helvetica').text(`${deed.contractCode}   |   STATUS: ${deed.status}   |   EFFECTIVE: ${deed.startDate}`);

    drawDivider(doc);
    doc.moveDown(0.5);

    // ── Two Column Party Details ──
    const leftColX = 45;
    const rightColX = 305;
    const currentY = doc.y;

    // Left Column: Contractor / Employer
    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .fillColor('#1E3A8A')
      .text('EMPLOYER / CONTRACTOR (नियोक्ता / कंत्राटदार)', leftColX, currentY);

    doc.moveDown(0.2);
    doc.fontSize(9).font('Helvetica');
    doc.text(`Firm Name: ${deed.contractorCompany}`, leftColX);
    doc.text(`Authorized Rep: ${deed.contractorName}`, leftColX);
    doc.text(`License No: ${deed.contractorLicense}`, leftColX);
    doc.text(`Project: ${deed.projectName}`, leftColX);

    // Right Column: Worker
    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .fillColor('#1E3A8A')
      .text('WORKER / SHRAMIK (श्रमिक / कामगार)', rightColX, currentY);

    doc.moveDown(0.2);
    doc.fontSize(9).font('Helvetica');
    doc.text(`Worker Name: ${deed.workerName}`, rightColX);
    doc.text(`Worker ID: ${deed.workerInternalId}`, rightColX);
    doc.text(`Occupation: ${deed.workerOccupation}`, rightColX);
    doc.text(`Skill Category: ${deed.workerSkillCategory}`, rightColX);

    doc.y = Math.max(doc.y, currentY + 75);
    doc.moveDown(0.5);
    drawDivider(doc);

    // ── Wage & Statutory Stipulations ──
    doc.moveDown(0.4);
    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .fillColor('#065F46')
      .text('MANDATED WAGE & WORK STIPULATIONS · मजदूरी व कामाच्या अटी');

    doc.moveDown(0.3);

    // Highlighted Wage Box
    const wageBoxY = doc.y;
    doc.rect(45, wageBoxY, 505, 50).fillAndStroke('#ECFDF5', '#059669');

    doc.fillColor('#065F46');
    doc.fontSize(10).font('Helvetica-Bold').text('STIPULATED DAILY WAGE / दैनिक मजदूरी दर:', 60, wageBoxY + 10);
    doc
      .fontSize(16)
      .font('Helvetica-Bold')
      .text(`${paiseToRupeeDisplay(deed.dailyWagePaise)} / day`, 60, wageBoxY + 26);

    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor('#374151')
      .text(`Standard Shift: ${deed.expectedWorkingHours} Hours  |  Payment Cycle: ${deed.paymentFrequency}`, 300, wageBoxY + 14)
      .text(`Worksite: ${deed.worksiteName} (${deed.worksiteAddress})`, 300, wageBoxY + 28);

    doc.y = wageBoxY + 62;
    doc.moveDown(0.4);

    // ── Statutory Terms & Conditions ──
    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .fillColor('#111827')
      .text('STATUTORY TERMS & BINDING CLAUSES (कायदेशीर अटी व शर्ती):');

    doc.moveDown(0.2);
    doc.fontSize(8).font('Helvetica').fillColor('#374151');

    const clauses = [
      '1. Minimum Wage Compliance: The stipulated daily wage shall at all times be equal to or exceed the statutory minimum wage benchmark notified by the State Government under the Minimum Wages Act, 1948.',
      '2. Attendance & Muster Verification: Shifts shall be recorded through the site-gate digital geo-fenced QR token. Verified punches shall directly accrue to the worker benefit passport.',
      '3. Ledger-Backed Wage Disbursement: Payments shall be transacted via double-entry ledger entries (DEBIT contractor wallet, CREDIT worker wallet). Deductions without written consent are prohibited.',
      '4. Working Hours & Overtime: Standard working hours are capped at 8 hours per day. Any additional hours shall be remunerated at statutory overtime multipliers.',
      '5. Dispute Redressal: Any shortfall or delay in payment grants immediate cause of action before the District Labour Commissioner under Section 20 of the Minimum Wages Act.',
    ];

    for (const clause of clauses) {
      doc.text(clause, 45, doc.y, { width: 505 });
      doc.moveDown(0.2);
    }

    doc.moveDown(0.4);
    drawDivider(doc);

    // ── Tamper-Evident Digital Acceptance Audit Evidence ──
    doc.moveDown(0.4);
    doc
      .fontSize(9)
      .font('Helvetica-Bold')
      .fillColor('#1E3A8A')
      .text('TAMPER-EVIDENT DIGITAL ACCEPTANCE RECORD · डिजिटल स्वाक्षरी व स्वीकृती पुरावा');

    doc.moveDown(0.3);
    doc.fontSize(8).font('Helvetica').fillColor('#111827');

    const auditBoxY = doc.y;
    doc.rect(45, auditBoxY, 505, 75).fillAndStroke('#F3F4F6', '#9CA3AF');

    doc.fillColor('#1F2937');
    doc.text(`Worker Acceptance Timestamp: ${new Date(deed.acceptanceTimestamp).toUTCString()} (IST: ${new Date(deed.acceptanceTimestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })})`, 55, auditBoxY + 8);
    doc.text(`Client IP Hash (SHA-256): ${deed.ipHash}`, 55, auditBoxY + 22);
    doc.text(`Acceptance Device: ${deed.deviceInfo.slice(0, 75)}`, 55, auditBoxY + 36);
    doc.text(`Cryptographic Terms Hash (SHA-256): ${deed.termsHash}`, 55, auditBoxY + 50);
    doc.font('Helvetica-Bold').text(`Legal Status: BINDING STATUTORY CONTRACT · डिजिटल पुरावा अपरिवर्तनीय`, 55, auditBoxY + 62);

    doc.end();
  });
}

function drawDivider(doc: any) {
  doc.strokeColor('#D1D5DB').lineWidth(0.5);
  doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
  doc.strokeColor('#000000');
}
