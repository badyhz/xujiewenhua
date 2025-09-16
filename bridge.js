// ===============================================
// bridge.js — Frontend data bridge to Supabase
// ===============================================
// 1) Put this file alongside your HTMLs (step1.html, step2.html, step3.html, step4.html, dashboard.html, team_project_radar_updated.html).
// 2) In <head> (or before </body>) add:
//    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
//    <script src="bridge.js"></script>
// 3) Fill SUPABASE_URL and SUPABASE_ANON_KEY below.
// ===============================================

window.Bridge = (function(){
  const SUPABASE_URL = "https://mhmmwlklbdrqsjqwtllg.supabase.co";  // TODO
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1obW13bGtsYmRycXNqcXd0bGxnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgwMTMyNDIsImV4cCI6MjA3MzU4OTI0Mn0.r3J9QZH_xXDrnLsqvkRzGeoddIRZu03sfjaow6WW2sE";            // TODO
  if (!window.supabase) { console.warn("Supabase SDK missing. Please include it before bridge.js"); }

  const client = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

  // A simple 'whoami' id persisted locally (not secure, just to group submissions)
  function getLocalExternalId(){
    let id = localStorage.getItem('external_id');
    if(!id){
      id = 'ext_' + Math.random().toString(36).slice(2);
      localStorage.setItem('external_id', id);
    }
    return id;
  }

  async function ensureAssessment(){
    const external_id = getLocalExternalId();
    // Try to find latest assessment by external_id
    const { data: found, error: e1 } = await client.from('assessments').select('id').eq('external_id', external_id).order('created_at', {ascending:false}).limit(1);
    if (e1) { console.error(e1); }
    if (found && found.length) return found[0].id;
    const { data: ins, error: e2 } = await client.from('assessments').insert({ external_id }).select('id').single();
    if (e2) { console.error(e2); }
    return ins?.id;
  }

  // Helpers to read from existing pages' localStorage conventions.
  function readStep1Local(){
    // Adjust keys here if your file uses different naming.
    // Try to capture 80 answers as array [1..7], plus derived struct8 if exists.
    let answers = JSON.parse(localStorage.getItem('step1_answers') || 'null');
    if (!answers) {
      // Some builds may save as step1_raw
      answers = JSON.parse(localStorage.getItem('step1_raw') || 'null');
    }
    let struct8 = JSON.parse(localStorage.getItem('step1_struct8') || 'null');
    return { answers, struct8 };
  }

  function readStep2Local(){
    let selected = JSON.parse(localStorage.getItem('step2_selected') || 'null');
    let eco16 = JSON.parse(localStorage.getItem('step2_eco16') || 'null');
    return { selected, eco16 };
  }

  function readStep3Local(){
    let answers = JSON.parse(localStorage.getItem('step3_answers') || 'null');
    let struct8 = JSON.parse(localStorage.getItem('step3_struct') || 'null');
    let eco16 = JSON.parse(localStorage.getItem('step3_eco16') || 'null');
    return { answers, struct8, eco16 };
  }

  function readStep4Local(){
    let labels = JSON.parse(localStorage.getItem('step4_labels') || 'null');
    let weights = JSON.parse(localStorage.getItem('step4_weights') || 'null');
    let composite = JSON.parse(localStorage.getItem('step4_composite') || 'null');
    return { labels, weights, composite };
  }

  function readDashboardSnapshot(){
    // dashboardUser is used by overlay & team radar
    let o = JSON.parse(localStorage.getItem('dashboardUser') || 'null');
    if (!o) return null;
    const payload = JSON.parse(localStorage.getItem('dashboard_payload') || 'null');
    return { 
      ecology16: o.ecology16, 
      potential_self8: o.potentialSelf8, 
      potential_env8: o.potentialEnv8,
      structure_self8: o.structureSelf8 || null,
      structure_env8: o.structureEnv8 || null,
      payload
    };
  }

  // Upserts to DB
  async function pushStep1(){
    const id = await ensureAssessment();
    const {answers, struct8} = readStep1Local();
    if(!answers) return {ok:false, msg:'No step1 answers in localStorage'};
    const { error } = await client.from('step1_answers').upsert({ assessment_id: id, answers, struct8 });
    if (error) throw error;
    return {ok:true, id};
  }

  async function pushStep2(){
    const id = await ensureAssessment();
    const {selected, eco16} = readStep2Local();
    if(!selected) return {ok:false, msg:'No step2 selected'};
    const { error } = await client.from('step2_tags').upsert({ assessment_id: id, selected, eco16 });
    if (error) throw error;
    return {ok:true, id};
  }

  async function pushStep3(){
    const id = await ensureAssessment();
    const {answers, struct8, eco16} = readStep3Local();
    if(!answers) return {ok:false, msg:'No step3 answers'};
    const { error } = await client.from('step3_calibration').upsert({ assessment_id: id, answers, struct8, eco16 });
    if (error) throw error;
    return {ok:true, id};
  }

  async function pushStep4(){
    const id = await ensureAssessment();
    const {labels, weights, composite} = readStep4Local();
    if(!labels) return {ok:false, msg:'No step4 labels'};
    const { error } = await client.from('step4_essence').upsert({ assessment_id: id, labels, weights, composite });
    if (error) throw error;
    return {ok:true, id};
  }

  async function pushDashboard(){
    const id = await ensureAssessment();
    const snap = readDashboardSnapshot();
    if(!snap) return {ok:false, msg:'No dashboardUser snapshot'};
    const { error } = await client.from('dashboard_snapshots').upsert({ assessment_id: id, ...snap });
    if (error) throw error;
    return {ok:true, id};
  }

  // Attach auto hooks to existing buttons by id if present.
  async function attach(){
    function hook(id, fn){
      const el = document.getElementById(id);
      if(!el) return;
      el.addEventListener('click', async function(){
        // delay to let page store localStorage first
        setTimeout(async ()=>{
          try{
            const r = await fn();
            console.log('[Bridge] pushed', id, r);
            // simple toast
            if(window.alert){ /* no-op */ }
          }catch(err){ console.error('[Bridge] error', err); }
        }, 300);
      });
    }
    hook('saveBtn', pushStep1);      // Step1/3 share id saveBtn; both will attempt
    hook('btnSave', pushStep4);      // Step4 uses btnSave; Step2 also uses btnSave—both okay
    hook('btnExport', pushDashboard);
  }

  // Config loader: read config tables to localStorage so your pages can consume globally
  async function loadConfigToLocal(){
    const dims = await client.from('dimensions').select('*').order('order', {ascending:true});
    if(!dims.error){
      localStorage.setItem('cfg_dimensions', JSON.stringify(dims.data));
    }
    const presets = await client.from('weight_presets').select('*');
    if(!presets.error){
      localStorage.setItem('cfg_weight_presets', JSON.stringify(presets.data));
    }
    const tags = await client.from('tags').select('*').limit(500);
    if(!tags.error){
      localStorage.setItem('cfg_tags', JSON.stringify(tags.data));
    }
    return true;
  }

  // Auto-attach on DOM ready
  document.addEventListener('DOMContentLoaded', attach);

  return {
    ensureAssessment,
    pushStep1, pushStep2, pushStep3, pushStep4, pushDashboard,
    loadConfigToLocal
  };
})();