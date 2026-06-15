import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const supabase=createClient('https://qcwdpdgjsnagrrmfxjis.supabase.co','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFjd2RwZGdqc25hZ3JybWZ4amlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MzUzMzgsImV4cCI6MjA5NDMxMTMzOH0.2gZo6Rrxv8UHxlMnyLH3piW9YF12n14VMMEWPY8huLE');
const slug=new URLSearchParams(location.search).get('slug')||location.pathname.split('/').filter(Boolean).pop()||'',money=v=>`${Math.round(Number(v)).toLocaleString('vi-VN')} ₫`,date=v=>new Date(v).toLocaleDateString('vi-VN'),esc=v=>String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'})[c]);
const {data,error}=await supabase.rpc('get_public_debt',{p_slug:slug});document.querySelector('#loading').classList.add('hidden');
if(error||!data?.customer){const e=document.querySelector('#error');e.textContent='Không tìm thấy link tracking hoặc hệ thống chưa được kích hoạt.';e.classList.remove('hidden')}else{
 const entries=data.entries||[],prints=data.prints||[],designs=data.designs||[];
 const balance=prints.reduce((s,x)=>s+Number(x.amount),0)+designs.reduce((s,x)=>s+Number(x.amount),0)+entries.reduce((s,x)=>s+(x.entry_type==='charge'?Number(x.amount):-Number(x.amount)),0);
 document.querySelector('#customer-name').textContent=data.customer.name;document.querySelector('#customer-note').textContent=data.customer.notes||'';document.querySelector('#balance').textContent=money(balance);
 document.querySelector('#print-count').textContent=prints.length;document.querySelector('#print-days').textContent=new Set(prints.map(x=>x.print_date)).size;document.querySelector('#print-length').textContent=`${prints.reduce((s,x)=>s+Number(x.adjusted_length),0).toFixed(2)}m`;document.querySelector('#design-count').textContent=designs.length;
 const render=(id,empty,items,fn)=>{document.querySelector(id).innerHTML=items.map(fn).join('');document.querySelector(empty).classList.toggle('hidden',items.length>0)};
 render('#prints','#prints-empty',prints,x=>`<tr><td>${date(x.print_date)}</td><td>${esc(x.file_name)}</td><td class="right">${Number(x.adjusted_length).toFixed(2)}m</td><td class="right charge">${money(x.amount)}</td></tr>`);
 render('#designs','#designs-empty',designs,x=>`<tr><td>${date(x.design_date)}</td><td>${esc(x.name)}</td><td>${esc(x.notes)}</td><td class="right charge">${money(x.amount)}</td></tr>`);
 render('#entries','#entries-empty',entries,x=>`<tr><td>${date(x.entry_date)}</td><td>${esc(x.description)}</td><td class="right charge">${x.entry_type==='charge'?money(x.amount):''}</td><td class="right payment">${x.entry_type==='payment'?money(x.amount):''}</td></tr>`);
 document.querySelector('#content').classList.remove('hidden');
}
