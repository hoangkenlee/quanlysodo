import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  'https://qcwdpdgjsnagrrmfxjis.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFjd2RwZGdqc25hZ3JybWZ4amlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MzUzMzgsImV4cCI6MjA5NDMxMTMzOH0.2gZo6Rrxv8UHxlMnyLH3piW9YF12n14VMMEWPY8huLE',
);
const slug = new URLSearchParams(location.search).get('slug') || location.pathname.split('/').filter(Boolean).pop() || '';
const money = value => `${Math.round(Number(value)).toLocaleString('vi-VN')} đ`;
const date = value => new Date(`${value}T00:00:00`).toLocaleDateString('vi-VN');
const esc = value => String(value || '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]);
const sum = (items, key) => items.reduce((total, item) => total + Number(item[key] || 0), 0);
const setText = (selector, value) => { document.querySelector(selector).textContent = value; };
const render = (selector, emptySelector, items, renderer) => {
  document.querySelector(selector).innerHTML = items.map(renderer).join('');
  document.querySelector(emptySelector).classList.toggle('hidden', items.length > 0);
};

document.querySelector('#print-report').addEventListener('click', () => window.print());
document.querySelector('#close-modal').addEventListener('click', () => document.querySelector('#image-modal').classList.add('hidden'));
document.querySelector('#image-modal').addEventListener('click', event => {
  if (event.target.id === 'image-modal') event.currentTarget.classList.add('hidden');
});

const { data, error } = await supabase.rpc('get_public_debt', { p_slug: slug });
document.querySelector('#loading').classList.add('hidden');
if (error || !data?.customer) {
  const errorBox = document.querySelector('#error');
  errorBox.textContent = 'Không tìm thấy link tracking hoặc hệ thống chưa được cập nhật.';
  errorBox.classList.remove('hidden');
} else {
  const entries = data.entries || [], prints = data.prints || [], designs = data.designs || [];
  const printTotal = sum(prints, 'amount'), designTotal = sum(designs, 'amount');
  const manualCharges = sum(entries.filter(item => item.entry_type === 'charge'), 'amount');
  const paidTotal = sum(entries.filter(item => item.entry_type === 'payment'), 'amount');
  const balance = printTotal + designTotal + manualCharges - paidTotal;
  const prices = [...new Set(prints.map(item => Number(item.unit_price)).filter(Boolean))];
  const dailyMap = prints.reduce((groups, item) => {
    const group = groups[item.print_date] ||= { date: item.print_date, count: 0, metres: 0, amount: 0 };
    group.count += 1; group.metres += Number(item.adjusted_length); group.amount += Number(item.amount);
    return groups;
  }, {});
  const dailyPrints = Object.values(dailyMap).sort((a, b) => b.date.localeCompare(a.date));

  setText('#customer-name', data.customer.name); setText('#customer-note', data.customer.notes || '');
  setText('#balance', money(balance)); setText('#debt-total', money(balance)); setText('#paid-total', money(paidTotal));
  setText('#print-length', `${sum(prints, 'adjusted_length').toFixed(2)}m`);
  setText('#unit-price', prices.length === 1 ? `${money(prices[0])}/m` : prices.length ? 'Nhiều đơn giá' : 'Chưa nhập');
  setText('#print-total', money(printTotal)); setText('#design-total', money(designTotal));
  setText('#print-count', prints.length); setText('#print-days', dailyPrints.length); setText('#design-count', designs.length);

  render('#daily-prints', '#daily-prints-empty', dailyPrints, item => `<tr><td>${date(item.date)}</td><td class="right">${item.count}</td><td class="right">${item.metres.toFixed(2)}m</td><td class="right charge">${money(item.amount)}</td></tr>`);
  render('#prints', '#prints-empty', prints, item => `<tr><td>${date(item.print_date)}</td><td>${esc(item.file_name)}</td><td class="right">${Number(item.adjusted_length).toFixed(2)}m</td><td class="right">${money(item.unit_price)}</td><td class="right charge">${money(item.amount)}</td></tr>`);
  render('#designs', '#designs-empty', designs, item => `<article class="design-card">${item.image_url ? `<button class="image-button" data-image="${esc(item.image_url)}"><img src="${esc(item.image_url)}" alt="${esc(item.name)}"/></button>` : '<div class="no-image">Không có ảnh</div>'}<div class="design-body"><small>${date(item.design_date)}</small><h4>${esc(item.name)}</h4><p>${esc(item.notes)}</p><strong>${money(item.amount)}</strong></div></article>`);
  render('#entries', '#entries-empty', entries, item => `<tr><td>${date(item.entry_date)}</td><td>${esc(item.description)}</td><td class="right charge">${item.entry_type === 'charge' ? money(item.amount) : ''}</td><td class="right payment">${item.entry_type === 'payment' ? money(item.amount) : ''}</td></tr>`);
  document.querySelectorAll('.image-button').forEach(button => button.addEventListener('click', () => {
    document.querySelector('#modal-image').src = button.dataset.image;
    document.querySelector('#image-modal').classList.remove('hidden');
  }));
  document.querySelector('#content').classList.remove('hidden');
}
