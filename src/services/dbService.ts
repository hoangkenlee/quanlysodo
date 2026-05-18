import { getSupabase } from '../lib/supabase';
import { Customer, CodeMapping, PLTFileRecord } from '../types';

/**
 * SQL SCHEMA SETUP (SaaS Multi-user version):
 * 
 * -- A. MIGRATION (If you already have tables but missing user_id):
 * alter table customers add column if not exists user_id uuid references auth.users(id) default auth.uid();
 * alter table code_mappings add column if not exists user_id uuid references auth.users(id) default auth.uid();
 * alter table plt_files add column if not exists user_id uuid references auth.users(id) default auth.uid();
 * 
 * -- B. FULL TABLE CREATION:
 * -- 1. Customers Table
 * create table if not exists customers (
 *   id uuid default gen_random_uuid() primary key,
 *   user_id uuid references auth.users(id) not null default auth.uid(),
 *   name text not null,
 *   created_at timestamptz default now()
 * );
 * 
 * -- 2. Code Mappings Table
 * create table code_mappings (
 *   id uuid default gen_random_uuid() primary key,
 *   user_id uuid references auth.users(id) not null,
 *   code text not null,
 *   customer_name text not null,
 *   created_at timestamptz default now(),
 *   unique (user_id, code) -- REQUIRED for atomic multi-user mapping updates
 * );
 * 
 * -- 3. PLT Files Table
 * create table plt_files (
 *   id uuid default gen_random_uuid() primary key,
 *   user_id uuid references auth.users(id) not null,
 *   file_name text not null,
 *   customer_name text not null,
 *   original_width float8,
 *   original_length float8,
 *   adjusted_length float8,
 *   is_over_width boolean,
 *   file_date timestamptz,
 *   created_at timestamptz default now()
 * );
 * 
 * -- 4. Enable RLS
 * alter table customers enable row level security;
 * alter table code_mappings enable row level security;
 * alter table plt_files enable row level security;
 * 
 * -- 5. RLS Policies
 * create policy "Users manage own customers" on customers for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
 * create policy "Users manage own mappings" on code_mappings for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
 * create policy "Users manage own files" on plt_files for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
 */

export const dbService = {
  // --- Auth ---
  async getCurrentUser() {
    const { data: { user } } = await getSupabase().auth.getUser();
    return user;
  },

  // --- Customers ---
  async getCustomers(): Promise<Customer[]> {
    const user = await this.getCurrentUser();
    if (!user) return [];

    const { data, error } = await getSupabase()
      .from('customers')
      .select('*')
      .eq('user_id', user.id)
      .order('name');
    
    if (error) {
      console.error('Error fetching customers:', error);
      return [];
    }
    return data || [];
  },

  async addCustomer(name: string): Promise<Customer> {
    const user = await this.getCurrentUser();
    if (!user) throw new Error('Yêu cầu đăng nhập.');

    const { data, error } = await getSupabase()
      .from('customers')
      .insert([{ name, user_id: user.id }])
      .select()
      .single();
    
    if (error) {
      console.error('Error adding customer:', error);
      throw new Error(`Lỗi Supabase khi thêm khách hàng: ${error.message} (Code: ${error.code})`);
    }
    
    if (!data) {
      throw new Error('Không nhận được dữ liệu trả về sau khi thêm khách hàng.');
    }
    
    return data;
  },

  async deleteCustomer(id: string): Promise<boolean> {
    const user = await this.getCurrentUser();
    if (!user) return false;

    const { error } = await getSupabase()
      .from('customers')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);
    
    if (error) {
      console.error('Error deleting customer:', error);
      return false;
    }
    return true;
  },

  async restoreDefaultCustomers(names: string[]): Promise<Customer[]> {
    const user = await this.getCurrentUser();
    if (!user) throw new Error('Yêu cầu đăng nhập.');

    // Delete existing customers for THIS user only
    const { error: deleteError } = await getSupabase()
      .from('customers')
      .delete()
      .eq('user_id', user.id);

    if (deleteError) {
      console.error('Error clearing customers:', deleteError);
      throw new Error(`Không thể xoá danh sách cũ: ${deleteError.message}`);
    }

    const { data, error } = await getSupabase()
      .from('customers')
      .insert(names.map(name => ({ name, user_id: user.id })))
      .select();
    
    if (error) {
      console.error('Error restoring customers:', error);
      throw new Error(`Lỗi Supabase khi khôi phục: ${error.message} (Code: ${error.code})`);
    }
    return data || [];
  },

  // --- Mappings ---
  async getMappings(): Promise<CodeMapping[]> {
    const user = await this.getCurrentUser();
    if (!user) return [];

    const { data, error } = await getSupabase()
      .from('code_mappings')
      .select('*')
      .eq('user_id', user.id);
    
    if (error) {
      console.error('Error fetching mappings:', error);
      return [];
    }
    return (data || []).map(m => ({
      code: m.code,
      customerName: m.customer_name
    }));
  },

  async updateMapping(code: string, customerName: string): Promise<void> {
    const user = await this.getCurrentUser();
    if (!user) return;

    // Use upsert with conflict on (user_id, code) if possible, 
    // but code_mappings might need a composite unique constraint in DB for this to be perfect.
    const { error } = await getSupabase()
      .from('code_mappings')
      .upsert({ 
        user_id: user.id,
        code, 
        customer_name: customerName 
      }, { onConflict: 'user_id,code' });
    
    if (error) console.error('Error updating mapping:', error);
  },

  // --- PLT Files ---
  async getFiles(): Promise<PLTFileRecord[]> {
    const user = await this.getCurrentUser();
    if (!user) return [];

    const { data, error } = await getSupabase()
      .from('plt_files')
      .select('*')
      .eq('user_id', user.id)
      .order('file_date', { ascending: false });
    
    if (error) {
      console.error('Error fetching files:', error);
      return [];
    }

    return (data || []).map(f => ({
      id: f.id,
      userId: f.user_id,
      fileName: f.file_name,
      customerName: f.customer_name,
      originalWidth: f.original_width,
      originalLength: f.original_length,
      adjustedLength: f.adjusted_length,
      isOverWidth: f.is_over_width,
      createdAt: f.created_at,
      fileDate: f.file_date
    }));
  },

  async addFile(file: Omit<PLTFileRecord, 'id' | 'createdAt'>): Promise<PLTFileRecord> {
    const user = await this.getCurrentUser();
    if (!user) throw new Error('Yêu cầu đăng nhập.');

    const { data, error } = await getSupabase()
      .from('plt_files')
      .insert([{
        user_id: user.id,
        file_name: file.fileName,
        customer_name: file.customerName,
        // Ensure we don't send NaN or Infinity to Postgres
        original_width: isFinite(file.originalWidth) ? file.originalWidth : 0,
        original_length: isFinite(file.originalLength) ? file.originalLength : 0,
        adjusted_length: isFinite(file.adjustedLength) ? file.adjustedLength : 0,
        is_over_width: !!file.isOverWidth,
        file_date: file.fileDate
      }])
      .select()
      .single();
    
    if (error) {
      console.error('CRITICAL SUPABASE ERROR (plt_files):', error);
      throw new Error(`Lỗi Supabase khi thêm file: ${error.message} (Chi tiết: ${error.details || 'Không có'})`);
    }

    if (!data) {
      throw new Error('Không nhận được dữ liệu trả về sau khi thêm file.');
    }

    return {
      id: data.id,
      userId: data.user_id,
      fileName: data.file_name,
      customerName: data.customer_name,
      originalWidth: data.original_width,
      originalLength: data.original_length,
      adjustedLength: data.adjusted_length,
      isOverWidth: data.is_over_width,
      createdAt: data.created_at,
      fileDate: data.file_date
    };
  },

  async updateFileCustomer(id: string, customerName: string): Promise<void> {
    const user = await this.getCurrentUser();
    if (!user) return;

    const { error } = await getSupabase()
      .from('plt_files')
      .update({ customer_name: customerName })
      .eq('id', id)
      .eq('user_id', user.id);
    
    if (error) console.error('Error updating file customer:', error);
  },

  async deleteFile(id: string): Promise<boolean> {
    const user = await this.getCurrentUser();
    if (!user) return false;

    const { error } = await getSupabase()
      .from('plt_files')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);
    
    if (error) {
      console.error('Error deleting file:', error);
      return false;
    }
    return true;
  }
};
