
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "accounts": {
                  Row: {
                    "account_type": Database["public"]['Enums']["account_type"],"code": string,"created_at": string,"currency": string,"id": string,"is_active": boolean,"name": string,"owner_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_type": Database["public"]['Enums']["account_type"],"code": string,"created_at"?: string,"currency"?: string,"id"?: string,"is_active"?: boolean,"name": string,"owner_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "account_type"?: Database["public"]['Enums']["account_type"],"code"?: string,"created_at"?: string,"currency"?: string,"id"?: string,"is_active"?: boolean,"name"?: string,"owner_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"anchors": {
                  Row: {
                    "anchor_date": string,"attendance_end_hash": string | null,"attendance_events_count": number,"attendance_start_hash": string | null,"combined_leaves_count": number,"created_at": string,"external_publication_proof": string | null,"external_publication_url": string | null,"id": string,"ledger_end_hash": string | null,"ledger_entries_count": number,"ledger_start_hash": string | null,"merkle_root": string,"published_to_external": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "anchor_date": string,"attendance_end_hash"?: string | null,"attendance_events_count"?: number,"attendance_start_hash"?: string | null,"combined_leaves_count"?: number,"created_at"?: string,"external_publication_proof"?: string | null,"external_publication_url"?: string | null,"id"?: string,"ledger_end_hash"?: string | null,"ledger_entries_count"?: number,"ledger_start_hash"?: string | null,"merkle_root": string,"published_to_external"?: boolean
                  }
                  Update: {
                    "anchor_date"?: string,"attendance_end_hash"?: string | null,"attendance_events_count"?: number,"attendance_start_hash"?: string | null,"combined_leaves_count"?: number,"created_at"?: string,"external_publication_proof"?: string | null,"external_publication_url"?: string | null,"id"?: string,"ledger_end_hash"?: string | null,"ledger_entries_count"?: number,"ledger_start_hash"?: string | null,"merkle_root"?: string,"published_to_external"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"attendance_discrepancies": {
                  Row: {
                    "conflict_type": string,"contract_id": string,"contractor_record": Json | null,"created_at": string,"date": string,"event_uuid": string,"id": string,"project_id": string,"resolution_notes": string | null,"status": string,"updated_at": string,"worker_claim": NonNullable<Json>,"worker_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "conflict_type": string,"contract_id": string,"contractor_record"?: Json | null,"created_at"?: string,"date": string,"event_uuid": string,"id"?: string,"project_id": string,"resolution_notes"?: string | null,"status"?: string,"updated_at"?: string,"worker_claim": NonNullable<Json>,"worker_id": string
                  }
                  Update: {
                    "conflict_type"?: string,"contract_id"?: string,"contractor_record"?: Json | null,"created_at"?: string,"date"?: string,"event_uuid"?: string,"id"?: string,"project_id"?: string,"resolution_notes"?: string | null,"status"?: string,"updated_at"?: string,"worker_claim"?: NonNullable<Json>,"worker_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "attendance_discrepancies_contract_id_fkey"
      columns: ["contract_id"]
isOneToOne: false
      referencedRelation: "contract_financial_summary"
      referencedColumns: ["contract_id"]
    },{
      foreignKeyName: "attendance_discrepancies_contract_id_fkey"
      columns: ["contract_id"]
isOneToOne: false
      referencedRelation: "work_contracts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_discrepancies_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_discrepancies_worker_id_fkey"
      columns: ["worker_id"]
isOneToOne: false
      referencedRelation: "worker_financial_summary"
      referencedColumns: ["worker_id"]
    },{
      foreignKeyName: "attendance_discrepancies_worker_id_fkey"
      columns: ["worker_id"]
isOneToOne: false
      referencedRelation: "workers"
      referencedColumns: ["id"]
    }
                  ]
                },"attendance_events": {
                  Row: {
                    "allowed_radius_meters": number,"attendance_method": string | null,"calculated_distance_meters": number,"captured_at": string | null,"contract_id": string,"contractor_id": string,"created_at": string,"date": string,"device_fingerprint": string | null,"fraud_flags": Json | null,"gps_accuracy_meters": number | null,"hash": string | null,"id": string,"idempotency_key": string | null,"mock_location_flag": boolean,"prev_hash": string | null,"project_id": string,"punch_type": string,"rejection_reason": string | null,"review_status": string,"status": Database["public"]['Enums']["attendance_status"],"token_id": string | null,"updated_at": string,"worker_id": string,"worker_latitude": number,"worker_longitude": number,"worksite_id": string,"worksite_latitude": number,"worksite_longitude": number
                  }
                  ComputedFields: never
                  Insert: {
                    "allowed_radius_meters"?: number,"attendance_method"?: string | null,"calculated_distance_meters": number,"captured_at"?: string | null,"contract_id": string,"contractor_id": string,"created_at"?: string,"date"?: string,"device_fingerprint"?: string | null,"fraud_flags"?: Json | null,"gps_accuracy_meters"?: number | null,"hash"?: string | null,"id"?: string,"idempotency_key"?: string | null,"mock_location_flag"?: boolean,"prev_hash"?: string | null,"project_id": string,"punch_type"?: string,"rejection_reason"?: string | null,"review_status"?: string,"status"?: Database["public"]['Enums']["attendance_status"],"token_id"?: string | null,"updated_at"?: string,"worker_id": string,"worker_latitude": number,"worker_longitude": number,"worksite_id": string,"worksite_latitude": number,"worksite_longitude": number
                  }
                  Update: {
                    "allowed_radius_meters"?: number,"attendance_method"?: string | null,"calculated_distance_meters"?: number,"captured_at"?: string | null,"contract_id"?: string,"contractor_id"?: string,"created_at"?: string,"date"?: string,"device_fingerprint"?: string | null,"fraud_flags"?: Json | null,"gps_accuracy_meters"?: number | null,"hash"?: string | null,"id"?: string,"idempotency_key"?: string | null,"mock_location_flag"?: boolean,"prev_hash"?: string | null,"project_id"?: string,"punch_type"?: string,"rejection_reason"?: string | null,"review_status"?: string,"status"?: Database["public"]['Enums']["attendance_status"],"token_id"?: string | null,"updated_at"?: string,"worker_id"?: string,"worker_latitude"?: number,"worker_longitude"?: number,"worksite_id"?: string,"worksite_latitude"?: number,"worksite_longitude"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "attendance_events_contract_id_fkey"
      columns: ["contract_id"]
isOneToOne: false
      referencedRelation: "contract_financial_summary"
      referencedColumns: ["contract_id"]
    },{
      foreignKeyName: "attendance_events_contract_id_fkey"
      columns: ["contract_id"]
isOneToOne: false
      referencedRelation: "work_contracts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_events_contractor_id_fkey"
      columns: ["contractor_id"]
isOneToOne: false
      referencedRelation: "contractors"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_events_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_events_token_id_fkey"
      columns: ["token_id"]
isOneToOne: false
      referencedRelation: "attendance_tokens"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_events_worker_id_fkey"
      columns: ["worker_id"]
isOneToOne: false
      referencedRelation: "worker_financial_summary"
      referencedColumns: ["worker_id"]
    },{
      foreignKeyName: "attendance_events_worker_id_fkey"
      columns: ["worker_id"]
isOneToOne: false
      referencedRelation: "workers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_events_worksite_id_fkey"
      columns: ["worksite_id"]
isOneToOne: false
      referencedRelation: "worksites"
      referencedColumns: ["id"]
    }
                  ]
                },"attendance_summaries": {
                  Row: {
                    "contract_id": string,"contractor_id": string,"created_at": string,"created_by": string,"end_date": string,"id": string,"notes": string | null,"project_id": string,"recorded_days_count": number,"start_date": string,"status": string,"updated_at": string,"worker_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "contract_id": string,"contractor_id": string,"created_at"?: string,"created_by": string,"end_date": string,"id"?: string,"notes"?: string | null,"project_id": string,"recorded_days_count": number,"start_date": string,"status"?: string,"updated_at"?: string,"worker_id": string
                  }
                  Update: {
                    "contract_id"?: string,"contractor_id"?: string,"created_at"?: string,"created_by"?: string,"end_date"?: string,"id"?: string,"notes"?: string | null,"project_id"?: string,"recorded_days_count"?: number,"start_date"?: string,"status"?: string,"updated_at"?: string,"worker_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "attendance_summaries_contract_id_fkey"
      columns: ["contract_id"]
isOneToOne: false
      referencedRelation: "contract_financial_summary"
      referencedColumns: ["contract_id"]
    },{
      foreignKeyName: "attendance_summaries_contract_id_fkey"
      columns: ["contract_id"]
isOneToOne: false
      referencedRelation: "work_contracts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_summaries_contractor_id_fkey"
      columns: ["contractor_id"]
isOneToOne: false
      referencedRelation: "contractors"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_summaries_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_summaries_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_summaries_worker_id_fkey"
      columns: ["worker_id"]
isOneToOne: false
      referencedRelation: "worker_financial_summary"
      referencedColumns: ["worker_id"]
    },{
      foreignKeyName: "attendance_summaries_worker_id_fkey"
      columns: ["worker_id"]
isOneToOne: false
      referencedRelation: "workers"
      referencedColumns: ["id"]
    }
                  ]
                },"attendance_tokens": {
                  Row: {
                    "created_at": string,"created_by": string,"expires_at": string,"hmac_secret": string | null,"id": string,"is_active": boolean,"max_uses": number | null,"nonce": string | null,"payload_json": Json | null,"project_id": string,"short_code": string | null,"token": string | null,"ttl_seconds": number,"used_count": number,"worksite_id": string | null,"valid_date": string,"token_hash": string | null,"code_hash": string | null,"encrypted_code": string | null,"encrypted_token": string | null,"revoked_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by": string,"expires_at": string,"hmac_secret"?: string | null,"id"?: string,"is_active"?: boolean,"max_uses"?: number | null,"nonce"?: string | null,"payload_json"?: Json | null,"project_id": string,"short_code"?: string | null,"token"?: string | null,"ttl_seconds"?: number,"used_count"?: number,"worksite_id"?: string | null,"valid_date"?: string,"token_hash"?: string | null,"code_hash"?: string | null,"encrypted_code"?: string | null,"encrypted_token"?: string | null,"revoked_at"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"expires_at"?: string,"hmac_secret"?: string | null,"id"?: string,"is_active"?: boolean,"max_uses"?: number | null,"nonce"?: string | null,"payload_json"?: Json | null,"project_id"?: string,"short_code"?: string | null,"token"?: string | null,"ttl_seconds"?: number,"used_count"?: number,"worksite_id"?: string | null,"valid_date"?: string,"token_hash"?: string | null,"code_hash"?: string | null,"encrypted_code"?: string | null,"encrypted_token"?: string | null,"revoked_at"?: string | null
                  }

                  Relationships: [
                    {
      foreignKeyName: "attendance_tokens_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_tokens_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_tokens_worksite_id_fkey"
      columns: ["worksite_id"]
isOneToOne: false
      referencedRelation: "worksites"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_events": {
                  Row: {
                    "action": string,"actor_id": string,"created_at": string,"current_hash": string,"entity_id": string,"entity_type": string,"id": string,"payload": NonNullable<Json>,"previous_hash": string,"sequence_number": number
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id": string,"created_at"?: string,"current_hash": string,"entity_id": string,"entity_type": string,"id"?: string,"payload"?: NonNullable<Json>,"previous_hash": string,"sequence_number"?: number
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string,"created_at"?: string,"current_hash"?: string,"entity_id"?: string,"entity_type"?: string,"id"?: string,"payload"?: NonNullable<Json>,"previous_hash"?: string,"sequence_number"?: number
                  }
                  Relationships: []
                },"complaint_reports": {
                  Row: {
                    "id": string,
                    "dispute_id": string,
                    "report_ref": string,
                    "version": number,
                    "language": "EN" | "HI" | "MR",
                    "recipient_type": "POLICE_STATION" | "LABOUR_OFFICE" | "OTHER",
                    "recipient_name": string,
                    "recipient_address": string,
                    "content_hash": string,
                    "ledger_hash": string,
                    "report_metadata": NonNullable<Json>,
                    "generated_by": string,
                    "generated_at": string,
                    "created_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,
                    "dispute_id": string,
                    "report_ref": string,
                    "version"?: number,
                    "language": "EN" | "HI" | "MR",
                    "recipient_type"?: "POLICE_STATION" | "LABOUR_OFFICE" | "OTHER",
                    "recipient_name": string,
                    "recipient_address": string,
                    "content_hash": string,
                    "ledger_hash": string,
                    "report_metadata"?: NonNullable<Json>,
                    "generated_by": string,
                    "generated_at"?: string,
                    "created_at"?: string
                  }
                  Update: {
                    "id"?: string,
                    "dispute_id"?: string,
                    "report_ref"?: string,
                    "version"?: number,
                    "language"?: "EN" | "HI" | "MR",
                    "recipient_type"?: "POLICE_STATION" | "LABOUR_OFFICE" | "OTHER",
                    "recipient_name"?: string,
                    "recipient_address"?: string,
                    "content_hash"?: string,
                    "ledger_hash"?: string,
                    "report_metadata"?: NonNullable<Json>,
                    "generated_by"?: string,
                    "generated_at"?: string,
                    "created_at"?: string
                  }
                  Relationships: [
                    {
                      foreignKeyName: "complaint_reports_dispute_id_fkey"
                      columns: ["dispute_id"]
                      isOneToOne: false
                      referencedRelation: "disputes"
                      referencedColumns: ["id"]
                    }
                  ]
                },"audit_log": {
                  Row: {
                    "action": string,"actor": string,"after": Json | null,"before": Json | null,"entity_id": string | null,"entity_type": string | null,"id": string,"timestamp": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor": string,"after"?: Json | null,"before"?: Json | null,"entity_id"?: string | null,"entity_type"?: string | null,"id"?: string,"timestamp"?: string
                  }
                  Update: {
                    "action"?: string,"actor"?: string,"after"?: Json | null,"before"?: Json | null,"entity_id"?: string | null,"entity_type"?: string | null,"id"?: string,"timestamp"?: string
                  }
                  Relationships: [
                    
                  ]
                },"compliance_check_logs": {
                  Row: {
                    "calculation": NonNullable<Json>,"checked_at": string,"checked_by": string | null,"contract_id": string,"explanation": string,"id": string,"inputs": NonNullable<Json>,"result": Database["public"]['Enums']["compliance_result_enum"],"rule_id": string | null,"rule_snapshot": Json | null,"rule_version": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "calculation": NonNullable<Json>,"checked_at"?: string,"checked_by"?: string | null,"contract_id": string,"explanation": string,"id"?: string,"inputs": NonNullable<Json>,"result": Database["public"]['Enums']["compliance_result_enum"],"rule_id"?: string | null,"rule_snapshot"?: Json | null,"rule_version"?: number | null
                  }
                  Update: {
                    "calculation"?: NonNullable<Json>,"checked_at"?: string,"checked_by"?: string | null,"contract_id"?: string,"explanation"?: string,"id"?: string,"inputs"?: NonNullable<Json>,"result"?: Database["public"]['Enums']["compliance_result_enum"],"rule_id"?: string | null,"rule_snapshot"?: Json | null,"rule_version"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "compliance_check_logs_checked_by_fkey"
      columns: ["checked_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "compliance_check_logs_contract_id_fkey"
      columns: ["contract_id"]
isOneToOne: false
      referencedRelation: "contract_financial_summary"
      referencedColumns: ["contract_id"]
    },{
      foreignKeyName: "compliance_check_logs_contract_id_fkey"
      columns: ["contract_id"]
isOneToOne: false
      referencedRelation: "work_contracts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "compliance_check_logs_rule_id_fkey"
      columns: ["rule_id"]
isOneToOne: false
      referencedRelation: "minimum_wage_rules"
      referencedColumns: ["id"]
    }
                  ]
                },"contract_acceptances": {
                  Row: {
                    "contract_id": string,"contract_pdf_url": string | null,"contract_version_id": string,"device_info": string | null,"id": string,"ip_address": string | null,"ip_hash": string | null,"rejection_reason": string | null,"responded_at": string,"response": Database["public"]['Enums']["acceptance_status"],"terms_hash": string | null,"user_agent": string | null,"worker_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "contract_id": string,"contract_pdf_url"?: string | null,"contract_version_id": string,"device_info"?: string | null,"id"?: string,"ip_address"?: string | null,"ip_hash"?: string | null,"rejection_reason"?: string | null,"responded_at"?: string,"response": Database["public"]['Enums']["acceptance_status"],"terms_hash"?: string | null,"user_agent"?: string | null,"worker_id": string
                  }
                  Update: {
                    "contract_id"?: string,"contract_pdf_url"?: string | null,"contract_version_id"?: string,"device_info"?: string | null,"id"?: string,"ip_address"?: string | null,"ip_hash"?: string | null,"rejection_reason"?: string | null,"responded_at"?: string,"response"?: Database["public"]['Enums']["acceptance_status"],"terms_hash"?: string | null,"user_agent"?: string | null,"worker_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "contract_acceptances_contract_id_fkey"
      columns: ["contract_id"]
isOneToOne: false
      referencedRelation: "contract_financial_summary"
      referencedColumns: ["contract_id"]
    },{
      foreignKeyName: "contract_acceptances_contract_id_fkey"
      columns: ["contract_id"]
isOneToOne: false
      referencedRelation: "work_contracts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contract_acceptances_contract_version_id_fkey"
      columns: ["contract_version_id"]
isOneToOne: false
      referencedRelation: "contract_versions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contract_acceptances_worker_id_fkey"
      columns: ["worker_id"]
isOneToOne: false
      referencedRelation: "worker_financial_summary"
      referencedColumns: ["worker_id"]
    },{
      foreignKeyName: "contract_acceptances_worker_id_fkey"
      columns: ["worker_id"]
isOneToOne: false
      referencedRelation: "workers"
      referencedColumns: ["id"]
    }
                  ]
                },"contract_versions": {
                  Row: {
                    "change_reason": string,"contract_id": string,"created_at": string,"created_by": string,"daily_wage": number,"effective_date": string,"expected_working_hours": number,"id": string,"payment_frequency": Database["public"]['Enums']["payment_frequency"],"terms_snapshot": NonNullable<Json>,"version_number": number,"work_type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "change_reason": string,"contract_id": string,"created_at"?: string,"created_by": string,"daily_wage": number,"effective_date": string,"expected_working_hours": number,"id"?: string,"payment_frequency": Database["public"]['Enums']["payment_frequency"],"terms_snapshot"?: NonNullable<Json>,"version_number": number,"work_type": string
                  }
                  Update: {
                    "change_reason"?: string,"contract_id"?: string,"created_at"?: string,"created_by"?: string,"daily_wage"?: number,"effective_date"?: string,"expected_working_hours"?: number,"id"?: string,"payment_frequency"?: Database["public"]['Enums']["payment_frequency"],"terms_snapshot"?: NonNullable<Json>,"version_number"?: number,"work_type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "contract_versions_contract_id_fkey"
      columns: ["contract_id"]
isOneToOne: false
      referencedRelation: "contract_financial_summary"
      referencedColumns: ["contract_id"]
    },{
      foreignKeyName: "contract_versions_contract_id_fkey"
      columns: ["contract_id"]
isOneToOne: false
      referencedRelation: "work_contracts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contract_versions_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"contractor_compliance_snapshots": {
                  Row: {
                    "breakdown": NonNullable<Json>,"contractor_id": string,"evaluated_at": string,"explanations": NonNullable<Json>,"id": string,"risk_level": Database["public"]['Enums']["contractor_risk_level_enum"],"score": number
                  }
                  ComputedFields: never
                  Insert: {
                    "breakdown": NonNullable<Json>,"contractor_id": string,"evaluated_at"?: string,"explanations": NonNullable<Json>,"id"?: string,"risk_level": Database["public"]['Enums']["contractor_risk_level_enum"],"score": number
                  }
                  Update: {
                    "breakdown"?: NonNullable<Json>,"contractor_id"?: string,"evaluated_at"?: string,"explanations"?: NonNullable<Json>,"id"?: string,"risk_level"?: Database["public"]['Enums']["contractor_risk_level_enum"],"score"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "contractor_compliance_snapshots_contractor_id_fkey"
      columns: ["contractor_id"]
isOneToOne: false
      referencedRelation: "contractors"
      referencedColumns: ["id"]
    }
                  ]
                },"contractors": {
                  Row: {
                    "company_name": string,"compliance_status": string,"created_at": string,"full_name": string,"id": string,"internal_contractor_id": string | null,"license_number": string | null,"non_compliance_reason": string | null,"non_compliant_since": string | null,"organization_id": string | null,"password_hash": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_name": string,"compliance_status"?: string,"created_at"?: string,"full_name": string,"id"?: string,"internal_contractor_id"?: string | null,"license_number"?: string | null,"non_compliance_reason"?: string | null,"non_compliant_since"?: string | null,"organization_id"?: string | null,"password_hash"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "company_name"?: string,"compliance_status"?: string,"created_at"?: string,"full_name"?: string,"id"?: string,"internal_contractor_id"?: string | null,"license_number"?: string | null,"non_compliance_reason"?: string | null,"non_compliant_since"?: string | null,"organization_id"?: string | null,"password_hash"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "contractors_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contractors_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"dispute_evidence_snapshots": {
                  Row: {
                    "attendance_snapshot": NonNullable<Json>,"audit_events_snapshot": NonNullable<Json>,"automated_analysis": NonNullable<Json>,"contract_snapshot": NonNullable<Json>,"contract_versions_snapshot": NonNullable<Json>,"created_at": string,"dispute_id": string,"earnings_snapshot": Json | null,"id": string,"payment_confirmations_snapshot": NonNullable<Json>,"payment_transactions_snapshot": NonNullable<Json>,"worker_acceptance_snapshot": Json | null,"worker_attendance_confirmations_snapshot": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "attendance_snapshot"?: NonNullable<Json>,"audit_events_snapshot"?: NonNullable<Json>,"automated_analysis": NonNullable<Json>,"contract_snapshot": NonNullable<Json>,"contract_versions_snapshot"?: NonNullable<Json>,"created_at"?: string,"dispute_id": string,"earnings_snapshot"?: Json | null,"id"?: string,"payment_confirmations_snapshot"?: NonNullable<Json>,"payment_transactions_snapshot"?: NonNullable<Json>,"worker_acceptance_snapshot"?: Json | null,"worker_attendance_confirmations_snapshot"?: NonNullable<Json>
                  }
                  Update: {
                    "attendance_snapshot"?: NonNullable<Json>,"audit_events_snapshot"?: NonNullable<Json>,"automated_analysis"?: NonNullable<Json>,"contract_snapshot"?: NonNullable<Json>,"contract_versions_snapshot"?: NonNullable<Json>,"created_at"?: string,"dispute_id"?: string,"earnings_snapshot"?: Json | null,"id"?: string,"payment_confirmations_snapshot"?: NonNullable<Json>,"payment_transactions_snapshot"?: NonNullable<Json>,"worker_acceptance_snapshot"?: Json | null,"worker_attendance_confirmations_snapshot"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "dispute_evidence_snapshots_dispute_id_fkey"
      columns: ["dispute_id"]
isOneToOne: false
      referencedRelation: "disputes"
      referencedColumns: ["id"]
    }
                  ]
                },"dispute_resolutions": {
                  Row: {
                    "decision": string,"dispute_id": string,"id": string,"reason": string,"resolution_notes": string | null,"resolved_at": string,"reviewer_user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "decision": string,"dispute_id": string,"id"?: string,"reason": string,"resolution_notes"?: string | null,"resolved_at"?: string,"reviewer_user_id": string
                  }
                  Update: {
                    "decision"?: string,"dispute_id"?: string,"id"?: string,"reason"?: string,"resolution_notes"?: string | null,"resolved_at"?: string,"reviewer_user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "dispute_resolutions_dispute_id_fkey"
      columns: ["dispute_id"]
isOneToOne: false
      referencedRelation: "disputes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "dispute_resolutions_reviewer_user_id_fkey"
      columns: ["reviewer_user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"disputes": {
                  Row: {
                    "amount_claimed_paise": number,"category": any,"contract_id": string,"contractor_counter_statement": string | null,"contractor_evidence_url": string | null,"contractor_id": string,"contractor_responded_at": string | null,"contractor_response_deadline": string | null,"created_at": string,"description": string,"dispute_ref": string,"evidence_photo_url": string | null,"evidence_voice_url": string | null,"id": string,"is_deadline_missed": boolean,"is_settled": boolean,"linked_attendance_event_ids": NonNullable<Json>,"linked_ledger_entry_ids": NonNullable<Json>,"order_payment_deadline": string | null,"ordered_amount_paise": number,"priority": Database["public"]['Enums']["dispute_priority_enum"],"project_id": string,"raised_by_user_id": string,"ruling_decision": string | null,"ruling_issued_at": string | null,"ruling_issued_by": string | null,"ruling_reason": string | null,"settled_at": string | null,"settlement_ledger_entry_id": string | null,"status": any,"updated_at": string,"voice_transcription": string | null,"worker_id": string,"reference": string,"period_from": string,"period_to": string,"earned_paise": number,"paid_paise": number,"shortfall_paise": number,"claimed_paise": number,"claimed_justification": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_claimed_paise"?: number,"category": any,"contract_id": string,"contractor_counter_statement"?: string | null,"contractor_evidence_url"?: string | null,"contractor_id": string,"contractor_responded_at"?: string | null,"contractor_response_deadline"?: string | null,"created_at"?: string,"description": string,"dispute_ref"?: string,"evidence_photo_url"?: string | null,"evidence_voice_url"?: string | null,"id"?: string,"is_deadline_missed"?: boolean,"is_settled"?: boolean,"linked_attendance_event_ids"?: NonNullable<Json>,"linked_ledger_entry_ids"?: NonNullable<Json>,"order_payment_deadline"?: string | null,"ordered_amount_paise"?: number,"priority"?: Database["public"]['Enums']["dispute_priority_enum"],"project_id": string,"raised_by_user_id"?: string,"ruling_decision"?: string | null,"ruling_issued_at"?: string | null,"ruling_issued_by"?: string | null,"ruling_reason"?: string | null,"settled_at"?: string | null,"settlement_ledger_entry_id"?: string | null,"status"?: any,"updated_at"?: string,"voice_transcription"?: string | null,"worker_id": string,"reference"?: string,"period_from"?: string,"period_to"?: string,"earned_paise"?: number,"paid_paise"?: number,"shortfall_paise"?: number,"claimed_paise"?: number,"claimed_justification"?: string | null
                  }
                  Update: {
                    "amount_claimed_paise"?: number,"category"?: any,"contract_id"?: string,"contractor_counter_statement"?: string | null,"contractor_evidence_url"?: string | null,"contractor_id"?: string,"contractor_responded_at"?: string | null,"contractor_response_deadline"?: string | null,"created_at"?: string,"description"?: string,"dispute_ref"?: string,"evidence_photo_url"?: string | null,"evidence_voice_url"?: string | null,"id"?: string,"is_deadline_missed"?: boolean,"is_settled"?: boolean,"linked_attendance_event_ids"?: NonNullable<Json>,"linked_ledger_entry_ids"?: NonNullable<Json>,"order_payment_deadline"?: string | null,"ordered_amount_paise"?: number,"priority"?: Database["public"]['Enums']["dispute_priority_enum"],"project_id"?: string,"raised_by_user_id"?: string,"ruling_decision"?: string | null,"ruling_issued_at"?: string | null,"ruling_issued_by"?: string | null,"ruling_reason"?: string | null,"settled_at"?: string | null,"settlement_ledger_entry_id"?: string | null,"status"?: any,"updated_at"?: string,"voice_transcription"?: string | null,"worker_id"?: string,"reference"?: string,"period_from"?: string,"period_to"?: string,"earned_paise"?: number,"paid_paise"?: number,"shortfall_paise"?: number,"claimed_paise"?: number,"claimed_justification"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "disputes_contract_id_fkey"
      columns: ["contract_id"]
isOneToOne: false
      referencedRelation: "contract_financial_summary"
      referencedColumns: ["contract_id"]
    },{
      foreignKeyName: "disputes_contract_id_fkey"
      columns: ["contract_id"]
isOneToOne: false
      referencedRelation: "work_contracts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "disputes_contractor_id_fkey"
      columns: ["contractor_id"]
isOneToOne: false
      referencedRelation: "contractors"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "disputes_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "disputes_raised_by_user_id_fkey"
      columns: ["raised_by_user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "disputes_ruling_issued_by_fkey"
      columns: ["ruling_issued_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "disputes_worker_id_fkey"
      columns: ["worker_id"]
isOneToOne: false
      referencedRelation: "worker_financial_summary"
      referencedColumns: ["worker_id"]
    },{
      foreignKeyName: "disputes_worker_id_fkey"
      columns: ["worker_id"]
isOneToOne: false
      referencedRelation: "workers"
      referencedColumns: ["id"]
    }
                  ]
                },"earnings_snapshots": {
                  Row: {
                    "computed_at": string,"computed_by": string,"contract_id": string,"contractor_id": string,"daily_wage_paise": number,"id": string,"period_end": string,"period_start": string,"total_earned_paise": number,"verified_days_count": number,"worker_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "computed_at"?: string,"computed_by": string,"contract_id": string,"contractor_id": string,"daily_wage_paise": number,"id"?: string,"period_end": string,"period_start": string,"total_earned_paise": number,"verified_days_count": number,"worker_id": string
                  }
                  Update: {
                    "computed_at"?: string,"computed_by"?: string,"contract_id"?: string,"contractor_id"?: string,"daily_wage_paise"?: number,"id"?: string,"period_end"?: string,"period_start"?: string,"total_earned_paise"?: number,"verified_days_count"?: number,"worker_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "earnings_snapshots_computed_by_fkey"
      columns: ["computed_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "earnings_snapshots_contract_id_fkey"
      columns: ["contract_id"]
isOneToOne: false
      referencedRelation: "contract_financial_summary"
      referencedColumns: ["contract_id"]
    },{
      foreignKeyName: "earnings_snapshots_contract_id_fkey"
      columns: ["contract_id"]
isOneToOne: false
      referencedRelation: "work_contracts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "earnings_snapshots_contractor_id_fkey"
      columns: ["contractor_id"]
isOneToOne: false
      referencedRelation: "contractors"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "earnings_snapshots_worker_id_fkey"
      columns: ["worker_id"]
isOneToOne: false
      referencedRelation: "worker_financial_summary"
      referencedColumns: ["worker_id"]
    },{
      foreignKeyName: "earnings_snapshots_worker_id_fkey"
      columns: ["worker_id"]
isOneToOne: false
      referencedRelation: "workers"
      referencedColumns: ["id"]
    }
                  ]
                },"employment_relationships": {
                  Row: {
                    "acceptance_id": string | null,"acceptance_timestamp": string,"contract_id": string,"contract_version_id": string,"contractor_id": string,"created_at": string,"end_date": string | null,"id": string,"project_id": string,"start_date": string,"status": Database["public"]['Enums']["employment_status"],"updated_at": string,"worker_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "acceptance_id"?: string | null,"acceptance_timestamp"?: string,"contract_id": string,"contract_version_id": string,"contractor_id": string,"created_at"?: string,"end_date"?: string | null,"id"?: string,"project_id": string,"start_date": string,"status"?: Database["public"]['Enums']["employment_status"],"updated_at"?: string,"worker_id": string
                  }
                  Update: {
                    "acceptance_id"?: string | null,"acceptance_timestamp"?: string,"contract_id"?: string,"contract_version_id"?: string,"contractor_id"?: string,"created_at"?: string,"end_date"?: string | null,"id"?: string,"project_id"?: string,"start_date"?: string,"status"?: Database["public"]['Enums']["employment_status"],"updated_at"?: string,"worker_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "employment_relationships_acceptance_id_fkey"
      columns: ["acceptance_id"]
isOneToOne: false
      referencedRelation: "contract_acceptances"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "employment_relationships_contract_id_fkey"
      columns: ["contract_id"]
isOneToOne: false
      referencedRelation: "contract_financial_summary"
      referencedColumns: ["contract_id"]
    },{
      foreignKeyName: "employment_relationships_contract_id_fkey"
      columns: ["contract_id"]
isOneToOne: false
      referencedRelation: "work_contracts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "employment_relationships_contract_version_id_fkey"
      columns: ["contract_version_id"]
isOneToOne: false
      referencedRelation: "contract_versions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "employment_relationships_contractor_id_fkey"
      columns: ["contractor_id"]
isOneToOne: false
      referencedRelation: "contractors"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "employment_relationships_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "employment_relationships_worker_id_fkey"
      columns: ["worker_id"]
isOneToOne: false
      referencedRelation: "worker_financial_summary"
      referencedColumns: ["worker_id"]
    },{
      foreignKeyName: "employment_relationships_worker_id_fkey"
      columns: ["worker_id"]
isOneToOne: false
      referencedRelation: "workers"
      referencedColumns: ["id"]
    }
                  ]
                },"fraud_review_queue": {
                  Row: {
                    "attendance_event_id": string,"created_at": string,"flag_reasons": NonNullable<Json>,"id": string,"project_id": string,"review_decision": string | null,"review_notes": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"severity": string,"worker_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attendance_event_id": string,"created_at"?: string,"flag_reasons"?: NonNullable<Json>,"id"?: string,"project_id": string,"review_decision"?: string | null,"review_notes"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"severity"?: string,"worker_id": string
                  }
                  Update: {
                    "attendance_event_id"?: string,"created_at"?: string,"flag_reasons"?: NonNullable<Json>,"id"?: string,"project_id"?: string,"review_decision"?: string | null,"review_notes"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"severity"?: string,"worker_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "fraud_review_queue_attendance_event_id_fkey"
      columns: ["attendance_event_id"]
isOneToOne: false
      referencedRelation: "attendance_events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fraud_review_queue_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fraud_review_queue_reviewed_by_fkey"
      columns: ["reviewed_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fraud_review_queue_worker_id_fkey"
      columns: ["worker_id"]
isOneToOne: false
      referencedRelation: "worker_financial_summary"
      referencedColumns: ["worker_id"]
    },{
      foreignKeyName: "fraud_review_queue_worker_id_fkey"
      columns: ["worker_id"]
isOneToOne: false
      referencedRelation: "workers"
      referencedColumns: ["id"]
    }
                  ]
                },"institutional_users": {
                  Row: {
                    "created_at": string,"full_name": string,"id": string,"jurisdiction_region": string,"official_designation": string,"organization_id": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"full_name": string,"id"?: string,"jurisdiction_region": string,"official_designation": string,"organization_id": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"full_name"?: string,"id"?: string,"jurisdiction_region"?: string,"official_designation"?: string,"organization_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "institutional_users_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "institutional_users_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"issued_credentials": {
                  Row: {
                    "created_at": string,"credential_hash": string,"credential_ref": string,"id": string,"issued_at": string,"ledger_hash_at_issuance": string,"revoked_at": string | null,"sharing_consent": NonNullable<Json>,"snapshot_payload": NonNullable<Json>,"worker_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"credential_hash": string,"credential_ref": string,"id"?: string,"issued_at"?: string,"ledger_hash_at_issuance": string,"revoked_at"?: string | null,"sharing_consent"?: NonNullable<Json>,"snapshot_payload": NonNullable<Json>,"worker_id": string
                  }
                  Update: {
                    "created_at"?: string,"credential_hash"?: string,"credential_ref"?: string,"id"?: string,"issued_at"?: string,"ledger_hash_at_issuance"?: string,"revoked_at"?: string | null,"sharing_consent"?: NonNullable<Json>,"snapshot_payload"?: NonNullable<Json>,"worker_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "issued_credentials_worker_id_fkey"
      columns: ["worker_id"]
isOneToOne: false
      referencedRelation: "worker_financial_summary"
      referencedColumns: ["worker_id"]
    },{
      foreignKeyName: "issued_credentials_worker_id_fkey"
      columns: ["worker_id"]
isOneToOne: false
      referencedRelation: "workers"
      referencedColumns: ["id"]
    }
                  ]
                },"job_completion_statements": {
                  Row: {
                    "acceptance_date": string,"contract_id": string,"contract_period_end": string | null,"contract_period_start": string,"contractor_id": string,"daily_wage_paise": number,"employment_relationship_id": string,"generated_at": string,"generated_by": string,"id": string,"open_disputes": number,"outstanding_paise": number,"project_id": string,"resolved_disputes": number,"settlement_status": Database["public"]['Enums']["settlement_status_enum"],"total_disputes": number,"total_earned_paise": number,"total_paid_paise": number,"verified_workdays": number,"work_type": string,"worker_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "acceptance_date": string,"contract_id": string,"contract_period_end"?: string | null,"contract_period_start": string,"contractor_id": string,"daily_wage_paise": number,"employment_relationship_id": string,"generated_at"?: string,"generated_by": string,"id"?: string,"open_disputes"?: number,"outstanding_paise"?: number,"project_id": string,"resolved_disputes"?: number,"settlement_status": Database["public"]['Enums']["settlement_status_enum"],"total_disputes"?: number,"total_earned_paise"?: number,"total_paid_paise"?: number,"verified_workdays"?: number,"work_type": string,"worker_id": string
                  }
                  Update: {
                    "acceptance_date"?: string,"contract_id"?: string,"contract_period_end"?: string | null,"contract_period_start"?: string,"contractor_id"?: string,"daily_wage_paise"?: number,"employment_relationship_id"?: string,"generated_at"?: string,"generated_by"?: string,"id"?: string,"open_disputes"?: number,"outstanding_paise"?: number,"project_id"?: string,"resolved_disputes"?: number,"settlement_status"?: Database["public"]['Enums']["settlement_status_enum"],"total_disputes"?: number,"total_earned_paise"?: number,"total_paid_paise"?: number,"verified_workdays"?: number,"work_type"?: string,"worker_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "job_completion_statements_contract_id_fkey"
      columns: ["contract_id"]
isOneToOne: false
      referencedRelation: "contract_financial_summary"
      referencedColumns: ["contract_id"]
    },{
      foreignKeyName: "job_completion_statements_contract_id_fkey"
      columns: ["contract_id"]
isOneToOne: false
      referencedRelation: "work_contracts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "job_completion_statements_contractor_id_fkey"
      columns: ["contractor_id"]
isOneToOne: false
      referencedRelation: "contractors"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "job_completion_statements_employment_relationship_id_fkey"
      columns: ["employment_relationship_id"]
isOneToOne: false
      referencedRelation: "employment_relationships"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "job_completion_statements_generated_by_fkey"
      columns: ["generated_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "job_completion_statements_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "job_completion_statements_worker_id_fkey"
      columns: ["worker_id"]
isOneToOne: false
      referencedRelation: "worker_financial_summary"
      referencedColumns: ["worker_id"]
    },{
      foreignKeyName: "job_completion_statements_worker_id_fkey"
      columns: ["worker_id"]
isOneToOne: false
      referencedRelation: "workers"
      referencedColumns: ["id"]
    }
                  ]
                },"ledger_entries": {
                  Row: {
                    "account_id": string | null,"amount_paise": number,"balance_after_paise": number | null,"contract_id": string | null,"created_at": string,"credit_account": string | null,"debit_account": string | null,"description": string | null,"direction": Database["public"]['Enums']["ledger_direction"] | null,"hash": string | null,"id": string,"prev_hash": string | null,"project_id": string | null,"ref_id": string | null,"ref_type": string | null,"transaction_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id"?: string | null,"amount_paise": number,"balance_after_paise"?: number | null,"contract_id"?: string | null,"created_at"?: string,"credit_account"?: string | null,"debit_account"?: string | null,"description"?: string | null,"direction"?: Database["public"]['Enums']["ledger_direction"] | null,"hash"?: string | null,"id"?: string,"prev_hash"?: string | null,"project_id"?: string | null,"ref_id"?: string | null,"ref_type"?: string | null,"transaction_id"?: string | null
                  }
                  Update: {
                    "account_id"?: string | null,"amount_paise"?: number,"balance_after_paise"?: number | null,"contract_id"?: string | null,"created_at"?: string,"credit_account"?: string | null,"debit_account"?: string | null,"description"?: string | null,"direction"?: Database["public"]['Enums']["ledger_direction"] | null,"hash"?: string | null,"id"?: string,"prev_hash"?: string | null,"project_id"?: string | null,"ref_id"?: string | null,"ref_type"?: string | null,"transaction_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "ledger_entries_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "wallet_accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ledger_entries_contract_id_fkey"
      columns: ["contract_id"]
isOneToOne: false
      referencedRelation: "contract_financial_summary"
      referencedColumns: ["contract_id"]
    },{
      foreignKeyName: "ledger_entries_contract_id_fkey"
      columns: ["contract_id"]
isOneToOne: false
      referencedRelation: "work_contracts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ledger_entries_credit_account_fkey"
      columns: ["credit_account"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ledger_entries_debit_account_fkey"
      columns: ["debit_account"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ledger_entries_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ledger_entries_transaction_id_fkey"
      columns: ["transaction_id"]
isOneToOne: false
      referencedRelation: "payment_transactions"
      referencedColumns: ["id"]
    }
                  ]
                },"minimum_wage_rules": {
                  Row: {
                    "created_at": string,"district": string | null,"effective_from": string,"effective_to": string | null,"id": string,"is_active": boolean,"minimum_amount_paise": number,"skill_level": Database["public"]['Enums']["skill_category_enum"],"source_reference": string,"state": string,"updated_at": string,"version": number,"wage_type": string,"worker_category": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"district"?: string | null,"effective_from": string,"effective_to"?: string | null,"id"?: string,"is_active"?: boolean,"minimum_amount_paise": number,"skill_level": Database["public"]['Enums']["skill_category_enum"],"source_reference": string,"state": string,"updated_at"?: string,"version"?: number,"wage_type"?: string,"worker_category"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"district"?: string | null,"effective_from"?: string,"effective_to"?: string | null,"id"?: string,"is_active"?: boolean,"minimum_amount_paise"?: number,"skill_level"?: Database["public"]['Enums']["skill_category_enum"],"source_reference"?: string,"state"?: string,"updated_at"?: string,"version"?: number,"wage_type"?: string,"worker_category"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"minimum_wages": {
                  Row: {
                    "created_at": string,"daily_rate_paise": number | null,"effective_date": string,"effective_from": string | null,"id": string,"is_active": boolean,"minimum_wage_paise": number,"region": string,"skill_category": string | null,"skill_tier": Database["public"]['Enums']["skill_category_enum"],"source_citation": string,"source_name": string | null,"source_url": string | null,"state": string,"updated_at": string,"verified": boolean,"zone": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"daily_rate_paise"?: number | null,"effective_date": string,"effective_from"?: string | null,"id"?: string,"is_active"?: boolean,"minimum_wage_paise": number,"region": string,"skill_category"?: string | null,"skill_tier": Database["public"]['Enums']["skill_category_enum"],"source_citation": string,"source_name"?: string | null,"source_url"?: string | null,"state"?: string,"updated_at"?: string,"verified"?: boolean,"zone"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"daily_rate_paise"?: number | null,"effective_date"?: string,"effective_from"?: string | null,"id"?: string,"is_active"?: boolean,"minimum_wage_paise"?: number,"region"?: string,"skill_category"?: string | null,"skill_tier"?: Database["public"]['Enums']["skill_category_enum"],"source_citation"?: string,"source_name"?: string | null,"source_url"?: string | null,"state"?: string,"updated_at"?: string,"verified"?: boolean,"zone"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"notifications": {
                  Row: {
                    "created_at": string,"id": string,"message": string,"payload": Json | null,"read": boolean,"role": Database["public"]['Enums']["user_role"],"title": string,"type": Database["public"]['Enums']["notification_type_enum"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"message": string,"payload"?: Json | null,"read"?: boolean,"role": Database["public"]['Enums']["user_role"],"title": string,"type": Database["public"]['Enums']["notification_type_enum"],"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"message"?: string,"payload"?: Json | null,"read"?: boolean,"role"?: Database["public"]['Enums']["user_role"],"title"?: string,"type"?: Database["public"]['Enums']["notification_type_enum"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"organizations": {
                  Row: {
                    "address": string | null,"contact_email": string | null,"contact_phone": string | null,"created_at": string,"id": string,"is_active": boolean,"name": string,"org_type": Database["public"]['Enums']["org_type_enum"],"registration_number": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"contact_email"?: string | null,"contact_phone"?: string | null,"created_at"?: string,"id"?: string,"is_active"?: boolean,"name": string,"org_type": Database["public"]['Enums']["org_type_enum"],"registration_number"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string | null,"contact_email"?: string | null,"contact_phone"?: string | null,"created_at"?: string,"id"?: string,"is_active"?: boolean,"name"?: string,"org_type"?: Database["public"]['Enums']["org_type_enum"],"registration_number"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"payment_confirmations": {
                  Row: {
                    "confirmed_at": string,"dispute_reason": string | null,"id": string,"is_confirmed": boolean,"transaction_id": string,"worker_id": string,"worker_notes": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "confirmed_at"?: string,"dispute_reason"?: string | null,"id"?: string,"is_confirmed": boolean,"transaction_id": string,"worker_id": string,"worker_notes"?: string | null
                  }
                  Update: {
                    "confirmed_at"?: string,"dispute_reason"?: string | null,"id"?: string,"is_confirmed"?: boolean,"transaction_id"?: string,"worker_id"?: string,"worker_notes"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "payment_confirmations_transaction_id_fkey"
      columns: ["transaction_id"]
isOneToOne: false
      referencedRelation: "payment_transactions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_confirmations_worker_id_fkey"
      columns: ["worker_id"]
isOneToOne: false
      referencedRelation: "worker_financial_summary"
      referencedColumns: ["worker_id"]
    },{
      foreignKeyName: "payment_confirmations_worker_id_fkey"
      columns: ["worker_id"]
isOneToOne: false
      referencedRelation: "workers"
      referencedColumns: ["id"]
    }
                  ]
                },"payment_transactions": {
                  Row: {
                    "amount_paise": number,"claimed_at": string | null,"confirmed_at": string | null,"contract_id": string,"contractor_id": string,"created_at": string,"dispute_reason": string | null,"disputed_at": string | null,"escalation_deadline": string | null,"id": string,"idempotency_key": string,"initiated_by": string,"is_escalated": boolean,"notes": string | null,"payment_method": string | null,"payment_source": Database["public"]['Enums']["payment_source"],"project_id": string,"proof_url": string | null,"receiver_account_id": string,"reference_number": string | null,"sender_account_id": string,"status": Database["public"]['Enums']["payment_status"],"transaction_ref": string,"updated_at": string,"worker_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_paise": number,"claimed_at"?: string | null,"confirmed_at"?: string | null,"contract_id": string,"contractor_id": string,"created_at"?: string,"dispute_reason"?: string | null,"disputed_at"?: string | null,"escalation_deadline"?: string | null,"id"?: string,"idempotency_key": string,"initiated_by": string,"is_escalated"?: boolean,"notes"?: string | null,"payment_method"?: string | null,"payment_source"?: Database["public"]['Enums']["payment_source"],"project_id": string,"proof_url"?: string | null,"receiver_account_id": string,"reference_number"?: string | null,"sender_account_id": string,"status"?: Database["public"]['Enums']["payment_status"],"transaction_ref": string,"updated_at"?: string,"worker_id": string
                  }
                  Update: {
                    "amount_paise"?: number,"claimed_at"?: string | null,"confirmed_at"?: string | null,"contract_id"?: string,"contractor_id"?: string,"created_at"?: string,"dispute_reason"?: string | null,"disputed_at"?: string | null,"escalation_deadline"?: string | null,"id"?: string,"idempotency_key"?: string,"initiated_by"?: string,"is_escalated"?: boolean,"notes"?: string | null,"payment_method"?: string | null,"payment_source"?: Database["public"]['Enums']["payment_source"],"project_id"?: string,"proof_url"?: string | null,"receiver_account_id"?: string,"reference_number"?: string | null,"sender_account_id"?: string,"status"?: Database["public"]['Enums']["payment_status"],"transaction_ref"?: string,"updated_at"?: string,"worker_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payment_transactions_contract_id_fkey"
      columns: ["contract_id"]
isOneToOne: false
      referencedRelation: "contract_financial_summary"
      referencedColumns: ["contract_id"]
    },{
      foreignKeyName: "payment_transactions_contract_id_fkey"
      columns: ["contract_id"]
isOneToOne: false
      referencedRelation: "work_contracts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_transactions_contractor_id_fkey"
      columns: ["contractor_id"]
isOneToOne: false
      referencedRelation: "contractors"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_transactions_initiated_by_fkey"
      columns: ["initiated_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_transactions_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_transactions_receiver_account_id_fkey"
      columns: ["receiver_account_id"]
isOneToOne: false
      referencedRelation: "wallet_accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_transactions_sender_account_id_fkey"
      columns: ["sender_account_id"]
isOneToOne: false
      referencedRelation: "wallet_accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_transactions_worker_id_fkey"
      columns: ["worker_id"]
isOneToOne: false
      referencedRelation: "worker_financial_summary"
      referencedColumns: ["worker_id"]
    },{
      foreignKeyName: "payment_transactions_worker_id_fkey"
      columns: ["worker_id"]
isOneToOne: false
      referencedRelation: "workers"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"email": string | null,"full_name": string | null,"id": string,"is_active": boolean,"locale": string,"login_id": string | null,"phone": string | null,"role": Database["public"]['Enums']["user_role"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email"?: string | null,"full_name"?: string | null,"id": string,"is_active"?: boolean,"locale"?: string,"login_id"?: string | null,"phone"?: string | null,"role"?: Database["public"]['Enums']["user_role"],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string | null,"full_name"?: string | null,"id"?: string,"is_active"?: boolean,"locale"?: string,"login_id"?: string | null,"phone"?: string | null,"role"?: Database["public"]['Enums']["user_role"],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"projects": {
                  Row: {
                    "contractor_id": string,"created_at": string,"description": string | null,"end_date": string | null,"id": string,"name": string,"start_date": string,"status": Database["public"]['Enums']["project_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "contractor_id": string,"created_at"?: string,"description"?: string | null,"end_date"?: string | null,"id"?: string,"name": string,"start_date": string,"status"?: Database["public"]['Enums']["project_status"],"updated_at"?: string
                  }
                  Update: {
                    "contractor_id"?: string,"created_at"?: string,"description"?: string | null,"end_date"?: string | null,"id"?: string,"name"?: string,"start_date"?: string,"status"?: Database["public"]['Enums']["project_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "projects_contractor_id_fkey"
      columns: ["contractor_id"]
isOneToOne: false
      referencedRelation: "contractors"
      referencedColumns: ["id"]
    }
                  ]
                },"reminders": {
                  Row: {
                    "contract_id": string | null,"created_at": string,"due_at": string,"id": string,"payload": Json | null,"project_id": string | null,"status": string,"type": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "contract_id"?: string | null,"created_at"?: string,"due_at": string,"id"?: string,"payload"?: Json | null,"project_id"?: string | null,"status"?: string,"type": string,"user_id": string
                  }
                  Update: {
                    "contract_id"?: string | null,"created_at"?: string,"due_at"?: string,"id"?: string,"payload"?: Json | null,"project_id"?: string | null,"status"?: string,"type"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reminders_contract_id_fkey"
      columns: ["contract_id"]
isOneToOne: false
      referencedRelation: "contract_financial_summary"
      referencedColumns: ["contract_id"]
    },{
      foreignKeyName: "reminders_contract_id_fkey"
      columns: ["contract_id"]
isOneToOne: false
      referencedRelation: "work_contracts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reminders_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reminders_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"supervisor_project_assignments": {
                  Row: {
                    "assigned_at": string,"id": string,"is_active": boolean,"project_id": string,"supervisor_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assigned_at"?: string,"id"?: string,"is_active"?: boolean,"project_id": string,"supervisor_id": string
                  }
                  Update: {
                    "assigned_at"?: string,"id"?: string,"is_active"?: boolean,"project_id"?: string,"supervisor_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "supervisor_project_assignments_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "supervisor_project_assignments_supervisor_id_fkey"
      columns: ["supervisor_id"]
isOneToOne: false
      referencedRelation: "supervisors"
      referencedColumns: ["id"]
    }
                  ]
                },"supervisors": {
                  Row: {
                    "badge_number": string | null,"contractor_id": string,"created_at": string,"full_name": string,"id": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "badge_number"?: string | null,"contractor_id": string,"created_at"?: string,"full_name": string,"id"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "badge_number"?: string | null,"contractor_id"?: string,"created_at"?: string,"full_name"?: string,"id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "supervisors_contractor_id_fkey"
      columns: ["contractor_id"]
isOneToOne: false
      referencedRelation: "contractors"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "supervisors_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"users": {
                  Row: {
                    "created_at": string,"email": string | null,"id": string,"is_active": boolean,"locale": string,"login_id": string | null,"password_hash": string | null,"phone": string,"role": Database["public"]['Enums']["user_role"],"set_password_token": string | null,"set_password_token_expires_at": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email"?: string | null,"id": string,"is_active"?: boolean,"locale"?: string,"login_id"?: string | null,"password_hash"?: string | null,"phone": string,"role": Database["public"]['Enums']["user_role"],"set_password_token"?: string | null,"set_password_token_expires_at"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string | null,"id"?: string,"is_active"?: boolean,"locale"?: string,"login_id"?: string | null,"password_hash"?: string | null,"phone"?: string,"role"?: Database["public"]['Enums']["user_role"],"set_password_token"?: string | null,"set_password_token_expires_at"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"wallet_accounts": {
                  Row: {
                    "account_type": string,"created_at": string,"currency": string,"id": string,"is_active": boolean,"owner_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_type": string,"created_at"?: string,"currency"?: string,"id"?: string,"is_active"?: boolean,"owner_id": string,"updated_at"?: string
                  }
                  Update: {
                    "account_type"?: string,"created_at"?: string,"currency"?: string,"id"?: string,"is_active"?: boolean,"owner_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"work_contracts": {
                  Row: {
                    "audit_trail": Json | null,"contract_code": string,"contract_pdf_url": string | null,"contractor_id": string,"created_at": string,"current_version_number": number,"daily_wage": number,"dues_confirmed": boolean | null,"end_date": string | null,"end_reason": string | null,"ended_by": string | null,"expected_working_hours": number,"id": string,"join_token": string,"min_wage_applicable_paise": number | null,"min_wage_override_acknowledged": boolean | null,"payment_frequency": Database["public"]['Enums']["payment_frequency"],"project_id": string,"start_date": string,"status": Database["public"]['Enums']["contract_status"],"terms_hash": string | null,"unresolved_dues_paise": number | null,"updated_at": string,"work_type": string,"worker_id": string,"worksite_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "audit_trail"?: Json | null,"contract_code": string,"contract_pdf_url"?: string | null,"contractor_id": string,"created_at"?: string,"current_version_number"?: number,"daily_wage": number,"dues_confirmed"?: boolean | null,"end_date"?: string | null,"end_reason"?: string | null,"ended_by"?: string | null,"expected_working_hours"?: number,"id"?: string,"join_token"?: string,"min_wage_applicable_paise"?: number | null,"min_wage_override_acknowledged"?: boolean | null,"payment_frequency"?: Database["public"]['Enums']["payment_frequency"],"project_id": string,"start_date": string,"status"?: Database["public"]['Enums']["contract_status"],"terms_hash"?: string | null,"unresolved_dues_paise"?: number | null,"updated_at"?: string,"work_type": string,"worker_id": string,"worksite_id": string
                  }
                  Update: {
                    "audit_trail"?: Json | null,"contract_code"?: string,"contract_pdf_url"?: string | null,"contractor_id"?: string,"created_at"?: string,"current_version_number"?: number,"daily_wage"?: number,"dues_confirmed"?: boolean | null,"end_date"?: string | null,"end_reason"?: string | null,"ended_by"?: string | null,"expected_working_hours"?: number,"id"?: string,"join_token"?: string,"min_wage_applicable_paise"?: number | null,"min_wage_override_acknowledged"?: boolean | null,"payment_frequency"?: Database["public"]['Enums']["payment_frequency"],"project_id"?: string,"start_date"?: string,"status"?: Database["public"]['Enums']["contract_status"],"terms_hash"?: string | null,"unresolved_dues_paise"?: number | null,"updated_at"?: string,"work_type"?: string,"worker_id"?: string,"worksite_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "work_contracts_contractor_id_fkey"
      columns: ["contractor_id"]
isOneToOne: false
      referencedRelation: "contractors"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "work_contracts_ended_by_fkey"
      columns: ["ended_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "work_contracts_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "work_contracts_worker_id_fkey"
      columns: ["worker_id"]
isOneToOne: false
      referencedRelation: "worker_financial_summary"
      referencedColumns: ["worker_id"]
    },{
      foreignKeyName: "work_contracts_worker_id_fkey"
      columns: ["worker_id"]
isOneToOne: false
      referencedRelation: "workers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "work_contracts_worksite_id_fkey"
      columns: ["worksite_id"]
isOneToOne: false
      referencedRelation: "worksites"
      referencedColumns: ["id"]
    }
                  ]
                },"worker_confirmations": {
                  Row: {
                    "comments": string | null,"confirmed_at": string,"contract_id": string,"discrepancy_reason": string | null,"id": string,"is_confirmed": boolean,"summary_id": string,"worker_claimed_days_count": number | null,"worker_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "comments"?: string | null,"confirmed_at"?: string,"contract_id": string,"discrepancy_reason"?: string | null,"id"?: string,"is_confirmed": boolean,"summary_id": string,"worker_claimed_days_count"?: number | null,"worker_id": string
                  }
                  Update: {
                    "comments"?: string | null,"confirmed_at"?: string,"contract_id"?: string,"discrepancy_reason"?: string | null,"id"?: string,"is_confirmed"?: boolean,"summary_id"?: string,"worker_claimed_days_count"?: number | null,"worker_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "worker_confirmations_contract_id_fkey"
      columns: ["contract_id"]
isOneToOne: false
      referencedRelation: "contract_financial_summary"
      referencedColumns: ["contract_id"]
    },{
      foreignKeyName: "worker_confirmations_contract_id_fkey"
      columns: ["contract_id"]
isOneToOne: false
      referencedRelation: "work_contracts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "worker_confirmations_summary_id_fkey"
      columns: ["summary_id"]
isOneToOne: false
      referencedRelation: "attendance_summaries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "worker_confirmations_worker_id_fkey"
      columns: ["worker_id"]
isOneToOne: false
      referencedRelation: "worker_financial_summary"
      referencedColumns: ["worker_id"]
    },{
      foreignKeyName: "worker_confirmations_worker_id_fkey"
      columns: ["worker_id"]
isOneToOne: false
      referencedRelation: "workers"
      referencedColumns: ["id"]
    }
                  ]
                },"workers": {
                  Row: {
                    "created_at": string,"emergency_contact": string | null,"full_name": string,"id": string,"internal_worker_id": string,"occupation": string,"password_hash": string | null,"profile_photo_url": string | null,"skill_category": Database["public"]['Enums']["skill_category_enum"],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"emergency_contact"?: string | null,"full_name": string,"id"?: string,"internal_worker_id": string,"occupation": string,"password_hash"?: string | null,"profile_photo_url"?: string | null,"skill_category"?: Database["public"]['Enums']["skill_category_enum"],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"emergency_contact"?: string | null,"full_name"?: string,"id"?: string,"internal_worker_id"?: string,"occupation"?: string,"password_hash"?: string | null,"profile_photo_url"?: string | null,"skill_category"?: Database["public"]['Enums']["skill_category_enum"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workers_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"worksites": {
                  Row: {
                    "address": string,"allowed_radius_meters": number,"city": string,"created_at": string,"id": string,"is_active": boolean,"latitude": number,"longitude": number,"name": string,"pincode": string | null,"project_id": string,"state": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address": string,"allowed_radius_meters"?: number,"city": string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"latitude": number,"longitude": number,"name": string,"pincode"?: string | null,"project_id": string,"state": string,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string,"allowed_radius_meters"?: number,"city"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"latitude"?: number,"longitude"?: number,"name"?: string,"pincode"?: string | null,"project_id"?: string,"state"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "worksites_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "contract_financial_summary": {
                  Row: {
                    "contract_code": string | null,"contract_id": string | null,"contract_status": Database["public"]['Enums']["contract_status"] | null,"contractor_id": string | null,"daily_wage_paise": number | null,"outstanding_paise": number | null,"project_id": string | null,"total_claimed_paise": number | null,"total_earned_paise": number | null,"total_paid_paise": number | null,"verified_days_count": number | null,"worker_id": string | null,"worksite_id": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "work_contracts_contractor_id_fkey"
      columns: ["contractor_id"]
isOneToOne: false
      referencedRelation: "contractors"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "work_contracts_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "work_contracts_worker_id_fkey"
      columns: ["worker_id"]
isOneToOne: false
      referencedRelation: "worker_financial_summary"
      referencedColumns: ["worker_id"]
    },{
      foreignKeyName: "work_contracts_worker_id_fkey"
      columns: ["worker_id"]
isOneToOne: false
      referencedRelation: "workers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "work_contracts_worksite_id_fkey"
      columns: ["worksite_id"]
isOneToOne: false
      referencedRelation: "worksites"
      referencedColumns: ["id"]
    }
                  ]
                },"worker_financial_summary": {
                  Row: {
                    "active_contracts_count": number | null,"full_name": string | null,"internal_worker_id": string | null,"occupation": string | null,"outstanding_paise": number | null,"skill_category": Database["public"]['Enums']["skill_category_enum"] | null,"total_claimed_paise": number | null,"total_contracts_count": number | null,"total_earned_paise": number | null,"total_paid_paise": number | null,"user_id": string | null,"verified_days_count": number | null,"worker_id": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "workers_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "create_payment_with_ledger":
{ Args: { "p_amount_paise": number,"p_contract_id": string,"p_contractor_id": string,"p_idempotency_key": string,"p_initiated_by": string,"p_notes": string,"p_payment_source": Database["public"]['Enums']["payment_source"],"p_project_id": string,"p_receiver_account_id": string,"p_sender_account_id": string,"p_transaction_ref": string,"p_worker_id": string }; Returns: Json
                           },
"dearmor":
{ Args: { "": string }; Returns: string
                           },
"gen_random_uuid":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"gen_salt":
{ Args: { "": string }; Returns: string
                           },
"get_contractor_id":
{ Args: { "user_uuid": string }; Returns: string
                           },
"get_project_contractor_id":
{ Args: { "proj_uuid": string }; Returns: string
                           },
"get_supervisor_id":
{ Args: { "user_uuid": string }; Returns: string
                           },
"get_user_role":
{ Args: { "user_uuid": string }; Returns: Database["public"]['Enums']["user_role"]
                           },
"get_wallet_balance":
{ Args: { "p_account_id": string }; Returns: number
                           },
"get_worker_id":
{ Args: { "user_uuid": string }; Returns: string
                           },
"is_supervisor_assigned_to_project":
{ Args: { "proj_uuid": string,"sup_uuid": string }; Returns: boolean
                           },
"is_worker_associated_with_contractor":
{ Args: { "p_contractor_user_id": string,"p_worker_id": string }; Returns: boolean
                           },
"is_worker_on_project":
{ Args: { "p_project_id": string,"p_worker_user_id": string }; Returns: boolean
                           },
"pgp_armor_headers":
{ Args: { "": string }; Returns: Record<string, unknown>[]
                           },
"reverse_payment_with_ledger":
{ Args: { "p_initiated_by": string,"p_original_transaction_id": string,"p_reason": string,"p_reversal_idempotency_key": string,"p_reversal_ref": string }; Returns: Json
                           },
"uuid_generate_v1":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"uuid_generate_v1mc":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"uuid_generate_v3":
{ Args: { "name": string,"namespace": string }; Returns: string
                           },
"uuid_generate_v4":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"uuid_generate_v5":
{ Args: { "name": string,"namespace": string }; Returns: string
                           },
"uuid_nil":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"uuid_ns_dns":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"uuid_ns_oid":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"uuid_ns_url":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"uuid_ns_x500":
{ Args: Record<PropertyKey, never>; Returns: string
                           }
          }
          Enums: {
            "acceptance_status": "PENDING"|"ACCEPTED"|"REJECTED","account_type": "WORKER"|"CONTRACTOR"|"ESCROW_LIABILITY"|"SYSTEM_CLEARING","attendance_status": "PENDING"|"VERIFIED"|"REJECTED"|"DISPUTED"|"CORRECTED"|"DISCREPANCY"|"FLAGGED","compliance_result_enum": "COMPLIANT"|"REVIEW_REQUIRED"|"POTENTIAL_NON_COMPLIANCE"|"INSUFFICIENT_DATA","contract_status": "DRAFT"|"PENDING_ACCEPTANCE"|"ACTIVE"|"REJECTED"|"COMPLETED"|"TERMINATED"|"DISPUTED"|"OFFERED"|"ACCEPTED","contractor_risk_level_enum": "GOOD_STANDING"|"LOW_RISK"|"MEDIUM_RISK"|"HIGH_RISK","dispute_category_enum": "ATTENDANCE"|"WAGE"|"PAYMENT"|"PARTIAL_PAYMENT"|"MISSING_PAYMENT"|"CONTRACT_TERMS"|"CONTRACT_AMENDMENT","dispute_priority_enum": "LOW"|"MEDIUM"|"HIGH"|"URGENT","dispute_status_enum": "OPEN"|"UNDER_REVIEW"|"WAITING_FOR_INFORMATION"|"RESOLVED"|"REJECTED"|"CLOSED","employment_status": "ACTIVE"|"SUSPENDED"|"COMPLETED"|"TERMINATED","ledger_direction": "DEBIT"|"CREDIT","notification_type_enum": "NEW_CONTRACT"|"CONTRACT_ACCEPTANCE"|"ATTENDANCE_MARKED"|"ATTENDANCE_CONFIRMATION"|"PAYMENT_RECORDED"|"PAYMENT_CONFIRMATION"|"OUTSTANDING_WAGE"|"DISPUTE_RAISED"|"DISPUTE_RESOLUTION"|"JOB_COMPLETION"|"WORKER_ACCEPTANCE"|"ATTENDANCE_REMINDER"|"ATTENDANCE_DISCREPANCY"|"PAYMENT_DISCREPANCY"|"CONTRACTOR_DISPUTE"|"NEW_ESCALATED_CASE"|"POTENTIAL_COMPLIANCE_ISSUE"|"REPEATED_DISCREPANCY","org_type_enum": "CONTRACTOR_FIRM"|"LABOUR_UNION"|"GOVERNMENT_BODY"|"INSPECTORATE"|"NGO","payment_frequency": "DAILY"|"WEEKLY"|"FORTNIGHTLY"|"MONTHLY","payment_source": "PLATFORM_TRANSFER"|"CONTRACTOR_REPORTED_CASH_PAYMENT"|"BANK_TRANSFER","payment_status": "PENDING"|"PROCESSING"|"SUCCESS"|"FAILED"|"REVERSED"|"DISPUTED"|"PAID_CLAIMED"|"WORKER_CONFIRMED"|"WORKER_DISPUTED"|"ESCALATED_TO_DISPUTE","project_status": "DRAFT"|"ACTIVE"|"COMPLETED"|"SUSPENDED"|"CANCELLED","settlement_status_enum": "SETTLED"|"OUTSTANDING_PAYMENT","skill_category_enum": "UNSKILLED"|"SEMI_SKILLED"|"SKILLED"|"HIGHLY_SKILLED","user_role": "WORKER"|"CONTRACTOR"|"SUPERVISOR"|"LABOUR_ORGANIZATION"|"INSTITUTIONAL_USER"|"ADMIN"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "acceptance_status": ["PENDING", "ACCEPTED", "REJECTED"],"account_type": ["WORKER", "CONTRACTOR", "ESCROW_LIABILITY", "SYSTEM_CLEARING"],"attendance_status": ["PENDING", "VERIFIED", "REJECTED", "DISPUTED", "CORRECTED", "DISCREPANCY", "FLAGGED"],"compliance_result_enum": ["COMPLIANT", "REVIEW_REQUIRED", "POTENTIAL_NON_COMPLIANCE", "INSUFFICIENT_DATA"],"contract_status": ["DRAFT", "PENDING_ACCEPTANCE", "ACTIVE", "REJECTED", "COMPLETED", "TERMINATED", "DISPUTED", "OFFERED", "ACCEPTED"],"contractor_risk_level_enum": ["GOOD_STANDING", "LOW_RISK", "MEDIUM_RISK", "HIGH_RISK"],"dispute_category_enum": ["ATTENDANCE", "WAGE", "PAYMENT", "PARTIAL_PAYMENT", "MISSING_PAYMENT", "CONTRACT_TERMS", "CONTRACT_AMENDMENT"],"dispute_priority_enum": ["LOW", "MEDIUM", "HIGH", "URGENT"],"dispute_status_enum": ["OPEN", "UNDER_REVIEW", "WAITING_FOR_INFORMATION", "RESOLVED", "REJECTED", "CLOSED"],"employment_status": ["ACTIVE", "SUSPENDED", "COMPLETED", "TERMINATED"],"ledger_direction": ["DEBIT", "CREDIT"],"notification_type_enum": ["NEW_CONTRACT", "CONTRACT_ACCEPTANCE", "ATTENDANCE_MARKED", "ATTENDANCE_CONFIRMATION", "PAYMENT_RECORDED", "PAYMENT_CONFIRMATION", "OUTSTANDING_WAGE", "DISPUTE_RAISED", "DISPUTE_RESOLUTION", "JOB_COMPLETION", "WORKER_ACCEPTANCE", "ATTENDANCE_REMINDER", "ATTENDANCE_DISCREPANCY", "PAYMENT_DISCREPANCY", "CONTRACTOR_DISPUTE", "NEW_ESCALATED_CASE", "POTENTIAL_COMPLIANCE_ISSUE", "REPEATED_DISCREPANCY"],"org_type_enum": ["CONTRACTOR_FIRM", "LABOUR_UNION", "GOVERNMENT_BODY", "INSPECTORATE", "NGO"],"payment_frequency": ["DAILY", "WEEKLY", "FORTNIGHTLY", "MONTHLY"],"payment_source": ["PLATFORM_TRANSFER", "CONTRACTOR_REPORTED_CASH_PAYMENT", "BANK_TRANSFER"],"payment_status": ["PENDING", "PROCESSING", "SUCCESS", "FAILED", "REVERSED", "DISPUTED", "PAID_CLAIMED", "WORKER_CONFIRMED", "WORKER_DISPUTED", "ESCALATED_TO_DISPUTE"],"project_status": ["DRAFT", "ACTIVE", "COMPLETED", "SUSPENDED", "CANCELLED"],"settlement_status_enum": ["SETTLED", "OUTSTANDING_PAYMENT"],"skill_category_enum": ["UNSKILLED", "SEMI_SKILLED", "SKILLED", "HIGHLY_SKILLED"],"user_role": ["WORKER", "CONTRACTOR", "SUPERVISOR", "LABOUR_ORGANIZATION", "INSTITUTIONAL_USER", "ADMIN"]
          }
        }
} as const;

export type UserRole = Database['public']['Enums']['user_role'];
export type SkillCategoryEnum = Database['public']['Enums']['skill_category_enum'];
export type ContractStatus = Database['public']['Enums']['contract_status'];
export type AttendanceStatus = Database['public']['Enums']['attendance_status'];
export type PaymentStatus = Database['public']['Enums']['payment_status'];
export type LedgerDirection = Database['public']['Enums']['ledger_direction'];
export type DisputeCategoryEnum = 'short_payment' | 'unpaid_wages' | 'attendance_not_recorded' | 'unlawful_deduction' | 'unsafe_conditions' | 'other' | 'ATTENDANCE' | 'WAGE' | 'PAYMENT' | 'PARTIAL_PAYMENT' | 'MISSING_PAYMENT' | 'CONTRACT_TERMS' | 'CONTRACT_AMENDMENT';
export type DisputeStatusEnum = 'open' | 'responded' | 'resolved' | 'escalated' | 'withdrawn' | 'OPEN' | 'UNDER_REVIEW' | 'WAITING_FOR_INFORMATION' | 'RESOLVED' | 'REJECTED' | 'CLOSED';
export type DisputeResponseType = 'accept_and_pay' | 'deduction_claimed' | 'reject';
export type DisputeDeductionReason = 'late_arrival' | 'incomplete_work' | 'advance_recovery' | 'other';
export type DisputePriorityEnum = Database['public']['Enums']['dispute_priority_enum'];
export type SettlementStatusEnum = Database['public']['Enums']['settlement_status_enum'];
export type ComplianceResultEnum = Database['public']['Enums']['compliance_result_enum'];
export type ContractorRiskLevelEnum = Database['public']['Enums']['contractor_risk_level_enum'];
export type AuditEventActionEnum = string;

export interface DisputeResponseRecord {
  id: string;
  dispute_id: string;
  contractor_id: string;
  type: DisputeResponseType;
  deduction_reason?: DisputeDeductionReason | null;
  deduction_amount_paise?: number | null;
  message: string;
  created_at: string;
}

export interface DisputeMessageRecord {
  id: string;
  dispute_id: string;
  sender_user_id: string;
  sender_role: string;
  message: string;
  created_at: string;
}

export interface DisputeEvidenceRecord {
  id: string;
  dispute_id: string;
  uploaded_by: string;
  file_path: string;
  mime: string;
  size: number;
  sha256: string;
  created_at: string;
}

export interface DisputeStatusHistoryRecord {
  id: string;
  dispute_id: string;
  from_status: string | null;
  to_status: string;
  actor: string;
  actor_role: string | null;
  note: string | null;
  at: string;
}

export type UserRow = Database['public']['Tables']['users']['Row'];
export type WorkerRow = Database['public']['Tables']['workers']['Row'];
export type ContractorRow = Database['public']['Tables']['contractors']['Row'];
export type ProjectRow = Database['public']['Tables']['projects']['Row'];
export type WorksiteRow = Database['public']['Tables']['worksites']['Row'];
export type WorkContractRow = Database['public']['Tables']['work_contracts']['Row'];
export type AttendanceEventRow = Database['public']['Tables']['attendance_events']['Row'];
export type AttendanceSummaryRow = Database['public']['Tables']['attendance_summaries']['Row'];
export type WorkerConfirmationRow = Database['public']['Tables']['worker_confirmations']['Row'];
export type DisputeRow = Database['public']['Tables']['disputes']['Row'];
export type DisputeEvidenceSnapshotRow = Database['public']['Tables']['dispute_evidence_snapshots']['Row'];
export type DisputeResolutionRow = Database['public']['Tables']['dispute_resolutions']['Row'];
export type AuditEventRow = Database['public']['Tables']['audit_events']['Row'];
export type AuditLogRow = Database['public']['Tables']['audit_log']['Row'];
export type MinimumWageRuleRow = Database['public']['Tables']['minimum_wage_rules']['Row'];
export type MinimumWageRow = Database['public']['Tables']['minimum_wages']['Row'];
export type ComplianceCheckLogRow = Database['public']['Tables']['compliance_check_logs']['Row'];
export type ContractorComplianceSnapshotRow = Database['public']['Tables']['contractor_compliance_snapshots']['Row'];
export type EarningsSnapshotRow = Database['public']['Tables']['earnings_snapshots']['Row'];
export type JobCompletionStatementRow = Database['public']['Tables']['job_completion_statements']['Row'];
export type LedgerEntryRow = Database['public']['Tables']['ledger_entries']['Row'];
export type PaymentTransactionRow = Database['public']['Tables']['payment_transactions']['Row'];
export type IssuedCredentialRow = Database['public']['Tables']['issued_credentials']['Row'];
export type NotificationRow = Database['public']['Tables']['notifications']['Row'];
export type ReminderRow = Database['public']['Tables']['reminders']['Row'];
export type OrganizationRow = Database['public']['Tables']['organizations']['Row'];
export type WalletAccountRow = Database['public']['Tables']['wallet_accounts']['Row'];
export type PaymentConfirmationRow = Database['public']['Tables']['payment_confirmations']['Row'];
export type ComplaintReportRow = Database['public']['Tables']['complaint_reports']['Row'];

