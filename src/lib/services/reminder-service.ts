import { createAdminClient } from '@/lib/supabase/admin';
import { Logger } from '@/lib/observability/logger';

export interface CreateReminderParams {
  userId: string;
  contractId?: string;
  projectId?: string;
  type: string;
  dueAt: Date;
  payload?: Record<string, any>;
}

export interface ReminderRecord {
  id: string;
  user_id: string;
  contract_id?: string;
  project_id?: string;
  type: string;
  due_at: string;
  status: 'PENDING' | 'SENT' | 'COMPLETED' | 'CANCELLED';
  payload: Record<string, any>;
  created_at: string;
}

export class ReminderService {
  /**
   * Create a persistent reminder record
   */
  static async createReminder(params: CreateReminderParams): Promise<ReminderRecord> {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('reminders')
      .insert({
        user_id: params.userId,
        contract_id: params.contractId || null,
        project_id: params.projectId || null,
        type: params.type,
        due_at: params.dueAt.toISOString(),
        status: 'PENDING',
        payload: params.payload || {},
      })
      .select()
      .single();

    if (error) {
      Logger.error('ReminderService.createReminder', 'DB_INSERT_ERROR', error, { userId: params.userId });
      throw new Error(`Failed to create reminder: ${error.message}`);
    }

    Logger.info('ReminderService.createReminder', { reminderId: data.id, dueAt: params.dueAt }, { userId: params.userId });
    return data as ReminderRecord;
  }

  /**
   * Fetch active pending reminders for a user
   */
  static async getUserReminders(userId: string): Promise<ReminderRecord[]> {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('reminders')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'PENDING')
      .order('due_at', { ascending: true });

    if (error) {
      Logger.error('ReminderService.getUserReminders', 'DB_SELECT_ERROR', error, { userId });
      throw new Error(`Failed to fetch reminders: ${error.message}`);
    }

    return (data || []) as ReminderRecord[];
  }

  /**
   * Update status of a reminder
   */
  static async updateStatus(reminderId: string, status: 'PENDING' | 'SENT' | 'COMPLETED' | 'CANCELLED'): Promise<boolean> {
    const supabase = createAdminClient();

    const { error } = await supabase.from('reminders').update({ status }).eq('id', reminderId);

    if (error) {
      Logger.error('ReminderService.updateStatus', 'DB_UPDATE_ERROR', error, { details: { reminderId, status } });
      return false;
    }

    return true;
  }
}
