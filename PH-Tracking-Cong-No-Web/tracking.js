import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  'https://qcwdpdgjsnagrrmfxjis.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFjd2RwZGdqc25hZ3JybWZ4amlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MzUzMzgsImV4cCI6MjA5NDMxMTMzOH0.2gZo6Rrxv8UHxlMnyLH3piW9YF12n14VMMEWPY8huLE'
);

const slug = new URLSearchParams(location.search).get('slug')
  || location.pathname.split('/').filter(Boolean).pop()
  || '';
const money = (value) => `${Number(value).toLocaleString('vi-VN')} ₫`;
const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);

const { data, error } = await supabase.rpc('get_public_debt', { p_slug: slug });
document.querySelector('#loading').classList.add('hidden');

if (error || !data?.customer) {
  const box = document.querySelector('#error');
  box.textContent = 'Không tìm thấy link công nợ hoặc link chưa được kích hoạt.';
  box.classList.remove('hidden');
} else {
  const entries = data.entries || [];
  const balance = entries.reduce((total, item) => total + (item.entry_type === 'charge' ? Number(item.amount) : -Number(item.amount)), 0);
  document.querySelector('#customer-name').textContent = data.customer.name;
  document.querySelector('#customer-note').textContent = data.customer.notes || '';
  document.querySelector('#balance').textContent = money(balance);
  document.querySelector('#entries').innerHTML = entries.map((item) => `<tr><td>${new Date(item.entry_date).toLocaleDateString('vi-VN')}</td><td>${escapeHtml(item.description)}</td><td class="right charge">${item.entry_type === 'charge' ? money(item.amount) : ''}</td><td class="right payment">${item.entry_type === 'payment' ? money(item.amount) : ''}</td></tr>`).join('');
  document.querySelector('#empty').classList.toggle('hidden', entries.length > 0);
  document.querySelector('#content').classList.remove('hidden');
}
