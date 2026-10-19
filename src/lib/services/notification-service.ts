import { createAdminClient } from '@/lib/supabase/admin';
import { Logger } from '@/lib/observability/logger';
import { UserRole } from '@/types/database.types';

export type NotificationType =
  // Worker
  | 'NEW_CONTRACT'
  | 'CONTRACT_ACCEPTANCE'
  | 'ATTENDANCE_MARKED'
  | 'ATTENDANCE_CONFIRMATION'
  | 'PAYMENT_RECORDED'
  | 'PAYMENT_CONFIRMATION'
  | 'OUTSTANDING_WAGE'
  | 'DISPUTE_RAISED'
  | 'DISPUTE_RESOLUTION'
  | 'JOB_COMPLETION'
  | 'ASSIGNMENT_INVITE'
  | 'ASSIGNMENT_ACCEPTED'
  | 'ASSIGNMENT_REJECTED'
  | 'ASSIGNMENT_CANCELLED'
  // Contractor
  | 'WORKER_ACCEPTANCE'
  | 'ATTENDANCE_REMINDER'
  | 'ATTENDANCE_DISCREPANCY'
  | 'PAYMENT_DISCREPANCY'
  | 'CONTRACTOR_DISPUTE'
  // Institutional
  | 'NEW_ESCALATED_CASE'
  | 'POTENTIAL_COMPLIANCE_ISSUE'
  | 'REPEATED_DISCREPANCY';

export interface CreateNotificationParams {
  userId: string;
  role: UserRole;
  type: NotificationType;
  title: string;
  message: string;
  titleKey?: string;
  bodyKey?: string;
  payload?: Record<string, any>;
}

export interface NotificationRecord {
  id: string;
  user_id: string;
  role: string;
  type: string;
  title: string;
  message: string;
  title_key?: string | null;
  body_key?: string | null;
  payload: Record<string, any>;
  read: boolean;
  read_at?: string | null;
  created_at: string;
}

export class NotificationService {
  /**
   * Create a database-backed notification for a user
   */
  static async createNotification(params: CreateNotificationParams): Promise<NotificationRecord> {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('notifications')
      .insert({
        user_id: params.userId,
        role: params.role,
        type: params.type,
        title: params.title,
        message: params.message,
        title_key: params.titleKey || null,
        body_key: params.bodyKey || null,
        payload: params.payload || {},
        read: false,
      })
      .select()
      .single();

    if (error) {
      Logger.error('NotificationService.createNotification', 'DB_INSERT_ERROR', error, { userId: params.userId });
      throw new Error(`Failed to create notification: ${error.message}`);
    }

    Logger.info('NotificationService.createNotification', { notificationId: data.id, type: params.type }, { userId: params.userId });
    return data as NotificationRecord;
  }

  /**
   * Get user notifications
   */
  static async getUserNotifications(
    userId: string,
    options?: { readOnly?: boolean; unreadOnly?: boolean; limit?: number }
  ): Promise<NotificationRecord[]> {
    const supabase = createAdminClient();

    let query = supabase.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false });

    if (options?.readOnly) {
      query = query.eq('read', true);
    } else if (options?.unreadOnly) {
      query = query.eq('read', false);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
      Logger.error('NotificationService.getUserNotifications', 'DB_SELECT_ERROR', error, { userId });
      throw new Error(`Failed to fetch notifications: ${error.message}`);
    }

    return (data || []) as NotificationRecord[];
  }

  /**
   * Mark notification as read
   */
  static async markAsRead(notificationId: string, userId: string): Promise<boolean> {
    const supabase = createAdminClient();

    const { error } = await supabase
      .from('notifications')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('id', notificationId)
      .eq('user_id', userId);

    if (error) {
      Logger.error('NotificationService.markAsRead', 'DB_UPDATE_ERROR', error, { userId, details: { notificationId } });
      return false;
    }

    return true;
  }
}
