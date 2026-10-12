import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import { LogIn, LogOut, Plus, Search, Users, Wallet, Clock, CheckCircle2, Upload, ExternalLink, RefreshCw } from 'lucide-react';
import './style.css';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;
const STATUSES = ['New Lead','Documents Pending','Application Submitted','Offer Received','Visa Process','Visa Approved','Visa Refused','Enrolled','On Hold','Closed'];
const money = n => new Intl.NumberFormat('en-PK', { style:'currency', currency:'PKR', maximumFractionDigits:0 }).format(Number(n || 0));
const blankStudent = { full_name:'', phone:'', email:'', country:'USA', university:'', program:'', status:'New Lead', total_fee:'', notes:'' };

function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [students, setStudents] = useState([]);
  const [payments, setPayments] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All statuses');
  const [active, setActive] = useState(null);
  const [studentForm, setStudentForm] = useState(blankStudent);
  const [editingId, setEditingId] = useState(null);
  const [showStudentForm, setShowStudentForm] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ amount:'', date:new Date().toISOString().slice(0,10), method:'Bank Transfer', reference:'', notes:'' });
  const [receipt, setReceipt] = useState(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!supabase) { setAuthLoading(false); return; }
    supabase.auth.getSession().then(({data}) => { setSession(data.session); setAuthLoading(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setAuthLoading(false);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => { if (session) loadData(); else { setStudents([]); setPayments([]); setActive(null); } }, [session]);

  async function loadData() {
    if (!supabase) return;
    const [s, p] = await Promise.all([
      supabase.from('students').select('*').order('created_at', { ascending:false }),
      supabase.from('payments').select('*').order('payment_date', { ascending:false })
    ]);
    if (s.error || p.error) { setNotice(s.error?.message || p.error?.message); return; }
    setStudents(s.data || []); setPayments(p.data || []);
    if (active) setActive((s.data || []).find(x => x.id === active.id) || null);
  }

  async function signIn(e) {
    e.preventDefault(); setAuthError('');
    if (!supabase) { setAuthError('Add your Supabase URL and key in the .env file first.'); return; }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setAuthError(error.message);
  }
  async function signOut() { await supabase.auth.signOut(); }

  const filtered = useMemo(() => students.filter(s => {
    const hay = `${s.full_name} ${s.phone || ''} ${s.email || ''} ${s.university || ''} ${s.program || ''}`.toLowerCase();
    return hay.includes(search.toLowerCase()) && (statusFilter === 'All statuses' || s.status === statusFilter);
  }), [students, search, statusFilter]);

  const paidByStudent = id => payments.filter(p => p.student_id === id).reduce((sum,p) => sum + Number(p.amount || 0), 0);
  const totalExpected = students.reduce((sum,s) => sum + Number(s.total_fee || 0), 0);
  const totalPaid = payments.reduce((sum,p) => sum + Number(p.amount || 0), 0);
  const totalPending = students.reduce((sum,s) => sum + Math.max(0, Number(s.total_fee || 0) - paidByStudent(s.id)), 0);

  function startAdd() { setEditingId(null); setStudentForm(blankStudent); setShowStudentForm(true); }
  function startEdit(s) {
    setEditingId(s.id);
    setStudentForm({ full_name:s.full_name || '', phone:s.phone || '', email:s.email || '', country:s.country || 'USA', university:s.university || '', program:s.program || '', status:s.status || 'New Lead', total_fee:String(s.total_fee ?? ''), notes:s.notes || '' });
    setShowStudentForm(true);
  }
  async function saveStudent(e) {
    e.preventDefault(); setSaving(true); setNotice('');
    const payload = { ...studentForm, total_fee:Number(studentForm.total_fee || 0), owner_id:session.user.id };
    const result = editingId
      ? await supabase.from('students').update(payload).eq('id', editingId).select().single()
      : await supabase.from('students').insert(payload).select().single();
    setSaving(false);
    if (result.error) { setNotice(result.error.message); return; }
    setShowStudentForm(false); setNotice(editingId ? 'Student updated.' : 'Student added.');
    await loadData();
    if (!editingId) setActive(result.data);
    else if (active?.id === editingId) setActive(result.data);
  }
  async function deleteStudent(s) {
    if (!confirm(`Delete ${s.full_name} and their payment records? This cannot be undone.`)) return;
    const { error } = await supabase.from('students').delete().eq('id', s.id);
    if (error) setNotice(error.message); else { setActive(null); setNotice('Student deleted.'); await loadData(); }
  }
  async function addPayment(e) {
    e.preventDefault();
    if (!active) return;
    setSaving(true); setNotice('');
    let receipt_path = null;
    if (receipt) {
      const safeName = receipt.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${session.user.id}/${active.id}/${Date.now()}-${safeName}`;
      const uploaded = await supabase.storage.from('payment-receipts').upload(path, receipt, { upsert:false });
      if (uploaded.error) { setSaving(false); setNotice(`Receipt upload failed: ${uploaded.error.message}`); return; }
      receipt_path = uploaded.data.path;
    }
    const { error } = await supabase.from('payments').insert({
      owner_id:session.user.id, student_id:active.id, amount:Number(paymentForm.amount),
      payment_date:paymentForm.date, method:paymentForm.method, reference:paymentForm.reference,
      notes:paymentForm.notes, receipt_path
    });
    setSaving(false);
    if (error) { setNotice(error.message); return; }
    setPaymentForm({ amount:'', date:new Date().toISOString().slice(0,10), method:'Bank Transfer', reference:'', notes:'' });
    setReceipt(null); setNotice('Payment recorded.'); await loadData();
  }
  async function openReceipt(path) {
    const { data, error } = await supabase.storage.from('payment-receipts').createSignedUrl(path, 60);
    if (error) setNotice(error.message); else window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  if (authLoading) return <div className="center"><div className="spinner"/>Checking session…</div>;
  if (!supabase) return <div className="center"><div className="login-card"><div className="brand-mark">I</div><h1>Set up Ibex CRM</h1><p>Create a Supabase project, run the SQL in <b>supabase-setup.sql</b>, copy <b>.env.example</b> to <b>.env</b>, and add your project URL and publishable/anon key.</p><p className="muted">Setup instructions are in README.md. Never put a Supabase service-role key in this website.</p></div></div>;
  if (!session) return <div className="login-shell"><form className="login-card" onSubmit={signIn}><div className="brand-mark">I</div><div className="eyebrow">IBEX OVERSEAS EDUCATION</div><h1>Student CRM</h1><p className="muted">Securely manage students, applications and payments.</p><label>Email address<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com"/></label><label>Password<input type="password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="Your password"/></label>{authError && <div className="error">{authError}</div>}<button className="primary full" type="submit"><LogIn size={17}/> Log in</button><p className="tiny">Create your first user in Supabase Authentication → Users. Public sign-up is intentionally not provided.</p></form></div>;

  const activePayments = active ? payments.filter(p=>p.student_id===active.id) : [];
  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><div className="brand-mark small">I</div><div><b>IBEX</b><span>OVERSEAS CRM</span></div></div><div className="nav-label">WORKSPACE</div><div className="nav-item selected"><Users size={17}/> Students <span className="nav-count">{students.length}</span></div><div className="sidebar-bottom"><div className="user-dot">{(session.user.email || 'I')[0].toUpperCase()}</div><div className="user-info"><b>{session.user.email}</b><span>Signed in</span></div><button className="icon-button" title="Log out" onClick={signOut}><LogOut size={17}/></button></div></aside>
    <main className="main">
      <header className="topbar"><div><div className="eyebrow">STUDENT MANAGEMENT</div><h1>Student dashboard</h1></div><div className="top-actions"><button className="secondary" onClick={loadData}><RefreshCw size={16}/> Refresh</button><button className="primary" onClick={startAdd}><Plus size={17}/> Add student</button></div></header>
      {notice && <div className="notice" role="status">{notice}<button onClick={()=>setNotice('')}>×</button></div>}
      <section className="stats-grid">
        <div className="stat-card"><div className="stat-icon blue"><Users size={19}/></div><span>Total students</span><strong>{students.length}</strong><small>All records in your workspace</small></div>
        <div className="stat-card"><div className="stat-icon green"><Wallet size={19}/></div><span>Total collected</span><strong>{money(totalPaid)}</strong><small>Recorded payments</small></div>
        <div className="stat-card"><div className="stat-icon amber"><Clock size={19}/></div><span>Pending payments</span><strong>{money(totalPending)}</strong><small>Expected fees minus recorded payments</small></div>
        <div className="stat-card"><div className="stat-icon purple"><CheckCircle2 size={19}/></div><span>Expected fees</span><strong>{money(totalExpected)}</strong><small>Across all students</small></div>
      </section>
      <section className="workspace">
        <div className="list-panel"><div className="panel-heading"><div><h2>Students</h2><p>Search and track every student</p></div><span className="pill">{filtered.length} records</span></div>
          <div className="filters"><div className="searchbox"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, phone, university…"/></div><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option>All statuses</option>{STATUSES.map(s=><option key={s}>{s}</option>)}</select></div>
          <div className="student-list">{filtered.map(s=>{const paid=paidByStudent(s.id), pending=Math.max(0,Number(s.total_fee||0)-paid);return <button className={`student-row ${active?.id===s.id?'active':''}`} key={s.id} onClick={()=>{setActive(s);setShowStudentForm(false);}}><div className="avatar">{(s.full_name||'?').split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase()}</div><div className="student-summary"><b>{s.full_name}</b><span>{s.university || s.country || 'No university added'}</span><div className="row-meta"><span className="status-dot"/>{s.status}</div></div><div className="row-money"><b>{money(pending)}</b><span>pending</span></div></button>})}
          {filtered.length===0 && <div className="empty"><Users size={26}/><b>No students found</b><span>Add a student or change your search.</span></div>}</div>
        </div>
        <div className="detail-panel">
          {showStudentForm ? <form onSubmit={saveStudent} className="detail-content"><div className="panel-heading"><div><h2>{editingId?'Edit student':'Add a student'}</h2><p>Fields marked * are required</p></div><button type="button" className="icon-button" onClick={()=>setShowStudentForm(false)}>×</button></div><div className="form-grid">
            <label className="wide">Full name *<input required value={studentForm.full_name} onChange={e=>setStudentForm({...studentForm,full_name:e.target.value})}/></label>
            <label>Phone / WhatsApp<input value={studentForm.phone} onChange={e=>setStudentForm({...studentForm,phone:e.target.value})}/></label><label>Email<input type="email" value={studentForm.email} onChange={e=>setStudentForm({...studentForm,email:e.target.value})}/></label>
            <label>Destination country<select value={studentForm.country} onChange={e=>setStudentForm({...studentForm,country:e.target.value})}><option>USA</option><option>China</option><option>Canada</option><option>UK</option><option>Australia</option><option>Other</option></select></label>
            <label>Status<select value={studentForm.status} onChange={e=>setStudentForm({...studentForm,status:e.target.value})}>{STATUSES.map(s=><option key={s}>{s}</option>)}</select></label>
            <label>University<input value={studentForm.university} onChange={e=>setStudentForm({...studentForm,university:e.target.value})}/></label><label>Program / degree<input value={studentForm.program} onChange={e=>setStudentForm({...studentForm,program:e.target.value})}/></label>
            <label className="wide">Total agreed service fee (PKR)<input type="number" min="0" value={studentForm.total_fee} onChange={e=>setStudentForm({...studentForm,total_fee:e.target.value})}/></label>
            <label className="wide">Notes<textarea rows="3" value={studentForm.notes} onChange={e=>setStudentForm({...studentForm,notes:e.target.value})} placeholder="Application updates, follow-up notes…"/></label>
          </div><div className="form-actions"><button type="button" className="secondary" onClick={()=>setShowStudentForm(false)}>Cancel</button><button className="primary" disabled={saving}>{saving?'Saving…':'Save student'}</button></div></form>
          : active ? <div className="detail-content"><div className="detail-top"><div className="avatar large">{(active.full_name||'?').split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase()}</div><div className="detail-title"><h2>{active.full_name}</h2><span className="status-badge">{active.status}</span></div><button className="secondary compact" onClick={()=>startEdit(active)}>Edit</button><button className="icon-button danger" title="Delete student" onClick={()=>deleteStudent(active)}>×</button></div>
            <div className="contact-lines">{active.phone&&<div><span>Phone</span><b>{active.phone}</b></div>}{active.email&&<div><span>Email</span><b>{active.email}</b></div>}{active.university&&<div><span>University</span><b>{active.university}</b></div>}{active.program&&<div><span>Program</span><b>{active.program}</b></div>}<div><span>Destination</span><b>{active.country||'—'}</b></div></div>
            <div className="fee-summary"><div><span>Total fee</span><b>{money(active.total_fee)}</b></div><div><span>Paid</span><b className="green-text">{money(paidByStudent(active.id))}</b></div><div><span>Pending</span><b className="amber-text">{money(Math.max(0,Number(active.total_fee||0)-paidByStudent(active.id)))}</b></div></div>
            {active.notes&&<div className="notes-box"><b>Notes</b><p>{active.notes}</p></div>}
            <div className="section-heading"><div><h3>Payment history</h3><p>Record payments and attach receipts</p></div><span className="pill">{activePayments.length} entries</span></div>
            <form className="payment-form" onSubmit={addPayment}><div className="form-grid"><label>Amount (PKR) *<input type="number" min="1" required value={paymentForm.amount} onChange={e=>setPaymentForm({...paymentForm,amount:e.target.value})}/></label><label>Payment date *<input type="date" required value={paymentForm.date} onChange={e=>setPaymentForm({...paymentForm,date:e.target.value})}/></label><label>Method<select value={paymentForm.method} onChange={e=>setPaymentForm({...paymentForm,method:e.target.value})}><option>Bank Transfer</option><option>Cash</option><option>JazzCash</option><option>EasyPaisa</option><option>Wise</option><option>Other</option></select></label><label>Transaction ID / reference<input value={paymentForm.reference} onChange={e=>setPaymentForm({...paymentForm,reference:e.target.value})}/></label><label className="wide">Receipt screenshot (PNG, JPG or PDF)<input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={e=>setReceipt(e.target.files?.[0] || null)}/>{receipt&&<span className="file-picked">{receipt.name}</span>}</label><label className="wide">Payment notes<input value={paymentForm.notes} onChange={e=>setPaymentForm({...paymentForm,notes:e.target.value})} placeholder="e.g. first installment"/></label></div><button className="primary full" disabled={saving}><Plus size={16}/>{saving?'Saving payment…':'Record payment'}</button></form>
            <div className="payment-list">{activePayments.map(p=><div className="payment-row" key={p.id}><div className="payment-check"><CheckCircle2 size={18}/></div><div className="payment-info"><b>{money(p.amount)}</b><span>{p.payment_date} · {p.method}{p.reference?` · Ref: ${p.reference}`:''}</span>{p.notes&&<small>{p.notes}</small>}</div>{p.receipt_path&&<button className="receipt-link" onClick={()=>openReceipt(p.receipt_path)} title="Open private receipt"><ExternalLink size={16}/> Receipt</button>}</div>)}{activePayments.length===0&&<div className="empty small-empty">No payments recorded for this student yet.</div>}</div>
          </div> : <div className="empty detail-empty"><div className="empty-art"><Users size={28}/></div><h2>Select a student</h2><p>Choose a student from the list to see their details, fees and payment history, or add a new student.</p><button className="primary" onClick={startAdd}><Plus size={17}/> Add student</button></div>}
        </div>
      </section>
      <footer>Ibex Overseas Education · Private student records · Keep account access restricted to authorized staff</footer>
    </main>
  </div>;
}
createRoot(document.getElementById('root')).render(<App />);
