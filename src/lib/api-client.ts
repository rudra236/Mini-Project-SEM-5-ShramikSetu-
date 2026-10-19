/**
 * Typed API Client for ShramikSetu.
 * Strictly calls real Next.js API endpoints without mocks or fake data.
 */

export interface ApiErrorResponse {
  error?: {
    code?: string;
    message?: string;
  };
  message?: string;
}

export class ApiError extends Error {
  code: string;
  statusCode: number;

  constructor(message: string, code: string = 'API_ERROR', statusCode: number = 400) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

async function fetcher<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    credentials: 'include',
  });

  let data: any = null;
  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    data = await res.json();
  }

  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined') {
      // Ensure session termination happens only on actual auth verification expiry (e.g., /api/auth/me returning 401)
      if (url.includes('/api/auth/me')) {
        window.dispatchEvent(new CustomEvent('shramiksetu:session-expired'));
      }
    }
    const errorMsg = data?.error?.message || data?.message || `Request failed with status ${res.status}`;
    const errorCode = data?.error?.code || 'ERROR';
    throw new ApiError(errorMsg, errorCode, res.status);
  }

  return data as T;
}

export const api = {
  auth: {
    signin: (payload: { id: string; password: string; role: 'WORKER' | 'CONTRACTOR' }) =>
      fetcher<{ success: boolean; user: any; profile: any; role: string; redirect: string }>('/api/auth/signin', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    signout: () =>
      fetcher<{ success: boolean; message: string }>('/api/auth/signout', {
        method: 'POST',
      }),

    me: () =>
      fetcher<{
        success: boolean;
        user: any;
        role: string;
        profile: any;
        profiles?: {
          worker?: any;
          contractor?: any;
          supervisor?: any;
          institutionalUser?: any;
        };
      }>('/api/auth/me'),

    register: (payload: {
      role: 'WORKER' | 'CONTRACTOR';
      password: string;
      fullName?: string;
      phone?: string;
      occupation?: string;
      skillCategory?: 'UNSKILLED' | 'SEMI_SKILLED' | 'SKILLED' | 'HIGHLY_SKILLED';
      emergencyContact?: string;
      companyName?: string;
      licenseNumber?: string;
      locale?: 'en' | 'hi' | 'mr';
    }) =>
      fetcher<{
        success: boolean;
        id: string;
        loginId: string;
        user: any;
        profile: any;
        role: string;
        redirect: string;
      }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    setPassword: (payload: { token: string; newPassword: string }) =>
      fetcher<{ success: boolean; message: string }>('/api/auth/set-password', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    loginWorker: (payload: { workerId: string; password: string }) =>
      fetcher<{ success: boolean; user: any; profile: any; redirect: string }>('/api/auth/worker/login', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    logout: () =>
      fetcher<{ success: boolean; message: string }>('/api/auth/signout', {
        method: 'POST',
      }),

    getProfile: () =>
      fetcher<{
        success: boolean;
        authUserId: string;
        user: any;
        profiles: {
          worker: any;
          contractor: any;
          supervisor: any;
          institutionalUser: any;
        };
      }>('/api/auth/profile'),

    createOrUpdateProfile: (payload: {
      role: 'WORKER' | 'CONTRACTOR' | 'SUPERVISOR' | 'LABOUR_ORGANIZATION' | 'INSTITUTIONAL_USER' | 'ADMIN';
      locale?: 'en' | 'hi' | 'mr';
      profileData?: {
        fullName?: string;
        internalWorkerId?: string;
        occupation?: string;
        skillCategory?: 'UNSKILLED' | 'SEMI_SKILLED' | 'SKILLED' | 'HIGHLY_SKILLED';
        companyName?: string;
        licenseNumber?: string;
        contractorId?: string;
        badgeNumber?: string;
        organizationId?: string;
        officialDesignation?: string;
        jurisdictionRegion?: string;
        emergencyContact?: string;
        profilePhotoUrl?: string;
      };
    }) =>
      fetcher<{ success: boolean; user: any; profile: any }>('/api/auth/profile', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  },

  workers: {
    getProfile: (workerId?: string) =>
      fetcher<{ success: boolean; worker: any }>(
        workerId ? `/api/workers/profile?workerId=${encodeURIComponent(workerId)}` : '/api/workers/profile'
      ),
    updateProfile: (payload: {
      workerId?: string;
      fullName?: string;
      occupation?: string;
      skillCategory?: 'UNSKILLED' | 'SEMI_SKILLED' | 'SKILLED' | 'HIGHLY_SKILLED';
      phone?: string | null;
      emergencyContact?: string | null;
    }) =>
      fetcher<{ success: boolean; worker: any; user: any }>('/api/workers/profile', {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
  },

  contractors: {
    getProfile: (contractorId?: string) =>
      fetcher<{ success: boolean; contractor: any }>(
        contractorId ? `/api/contractors/profile?contractorId=${encodeURIComponent(contractorId)}` : '/api/contractors/profile'
      ),
    updateProfile: (payload: {
      contractorId?: string;
      companyName?: string;
      fullName?: string;
      licenseNumber?: string | null;
      phone?: string | null;
    }) =>
      fetcher<{ success: boolean; contractor: any; user: any }>('/api/contractors/profile', {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
  },

  projects: {
    list: (id?: string) =>
      fetcher<{ success: boolean; projects?: any[]; project?: any; counts?: any; projectCounts?: any }>(
        id ? `/api/projects?id=${encodeURIComponent(id)}` : '/api/projects'
      ),

    create: (payload: {
      name: string;
      description?: string;
      startDate: string;
      endDate?: string;
      worksiteName?: string;
      latitude?: number;
      longitude?: number;
      geofenceRadiusMeters?: number;
      address?: string;
      city?: string;
      state?: string;
      pincode?: string;
    }) =>
      fetcher<{ success: boolean; project: any; worksite?: any }>('/api/projects', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  },

  contracts: {
    list: () =>
      fetcher<{ success: boolean; contracts: any[] }>('/api/contracts'),

    get: (id: string) =>
      fetcher<{ success: boolean; contract: any; attendanceSummary?: { verifiedDaysCount: number; totalEarnedPaise: number; recentAttendance: any[] } }>(
        `/api/contracts/${id}`
      ),

    create: (payload: {
      workerId?: string;
      workerLoginId?: string; // SS-W-YYYY-NNNNNN from identity card
      projectId: string;
      worksiteId?: string; // auto-resolved from project if omitted
      workType: string;
      dailyWage: number; // in Rupees
      expectedWorkingHours?: number;
      paymentFrequency?: 'DAILY' | 'WEEKLY' | 'FORTNIGHTLY' | 'MONTHLY';
      startDate: string;
      endDate?: string;
      contractorId?: string;
      acknowledgeBelowMinimumWage?: boolean;
    }) =>
      fetcher<{ success: boolean; contract: any; version: any }>('/api/contracts', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    respond: (contractId: string, payload: { response: 'ACCEPTED' | 'REJECTED'; rejectionReason?: string }) =>
      fetcher<{ success: boolean; contract: any; acceptance: any; employmentRelationship?: any }>(
        `/api/contracts/${contractId}/respond`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      ),

    accept: (contractId: string) =>
      fetcher<{ success: boolean; contract: any }>(`/worker/assignments/${contractId}/accept`, {
        method: 'POST',
      }),

    reject: (contractId: string, reason?: string) =>
      fetcher<{ success: boolean; contract: any }>(`/worker/assignments/${contractId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),

    cancel: (contractId: string) =>
      fetcher<{ success: boolean; contract: any }>(`/contractor/assignments/${contractId}/cancel`, {
        method: 'POST',
      }),

    submit: (contractId: string) =>
      fetcher<{ success: boolean; contract: any }>(`/api/contracts/${contractId}/submit`, {
        method: 'POST',
      }),

    terminate: (
      contractId: string,
      payload: { reason: string; endDate?: string; confirmOutstandingDues?: boolean }
    ) =>
      fetcher<{ success: boolean; contract: any; unresolvedDuesPaise?: number; message?: string }>(
        `/api/contracts/${contractId}/terminate`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      ),

    createVersion: (
      contractId: string,
      payload: {
        dailyWage?: number;
        expectedWorkingHours?: number;
        paymentFrequency?: string;
        workType?: string;
        effectiveDate: string;
        changeReason: string;
      }
    ) =>
      fetcher<{ success: boolean; contract: any; version: any }>(`/api/contracts/${contractId}/version`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  },

  attendance: {
    list: () =>
      fetcher<{ success: boolean; attendanceEvents: any[] }>('/api/attendance'),

    createToken: (payload: {
      projectId: string;
      worksiteId?: string;
      ttlSeconds?: number;
    }) =>
      fetcher<{
        success: boolean;
        token: string;
        shortCode: string;
        tokenId: string;
        expiresAt: string;
        ttlSeconds: number;
      }>(
        '/api/attendance/token/create',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      ),

    mark: (payload: {
      qrToken?: string;
      manualCode?: string;
      latitude?: number;
      longitude?: number;
      gpsAccuracyMeters?: number;
      mockLocationFlag?: boolean;
      deviceFingerprint?: string;
      punchType?: 'IN' | 'OUT';
      capturedAt?: string;
      idempotencyKey?: string;
      date?: string;
    }) =>
      fetcher<{
        success: boolean;
        attendanceEvent: any;
        hasFraudFlags: boolean;
        fraudFlagCount: number;
      }>('/api/attendance/mark', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    getSummary: () =>
      fetcher<{ success: boolean; summaries: any[] }>('/api/attendance/summary'),

    confirm: (payload: any) =>
      fetcher<{ success: boolean; confirmation: any }>('/api/attendance/confirm', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    getReviewQueue: (projectId?: string) =>
      fetcher<{ success: boolean; reviewItems: any[] }>(
        `/api/attendance/review${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`
      ),

    resolveReview: (payload: {
      reviewItemId?: string;
      attendanceEventId?: string;
      decision: 'APPROVED' | 'REJECTED';
      notes?: string;
    }) =>
      fetcher<{ success: boolean; reviewItem: any; attendanceStatus: string }>(
        '/api/attendance/review',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      ),
  },

  earnings: {
    get: (params?: { contractId?: string; startDate?: string; endDate?: string; snapshot?: boolean }) => {
      const q = new URLSearchParams();
      if (params?.contractId) q.set('contractId', params.contractId);
      if (params?.startDate) q.set('startDate', params.startDate);
      if (params?.endDate) q.set('endDate', params.endDate);
      if (params?.snapshot) q.set('snapshot', 'true');
      const qs = q.toString();
      return fetcher<{
        success: boolean;
        verifiedDaysCount: number;
        dailyWagePaise: number;
        totalEarnedPaise: number;
        totalPaidPaise: number;
        outstandingPaise: number;
        dailyWageDisplay?: string;
        totalEarnedDisplay?: string;
        totalPaidDisplay?: string;
        outstandingDisplay?: string;
      }>(`/api/earnings${qs ? `?${qs}` : ''}`);
    },
  },

  ledger: {
    getTimeline: (workerId?: string) => {
      const q = new URLSearchParams();
      if (workerId) q.set('workerId', workerId);
      const qs = q.toString();
      return fetcher<{
        success: boolean;
        financialSummary: any;
        timeline: any[];
        pendingClaims: any[];
        projectBreakdowns: any[];
        projects: { id: string; name: string }[];
        months: string[];
      }>(`/api/ledger/timeline${qs ? `?${qs}` : ''}`);
    },
  },

  payments: {
    initiate: (payload: {
      contractId: string;
      workerId: string;
      contractorId: string;
      projectId: string;
      amountPaise: number; // Positive integer
      idempotencyKey: string;
      paymentSource?: string;
      paymentMethod?: string;
      referenceNumber?: string;
      proofUrl?: string;
      notes?: string;
      isAdvance?: boolean;
      disputeId?: string;
    }) =>
      fetcher<{
        success: boolean;
        transaction: any;
        ledger: { debit: any; credit: any };
        isDuplicate: boolean;
      }>('/api/payments/initiate', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    confirm: (payload: {
      transactionId: string;
      isConfirmed: boolean;
      disputeReason?: string; // Required when isConfirmed is false
      workerNotes?: string;
    }) =>
      fetcher<{ success: boolean; confirmation: any; status: string }>('/api/payments/confirm', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    getSummary: (params?: { contractId?: string; periodStart?: string; periodEnd?: string }) => {
      const q = new URLSearchParams();
      if (params?.contractId) q.set('contractId', params.contractId);
      if (params?.periodStart) q.set('periodStart', params.periodStart);
      if (params?.periodEnd) q.set('periodEnd', params.periodEnd);
      const qs = q.toString();
      return fetcher<{
        success: boolean;
        totalEarnedPaise: number;
        totalPaidPaise: number;
        outstandingPaise: number;
        transactions: any[];
      }>(`/api/payments/summary${qs ? `?${qs}` : ''}`);
    },

    getTransaction: (transactionId: string) =>
      fetcher<{
        success: boolean;
        transaction: any;
        ledgerEntries: any[];
        confirmation?: any;
      }>(`/api/payments/${transactionId}`),

    escalate: (maxAgeDays?: number) =>
      fetcher<{
        success: boolean;
        message: string;
        escalatedCount: number;
        escalatedIds: string[];
      }>('/api/payments/escalate', {
        method: 'POST',
        body: JSON.stringify({ maxAgeDays }),
      }),
  },

  wallet: {
    getSummary: (workerId?: string) => {
      const q = new URLSearchParams();
      if (workerId) q.set('workerId', workerId);
      const qs = q.toString();
      return fetcher<{
        success: boolean;
        financialSummary: any;
        timeline: any[];
        pendingClaims: any[];
        projectBreakdowns: any[];
        projects: { id: string; name: string }[];
        months: string[];
      }>(`/api/wallet/summary${qs ? `?${qs}` : ''}`);
    },

    withdraw: (payload: {
      amountPaise: number;
      destinationType: 'UPI' | 'BANK_TRANSFER';
      destinationValue: string;
      idempotencyKey: string;
      simulateFailure?: boolean;
    }) =>
      fetcher<{
        success: boolean;
        status: 'SUCCESS' | 'FAILED';
        message: string;
        transactionRef: string;
        amountPaise: number;
        destinationMasked: string;
        destinationType: 'UPI' | 'BANK_TRANSFER';
        reversed?: boolean;
        walletBalancePaise: number;
        isDuplicate?: boolean;
      }>('/api/wallet/withdraw', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  },

  reconciliation: {
    get: (contractId: string, params?: { periodStart?: string; periodEnd?: string }) => {
      const q = new URLSearchParams();
      if (params?.periodStart) q.set('periodStart', params.periodStart);
      if (params?.periodEnd) q.set('periodEnd', params.periodEnd);
      const qs = q.toString();
      return fetcher<{
        success: boolean;
        reconciliation?: {
          verifiedDaysCount: number;
          dailyWagePaise: number;
          totalEarnedPaise: number;
          totalPaidPaise: number;
          outstandingPaise: number;
        };
        verifiedDaysCount: number;
        dailyWagePaise: number;
        totalEarnedPaise: number;
        totalPaidPaise: number;
        outstandingPaise: number;
      }>(`/api/reconciliation/${contractId}${qs ? `?${qs}` : ''}`);
    },
  },

  disputes: {
    list: (params?: { workerId?: string; contractorId?: string; status?: string }) => {
      const q = new URLSearchParams();
      if (params?.workerId) q.set('workerId', params.workerId);
      if (params?.contractorId) q.set('contractorId', params.contractorId);
      if (params?.status) q.set('status', params.status);
      const qs = q.toString();
      return fetcher<{ success: boolean; disputes: any[] }>(`/api/disputes${qs ? `?${qs}` : ''}`);
    },

    count: (params?: { contractorId?: string; projectId?: string }) => {
      const q = new URLSearchParams();
      if (params?.contractorId) q.set('contractorId', params.contractorId);
      if (params?.projectId) q.set('projectId', params.projectId);
      const qs = q.toString();
      return fetcher<{ success: boolean; count: number }>(`/api/disputes/count${qs ? `?${qs}` : ''}`);
    },

    calculate: (params: { contractId: string; periodFrom: string; periodTo: string }) => {
      const q = new URLSearchParams();
      q.set('contractId', params.contractId);
      q.set('periodFrom', params.periodFrom);
      q.set('periodTo', params.periodTo);
      return fetcher<{
        success: boolean;
        contractId: string;
        periodFrom: string;
        periodTo: string;
        dailyWagePaise: number;
        verifiedAttendanceDaysCount: number;
        earnedPaise: number;
        paidPaise: number;
        shortfallPaise: number;
        earnedRupees: number;
        paidRupees: number;
        shortfallRupees: number;
      }>(`/api/disputes/calculate?${q.toString()}`);
    },

    create: (payload: {
      workerId: string;
      contractorId?: string;
      projectId?: string;
      contractId: string;
      category: any;
      periodFrom: string;
      periodTo: string;
      description: string;
      priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
      claimedPaise?: number;
      claimedJustification?: string;
      amountClaimedPaise?: number;
      evidencePhotoUrl?: string;
      evidenceVoiceUrl?: string;
      voiceTranscription?: string;
      linkedAttendanceEventIds?: string[];
      linkedLedgerEntryIds?: string[];
    }) =>
      fetcher<{ success: boolean; dispute: any; evidence?: any }>('/api/disputes', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    get: (id: string) =>
      fetcher<{
        success: boolean;
        dispute: any;
        responses?: any[];
        messages?: any[];
        evidence?: any[];
        statusHistory?: any[];
        worker?: any;
        contractor?: any;
        project?: any;
        contract?: any;
        linkedPayments?: any[];
        evidenceSnapshot?: any;
        resolutions?: any[];
      }>(`/api/disputes/${id}`),

    respond: (
      id: string,
      payload: {
        type?: 'accept_and_pay' | 'deduction_claimed' | 'reject';
        deductionReason?: 'late_arrival' | 'incomplete_work' | 'advance_recovery' | 'other';
        deductionAmountPaise?: number;
        message?: string;
        counterStatement?: string;
        evidenceUrl?: string;
      }
    ) =>
      fetcher<{ success: boolean; dispute: any; response?: any }>(`/api/disputes/${id}/respond`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    withdraw: (id: string, reason?: string) =>
      fetcher<{ success: boolean; dispute: any }>(`/api/disputes/${id}/actions`, {
        method: 'POST',
        body: JSON.stringify({ action: 'withdraw', reason }),
      }),

    escalate: (id: string, reason?: string) =>
      fetcher<{ success: boolean; dispute: any }>(`/api/disputes/${id}/actions`, {
        method: 'POST',
        body: JSON.stringify({ action: 'escalate', reason }),
      }),

    confirmResolution: (id: string, notes?: string) =>
      fetcher<{ success: boolean; dispute: any }>(`/api/disputes/${id}/actions`, {
        method: 'POST',
        body: JSON.stringify({ action: 'confirm_resolution', notes }),
      }),

    getMessages: (id: string) =>
      fetcher<{ success: boolean; messages: any[] }>(`/api/disputes/${id}/messages`),

    postMessage: (id: string, message: string) =>
      fetcher<{ success: boolean; message: any }>(`/api/disputes/${id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ message }),
      }),

    uploadEvidence: async (id: string, file: File): Promise<{ success: boolean; evidence: any }> => {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/api/disputes/${id}/evidence`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to upload evidence');
      }
      return data;
    },

    ruling: (id: string, payload: {
      rulingDecision: 'DISMISS' | 'ORDER_PAYMENT' | 'PARTIAL_SETTLEMENT';
      reason: string;
      resolutionNotes?: string;
      orderedAmountPaise?: number;
      deadlineDays?: number;
    }) =>
      fetcher<{ success: boolean; dispute: any; resolution: any; ledgerEntry?: any }>(`/api/disputes/${id}/ruling`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    checkDeadlines: () =>
      fetcher<{ success: boolean; flaggedCount: number; flaggedDisputeIds: string[] }>('/api/disputes/check-deadlines', {
        method: 'POST',
      }),

    resolve: (id: string, payload: { resolution: string; notes?: string }) =>
      fetcher<{ success: boolean; dispute: any }>(`/api/disputes/${id}/resolve`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    getReportPdfUrl: (
      id: string,
      options?: {
        lang?: 'EN' | 'HI' | 'MR';
        recipientType?: 'POLICE_STATION' | 'LABOUR_OFFICE' | 'OTHER';
        recipientName?: string;
        recipientAddress?: string;
      }
    ) => {
      const q = new URLSearchParams();
      if (options?.lang) q.set('lang', options.lang);
      if (options?.recipientType) q.set('recipientType', options.recipientType);
      if (options?.recipientName) q.set('recipientName', options.recipientName);
      if (options?.recipientAddress) q.set('recipientAddress', options.recipientAddress);
      const qs = q.toString();
      return `/api/disputes/${encodeURIComponent(id)}/report.pdf${qs ? `?${qs}` : ''}`;
    },
  },

  compliance: {
    check: (payload: { contractId: string; checkDate?: string }) =>
      fetcher<{
        success: boolean;
        result: 'COMPLIANT' | 'REVIEW_REQUIRED' | 'POTENTIAL_NON_COMPLIANCE' | 'INSUFFICIENT_DATA';
        ruleUsed?: any;
        inputs?: any;
        calculation?: any;
        benchmark?: any;
        details?: any;
      }>('/api/compliance/check', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    getMinimumWages: (params?: { state?: string; skillCategory?: string; zone?: string }) => {
      const q = new URLSearchParams();
      if (params?.state) q.set('state', params.state);
      if (params?.skillCategory) q.set('skillCategory', params.skillCategory);
      if (params?.zone) q.set('zone', params.zone);
      const qs = q.toString();
      return fetcher<{
        success: boolean;
        minimumWages: any[];
        applicableMinimumWage?: any;
      }>(`/api/compliance/minimum-wages${qs ? `?${qs}` : ''}`);
    },
  },

  passport: {
    get: (workerId: string) =>
      fetcher<{ success: boolean; passport: any }>(`/api/passport/${workerId}`),
  },

  credentials: {
    issue: (workerId: string, consent?: any) =>
      fetcher<{ success: boolean; credential: any }>('/api/credentials/issue', {
        method: 'POST',
        body: JSON.stringify({ workerId, consent }),
      }),
    verify: (ref: string) =>
      fetcher<{ success: boolean; verification: any }>(`/api/verify/${ref}`),
  },

  institutional: {
    analytics: (params?: {
      state?: string;
      district?: string;
      projectId?: string;
      contractorId?: string;
      workerCategory?: string;
      startDate?: string;
      endDate?: string;
      status?: string;
    }) => {
      const q = new URLSearchParams();
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          if (v) q.set(k, v);
        });
      }
      const qs = q.toString();
      return fetcher<{
        success: boolean;
        metrics: {
          totalWorkers: number;
          activeContracts: number;
          activeProjects: number;
          openDisputes: number;
          paymentDiscrepancies: number;
          potentialComplianceCases: number;
          outstandingWages: number;
          contractorIndicators: any[];
        };
        geographic?: any;
      }>(`/api/institutional/analytics${qs ? `?${qs}` : ''}`);
    },
  },

  employmentHistory: {
    get: (workerId: string) =>
      fetcher<{ success: boolean; history: any[] }>(`/api/employment-history/${workerId}`),

    getTimeline: (workerId: string) =>
      fetcher<{ success: boolean; timeline: any[] }>(`/api/employment-history/${workerId}/timeline`),
  },

  notifications: {
    list: (params?: { unread?: boolean; limit?: number }) => {
      const q = new URLSearchParams();
      if (params?.unread) q.set('unread', 'true');
      if (params?.limit) q.set('limit', String(params.limit));
      const qs = q.toString();
      return fetcher<{ success: boolean; notifications: any[] }>(`/api/notifications${qs ? `?${qs}` : ''}`);
    },

    markRead: (notificationId: string) =>
      fetcher<{ success: boolean }>('/api/notifications', {
        method: 'PATCH',
        body: JSON.stringify({ notificationId }),
      }),
  },

  counts: {
    get: (params?: { scope?: 'project' | 'contractor' | 'worker' | 'user'; projectId?: string }) => {
      const q = new URLSearchParams();
      if (params?.scope) q.set('scope', params.scope);
      if (params?.projectId) q.set('projectId', params.projectId);
      const qs = q.toString();
      return fetcher<{
        success: boolean;
        scope: string;
        counts?: any;
        unreadNotifications?: number;
      }>(`/api/counts${qs ? `?${qs}` : ''}`);
    },
  },
};
